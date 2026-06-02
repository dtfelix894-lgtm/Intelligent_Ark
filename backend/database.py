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
        # 迁移：风险事件处理闭环字段（处理时间/处理人/动作/备注）
        for col in (
            "ALTER TABLE risk_events ADD COLUMN handled_at TEXT",
            "ALTER TABLE risk_events ADD COLUMN handled_by TEXT",
            "ALTER TABLE risk_events ADD COLUMN action TEXT",
            "ALTER TABLE risk_events ADD COLUMN note TEXT",
        ):
            try:
                conn.execute(col)
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


def count_users_by_role(role: str) -> int:
    """统计指定角色的注册用户数（social=独居老人，student=学生）。"""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM users WHERE role = ?",
            (role,),
        ).fetchone()
        return int(row["n"]) if row else 0


def list_users_with_stats(role: str, scenario: str) -> list[dict]:
    """
    账号管理列表：指定角色的注册用户 + 资料 + 请求/风险统计。
    - 高校(student) 带 school/student_id 双标识；社区(social) 带 email。
    - request_count：该 scenario 下用户提问条数；last_active：最近一次提问时间。
    - red_count/yellow_count：该 scenario 下历史红/黄码次数。
    """
    with get_conn() as conn:
        users = conn.execute(
            "SELECT u.id, u.account, u.role, u.created_at, "
            "p.school, p.student_id, p.qq_email "
            "FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id "
            "WHERE u.role = ? ORDER BY u.created_at DESC",
            (role,),
        ).fetchall()

        chat_rows = conn.execute(
            "SELECT user_id, COUNT(*) AS n, MAX(created_at) AS last FROM chat_messages "
            "WHERE role = 'user' AND scenario = ? GROUP BY user_id",
            (scenario,),
        ).fetchall()
        chat_map = {r["user_id"]: (r["n"], r["last"]) for r in chat_rows}

        risk_rows = conn.execute(
            "SELECT user_id, level, COUNT(*) AS n FROM risk_events "
            "WHERE scenario = ? AND level IN ('red','yellow') GROUP BY user_id, level",
            (scenario,),
        ).fetchall()
        risk_map: dict[int, dict[str, int]] = {}
        for r in risk_rows:
            risk_map.setdefault(r["user_id"], {})[r["level"]] = r["n"]

    result = []
    for u in users:
        n, last = chat_map.get(u["id"], (0, None))
        rc = risk_map.get(u["id"], {})
        result.append({
            "id": u["id"],
            "account": u["account"],
            "role": u["role"],
            "created_at": u["created_at"],
            "school": u["school"],
            "student_id": u["student_id"] or u["account"],
            "email": u["qq_email"] or u["account"],
            "request_count": n,
            "last_active": last,
            "red_count": rc.get("red", 0),
            "yellow_count": rc.get("yellow", 0),
        })
    return result


def get_risk_trend(scenario: str, days: int = 7) -> list[dict]:
    """
    风险走势：近 days 天，每天的黄码/红码预警数 + 当天平均风险分。
    空白天补 0（avg_score 为 None），按本地日期对齐 created_at。
    """
    from datetime import datetime, timedelta

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT date(created_at) AS d, level, COUNT(*) AS n, SUM(score) AS s "
            "FROM risk_events WHERE scenario = ? AND created_at >= datetime('now','localtime', ?) "
            "GROUP BY date(created_at), level",
            (scenario, f"-{days - 1} days"),
        ).fetchall()

    by_date: dict[str, dict] = {}
    for r in rows:
        e = by_date.setdefault(r["d"], {"yellow": 0, "red": 0, "green": 0, "score_sum": 0, "count": 0})
        e[r["level"]] = r["n"]
        e["score_sum"] += r["s"] or 0
        e["count"] += r["n"]

    today = datetime.now().date()
    result = []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        key = day.isoformat()
        e = by_date.get(key)
        if e and e["count"]:
            avg = round(e["score_sum"] / e["count"])
            result.append({"date": key, "label": f"{day.month}/{day.day}",
                           "yellow": e["yellow"], "red": e["red"],
                           "count": e["count"], "avg_score": avg})
        else:
            result.append({"date": key, "label": f"{day.month}/{day.day}",
                           "yellow": 0, "red": 0, "count": 0, "avg_score": None})
    return result


def get_risk_tag_distribution(scenario: str, limit: int = 7) -> list[dict]:
    """风险标签分布：聚合 risk_events.tags（JSON 数组）的频次，返回 top limit。"""
    from collections import Counter

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT tags FROM risk_events WHERE scenario = ?",
            (scenario,),
        ).fetchall()

    counter: Counter = Counter()
    for r in rows:
        try:
            for t in _json.loads(r["tags"]):
                t = (t or "").strip()
                if t:
                    counter[t] += 1
        except Exception:
            continue
    return [{"tag": t, "count": n} for t, n in counter.most_common(limit)]


def get_user_activity(user_id: int, scenario: str, days: int = 7) -> dict:
    """
    单用户请求明细：总次数 + 首次/最近时间 + 最近 days 天的每日请求分布。
    """
    with get_conn() as conn:
        summary = conn.execute(
            "SELECT COUNT(*) AS n, MIN(created_at) AS first, MAX(created_at) AS last "
            "FROM chat_messages WHERE user_id = ? AND role = 'user' AND scenario = ?",
            (user_id, scenario),
        ).fetchone()
        daily_rows = conn.execute(
            "SELECT date(created_at) AS d, COUNT(*) AS n FROM chat_messages "
            "WHERE user_id = ? AND role = 'user' AND scenario = ? "
            "AND created_at >= datetime('now', ?) "
            "GROUP BY date(created_at) ORDER BY d",
            (user_id, scenario, f"-{days} days"),
        ).fetchall()
    return {
        "request_count": summary["n"] if summary else 0,
        "first_active": summary["first"] if summary else None,
        "last_active": summary["last"] if summary else None,
        "daily": [{"date": r["d"], "count": r["n"]} for r in daily_rows],
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
            "INSERT INTO risk_events (user_id, scenario, level, score, tags, summary, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))",
            (user_id, scenario, level, score, _json.dumps(tags, ensure_ascii=False), summary),
        )
        return cur.lastrowid


def list_risk_events(
    level: Optional[str] = None,
    scenario: Optional[str] = None,
    handled: Optional[bool] = None,
    limit: int = 100,
) -> list[dict]:
    sql = (
        "SELECT r.id, r.user_id, u.account, r.scenario, r.level, r.score, "
        "r.tags, r.summary, r.handled, r.handled_at, r.handled_by, r.action, r.note, r.created_at "
        "FROM risk_events r JOIN users u ON u.id = r.user_id WHERE 1=1"
    )
    params: list = []
    if level:
        sql += " AND r.level = ?"
        params.append(level)
    if scenario:
        sql += " AND r.scenario = ?"
        params.append(scenario)
    if handled is not None:
        sql += " AND r.handled = ?"
        params.append(1 if handled else 0)
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
            "handled_at": r["handled_at"],
            "handled_by": r["handled_by"],
            "action": r["action"],
            "note": r["note"],
            "created_at": r["created_at"],
        })
    return result


def mark_risk_event_handled(
    event_id: int,
    handled_by: Optional[str] = None,
    action: Optional[str] = None,
    note: Optional[str] = None,
) -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE risk_events SET handled = 1, handled_at = datetime('now','localtime'), "
            "handled_by = ?, action = ?, note = ? WHERE id = ?",
            (handled_by, action, note, event_id),
        )
        return cur.rowcount > 0


def list_user_interventions(user_id: int, scenario: str, limit: int = 50) -> list[dict]:
    """单用户已处理的干预记录（红/黄码），供账号管理记录展示。"""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, level, score, tags, summary, action, note, handled_by, handled_at, created_at "
            "FROM risk_events WHERE user_id = ? AND scenario = ? AND handled = 1 "
            "ORDER BY handled_at DESC LIMIT ?",
            (user_id, scenario, limit),
        ).fetchall()
    result = []
    for r in rows:
        try:
            tags = _json.loads(r["tags"])
        except Exception:
            tags = []
        result.append({
            "id": r["id"],
            "level": r["level"],
            "score": r["score"],
            "tags": tags,
            "summary": r["summary"],
            "action": r["action"],
            "note": r["note"],
            "handled_by": r["handled_by"],
            "handled_at": r["handled_at"],
            "created_at": r["created_at"],
        })
    return result


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
