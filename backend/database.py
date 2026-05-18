"""
数据库模块：SQLite + bcrypt 鉴权
"""
import sqlite3
import os
import bcrypt
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "intelligent_ark.db"


# ─── 连接管理 ─────────────────────────────────────────────────────────────────

@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10.0)
    conn.row_factory = sqlite3.Row
    # WAL：读写不互斥，降低"database is locked"概率
    # NORMAL：配合 WAL 的主流推荐同步级别，耐久性与吞吐的平衡
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ─── 建表 ─────────────────────────────────────────────────────────────────────

def init_db():
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            account     TEXT    NOT NULL UNIQUE,
            password_hash TEXT  NOT NULL,
            role        TEXT    NOT NULL DEFAULT 'student',  -- student | social | admin
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id     INTEGER PRIMARY KEY REFERENCES users(id),
            school      TEXT,
            student_id  TEXT,
            education   TEXT,
            qq_email    TEXT,
            admin_type  TEXT,    -- G | C（仅 admin 角色使用）
            school_name TEXT     -- 学校名称（仅高校管理员使用）
        );
        CREATE TABLE IF NOT EXISTS chat_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id),
            scenario    TEXT    NOT NULL,
            role        TEXT    NOT NULL,  -- 'user' | 'assistant'
            content     TEXT    NOT NULL,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at);

        CREATE TABLE IF NOT EXISTS risk_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id),
            scenario    TEXT    NOT NULL,
            level       TEXT    NOT NULL,  -- green | yellow | red
            score       INTEGER NOT NULL,
            tags        TEXT    NOT NULL,  -- JSON array
            summary     TEXT    NOT NULL,
            handled     INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_risk_events_level ON risk_events(level, created_at);
        """)
        # 迁移：为已存在的表添加新字段
        try:
            conn.execute("ALTER TABLE user_profiles ADD COLUMN admin_type TEXT")
        except sqlite3.OperationalError:
            pass  # 字段已存在
        try:
            conn.execute("ALTER TABLE user_profiles ADD COLUMN school_name TEXT")
        except sqlite3.OperationalError:
            pass  # 字段已存在


# ─── 密码工具 ────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ─── 用户操作 ────────────────────────────────────────────────────────────────

def _get_or_create_idempotent(
    account: str,
    plain_password: str,
    role: str,
    profile: Optional[dict] = None,
) -> int:
    """幂等插入：账号存在则直接返回 id，不抛异常。用于 seed_demo_users。"""
    with get_conn() as conn:
        cur = conn.execute("SELECT id FROM users WHERE account = ?", (account,))
        row = cur.fetchone()
        if row:
            return row["id"]

        pw_hash = hash_password(plain_password)
        cur = conn.execute(
            "INSERT INTO users (account, password_hash, role) VALUES (?, ?, ?)",
            (account, pw_hash, role),
        )
        user_id = cur.lastrowid

        if profile:
            conn.execute(
                "INSERT OR IGNORE INTO user_profiles (user_id, school, student_id, education, qq_email, admin_type, school_name) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    user_id,
                    profile.get("school"),
                    profile.get("student_id"),
                    profile.get("education"),
                    profile.get("qq_email"),
                    profile.get("admin_type"),
                    profile.get("school_name"),
                ),
            )
        return user_id


def get_or_create_user(
    account: str,
    plain_password: str,
    role: str,
    profile: Optional[dict] = None,
) -> int:
    """不存在则创建并返回 id，已存在则主动抛出 IntegrityError。"""
    with get_conn() as conn:
        cur = conn.execute("SELECT id FROM users WHERE account = ?", (account,))
        row = cur.fetchone()
        if row:
            # 主动抛异常，让上层路由区分"已存在"与其他错误
            raise sqlite3.IntegrityError(f"账号 {account} 已存在")

        pw_hash = hash_password(plain_password)
        cur = conn.execute(
            "INSERT INTO users (account, password_hash, role) VALUES (?, ?, ?)",
            (account, pw_hash, role),
        )
        user_id = cur.lastrowid

        if profile:
            conn.execute(
                "INSERT OR IGNORE INTO user_profiles (user_id, school, student_id, education, qq_email, admin_type, school_name) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    user_id,
                    profile.get("school"),
                    profile.get("student_id"),
                    profile.get("education"),
                    profile.get("qq_email"),
                    profile.get("admin_type"),
                    profile.get("school_name"),
                ),
            )

        return user_id


def verify_user(account: str, plain_password: str) -> Optional[dict]:
    """验证账号密码，成功返回用户信息 dict，失败返回 None。"""
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT id, account, password_hash, role FROM users WHERE account = ?",
            (account,),
        )
        row = cur.fetchone()
        if not row:
            return None
        if not verify_password(plain_password, row["password_hash"]):
            return None
        return {
            "id": row["id"],
            "account": row["account"],
            "role": row["role"],
        }


import json as _json


# ─── 对话 & 风险事件 ─────────────────────────────────────────────────────────

def get_recent_chat_history(
    user_id: int,
    scenario: str,
    limit: int = 10,
) -> list[dict]:
    """
    获取 (user_id, scenario) 最近 limit 条消息，按时间正序返回 OpenAI 消息格式。
    返回形如 [{"role": "user"|"assistant", "content": "..."}]
    """
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT role, content FROM chat_messages "
            "WHERE user_id = ? AND scenario = ? "
            "ORDER BY id DESC LIMIT ?",
            (user_id, scenario, limit),
        ).fetchall()
    # DESC 取最新 N 条后反转为正序
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def clear_chat_history(user_id: int, scenario: Optional[str] = None) -> int:
    """清空指定用户（可选场景）的对话历史，返回删除行数。"""
    with get_conn() as conn:
        if scenario:
            cur = conn.execute(
                "DELETE FROM chat_messages WHERE user_id = ? AND scenario = ?",
                (user_id, scenario),
            )
        else:
            cur = conn.execute(
                "DELETE FROM chat_messages WHERE user_id = ?",
                (user_id,),
            )
        return cur.rowcount


def save_chat_message(user_id: int, scenario: str, role: str, content: str) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO chat_messages (user_id, scenario, role, content) VALUES (?, ?, ?, ?)",
            (user_id, scenario, role, content),
        )
        return cur.lastrowid


def save_risk_event(
    user_id: int,
    scenario: str,
    level: str,
    score: int,
    tags: list,
    summary: str,
) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO risk_events (user_id, scenario, level, score, tags, summary) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, scenario, level, score, _json.dumps(tags, ensure_ascii=False), summary),
        )
        return cur.lastrowid


def list_risk_events(
    level: Optional[str] = None,
    scenario: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    sql = (
        "SELECT r.id, r.user_id, u.account, r.scenario, r.level, r.score, "
        "r.tags, r.summary, r.handled, r.created_at "
        "FROM risk_events r JOIN users u ON u.id = r.user_id WHERE 1=1"
    )
    params: list = []
    if level:
        sql += " AND r.level = ?"
        params.append(level)
    if scenario:
        sql += " AND r.scenario = ?"
        params.append(scenario)
    sql += " ORDER BY r.created_at DESC LIMIT ?"
    params.append(limit)

    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    result = []
    for r in rows:
        try:
            tags = _json.loads(r["tags"])
        except Exception:
            tags = []
        result.append({
            "id": r["id"],
            "user_id": r["user_id"],
            "account": r["account"],
            "scenario": r["scenario"],
            "level": r["level"],
            "score": r["score"],
            "tags": tags,
            "summary": r["summary"],
            "handled": bool(r["handled"]),
            "created_at": r["created_at"],
        })
    return result


def mark_risk_event_handled(event_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE risk_events SET handled = 1 WHERE id = ?",
            (event_id,),
        )
        return cur.rowcount > 0


def get_admin_profile(worker_id: str) -> Optional[dict]:
    """获取管理员的扩展信息（admin_type, school_name）。"""
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT up.admin_type, up.school_name FROM user_profiles up "
            "JOIN users u ON u.id = up.user_id WHERE u.account = ?",
            (worker_id,),
        )
        row = cur.fetchone()
        if row:
            return {
                "admin_type": row["admin_type"],
                "school_name": row["school_name"],
            }
        return None


# ─── 演示账号初始化 ──────────────────────────────────────────────────────────

def seed_demo_users():
    _get_or_create_idempotent(
        account="001",
        plain_password="123456",
        role="student",
        profile={"school": "保定学院", "student_id": "001", "education": "本科生"},
    )
    _get_or_create_idempotent(
        account="002@qq.com",
        plain_password="123456",
        role="social",
        profile={"qq_email": "002@qq.com"},
    )
    # 高校管理员
    _get_or_create_idempotent(
        account="G001",
        plain_password="123456",
        role="admin",
        profile={"admin_type": "G", "school_name": "保定学院"},
    )
    # 社区管理员
    _get_or_create_idempotent(
        account="C001",
        plain_password="123456",
        role="admin",
        profile={"admin_type": "C", "school_name": ""},
    )
