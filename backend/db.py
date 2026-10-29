"""
Dialect-aware DB access layer.

- If DATABASE_URL is postgresql:// or postgres:// → psycopg v3 pool (UTC timestamptz).
- Otherwise → existing SQLite via DB_PATH (dev / transition fallback).

Call sites keep using "?" placeholders; PG path rewrites them to "%s".
Do not invent passwords; missing/invalid URL must not break SQLite startup.
"""
from __future__ import annotations

import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Iterator, Optional, Union
from zoneinfo import ZoneInfo

BASE_DIR = Path(__file__).parent
DB_PATH = Path(os.getenv("DB_PATH", str(BASE_DIR / "intelligent_ark.db")))
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
PG_SCHEMA_PATH = BASE_DIR / "sql" / "pg_schema_v1.sql"

TAIPEI = ZoneInfo("Asia/Taipei")
UTC = ZoneInfo("UTC")

# Tables with IDENTITY / lastrowid consumers
_IDENTITY_TABLES = {
    "users",
    "chat_messages",
    "risk_events",
    "event_transitions",
    "follow_up_records",
    "reassessments",
    "audit_logs",
}

_pool = None
_psycopg = None
_PgIntegrityError = ()
_dict_row = None


def using_postgres() -> bool:
    u = _resolve_database_url().lower()
    return u.startswith("postgresql://") or u.startswith("postgres://")


def _load_psycopg():
    global _psycopg, _PgIntegrityError, _dict_row
    if _psycopg is not None:
        return _psycopg
    try:
        import psycopg
        from psycopg import errors as pg_errors
        from psycopg.rows import dict_row
    except ImportError as e:
        raise RuntimeError(
            "DATABASE_URL points to PostgreSQL but psycopg is not installed. "
            "Install with: pip install \"psycopg[binary,pool]>=3.1\""
        ) from e
    _psycopg = psycopg
    _PgIntegrityError = (pg_errors.IntegrityConstraintViolation, pg_errors.UniqueViolation)
    _dict_row = dict_row
    return _psycopg


# Unified IntegrityError for callers (sqlite + optional psycopg).
class IntegrityError(Exception):
    """Raised for unique/constraint conflicts (both dialects)."""



def integrity_errors() -> tuple:
    """Tuple usable in `except integrity_errors():` covering both dialects."""
    errs = [sqlite3.IntegrityError]
    if using_postgres():
        try:
            _load_psycopg()
            errs.extend(_PgIntegrityError)
        except Exception:
            pass
    return tuple(errs)


def sql_now() -> str:
    """SQL expression for \"now\" instant."""
    if using_postgres():
        return "now()"
    # SQLite transition: keep Asia/Taipei wall TEXT compatible with existing rows
    return "datetime('now','+8 hours')"


def sql_today() -> str:
    if using_postgres():
        return "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')::date"
    return "date(datetime('now','+8 hours'))"


def sql_now_plus_minutes(param_is_int: bool = True) -> str:
    """One placeholder: integer minutes (PG) or SQLite modifier string '+N minutes'."""
    if using_postgres():
        # placeholder bound as int minutes
        return "(now() + make_interval(mins => ?))"
    return "datetime('now','+8 hours', ?)"


def sql_now_minus_days() -> str:
    """One placeholder: integer days (PG) or SQLite modifier '-N days'."""
    if using_postgres():
        return "(now() - make_interval(days => ?))"
    return "datetime('now','+8 hours', ?)"


def sql_today_plus_days() -> str:
    """One placeholder: integer days (PG) or SQLite modifier '+N days'."""
    if using_postgres():
        return "((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')::date + ?::int)"
    return "date(datetime('now','+8 hours'), ?)"


def minutes_param(minutes: int) -> Any:
    if using_postgres():
        return int(minutes)
    return f"+{int(minutes)} minutes"


def days_ago_param(days: int) -> Any:
    if using_postgres():
        return int(days)
    return f"-{int(days)} days"


def days_ahead_param(days: int) -> Any:
    if using_postgres():
        return int(days)
    return f"+{int(days)} days"


def json_param(value: Any) -> Any:
    """Bind JSON/JSONB parameter (list/dict)."""
    if using_postgres():
        from psycopg.types.json import Jsonb
        return Jsonb(value)
    import json
    return json.dumps(value, ensure_ascii=False)


def format_ts_for_api(value: Any) -> Any:
    """Normalize DB timestamps to Asia/Taipei wall 'YYYY-MM-DD HH:MM:SS' strings for API."""
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            # treat naive as UTC if on PG path historically; for SQLite wall keep as-is
            if using_postgres():
                dt = dt.replace(tzinfo=UTC)
            else:
                return dt.strftime("%Y-%m-%d %H:%M:%S")
        return dt.astimezone(TAIPEI).strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
    return value


def _qmark_to_pyformat(sql: str) -> str:
    """Replace ? placeholders with %s (no literal ? expected in this codebase)."""
    return sql.replace("?", "%s")


class _PgCursorProxy:
    def __init__(self, cur):
        self._cur = cur

    def fetchone(self):
        row = self._cur.fetchone()
        return _normalize_row(row) if row is not None else None

    def fetchall(self):
        return [_normalize_row(r) for r in self._cur.fetchall()]

    def __getattr__(self, name):
        return getattr(self._cur, name)


class _PgConnProxy:
    """sqlite3-like façade over a psycopg connection."""

    def __init__(self, conn):
        self._conn = conn
        self.lastrowid: Optional[int] = None
        self.rowcount: int = -1

    def execute(self, sql: str, params: Any = None):
        sql_work = sql
        # Translate legacy SQLite INSERT OR IGNORE if any remain
        sql_work = re.sub(
            r"INSERT\s+OR\s+IGNORE\s+INTO\s+user_profiles",
            "INSERT INTO user_profiles",
            sql_work,
            flags=re.IGNORECASE,
        )
        if re.search(r"INSERT\s+INTO\s+user_profiles", sql_work, re.I) and "ON CONFLICT" not in sql_work.upper():
            # Only when it was OR IGNORE path — callers should use ON CONFLICT; leave as-is otherwise
            pass

        upper = sql_work.lstrip().upper()
        returning = False
        if upper.startswith("INSERT") and "RETURNING" not in upper:
            m = re.match(
                r"INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+([A-Za-z_][A-Za-z0-9_]*)",
                sql_work.lstrip(),
                flags=re.IGNORECASE,
            )
            if m and m.group(1).lower() in _IDENTITY_TABLES:
                sql_work = sql_work.rstrip().rstrip(";") + " RETURNING id"
                returning = True

        sql_pg = _qmark_to_pyformat(sql_work)
        cur = self._conn.execute(sql_pg, params if params is not None else ())
        self.rowcount = cur.rowcount if cur.rowcount is not None else -1
        self.lastrowid = None
        if returning:
            row = cur.fetchone()
            if row is not None:
                self.lastrowid = row["id"] if isinstance(row, dict) else row[0]
        proxy = _PgCursorProxy(cur)
        # Call sites use cur.lastrowid (sqlite3 style); expose it on the cursor proxy too.
        proxy.lastrowid = self.lastrowid
        proxy.rowcount = self.rowcount
        return proxy

    def executescript(self, script: str):
        # Split on semicolons carefully enough for our DDL file
        self._conn.execute(script)  # psycopg allows multiple statements in one execute for simple DDL
        return self

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        # Pool returns connection on context exit; do not close underlying
        pass


class _RowDict(dict):
    """dict with .keys() that also supports sqlite3.Row-like membership."""

    def keys(self):
        return dict.keys(self)


def _normalize_row(row: Any) -> Any:
    if row is None:
        return None
    if isinstance(row, dict):
        out = _RowDict()
        for k, v in row.items():
            if isinstance(v, datetime):
                out[k] = format_ts_for_api(v)
            elif isinstance(v, date) and not isinstance(v, datetime):
                out[k] = v.isoformat()
            else:
                out[k] = v
        return out
    return row


def _ensure_pool():
    global _pool
    if _pool is not None:
        return _pool
    url = _resolve_database_url()
    if "REPLACE_WITH" in url or "YOUR_PASSWORD" in url:
        raise RuntimeError(
            "DATABASE_URL still contains a placeholder password. "
            "Unset DATABASE_URL to use SQLite, or set a real password."
        )
    _load_psycopg()
    try:
        from psycopg_pool import ConnectionPool
    except ImportError as e:
        raise RuntimeError(
            "psycopg_pool missing. Install with: pip install \"psycopg[binary,pool]>=3.1\""
        ) from e

    def _configure(conn):
        conn.row_factory = _dict_row

    _pool = ConnectionPool(
        conninfo=_resolve_database_url(),
        min_size=1,
        max_size=int(os.getenv("PG_POOL_MAX", "10")),
        kwargs={"row_factory": _dict_row},
        open=True,
    )
    return _pool


def _resolve_database_url() -> str:
    import sys
    app_db = sys.modules.get("database")
    if app_db is not None and hasattr(app_db, "DATABASE_URL"):
        return (getattr(app_db, "DATABASE_URL") or "").strip()
    return (os.getenv("DATABASE_URL") or DATABASE_URL or "").strip()


def _resolve_sqlite_path() -> Path:
    """Prefer database.DB_PATH when present so unittest patches keep working."""
    import sys
    app_db = sys.modules.get("database")
    if app_db is not None and getattr(app_db, "DB_PATH", None) is not None:
        return Path(app_db.DB_PATH)
    return Path(DB_PATH)


@contextmanager
def get_conn() -> Iterator[Any]:
    if using_postgres():
        pool = _ensure_pool()
        with pool.connection() as conn:
            proxy = _PgConnProxy(conn)
            try:
                yield proxy
                conn.commit()
            except Exception as e:
                conn.rollback()
                _load_psycopg()
                if _PgIntegrityError and isinstance(e, _PgIntegrityError):
                    raise IntegrityError(str(e)) from e
                raise
        return

    # SQLite fallback (default when DATABASE_URL unset)
    sqlite_path = _resolve_sqlite_path()
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(sqlite_path, check_same_thread=False, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except sqlite3.IntegrityError as e:
        conn.rollback()
        raise IntegrityError(str(e)) from e
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_postgres_schema(conn_proxy: Optional[Any] = None) -> None:
    """Apply backend/sql/pg_schema_v1.sql (IF NOT EXISTS)."""
    if not PG_SCHEMA_PATH.is_file():
        raise FileNotFoundError(f"PG schema not found: {PG_SCHEMA_PATH}")
    ddl = PG_SCHEMA_PATH.read_text(encoding="utf-8")
    if conn_proxy is not None:
        # run statements one-by-one for clearer errors
        _run_pg_ddl(conn_proxy._conn, ddl)
        return
    with get_conn() as conn:
        _run_pg_ddl(conn._conn if isinstance(conn, _PgConnProxy) else conn, ddl)


def _run_pg_ddl(raw_conn, ddl: str) -> None:
    # Strip line comments carefully; execute whole script (psycopg supports multi-statement)
    raw_conn.execute(ddl)


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def backend_label() -> str:
    return "postgresql" if using_postgres() else "sqlite"
