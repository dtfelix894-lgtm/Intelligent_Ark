"""
数据库模块：SQLite / PostgreSQL + bcrypt 鉴权

连接由 db.py 适配：DATABASE_URL(postgresql) 优先，否则 DB_PATH(SQLite)。
"""
import os
import bcrypt
from pathlib import Path
from typing import Optional
import threading
import queue

from db import (
    BASE_DIR,
    DB_PATH,
    DATABASE_URL,
    get_conn,
    using_postgres,
    sql_now,
    sql_today,
    sql_now_plus_minutes,
    sql_now_minus_days,
    sql_today_plus_days,
    minutes_param,
    days_ago_param,
    days_ahead_param,
    json_param,
    format_ts_for_api,
    init_postgres_schema,
    integrity_errors,
    IntegrityError,
    backend_label,
)

# ─── 建表 ─────────────────────────────────────────────────────────────────────

def init_db():
    """Create schema. PG loads sql/pg_schema_v1.sql; SQLite keeps CREATE/ALTER path."""
    if using_postgres():
        with get_conn() as conn:
            init_postgres_schema(conn)
            try:
                conn.execute(
                    "UPDATE risk_events SET status = 'closed', "
                    "closure_label = COALESCE(NULLIF(closure_label, ''), 'legacy_unlabeled'), "
                    "closed_at = COALESCE(closed_at, handled_at) "
                    "WHERE handled IS TRUE AND (status IS NULL OR status = '' OR status = 'pending' OR status = 'claimed')"
                )
                conn.execute(
                    "UPDATE risk_events SET status = 'claimed' "
                    "WHERE handled IS FALSE AND assignee IS NOT NULL AND assignee != '' "
                    "AND (status IS NULL OR status = '' OR status = 'pending')"
                )
                conn.execute(
                    "UPDATE risk_events SET status = 'pending' "
                    "WHERE (status IS NULL OR status = '') AND handled IS FALSE"
                )
            except Exception:
                pass
        return

    with get_conn() as conn:
        now = sql_now()
        conn.executescript(f"""
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            account     TEXT    NOT NULL UNIQUE,
            password_hash TEXT  NOT NULL,
            role        TEXT    NOT NULL DEFAULT 'student',
            is_demo     INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL DEFAULT ({now})
        );
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id     INTEGER PRIMARY KEY REFERENCES users(id),
            school      TEXT,
            student_id  TEXT,
            education   TEXT,
            qq_email    TEXT,
            admin_type  TEXT,
            school_name TEXT
        );
        CREATE TABLE IF NOT EXISTS chat_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id),
            scenario    TEXT    NOT NULL,
            role        TEXT    NOT NULL,
            content     TEXT    NOT NULL,
            created_at  TEXT    NOT NULL DEFAULT ({now})
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at);

        CREATE TABLE IF NOT EXISTS risk_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id),
            scenario    TEXT    NOT NULL,
            level       TEXT    NOT NULL,
            score       INTEGER NOT NULL,
            tags        TEXT    NOT NULL,
            summary     TEXT    NOT NULL,
            handled     INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL DEFAULT ({now})
        );
        CREATE INDEX IF NOT EXISTS idx_risk_events_level ON risk_events(level, created_at);
        """)
        import sqlite3 as _sqlite3
        for col in (
            "ALTER TABLE user_profiles ADD COLUMN admin_type TEXT",
            "ALTER TABLE user_profiles ADD COLUMN school_name TEXT",
            "ALTER TABLE user_profiles ADD COLUMN companion_persona TEXT",
            "ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE risk_events ADD COLUMN handled_at TEXT",
            "ALTER TABLE risk_events ADD COLUMN handled_by TEXT",
            "ALTER TABLE risk_events ADD COLUMN action TEXT",
            "ALTER TABLE risk_events ADD COLUMN note TEXT",
            "ALTER TABLE risk_events ADD COLUMN assignee TEXT",
            "ALTER TABLE risk_events ADD COLUMN claimed_at TEXT",
            "ALTER TABLE risk_events ADD COLUMN status TEXT",
            "ALTER TABLE risk_events ADD COLUMN closed_at TEXT",
            "ALTER TABLE risk_events ADD COLUMN closure_label TEXT",
            "ALTER TABLE risk_events ADD COLUMN closure_other_person INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE risk_events ADD COLUMN closure_note TEXT",
            "ALTER TABLE risk_events ADD COLUMN claim_due_at TEXT",
            "ALTER TABLE risk_events ADD COLUMN escalated_at TEXT",
        ):
            try:
                conn.execute(col)
            except _sqlite3.OperationalError:
                pass
        try:
            conn.execute(
                "UPDATE risk_events SET status = 'closed', "
                "closure_label = COALESCE(NULLIF(closure_label, ''), 'legacy_unlabeled'), "
                "closed_at = COALESCE(closed_at, handled_at) "
                "WHERE " + _sql_bool_eq("handled", True) + " AND (status IS NULL OR status = '' OR status = 'pending' OR status = 'claimed')"
            )
            conn.execute(
                "UPDATE risk_events SET status = 'claimed' "
                "WHERE " + _sql_bool_eq("handled", False) + " AND assignee IS NOT NULL AND assignee != '' "
                "AND (status IS NULL OR status = '' OR status = 'pending')"
            )
            conn.execute(
                "UPDATE risk_events SET status = 'pending' "
                "WHERE (status IS NULL OR status = '') AND " + _sql_bool_eq("handled", False)
            )
        except _sqlite3.OperationalError:
            pass
        conn.execute(f"""
        CREATE TABLE IF NOT EXISTS event_transitions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id    INTEGER NOT NULL REFERENCES risk_events(id),
            from_status TEXT    NOT NULL,
            to_status   TEXT    NOT NULL,
            actor       TEXT    NOT NULL,
            reason      TEXT,
            created_at  TEXT    NOT NULL DEFAULT ({now})
        )
        """)
        conn.execute(f"""
        CREATE TABLE IF NOT EXISTS follow_up_records (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id        INTEGER NOT NULL REFERENCES risk_events(id),
            type            TEXT    NOT NULL,
            occurred_at     TEXT    NOT NULL,
            summary         TEXT    NOT NULL,
            referral_target TEXT,
            actor           TEXT    NOT NULL,
            created_at      TEXT    NOT NULL DEFAULT ({now})
        )
        """)
        conn.execute(f"""
        CREATE TABLE IF NOT EXISTS reassessments (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id     INTEGER NOT NULL REFERENCES risk_events(id),
            due_date     TEXT    NOT NULL,
            completed_at TEXT,
            result       TEXT,
            actor        TEXT,
            created_at   TEXT    NOT NULL DEFAULT ({now})
        )
        """)
        conn.execute(f"""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            actor       TEXT    NOT NULL,
            action      TEXT    NOT NULL,
            target_type TEXT    NOT NULL,
            target_id   TEXT    NOT NULL,
            meta        TEXT,
            created_at  TEXT    NOT NULL DEFAULT ({now})
        )
        """)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ─── 用户操作 ────────────────────────────────────────────────────────────────

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
            raise IntegrityError(f"账号 {account} 已存在")

        pw_hash = hash_password(plain_password)
        cur = conn.execute(
            "INSERT INTO users (account, password_hash, role, created_at) VALUES (?, ?, ?, " + sql_now() + ")",
            (account, pw_hash, role),
        )
        user_id = cur.lastrowid

        if profile:
            conn.execute(
                "INSERT INTO user_profiles (user_id, school, student_id, education, qq_email, admin_type, school_name) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING",
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


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Return the current identity/scope for token validation."""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT u.id,u.account,u.role,p.school,p.student_id,p.education,
                      p.admin_type,p.school_name,p.companion_persona
               FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
              WHERE u.id=?""", (user_id,)
        ).fetchone()
    return dict(row) if row else None
def set_companion_persona(user_id: int, persona: str) -> None:
    """COMP-06：保存学生人设偏好（senior_sister | senior_brother）。"""
    if persona not in ("senior_sister", "senior_brother"):
        raise ValueError("invalid companion_persona")
    with get_conn() as conn:
        exists = conn.execute(
            "SELECT 1 FROM user_profiles WHERE user_id = ?", (user_id,)
        ).fetchone()
        if exists:
            conn.execute(
                "UPDATE user_profiles SET companion_persona = ? WHERE user_id = ?",
                (persona, user_id),
            )
        else:
            conn.execute(
                "INSERT INTO user_profiles (user_id, companion_persona) VALUES (?, ?)",
                (user_id, persona),
            )
        conn.commit()


def count_users_by_role(role: str) -> int:
    """统计通过注册流程创建的账号数，演示账号不进入工作台统计。"""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM users WHERE role = ? AND " + _sql_is_demo_false(),
            (role,),
        ).fetchone()
        return int(row["n"]) if row else 0


def list_users_with_stats(role: str, scenario: str) -> list[dict]:
    """
    账号管理列表：指定角色的注册用户 + 资料 + 请求/风险统计。
    - 高校(student) 带 school/student_id 双标识。
    - request_count：该 scenario 下用户提问条数；last_active：最近一次提问时间。
    - red_count/yellow_count：该 scenario 下历史红/黄码次数。
    """
    with get_conn() as conn:
        users = conn.execute(
            "SELECT u.id, u.account, u.role, u.created_at, "
            "p.school, p.student_id, p.qq_email "
            "FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id "
            "WHERE u.role = ? AND " + _sql_is_demo_false("u") + " ORDER BY u.created_at DESC",
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
    空白天补 0（avg_score 为 None），按北京时间自然日对齐 created_at。
    """
    from datetime import datetime, timedelta, timezone

    today = datetime.now(timezone(timedelta(hours=8))).date()  # 北京时间自然日，不依赖服务器时区
    first_day = today - timedelta(days=days - 1)
    next_day = today + timedelta(days=1)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT " + _sql_local_date("created_at") + " AS d, level, COUNT(*) AS n, SUM(score) AS s "
            "FROM risk_events WHERE scenario = ? AND created_at >= ? AND created_at < ? "
            "GROUP BY " + _sql_local_date("created_at") + ", level",
            (scenario, f"{first_day.isoformat()} 00:00:00", f"{next_day.isoformat()} 00:00:00"),
        ).fetchall()

    by_date: dict[str, dict] = {}
    for r in rows:
        dkey = r["d"].isoformat() if hasattr(r["d"], "isoformat") else str(r["d"])
        e = by_date.setdefault(dkey, {"yellow": 0, "red": 0, "green": 0, "score_sum": 0, "count": 0})
        e[r["level"]] = r["n"]
        e["score_sum"] += r["s"] or 0
        e["count"] += r["n"]

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
            raw = r["tags"]
            if isinstance(raw, list):
                tlist = raw
            elif isinstance(raw, dict):
                tlist = list(raw.values())
            else:
                tlist = _json.loads(raw or "[]")
            for t in tlist:
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
            "SELECT " + _sql_local_date("created_at") + " AS d, COUNT(*) AS n FROM chat_messages "
            "WHERE user_id = ? AND role = 'user' AND scenario = ? "
            "AND created_at >= " + sql_now_minus_days() + " "
            "GROUP BY " + _sql_local_date("created_at") + " ORDER BY d",
            (user_id, scenario, days_ago_param(days)),
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
            "SELECT id, role, content FROM chat_messages "
            "WHERE user_id = ? AND scenario = ? "
            "ORDER BY id DESC LIMIT ?",
            (user_id, scenario, limit),
        ).fetchall()
    # DESC 取最新 N 条后反转为正序
    return [{"id": r["id"], "role": r["role"], "content": r["content"]} for r in reversed(rows)]


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
            "INSERT INTO chat_messages (user_id, scenario, role, content, created_at) VALUES (?, ?, ?, ?, " + sql_now() + ")",
            (user_id, scenario, role, content),
        )
        return cur.lastrowid



def get_claim_timeouts() -> dict:
    """认领时限配置（分钟）。prod 下限 5 分钟。"""
    import os
    app_env = (os.getenv("APP_ENV") or "dev").strip().lower()
    try:
        red = int(os.getenv("RED_CLAIM_MINUTES", "30"))
    except ValueError:
        red = 30
    try:
        yellow_hours = float(os.getenv("YELLOW_CLAIM_HOURS", "24"))
    except ValueError:
        yellow_hours = 24.0
    yellow = int(yellow_hours * 60)
    if app_env == "prod":
        red = max(5, red)
        yellow = max(5, yellow)
    else:
        red = max(1, red)
        yellow = max(1, yellow)
    return {"red_minutes": red, "yellow_minutes": yellow, "app_env": app_env}


def _claim_due_minutes_for_level(level: str) -> int:
    cfg = get_claim_timeouts()
    return cfg["red_minutes"] if level == "red" else cfg["yellow_minutes"]


def save_risk_event(
    user_id: int,
    scenario: str,
    level: str,
    score: int,
    tags: list,
    summary: str,
) -> int:
    # claim_due_at：red 默认 +N 分钟，yellow 默认 +H 小时（配置见 get_claim_timeouts）
    minutes = _claim_due_minutes_for_level(level)
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO risk_events (user_id, scenario, level, score, tags, summary, status, "
            "claim_due_at, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'pending', "
            + sql_now_plus_minutes() + ", " + sql_now() + ")",
            (
                user_id, scenario, level, score,
                json_param(tags), summary,
                minutes_param(minutes),
            ),
        )
        event_id = cur.lastrowid
    # SSE：写入后推送脱敏事件（无对话原文）；失败不影响落库
    try:
        publish_risk_alert_created(event_id, scenario)
    except Exception:
        pass
    return event_id


def list_risk_events(
    level: Optional[str] = None,
    scenario: Optional[str] = None,
    handled: Optional[bool] = None,
    limit: int = 100,
) -> list[dict]:
    sql = (
        "SELECT r.id, r.user_id, u.account, r.scenario, r.level, r.score, "
        "r.tags, r.summary, r.handled, r.handled_at, r.handled_by, r.action, r.note, "
        "r.assignee, r.claimed_at, r.status, r.closed_at, r.closure_label, "
        "r.closure_other_person, r.closure_note, r.claim_due_at, r.escalated_at, r.created_at "
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
        # Acceptance: 待跟进=状态≠closed；已跟进=closed（与 handled 位同步）
        if handled:
            sql += " AND (" + _sql_bool_eq("r.handled", True) + " OR r.status = 'closed')"
        else:
            sql += " AND COALESCE(r.status, '') != 'closed' AND " + _sql_bool_eq("r.handled", False)
    sql += " ORDER BY r.created_at DESC LIMIT ?"
    params.append(limit)

    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    result = []
    for r in rows:
        try:
            tags = r["tags"] if isinstance(r["tags"], (list, dict)) else _json.loads(r["tags"] or "[]")
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
            "assignee": r["assignee"],
            "claimed_at": r["claimed_at"],
            "status": r["status"] or ("closed" if r["handled"] else ("claimed" if r["assignee"] else "pending")),
            "closed_at": r["closed_at"],
            "closure_label": r["closure_label"],
            "closure_other_person": bool(r["closure_other_person"] or 0),
            "closure_note": r["closure_note"],
            "claim_due_at": r["claim_due_at"] if "claim_due_at" in r.keys() else None,
            "escalated_at": r["escalated_at"] if "escalated_at" in r.keys() else None,
            "created_at": r["created_at"],
        })
    return result


def _row_to_risk_event(r) -> dict:
    """Map a joined risk_events row to the public (desensitized) alert dict."""
    raw_tags = r["tags"]
    try:
        if isinstance(raw_tags, (list, dict)):
            tags = raw_tags
        else:
            tags = _json.loads(raw_tags or "[]")
    except Exception:
        tags = []
    return {
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
        "assignee": r["assignee"] if "assignee" in r.keys() else None,
        "claimed_at": r["claimed_at"] if "claimed_at" in r.keys() else None,
        "status": (r["status"] if "status" in r.keys() and r["status"] else (
            "closed" if r["handled"] else ("claimed" if (r["assignee"] if "assignee" in r.keys() else None) else "pending")
        )),
        "closed_at": r["closed_at"] if "closed_at" in r.keys() else None,
        "closure_label": r["closure_label"] if "closure_label" in r.keys() else None,
        "closure_other_person": bool(r["closure_other_person"]) if "closure_other_person" in r.keys() else False,
        "closure_note": r["closure_note"] if "closure_note" in r.keys() else None,
        "claim_due_at": r["claim_due_at"] if "claim_due_at" in r.keys() else None,
        "escalated_at": r["escalated_at"] if "escalated_at" in r.keys() else None,
        "created_at": r["created_at"],
    }


_RISK_EVENT_SELECT = (
    "SELECT r.id, r.user_id, u.account, r.scenario, r.level, r.score, "
    "r.tags, r.summary, r.handled, r.handled_at, r.handled_by, r.action, r.note, "
    "r.assignee, r.claimed_at, r.status, r.closed_at, r.closure_label, "
    "r.closure_other_person, r.closure_note, r.claim_due_at, r.escalated_at, r.created_at "
    "FROM risk_events r JOIN users u ON u.id = r.user_id "
)


def get_risk_event(event_id: int, scenario: str = "university") -> Optional[dict]:
    """Single desensitized alert (summary only; never joins chat_messages)."""
    with get_conn() as conn:
        row = conn.execute(
            _RISK_EVENT_SELECT + "WHERE r.id = ? AND r.scenario = ?",
            (event_id, scenario),
        ).fetchone()
    return _row_to_risk_event(row) if row else None


def list_peer_risk_events(
    user_id: int,
    scenario: str = "university",
    exclude_id: Optional[int] = None,
    limit: int = 20,
) -> list[dict]:
    """Same-student related alerts (summaries only; storage not deduped)."""
    sql = _RISK_EVENT_SELECT + "WHERE r.user_id = ? AND r.scenario = ?"
    params: list = [user_id, scenario]
    if exclude_id is not None:
        sql += " AND r.id != ?"
        params.append(exclude_id)
    sql += " ORDER BY r.created_at DESC LIMIT ?"
    params.append(limit)
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_risk_event(r) for r in rows]


def write_audit_log(
    actor: str,
    action: str,
    target_type: str,
    target_id: str,
    meta: Optional[dict] = None,
) -> None:
    """Append-only audit entry (no chat content in meta)."""
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO audit_logs (actor, action, target_type, target_id, meta, created_at) "
            "VALUES (?, ?, ?, ?, ?, " + sql_now() + ")",
            (
                actor,
                action,
                target_type,
                str(target_id),
                json_param(meta or {}),
            ),
        )


def get_admin_account(account: str) -> Optional[dict]:
    """Return admin identity by worker id, or None if missing / not admin."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, account, role FROM users WHERE account = ?",
            (account,),
        ).fetchone()
    if not row or row["role"] != "admin":
        return None
    return {"id": row["id"], "account": row["account"], "role": row["role"]}



def list_admin_accounts(limit: int = 100) -> list[dict]:
    """Staff worker ids for assign / reassign dropdown (no passwords)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, account FROM users WHERE role = 'admin' "
            "ORDER BY account ASC LIMIT ?",
            (limit,),
        ).fetchall()
    return [{"id": r["id"], "account": r["account"]} for r in rows]


def claim_risk_event(event_id: int, assignee: str) -> tuple[str, Optional[dict]]:
    """Claim an unassigned university alert for assignee.

    Returns (status, event):
      - ok: newly claimed or already claimed by the same assignee
      - conflict: already claimed by someone else
      - missing: event not found / wrong scenario
    """
    with get_conn() as conn:
        row = conn.execute(
            _RISK_EVENT_SELECT + "WHERE r.id = ? AND r.scenario = 'university'",
            (event_id,),
        ).fetchone()
        if not row:
            return "missing", None
        current = row["assignee"]
        if current and current != assignee:
            return "conflict", _row_to_risk_event(row)
        if not current:
            conn.execute(
                "UPDATE risk_events SET assignee = ?, claimed_at = " + sql_now() + ", "
                "status = CASE WHEN status IS NULL OR status = '' OR status = 'pending' THEN 'claimed' ELSE status END "
                "WHERE id = ? AND scenario = 'university' AND (assignee IS NULL OR assignee = '')",
                (assignee, event_id),
            )
            # Re-read after atomic claim; another worker may have won the race.
            row = conn.execute(
                _RISK_EVENT_SELECT + "WHERE r.id = ? AND r.scenario = 'university'",
                (event_id,),
            ).fetchone()
            if row["assignee"] != assignee:
                return "conflict", _row_to_risk_event(row)
            # 新认领：写流转 pending→claimed
            conn.execute(
                "INSERT INTO event_transitions (event_id, from_status, to_status, actor, reason, created_at) "
                "VALUES (?, 'pending', 'claimed', ?, '认领', " + sql_now() + ")",
                (event_id, assignee),
            )
        return "ok", _row_to_risk_event(row)


def assign_risk_event(event_id: int, assignee: str) -> tuple[str, Optional[dict]]:
    """Assign / reassign a university alert to an admin worker id."""
    with get_conn() as conn:
        row = conn.execute(
            _RISK_EVENT_SELECT + "WHERE r.id = ? AND r.scenario = 'university'",
            (event_id,),
        ).fetchone()
        if not row:
            return "missing", None
        from_status = _effective_status(row)
        conn.execute(
            "UPDATE risk_events SET assignee = ?, claimed_at = " + sql_now() + ", "
            "status = CASE WHEN status IS NULL OR status = '' OR status = 'pending' THEN 'claimed' ELSE status END "
            "WHERE id = ? AND scenario = 'university'",
            (assignee, event_id),
        )
        if from_status == "pending":
            conn.execute(
                "INSERT INTO event_transitions (event_id, from_status, to_status, actor, reason, created_at) "
                "VALUES (?, 'pending', 'claimed', ?, '分派', " + sql_now() + ")",
                (event_id, assignee),
            )
        row = conn.execute(
            _RISK_EVENT_SELECT + "WHERE r.id = ? AND r.scenario = 'university'",
            (event_id,),
        ).fetchone()
        return "ok", _row_to_risk_event(row)


def mark_risk_event_handled(
    event_id: int,
    handled_by: Optional[str] = None,
    action: Optional[str] = None,
    note: Optional[str] = None,
) -> bool:
    """Confirm an existing campus event without overwriting its first handling."""
    with get_conn() as conn:
        row = conn.execute(
            _RISK_EVENT_SELECT + "WHERE r.id = ? AND r.scenario = 'university'",
            (event_id,),
        ).fetchone()
        if not row:
            return False
        from_status = _effective_status(row)
        cur = conn.execute(
            "UPDATE risk_events SET handled = " + _sql_bool(True) + ", handled_at = " + sql_now() + ", "
            "handled_by = ?, action = ?, note = ?, "
            "status = 'closed', "
            "closed_at = COALESCE(closed_at, " + sql_now() + "), "
            "closure_label = COALESCE(NULLIF(closure_label, ''), 'legacy_unlabeled') "
            "WHERE id = ? AND scenario = 'university' AND " + _sql_bool_eq("handled", False),
            (handled_by, action, note, event_id),
        )
        if cur.rowcount > 0:
            # CASE-01 兼容边：任意未结案 → closed + legacy_unlabeled
            if from_status != "closed":
                conn.execute(
                    "INSERT INTO event_transitions (event_id, from_status, to_status, actor, reason, created_at) "
                    "VALUES (?, ?, 'closed', ?, ?, " + sql_now() + ")",
                    (event_id, from_status, handled_by or "", "legacy_handle"),
                )
            return True
        # A retry, including a second worker's concurrent request, succeeds
        # idempotently. The guarded UPDATE preserves the original audit fields.
        return conn.execute(
            "SELECT 1 FROM risk_events WHERE id = ? AND scenario = 'university' AND " + _sql_bool_eq("handled", True),
            (event_id,),
        ).fetchone() is not None


def list_user_interventions(user_id: int, scenario: str, limit: int = 50) -> list[dict]:
    """单用户已处理的干预记录（红/黄码），供账号管理记录展示。"""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, level, score, tags, summary, action, note, handled_by, handled_at, created_at "
            "FROM risk_events WHERE user_id = ? AND scenario = ? AND " + _sql_bool_eq("handled", True) + " "
            "ORDER BY handled_at DESC LIMIT ?",
            (user_id, scenario, limit),
        ).fetchall()
    result = []
    for r in rows:
        try:
            tags = r["tags"] if isinstance(r["tags"], (list, dict)) else _json.loads(r["tags"] or "[]")
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


# ─── 状态机 / 跟进记录 / 复评（CASE-01..04）──────────────────────────────────

VALID_STATUSES = (
    "pending", "claimed", "verifying", "intervening", "referred", "monitoring", "closed",
)

# 合法边：from → set(to)。pending→claimed 只由 claim_risk_event / assign_risk_event 写入，
# 它们用 assignee 为空的条件更新避免并发认领互相覆盖。流转接口不承接认领。
# claimed → intervening / monitoring 保留给已认领后的工作台路径；closed→monitoring 非法。
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": set(),
    "claimed": {"verifying", "intervening", "monitoring"},
    "verifying": {"intervening", "closed"},
    "intervening": {"referred", "monitoring", "closed"},
    "referred": {"monitoring", "closed"},
    "monitoring": {"intervening", "closed"},
    "closed": {"intervening"},  # 重开（本批可不做全量，保留最小边）
}

# 结案标注：confirmed=确认风险 / false_positive=误报 / undetermined=无法判断
# + legacy_unlabeled（仅 handle 快速结案兼容，页显「未标注」）
CLOSURE_LABELS = ("confirmed", "false_positive", "undetermined", "legacy_unlabeled")

RECORD_TYPES = ("interview", "phone", "home_visit", "referral", "contact_parent", "other", "correction", "reassessment")

REASSESS_INTERVALS_DAYS = (14, 30)


def _effective_status(row) -> str:
    if "status" in row.keys() and row["status"]:
        return row["status"]
    if row["handled"]:
        return "closed"
    if "assignee" in row.keys() and row["assignee"]:
        return "claimed"
    return "pending"


def _schedule_reassessments(conn, event_id: int) -> None:
    """Create default 14/30 day reassessments if none pending exist."""
    existing = conn.execute(
        "SELECT COUNT(*) AS n FROM reassessments WHERE event_id = ? AND completed_at IS NULL",
        (event_id,),
    ).fetchone()["n"]
    if existing > 0:
        return
    for days in REASSESS_INTERVALS_DAYS:
        conn.execute(
            "INSERT INTO reassessments (event_id, due_date, created_at) "
            "VALUES (?, " + sql_today_plus_days() + ", " + sql_now() + ")",
            (event_id, days_ahead_param(days)),
        )


def transition_risk_event(
    event_id: int,
    to_status: str,
    actor: str,
    reason: Optional[str] = None,
    closure_label: Optional[str] = None,
    closure_other_person: bool = False,
    closure_note: Optional[str] = None,
) -> tuple[str, Optional[dict]]:
    """Apply a legal status transition. Returns (ok|illegal|missing|bad_closure, event)."""
    to_status = (to_status or "").strip()
    if to_status not in VALID_STATUSES:
        return "illegal", None
    with get_conn() as conn:
        row = conn.execute(
            _RISK_EVENT_SELECT + "WHERE r.id = ? AND r.scenario = 'university'",
            (event_id,),
        ).fetchone()
        if not row:
            return "missing", None
        from_status = _effective_status(row)
        allowed = ALLOWED_TRANSITIONS.get(from_status, set())
        if to_status not in allowed:
            return "illegal", _row_to_risk_event(row)

        if to_status == "closed":
            label = (closure_label or "").strip()
            note = (closure_note or "").strip()
            if label not in ("confirmed", "false_positive", "undetermined"):
                return "bad_closure", _row_to_risk_event(row)
            if not note:
                return "bad_closure", _row_to_risk_event(row)
            conn.execute(
                "UPDATE risk_events SET status = 'closed', handled = " + _sql_bool(True) + ", "
                "closed_at = " + sql_now() + ", "
                "closure_label = ?, closure_other_person = ?, closure_note = ?, "
                "handled_at = COALESCE(handled_at, " + sql_now() + "), "
                "handled_by = COALESCE(handled_by, ?) "
                "WHERE id = ? AND scenario = 'university'",
                (label, 1 if closure_other_person else 0, note, actor, event_id),
            )
            if label == "confirmed":
                _schedule_reassessments(conn, event_id)
        elif from_status == "closed" and to_status == "intervening":
            # 重开：不清除旧标注
            if not (reason or "").strip():
                return "bad_closure", _row_to_risk_event(row)
            conn.execute(
                "UPDATE risk_events SET status = 'intervening', handled = " + _sql_bool(False) + " "
                "WHERE id = ? AND scenario = 'university'",
                (event_id,),
            )
        else:
            conn.execute(
                "UPDATE risk_events SET status = ? "
                "WHERE id = ? AND scenario = 'university'",
                (to_status, event_id),
            )
            if to_status == "monitoring":
                _schedule_reassessments(conn, event_id)

        conn.execute(
            "INSERT INTO event_transitions (event_id, from_status, to_status, actor, reason, created_at) "
            "VALUES (?, ?, ?, ?, ?, " + sql_now() + ")",
            (event_id, from_status, to_status, actor, reason),
        )
        row = conn.execute(
            _RISK_EVENT_SELECT + "WHERE r.id = ? AND r.scenario = 'university'",
            (event_id,),
        ).fetchone()
        return "ok", _row_to_risk_event(row)


def list_event_transitions(event_id: int, limit: int = 50) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, event_id, from_status, to_status, actor, reason, created_at "
            "FROM event_transitions WHERE event_id = ? ORDER BY id ASC LIMIT ?",
            (event_id, limit),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "event_id": r["event_id"],
            "from_status": r["from_status"],
            "to_status": r["to_status"],
            "actor": r["actor"],
            "reason": r["reason"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def add_follow_up_record(
    event_id: int,
    record_type: str,
    occurred_at: str,
    summary: str,
    actor: str,
    referral_target: Optional[str] = None,
    advance_to_referred: bool = False,
) -> tuple[str, Optional[dict], Optional[dict]]:
    """Append a follow-up record. Returns (ok|missing|illegal|bad_input, record, event)."""
    record_type = (record_type or "").strip()
    summary = (summary or "").strip()
    occurred_at = (occurred_at or "").strip()
    if record_type not in RECORD_TYPES:
        return "bad_input", None, None
    if not summary or len(summary) > 500:
        return "bad_input", None, None
    if not occurred_at:
        return "bad_input", None, None
    do_refer = False
    with get_conn() as conn:
        row = conn.execute(
            _RISK_EVENT_SELECT + "WHERE r.id = ? AND r.scenario = 'university'",
            (event_id,),
        ).fetchone()
        if not row:
            return "missing", None, None
        status = _effective_status(row)
        if status in ("pending", "closed") and record_type != "reassessment":
            return "illegal", None, _row_to_risk_event(row)
        cur = conn.execute(
            "INSERT INTO follow_up_records "
            "(event_id, type, occurred_at, summary, referral_target, actor, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, " + sql_now() + ")",
            (event_id, record_type, occurred_at, summary, referral_target, actor),
        )
        rid = cur.lastrowid
        do_refer = bool(
            advance_to_referred and record_type == "referral" and status == "intervening"
        )
        rec = conn.execute(
            "SELECT id, event_id, type, occurred_at, summary, referral_target, actor, created_at "
            "FROM follow_up_records WHERE id = ?",
            (rid,),
        ).fetchone()
        record = {
            "id": rec["id"],
            "event_id": rec["event_id"],
            "type": rec["type"],
            "occurred_at": rec["occurred_at"],
            "summary": rec["summary"],
            "referral_target": rec["referral_target"],
            "actor": rec["actor"],
            "created_at": rec["created_at"],
        }
        event = _row_to_risk_event(row)
    if do_refer:
        st, event2 = transition_risk_event(
            event_id, "referred", actor, reason="跟进记录：转介",
        )
        if st == "ok" and event2:
            event = event2
        else:
            event = get_risk_event(event_id) or event
    return "ok", record, event


def list_follow_up_records(event_id: int, limit: int = 50) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, event_id, type, occurred_at, summary, referral_target, actor, created_at "
            "FROM follow_up_records WHERE event_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?",
            (event_id, limit),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "event_id": r["event_id"],
            "type": r["type"],
            "occurred_at": r["occurred_at"],
            "summary": r["summary"],
            "referral_target": r["referral_target"],
            "actor": r["actor"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def list_reassessments(
    due: Optional[str] = None,
    event_id: Optional[int] = None,
    include_completed: bool = False,
    limit: int = 100,
) -> list[dict]:
    """due: today | overdue | upcoming | all"""
    sql = (
        "SELECT ra.id, ra.event_id, ra.due_date, ra.completed_at, ra.result, ra.actor, ra.created_at, "
        "r.level, r.summary, r.status, r.assignee, u.account AS student_account "
        "FROM reassessments ra "
        "JOIN risk_events r ON r.id = ra.event_id "
        "JOIN users u ON u.id = r.user_id "
        "WHERE 1=1"
    )
    params: list = []
    if event_id is not None:
        sql += " AND ra.event_id = ?"
        params.append(event_id)
    if not include_completed:
        sql += " AND ra.completed_at IS NULL"
    today = sql_today()
    if due == "today":
        sql += f" AND ra.completed_at IS NULL AND ra.due_date = {today}"
    elif due == "overdue":
        sql += f" AND ra.completed_at IS NULL AND ra.due_date < {today}"
    elif due == "upcoming":
        sql += f" AND ra.completed_at IS NULL AND ra.due_date >= {today}"
    sql += " ORDER BY ra.due_date ASC, ra.id ASC LIMIT ?"
    params.append(limit)
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [
        {
            "id": r["id"],
            "event_id": r["event_id"],
            "due_date": r["due_date"],
            "completed_at": r["completed_at"],
            "result": r["result"],
            "actor": r["actor"],
            "created_at": r["created_at"],
            "level": r["level"],
            "summary": r["summary"],
            "status": r["status"],
            "assignee": r["assignee"],
            "student_account": r["student_account"],
        }
        for r in rows
    ]


def complete_reassessment(
    reassessment_id: int,
    result: str,
    actor: str,
    note: Optional[str] = None,
) -> tuple[str, Optional[dict], Optional[dict]]:
    """result: improved | still_risk. Returns (ok|missing|done|bad_input, reassessment, event)."""
    result = (result or "").strip()
    if result not in ("improved", "still_risk"):
        return "bad_input", None, None
    with get_conn() as conn:
        ra = conn.execute(
            "SELECT id, event_id, due_date, completed_at, result, actor, created_at "
            "FROM reassessments WHERE id = ?",
            (reassessment_id,),
        ).fetchone()
        if not ra:
            return "missing", None, None
        if ra["completed_at"]:
            return "done", {
                "id": ra["id"],
                "event_id": ra["event_id"],
                "due_date": ra["due_date"],
                "completed_at": ra["completed_at"],
                "result": ra["result"],
                "actor": ra["actor"],
                "created_at": ra["created_at"],
            }, get_risk_event(ra["event_id"])
        conn.execute(
            "UPDATE reassessments SET completed_at = " + sql_now() + ", "
            "result = ?, actor = ? WHERE id = ? AND completed_at IS NULL",
            (result, actor, reassessment_id),
        )
        summary = note or ("复评结果：好转" if result == "improved" else "复评结果：仍有风险")
        conn.execute(
            "INSERT INTO follow_up_records "
            "(event_id, type, occurred_at, summary, referral_target, actor, created_at) "
            "VALUES (?, 'reassessment', " + sql_now() + ", ?, NULL, ?, " + sql_now() + ")",
            (ra["event_id"], summary[:500], actor),
        )

    event = get_risk_event(ra["event_id"])
    if result == "still_risk" and event and event.get("status") == "monitoring":
        st, event = transition_risk_event(
            ra["event_id"], "intervening", actor, reason="reassess_still_risk",
        )
        if st != "ok":
            pass
    elif result == "improved" and event and event.get("status") == "monitoring":
        # Acceptance CASE-03：好转 → closed，结案标注确认风险
        st, event = transition_risk_event(
            ra["event_id"],
            "closed",
            actor,
            reason="reassess_improved",
            closure_label="confirmed",
            closure_note=(note or "复评结果：好转")[:500],
        )
        if st != "ok":
            pass

    ra2 = list_reassessments(event_id=ra["event_id"], include_completed=True, limit=200)
    found = next((x for x in ra2 if x["id"] == reassessment_id), None)
    return "ok", found, event



def create_reassessment(
    event_id: int,
    due_date: str,
    actor: str,
) -> tuple[str, Optional[dict]]:
    """Manually schedule one reassessment (YYYY-MM-DD). Returns (ok|missing|bad_input|illegal, item)."""
    due_date = (due_date or "").strip()
    if len(due_date) < 10:
        return "bad_input", None
    due_date = due_date[:10]
    with get_conn() as conn:
        row = conn.execute(
            _RISK_EVENT_SELECT + "WHERE r.id = ? AND r.scenario = 'university'",
            (event_id,),
        ).fetchone()
        if not row:
            return "missing", None
        status = _effective_status(row)
        # 进入 monitoring 或已结案(确认风险)后可创建；intervening 也允许人工加一次
        if status not in ("monitoring", "intervening", "closed", "referred"):
            return "illegal", None
        if status == "closed" and (row["closure_label"] or "") not in ("confirmed", "legacy_unlabeled"):
            # 误报/无法判断结案默认不再复评；仍允许人工（降级为 ok）时放宽：本批允许
            pass
        cur = conn.execute(
            "INSERT INTO reassessments (event_id, due_date, created_at) "
            "VALUES (?, ?, " + sql_now() + ")",
            (event_id, due_date),
        )
        rid = cur.lastrowid
    items = list_reassessments(event_id=event_id, include_completed=True, limit=200)
    found = next((x for x in items if x["id"] == rid), None)
    return "ok", found


def next_statuses_for(status: str) -> list[str]:
    return sorted(ALLOWED_TRANSITIONS.get(status, set()))




def _parse_ts(value):
    """Parse DB timestamp to naive Asia/Taipei wall datetime for comparisons."""
    if not value:
        return None
    from datetime import datetime, timezone, timedelta
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is not None:
            from zoneinfo import ZoneInfo
            return dt.astimezone(ZoneInfo("Asia/Taipei")).replace(tzinfo=None)
        return dt
    raw = str(value).strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw[:26], fmt)
        except ValueError:
            continue
    return None


def _now_local():
    from datetime import datetime, timedelta, timezone
    # Mirror wall clock used in SQLite TEXT path; PG stores UTC but API normalizes to +8 wall.
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=8)


def enrich_risk_event_timeout(event: dict, *, persist_escalation: bool = True) -> dict:
    """Attach claim_due_at / is_overdue / overdue_minutes; first overdue sets escalated_at once."""
    if not event:
        return event
    status = event.get("status") or "pending"
    level = event.get("level") or "yellow"
    created = event.get("created_at")
    due = event.get("claim_due_at")
    if not due and created:
        minutes = _claim_due_minutes_for_level(level)
        created_dt = _parse_ts(created)
        if created_dt:
            from datetime import timedelta
            due_dt = created_dt + timedelta(minutes=minutes)
            due = due_dt.strftime("%Y-%m-%d %H:%M:%S")
            event["claim_due_at"] = due
            # backfill quietly
            try:
                with get_conn() as conn:
                    conn.execute(
                        "UPDATE risk_events SET claim_due_at = ? "
                        "WHERE id = ? AND claim_due_at IS NULL",
                        (due, event["id"]),
                    )
            except Exception:
                pass
    is_overdue = False
    overdue_minutes = 0
    due_dt = _parse_ts(due)
    now = _now_local()
    # POOL-02：超过认领截止时间仍为 pending 即超时，含已填负责人但尚未认领的事件。
    if status == "pending" and due_dt and now > due_dt:
        is_overdue = True
        overdue_minutes = max(0, int((now - due_dt).total_seconds() // 60))
        if persist_escalation and not event.get("escalated_at"):
            with get_conn() as conn:
                cur = conn.execute(
                    "UPDATE risk_events SET escalated_at = " + sql_now() + " "
                    "WHERE id = ? AND scenario = 'university' "
                    "AND escalated_at IS NULL",
                    (event["id"],),
                )
                if cur.rowcount > 0:
                    event["escalated_at"] = now.strftime("%Y-%m-%d %H:%M:%S")
                    try:
                        write_audit_log(
                            actor="system",
                            action="escalate_overdue",
                            target_type="risk_event",
                            target_id=str(event["id"]),
                            meta={"level": level, "overdue_minutes": overdue_minutes},
                        )
                    except Exception:
                        pass
            # re-read escalated_at
            row = None
            with get_conn() as conn:
                row = conn.execute(
                    "SELECT escalated_at FROM risk_events WHERE id = ?",
                    (event["id"],),
                ).fetchone()
            if row and row["escalated_at"]:
                event["escalated_at"] = row["escalated_at"]
    event["is_overdue"] = is_overdue
    event["overdue_minutes"] = overdue_minutes
    return event



# ─── Admin alerts SSE bus (单进程内存队列；无对话原文) ─────────────────────────

_ALERT_SUBSCRIBERS: list[queue.Queue] = []
_ALERT_SUB_LOCK = threading.Lock()


def subscribe_risk_alerts() -> queue.Queue:
    """Register an SSE subscriber queue (max 64 buffered events)."""
    q: queue.Queue = queue.Queue(maxsize=64)
    with _ALERT_SUB_LOCK:
        _ALERT_SUBSCRIBERS.append(q)
    return q


def unsubscribe_risk_alerts(q: queue.Queue) -> None:
    with _ALERT_SUB_LOCK:
        try:
            _ALERT_SUBSCRIBERS.remove(q)
        except ValueError:
            pass


def publish_risk_alert_created(event_id: int, scenario: str = "university") -> None:
    """Push a desensitized alert payload to all SSE subscribers.

    Payload uses get_risk_event (summary/tags only; never joins chat_messages).
    """
    event = get_risk_event(event_id, scenario=scenario)
    if not event:
        return
    event = enrich_risk_event_timeout(dict(event), persist_escalation=False)
    # 仅保留工作台列表所需脱敏字段，杜绝原文泄漏
    item = {
        "id": event.get("id"),
        "user_id": event.get("user_id"),
        "account": event.get("account"),
        "scenario": event.get("scenario"),
        "level": event.get("level"),
        "score": event.get("score"),
        "tags": event.get("tags") or [],
        "summary": event.get("summary"),
        "handled": bool(event.get("handled")),
        "handled_at": event.get("handled_at"),
        "handled_by": event.get("handled_by"),
        "action": event.get("action"),
        "note": event.get("note"),
        "assignee": event.get("assignee"),
        "claimed_at": event.get("claimed_at"),
        "status": event.get("status"),
        "closed_at": event.get("closed_at"),
        "closure_label": event.get("closure_label"),
        "closure_other_person": bool(event.get("closure_other_person")),
        "closure_note": event.get("closure_note"),
        "claim_due_at": event.get("claim_due_at"),
        "escalated_at": event.get("escalated_at"),
        "created_at": event.get("created_at"),
        "is_overdue": bool(event.get("is_overdue")),
        "overdue_minutes": int(event.get("overdue_minutes") or 0),
    }
    payload = {"type": "alert_created", "item": item}
    with _ALERT_SUB_LOCK:
        subs = list(_ALERT_SUBSCRIBERS)
    stale: list[queue.Queue] = []
    for q in subs:
        try:
            q.put_nowait(payload)
        except queue.Full:
            stale.append(q)
        except Exception:
            stale.append(q)
    for q in stale:
        unsubscribe_risk_alerts(q)


def list_risk_events_enriched(
    level: Optional[str] = None,
    scenario: Optional[str] = None,
    handled: Optional[bool] = None,
    limit: int = 100,
) -> list[dict]:
    items = list_risk_events(level=level, scenario=scenario, handled=handled, limit=limit)
    return [enrich_risk_event_timeout(dict(it)) for it in items]


def count_overdue_alerts(scenario: str = "university") -> int:
    items = list_risk_events_enriched(scenario=scenario, handled=False, limit=500)
    return sum(1 for it in items if it.get("is_overdue"))


def _percentile(sorted_vals: list[float], p: float) -> Optional[float]:
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return round(sorted_vals[0], 1)
    k = (len(sorted_vals) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return round(sorted_vals[f], 1)
    return round(sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f), 1)


def _suppress_count(n: int) -> object:
    """小数抑制：小于 5 显示 '<5'（聚合格子）。"""
    if n <= 0:
        return 0
    if n < 5:
        return "<5"
    return n


def get_admin_metrics(scenario: str = "university", days: int = 7) -> dict:
    """匿名聚合看板数据（不含学生账号/原文）。"""
    trend = get_risk_trend(scenario, days)
    tags = get_risk_tag_distribution(scenario, limit=12)
    # 状态在途
    with get_conn() as conn:
        status_rows = conn.execute(
            "SELECT COALESCE(NULLIF(status,''), CASE WHEN " + _sql_bool_eq("handled", True) + " THEN 'closed' "
            "WHEN assignee IS NOT NULL AND assignee != '' THEN 'claimed' ELSE 'pending' END) AS st, "
            "COUNT(*) AS n FROM risk_events WHERE scenario = ? GROUP BY st",
            (scenario,),
        ).fetchall()
        closure_rows = conn.execute(
            "SELECT COALESCE(NULLIF(closure_label,''), 'unknown') AS lab, COUNT(*) AS n "
            "FROM risk_events WHERE scenario = ? AND (status = 'closed' OR " + _sql_bool_eq("handled", True) + ") "
            "GROUP BY lab",
            (scenario,),
        ).fetchall()
        # 认领时长（分钟）：claimed_at - created_at
        claim_rows = conn.execute(
            "SELECT level, claimed_at, created_at FROM risk_events "
            "WHERE scenario = ? AND " + _sql_ts_present("claimed_at"),
            (scenario,),
        ).fetchall()
        # 按标签误报
        tag_fp_rows = conn.execute(
            "SELECT tags, closure_label FROM risk_events "
            "WHERE scenario = ? AND (status = 'closed' OR " + _sql_bool_eq("handled", True) + ")",
            (scenario,),
        ).fetchall()

    by_level: dict[str, list[float]] = {"red": [], "yellow": []}
    for r in claim_rows:
        a = _parse_ts(r["claimed_at"])
        b = _parse_ts(r["created_at"])
        if not a or not b:
            continue
        mins = max(0.0, (a - b).total_seconds() / 60.0)
        key = r["level"] if r["level"] in by_level else None
        if key:
            by_level[key].append(mins)

    claim_stats = {}
    for lv, vals in by_level.items():
        vals = sorted(vals)
        claim_stats[lv] = {
            "count": len(vals),
            "median_minutes": _percentile(vals, 0.5),
            "p90_minutes": _percentile(vals, 0.9),
        }

    status_counts = {r["st"]: r["n"] for r in status_rows}
    closure_counts = {r["lab"]: r["n"] for r in closure_rows}

    # 误报率 by tag
    tag_totals: dict[str, int] = {}
    tag_fp: dict[str, int] = {}
    for r in tag_fp_rows:
        try:
            tlist = r["tags"] if isinstance(r["tags"], (list, dict)) else _json.loads(r["tags"] or "[]")
        except Exception:
            tlist = []
        for tag in tlist:
            tag_totals[tag] = tag_totals.get(tag, 0) + 1
            if r["closure_label"] == "false_positive":
                tag_fp[tag] = tag_fp.get(tag, 0) + 1
    false_positive_by_tag = []
    for tag, total in sorted(tag_totals.items(), key=lambda x: -x[1])[:12]:
        fp = tag_fp.get(tag, 0)
        false_positive_by_tag.append({
            "tag": tag,
            "closed_count": _suppress_count(total),
            "false_positive_count": _suppress_count(fp),
            "false_positive_rate": round(fp / total, 3) if total >= 5 else None,
        })

    overdue = count_overdue_alerts(scenario)
    open_count = sum(v for k, v in status_counts.items() if k != "closed")

    suppressed_trend = []
    for t in trend:
        cell = dict(t)
        c = int(t.get("count") or 0)
        cell["yellow"] = _suppress_count(int(t.get("yellow") or 0))
        cell["red"] = _suppress_count(int(t.get("red") or 0))
        cell["count"] = _suppress_count(c)
        if c < 5:
            cell["avg_score"] = None
        suppressed_trend.append(cell)

    return {
        "trend": suppressed_trend,
        "tags": [{"tag": t["tag"], "count": _suppress_count(t["count"])} for t in tags],
        "status_counts": {k: _suppress_count(v) for k, v in status_counts.items()},
        "closure_counts": {k: _suppress_count(v) for k, v in closure_counts.items()},
        "claim_duration": claim_stats,
        "overdue_count": overdue,
        "open_count": open_count,
        "false_positive_by_tag": false_positive_by_tag,
        "days": days,
        "note": "聚合指标不含学生账号与消息原文；计数<5 显示为 <5。",
    }


def list_audit_logs(
    actor: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """只读审计元数据，不含对话原文。返回 (items, total)。"""
    where = " WHERE 1=1"
    params: list = []
    if actor:
        where += " AND actor = ?"
        params.append(actor)
    if action:
        where += " AND action = ?"
        params.append(action)
    with get_conn() as conn:
        total = conn.execute(
            "SELECT COUNT(*) AS n FROM audit_logs" + where, params
        ).fetchone()["n"]
        rows = conn.execute(
            "SELECT id, actor, action, target_type, target_id, meta, created_at "
            "FROM audit_logs" + where + " ORDER BY id DESC LIMIT ? OFFSET ?",
            params + [limit, max(0, offset)],
        ).fetchall()
    out = []
    banned = {"content", "message", "text", "raw", "prompt", "password", "token", "secret", "api_key"}
    for r in rows:
        meta = {}
        try:
            raw = r["meta"] if isinstance(r["meta"], (list, dict)) else _json.loads(r["meta"] or "{}")
            if isinstance(raw, dict):
                for k, v in raw.items():
                    if str(k).lower() in banned:
                        continue
                    if isinstance(v, str) and len(v) > 200:
                        v = v[:200] + "…"
                    meta[k] = v
        except Exception:
            meta = {}
        out.append({
            "id": r["id"],
            "actor": r["actor"],
            "action": r["action"],
            "target_type": r["target_type"],
            "target_id": r["target_id"],
            "meta": meta,
            "created_at": r["created_at"],
        })
    return out, int(total)


def get_admin_config_summary() -> dict:
    """只读配置摘要（热线/时限等），供工作台展示。"""
    import os
    timeouts = get_claim_timeouts()
    try:
        intervals = [
            int(x.strip())
            for x in (os.getenv("REASSESS_INTERVAL_DAYS", "14,30") or "14,30").split(",")
            if x.strip().isdigit()
        ]
    except Exception:
        intervals = [14, 30]
    if not intervals:
        intervals = [14, 30]
    return {
        "claim_timeouts": timeouts,
        "reassess_interval_days": intervals,
        "psych_center": {
            "label": (os.getenv("SCHOOL_PSYCH_CENTER_LABEL") or "学校心理中心").strip(),
            "phone": (os.getenv("SCHOOL_PSYCH_CENTER_PHONE") or "").strip() or None,
        },
        "hotline": {
            "label": (os.getenv("HOTLINE_24H_LABEL") or "24h 心理援助热线").strip(),
            "phone": (os.getenv("HOTLINE_24H_PHONE") or "").strip() or None,
        },
        "appointment": {
            "label": (os.getenv("APPOINTMENT_LABEL") or "预约心理咨询").strip(),
            "url": (os.getenv("APPOINTMENT_URL") or "").strip() or None,
        },
        "is_placeholder": (os.getenv("HELP_RESOURCES_IS_PLACEHOLDER") or "0").strip() in ("1", "true", "True", "yes"),
        "source": "environment",
        "editable": False,
    }










def _sql_local_date(column: str) -> str:
    """Calendar date in Asia/Taipei for PG timestamptz; SQLite TEXT wall clock date()."""
    from db import using_postgres
    if using_postgres():
        return f"(({column} AT TIME ZONE 'Asia/Taipei')::date)"
    return f"date({column})"


def _sql_ts_present(column: str) -> str:
    """Non-null timestamp predicate (SQLite historically also rejected empty string)."""
    from db import using_postgres
    if using_postgres():
        return f"{column} IS NOT NULL"
    return f"{column} IS NOT NULL AND {column} != ''"

def _sql_bool(value: bool) -> str:
    """Literal true/false compatible with Postgres BOOLEAN and SQLite INTEGER."""
    from db import using_postgres
    if using_postgres():
        return "TRUE" if value else "FALSE"
    return "1" if value else "0"


def _sql_bool_eq(column: str, value: bool) -> str:
    return f"{column} = {_sql_bool(value)}"

def _sql_is_demo_true() -> str:
    """Postgres boolean vs SQLite integer affinity."""
    from db import using_postgres
    return "COALESCE(is_demo, FALSE) IS TRUE" if using_postgres() else "COALESCE(is_demo, 0) = 1"


def _sql_is_demo_false(alias: str = "") -> str:
    from db import using_postgres
    if not alias:
        col = "is_demo"
    elif alias.endswith("."):
        col = f"{alias}is_demo"
    else:
        col = f"{alias}.is_demo"
    if using_postgres():
        return f"COALESCE({col}, FALSE) IS NOT TRUE"
    return f"COALESCE({col}, 0) = 0"


def _sql_set_is_demo_true() -> str:
    from db import using_postgres
    return "TRUE" if using_postgres() else "1"

def purge_demo_users() -> dict:
    """启动时清理演示账号及其专属关联数据。

    安全边界：
    - 仅删除 users.is_demo = 1 的账号（正式注册用户默认 is_demo=0，绝不误删）
    - 历史种子号 001(student) 若仍存在且为演示遗留，启动时标 is_demo=1 再删
    - G001 及 G002–G010 可为正式管理员，不再因工号被自动标演示
    - 级联删除仅属于这些用户的 profile / chat / risk_events 及子表
    - 清理仍指向已删工号的 assignee/handled_by；删除其 audit_logs
    - 不再创建或注入任何演示账号
    """
    with get_conn() as conn:
        # 仅清理历史学生演示号 001；G001 等管理员工号可为正式账号，不再强制标演示
        conn.execute(
            "UPDATE users SET is_demo = " + _sql_set_is_demo_true() + " WHERE account = '001' AND role = 'student'"
        )
        rows = conn.execute(
            "SELECT id, account FROM users WHERE " + _sql_is_demo_true()
        ).fetchall()
        if not rows:
            return {"deleted_users": 0, "accounts": []}

        user_ids = [r["id"] for r in rows]
        accounts = [r["account"] for r in rows]
        placeholders = ",".join("?" * len(user_ids))

        event_rows = conn.execute(
            f"SELECT id FROM risk_events WHERE user_id IN ({placeholders})",
            user_ids,
        ).fetchall()
        event_ids = [r["id"] for r in event_rows]

        if event_ids:
            ep = ",".join("?" * len(event_ids))
            conn.execute(
                f"DELETE FROM event_transitions WHERE event_id IN ({ep})", event_ids
            )
            conn.execute(
                f"DELETE FROM follow_up_records WHERE event_id IN ({ep})", event_ids
            )
            conn.execute(
                f"DELETE FROM reassessments WHERE event_id IN ({ep})", event_ids
            )
            conn.execute(
                f"DELETE FROM risk_events WHERE id IN ({ep})", event_ids
            )

        conn.execute(
            f"DELETE FROM chat_messages WHERE user_id IN ({placeholders})", user_ids
        )
        conn.execute(
            f"DELETE FROM user_profiles WHERE user_id IN ({placeholders})", user_ids
        )

        # 正式用户事件上若曾被演示工号认领，清空引用（不删事件）
        ap = ",".join("?" * len(accounts))
        conn.execute(
            f"UPDATE risk_events SET assignee = NULL, claimed_at = NULL "
            f"WHERE assignee IN ({ap})",
            accounts,
        )
        conn.execute(
            f"UPDATE risk_events SET handled_by = NULL WHERE handled_by IN ({ap})",
            accounts,
        )
        conn.execute(
            f"DELETE FROM audit_logs WHERE actor IN ({ap})",
            accounts,
        )

        conn.execute(
            f"DELETE FROM users WHERE id IN ({placeholders})", user_ids
        )
        return {"deleted_users": len(user_ids), "accounts": accounts}

