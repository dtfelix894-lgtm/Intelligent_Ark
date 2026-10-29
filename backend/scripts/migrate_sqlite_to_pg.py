#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migrate Intelligent_Ark SQLite -> PostgreSQL (v1).

Contract: PDRs/DB_PostgreSQL_Design.md §2.3 / §7
Schema:   backend/sql/pg_schema_v1.sql

Dependency (install into the backend venv before a real migrate):
    pip install "psycopg[binary]>=3.1"

Usage (Windows PowerShell):
    cd D:\\PycharmProjects\\Intelligent_Ark\\backend

    # SQLite-only dry validation (no Postgres password needed):
    python scripts/migrate_sqlite_to_pg.py --sqlite-only-check

    # Full dry-run against Postgres (needs DATABASE_URL with real password later):
    $env:DATABASE_URL = "postgresql://ark_app:REPLACE_WITH_APP_PASSWORD@127.0.0.1:5432/intelligent_ark"
    python scripts/migrate_sqlite_to_pg.py --dry-run

    # Apply (after schema applied and URL set):
    python scripts/migrate_sqlite_to_pg.py
    python scripts/migrate_sqlite_to_pg.py --apply-schema

Exit codes:
    0  success
    1  usage / validation / count mismatch / migrate error
    2  missing dependency (psycopg) when PG is required
    3  missing DATABASE_URL when PG is required

Does NOT invent passwords. Does NOT delete the SQLite file.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")
UTC = ZoneInfo("UTC")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SQLITE = BACKEND_DIR / "intelligent_ark.db"
DEFAULT_SCHEMA = BACKEND_DIR / "sql" / "pg_schema_v1.sql"

# Parent -> children load order (FK-safe)
TABLE_ORDER = [
    "users",
    "user_profiles",
    "chat_messages",
    "risk_events",
    "event_transitions",
    "follow_up_records",
    "reassessments",
    "audit_logs",
]

# Tables with IDENTITY / sequences that need setval after id-preserving inserts
IDENTITY_TABLES = [
    "users",
    "chat_messages",
    "risk_events",
    "event_transitions",
    "follow_up_records",
    "reassessments",
    "audit_logs",
]


def wall_plus8_text_to_utc(ts: Any) -> Optional[datetime]:
    """Parse naive Asia/Taipei wall TEXT once -> UTC aware datetime. No extra +8."""
    if ts is None:
        return None
    s = str(ts).strip()
    if not s:
        return None
    # Accept "YYYY-MM-DD HH:MM:SS" or with fractional seconds / T separator
    s = s.replace("T", " ")[:26]
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            naive = datetime.strptime(s[: len("YYYY-MM-DD HH:MM:SS.ffffff") if "." in s else 19], fmt)
            return naive.replace(tzinfo=TAIPEI).astimezone(UTC)
        except ValueError:
            continue
    raise ValueError(f"unrecognized timestamp text: {ts!r}")


def parse_date_only(val: Any) -> Optional[date]:
    if val is None:
        return None
    s = str(val).strip()[:10]
    if not s:
        return None
    return datetime.strptime(s, "%Y-%m-%d").date()


def as_bool(val: Any) -> bool:
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(int(val))
    s = str(val).strip().lower()
    if s in ("1", "true", "t", "yes"):
        return True
    if s in ("0", "false", "f", "no", ""):
        return False
    raise ValueError(f"cannot cast bool: {val!r}")


def as_json(val: Any, *, default: Any = None) -> Any:
    if val is None:
        return default
    if isinstance(val, (dict, list)):
        return val
    s = str(val).strip()
    if not s:
        return default
    return json.loads(s)


def transform_users(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "account": row["account"],
        "password_hash": row["password_hash"],
        "role": row["role"],
        "is_demo": as_bool(row["is_demo"]) if "is_demo" in row.keys() else False,
        "created_at": wall_plus8_text_to_utc(row["created_at"]),
    }


def transform_user_profiles(row: sqlite3.Row) -> dict:
    keys = row.keys()
    return {
        "user_id": row["user_id"],
        "school": row["school"],
        "student_id": row["student_id"],
        "education": row["education"],
        "qq_email": row["qq_email"],
        "admin_type": row["admin_type"] if "admin_type" in keys else None,
        "school_name": row["school_name"] if "school_name" in keys else None,
        "companion_persona": row["companion_persona"] if "companion_persona" in keys else None,
    }


def transform_chat_messages(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "scenario": row["scenario"],
        "role": row["role"],
        "content": row["content"],
        "created_at": wall_plus8_text_to_utc(row["created_at"]),
    }


def transform_risk_events(row: sqlite3.Row) -> dict:
    keys = row.keys()

    def col(name: str, default=None):
        return row[name] if name in keys else default

    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "scenario": row["scenario"],
        "level": row["level"],
        "score": row["score"],
        "tags": as_json(row["tags"], default=[]),
        "summary": row["summary"],
        "handled": as_bool(row["handled"]),
        "created_at": wall_plus8_text_to_utc(row["created_at"]),
        "handled_at": wall_plus8_text_to_utc(col("handled_at")),
        "handled_by": col("handled_by"),
        "action": col("action"),
        "note": col("note"),
        "assignee": col("assignee"),
        "claimed_at": wall_plus8_text_to_utc(col("claimed_at")),
        "status": col("status"),
        "closed_at": wall_plus8_text_to_utc(col("closed_at")),
        "closure_label": col("closure_label"),
        "closure_other_person": as_bool(col("closure_other_person", 0)),
        "closure_note": col("closure_note"),
        "claim_due_at": wall_plus8_text_to_utc(col("claim_due_at")),
        "escalated_at": wall_plus8_text_to_utc(col("escalated_at")),
    }


def transform_event_transitions(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "event_id": row["event_id"],
        "from_status": row["from_status"],
        "to_status": row["to_status"],
        "actor": row["actor"],
        "reason": row["reason"],
        "created_at": wall_plus8_text_to_utc(row["created_at"]),
    }


def transform_follow_up_records(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "event_id": row["event_id"],
        "type": row["type"],
        "occurred_at": wall_plus8_text_to_utc(row["occurred_at"]),
        "summary": row["summary"],
        "referral_target": row["referral_target"],
        "actor": row["actor"],
        "created_at": wall_plus8_text_to_utc(row["created_at"]),
    }


def transform_reassessments(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "event_id": row["event_id"],
        "due_date": parse_date_only(row["due_date"]),
        "completed_at": wall_plus8_text_to_utc(row["completed_at"]),
        "result": row["result"],
        "actor": row["actor"],
        "created_at": wall_plus8_text_to_utc(row["created_at"]),
    }


def transform_audit_logs(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "actor": row["actor"],
        "action": row["action"],
        "target_type": row["target_type"],
        "target_id": row["target_id"],
        "meta": as_json(row["meta"], default=None),
        "created_at": wall_plus8_text_to_utc(row["created_at"]),
    }


TRANSFORMERS: dict[str, Callable[[sqlite3.Row], dict]] = {
    "users": transform_users,
    "user_profiles": transform_user_profiles,
    "chat_messages": transform_chat_messages,
    "risk_events": transform_risk_events,
    "event_transitions": transform_event_transitions,
    "follow_up_records": transform_follow_up_records,
    "reassessments": transform_reassessments,
    "audit_logs": transform_audit_logs,
}

INSERT_SQL: dict[str, str] = {
    "users": """
        INSERT INTO users (id, account, password_hash, role, is_demo, created_at)
        OVERRIDING SYSTEM VALUE
        VALUES (%(id)s, %(account)s, %(password_hash)s, %(role)s, %(is_demo)s, %(created_at)s)
    """,
    "user_profiles": """
        INSERT INTO user_profiles
            (user_id, school, student_id, education, qq_email, admin_type, school_name, companion_persona)
        VALUES (%(user_id)s, %(school)s, %(student_id)s, %(education)s, %(qq_email)s,
                %(admin_type)s, %(school_name)s, %(companion_persona)s)
    """,
    "chat_messages": """
        INSERT INTO chat_messages (id, user_id, scenario, role, content, created_at)
        OVERRIDING SYSTEM VALUE
        VALUES (%(id)s, %(user_id)s, %(scenario)s, %(role)s, %(content)s, %(created_at)s)
    """,
    "risk_events": """
        INSERT INTO risk_events (
            id, user_id, scenario, level, score, tags, summary, handled, created_at,
            handled_at, handled_by, action, note, assignee, claimed_at, status, closed_at,
            closure_label, closure_other_person, closure_note, claim_due_at, escalated_at
        ) OVERRIDING SYSTEM VALUE VALUES (
            %(id)s, %(user_id)s, %(scenario)s, %(level)s, %(score)s, %(tags)s, %(summary)s,
            %(handled)s, %(created_at)s, %(handled_at)s, %(handled_by)s, %(action)s, %(note)s,
            %(assignee)s, %(claimed_at)s, %(status)s, %(closed_at)s, %(closure_label)s,
            %(closure_other_person)s, %(closure_note)s, %(claim_due_at)s, %(escalated_at)s
        )
    """,
    "event_transitions": """
        INSERT INTO event_transitions
            (id, event_id, from_status, to_status, actor, reason, created_at)
        OVERRIDING SYSTEM VALUE
        VALUES (%(id)s, %(event_id)s, %(from_status)s, %(to_status)s, %(actor)s, %(reason)s, %(created_at)s)
    """,
    "follow_up_records": """
        INSERT INTO follow_up_records
            (id, event_id, type, occurred_at, summary, referral_target, actor, created_at)
        OVERRIDING SYSTEM VALUE
        VALUES (%(id)s, %(event_id)s, %(type)s, %(occurred_at)s, %(summary)s,
                %(referral_target)s, %(actor)s, %(created_at)s)
    """,
    "reassessments": """
        INSERT INTO reassessments
            (id, event_id, due_date, completed_at, result, actor, created_at)
        OVERRIDING SYSTEM VALUE
        VALUES (%(id)s, %(event_id)s, %(due_date)s, %(completed_at)s, %(result)s, %(actor)s, %(created_at)s)
    """,
    "audit_logs": """
        INSERT INTO audit_logs (id, actor, action, target_type, target_id, meta, created_at)
        OVERRIDING SYSTEM VALUE
        VALUES (%(id)s, %(actor)s, %(action)s, %(target_type)s, %(target_id)s, %(meta)s, %(created_at)s)
    """,
}


def open_sqlite(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise FileNotFoundError(f"SQLite DB not found: {path}")
    conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def sqlite_counts(conn: sqlite3.Connection) -> dict[str, int]:
    out: dict[str, int] = {}
    for table in TABLE_ORDER:
        try:
            out[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except sqlite3.Error as e:
            raise RuntimeError(f"SQLite count failed for {table}: {e}") from e
    return out


def sqlite_fetch_all(conn: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    return list(conn.execute(f"SELECT * FROM {table}"))


def validate_sqlite_transforms(conn: sqlite3.Connection) -> dict[str, int]:
    """Transform every row; raise on bad timestamps/JSON. Returns planned insert counts."""
    planned: dict[str, int] = {}
    for table in TABLE_ORDER:
        rows = sqlite_fetch_all(conn, table)
        xf = TRANSFORMERS[table]
        for i, row in enumerate(rows):
            try:
                xf(row)
            except Exception as e:
                pk = row["id"] if "id" in row.keys() else row["user_id"]
                raise RuntimeError(f"transform failed {table} row#{i} pk={pk}: {e}") from e
        planned[table] = len(rows)
    return planned


def sample_timezone_sanity(conn: sqlite3.Connection, limit: int = 3) -> None:
    """Print SQLite wall vs converted UTC for a few users.created_at rows."""
    rows = conn.execute(
        "SELECT id, created_at FROM users ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    print("Timezone sample (users.created_at):")
    for row in rows:
        utc = wall_plus8_text_to_utc(row["created_at"])
        local = utc.astimezone(TAIPEI).strftime("%Y-%m-%d %H:%M:%S") if utc else None
        print(f"  id={row['id']} sqlite={row['created_at']!r} -> utc={utc} local_check={local}")
        if local and str(row["created_at"]).strip()[:19] != local:
            raise RuntimeError(
                f"timezone round-trip mismatch id={row['id']}: "
                f"sqlite={row['created_at']!r} local_check={local!r}"
            )


def require_psycopg():
    try:
        import psycopg  # noqa: F401
        from psycopg.types.json import Jsonb  # noqa: F401
    except ImportError:
        print(
            "ERROR: psycopg v3 not installed. Run:\n"
            '  pip install "psycopg[binary]>=3.1"',
            file=sys.stderr,
        )
        sys.exit(2)


def resolve_database_url(cli_url: Optional[str]) -> str:
    url = (cli_url or os.getenv("DATABASE_URL") or "").strip()
    if not url:
        print(
            "ERROR: DATABASE_URL not set. Example:\n"
            "  $env:DATABASE_URL = "
            "'postgresql://ark_app:REPLACE_WITH_APP_PASSWORD@127.0.0.1:5432/intelligent_ark'",
            file=sys.stderr,
        )
        sys.exit(3)
    if "REPLACE_WITH" in url or "YOUR_PASSWORD" in url:
        print(
            "ERROR: DATABASE_URL still contains a placeholder password. "
            "Set the real password when ready; this tool will not invent one.",
            file=sys.stderr,
        )
        sys.exit(3)
    if not url.startswith(("postgresql://", "postgres://")):
        print("ERROR: DATABASE_URL must start with postgresql:// or postgres://", file=sys.stderr)
        sys.exit(3)
    return url


def apply_schema(pg_conn, schema_path: Path) -> None:
    sql = schema_path.read_text(encoding="utf-8")
    with pg_conn.cursor() as cur:
        cur.execute(sql)


def pg_counts(pg_conn) -> dict[str, int]:
    out: dict[str, int] = {}
    with pg_conn.cursor() as cur:
        for table in TABLE_ORDER:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            out[table] = cur.fetchone()[0]
    return out


def assert_target_empty(pg_conn) -> None:
    counts = pg_counts(pg_conn)
    nonempty = {t: n for t, n in counts.items() if n}
    if nonempty:
        raise RuntimeError(
            f"target tables not empty (refusing overwrite): {nonempty}. "
            "Use a fresh DB or truncate manually; this script does not wipe data."
        )


def adapt_row_for_pg(table: str, data: dict) -> dict:
    """Wrap JSON fields with Jsonb for psycopg."""
    from psycopg.types.json import Jsonb

    out = dict(data)
    if table == "risk_events":
        out["tags"] = Jsonb(out["tags"] if out["tags"] is not None else [])
    if table == "audit_logs" and out.get("meta") is not None:
        out["meta"] = Jsonb(out["meta"])
    return out


def insert_table(pg_conn, sqlite_conn: sqlite3.Connection, table: str) -> int:
    rows = sqlite_fetch_all(sqlite_conn, table)
    xf = TRANSFORMERS[table]
    sql = INSERT_SQL[table]
    n = 0
    with pg_conn.cursor() as cur:
        for row in rows:
            data = adapt_row_for_pg(table, xf(row))
            cur.execute(sql, data)
            n += 1
    return n


def sync_identity_sequences(pg_conn) -> None:
    with pg_conn.cursor() as cur:
        for table in IDENTITY_TABLES:
            cur.execute(
                """
                SELECT setval(
                    pg_get_serial_sequence(%s, 'id'),
                    COALESCE((SELECT MAX(id) FROM """
                + table
                + """), 1),
                    true
                )
                """,
                (table,),
            )


def compare_counts(src: dict[str, int], dst: dict[str, int]) -> bool:
    ok = True
    print("Row counts SQLite vs Postgres:")
    for table in TABLE_ORDER:
        a, b = src.get(table, 0), dst.get(table, 0)
        mark = "OK" if a == b else "MISMATCH"
        if a != b:
            ok = False
        print(f"  {table:22s} sqlite={a:5d}  pg={b:5d}  {mark}")
    return ok


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Migrate Intelligent_Ark SQLite data to PostgreSQL (v1)."
    )
    p.add_argument(
        "--sqlite",
        type=Path,
        default=DEFAULT_SQLITE,
        help=f"Source SQLite path (default: {DEFAULT_SQLITE})",
    )
    p.add_argument(
        "--database-url",
        default=None,
        help="Postgres URL (else env DATABASE_URL). Never invent passwords.",
    )
    p.add_argument(
        "--schema",
        type=Path,
        default=DEFAULT_SCHEMA,
        help=f"DDL file for --apply-schema (default: {DEFAULT_SCHEMA})",
    )
    p.add_argument(
        "--apply-schema",
        action="store_true",
        help="Execute pg_schema_v1.sql before data load",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate + load inside a transaction, then ROLLBACK (needs DATABASE_URL)",
    )
    p.add_argument(
        "--sqlite-only-check",
        action="store_true",
        help="Validate SQLite transforms/counts/timezone samples only (no Postgres)",
    )
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    sqlite_path = args.sqlite.resolve()

    print(f"SQLite source: {sqlite_path}")
    try:
        sconn = open_sqlite(sqlite_path)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    try:
        counts_src = sqlite_counts(sconn)
        print("SQLite counts:", counts_src)
        planned = validate_sqlite_transforms(sconn)
        print("Transform plan OK:", planned)
        sample_timezone_sanity(sconn)
    except Exception as e:
        print(f"ERROR: SQLite validation failed: {e}", file=sys.stderr)
        sconn.close()
        return 1

    if args.sqlite_only_check:
        print("SQLite-only check passed (no Postgres connection attempted).")
        sconn.close()
        return 0

    # Resolve URL before importing/requiring psycopg so placeholder/missing URL
    # yields exit 3 (documented) even when the driver is not installed yet.
    url = resolve_database_url(args.database_url)
    require_psycopg()
    import psycopg

    print(f"Postgres target: {url.split('@')[-1] if '@' in url else '(url)'}")

    try:
        pg = psycopg.connect(url)
    except Exception as e:
        print(f"ERROR: cannot connect to Postgres: {e}", file=sys.stderr)
        sconn.close()
        return 1

    try:
        pg.execute("BEGIN")
        if args.apply_schema:
            if not args.schema.is_file():
                raise FileNotFoundError(f"schema file missing: {args.schema}")
            print(f"Applying schema: {args.schema}")
            apply_schema(pg, args.schema)

        assert_target_empty(pg)

        loaded: dict[str, int] = {}
        for table in TABLE_ORDER:
            n = insert_table(pg, sconn, table)
            loaded[table] = n
            print(f"  loaded {table}: {n}")

        sync_identity_sequences(pg)
        counts_dst = pg_counts(pg)
        ok = compare_counts(counts_src, counts_dst)

        if not ok:
            pg.execute("ROLLBACK")
            print("ERROR: count mismatch — rolled back.", file=sys.stderr)
            return 1

        if args.dry_run:
            pg.execute("ROLLBACK")
            print("Dry-run OK — transaction rolled back; no data kept on Postgres.")
            return 0

        pg.execute("COMMIT")
        print("Migrate committed successfully.")
        return 0
    except Exception as e:
        try:
            pg.execute("ROLLBACK")
        except Exception:
            pass
        print(f"ERROR: migrate failed (rolled back if possible): {e}", file=sys.stderr)
        return 1
    finally:
        pg.close()
        sconn.close()


if __name__ == "__main__":
    sys.exit(main())
