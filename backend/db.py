"""
PostgreSQL access layer (psycopg v3 + connection pool).

Call sites keep using "?" placeholders; they are rewritten to "%s" for psycopg.
Requires DATABASE_URL (or Vercel POSTGRES_URL). SQLite is not supported.
"""
from __future__ import annotations

import os
import re
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from zoneinfo import ZoneInfo

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

BASE_DIR = Path(__file__).parent
PG_SCHEMA_PATH = BASE_DIR / "sql" / "pg_schema_v1.sql"

TAIPEI = ZoneInfo("Asia/Taipei")
UTC = ZoneInfo("UTC")

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

_ENV_URL_KEYS = (
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
)


class IntegrityError(Exception):
    """Raised for unique/constraint conflicts."""


def resolve_database_url() -> str:
    """Resolve PostgreSQL URL from environment (Vercel-compatible fallbacks)."""
    for key in _ENV_URL_KEYS:
        raw = (os.getenv(key) or "").strip()
        if not raw:
            continue
        return _normalize_database_url(raw)
    raise RuntimeError(
        "DATABASE_URL is required (PostgreSQL). "
        "Example: postgresql://user:pass@127.0.0.1:5432/intelligent_ark. "
        "On Vercel, attach Postgres or set POSTGRES_URL from the integration."
    )


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if not url.lower().startswith("postgresql://"):
        raise RuntimeError(
            f"DATABASE_URL must use postgresql:// or postgres:// (got prefix {url[:12]!r}…)"
        )
    if "REPLACE_WITH" in url or "YOUR_PASSWORD" in url:
        raise RuntimeError(
            "DATABASE_URL still contains a placeholder password. Set a real credential."
        )
    return _ensure_sslmode(url)


def _ensure_sslmode(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host in ("localhost", "127.0.0.1", "::1") or host.endswith(".local"):
        return url
    qs = parse_qs(parsed.query, keep_blank_values=True)
    if "sslmode" not in qs and "ssl" not in qs:
        qs["sslmode"] = ["require"]
        flat = [(k, v[0] if v else "") for k, v in qs.items()]
        return urlunparse(parsed._replace(query=urlencode(flat)))
    return url


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
            'psycopg is required. Install with: pip install "psycopg[binary,pool]>=3.1"'
        ) from e
    _psycopg = psycopg
    _PgIntegrityError = (pg_errors.IntegrityConstraintViolation, pg_errors.UniqueViolation)
    _dict_row = dict_row
    return _psycopg


def sql_now() -> str:
    return "now()"


def sql_today() -> str:
    return "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')::date"


def sql_now_plus_minutes(param_is_int: bool = True) -> str:
    return "(now() + make_interval(mins => ?))"


def sql_now_minus_days() -> str:
    return "(now() - make_interval(days => ?))"


def sql_today_plus_days() -> str:
    return "((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')::date + ?::int)"


def minutes_param(minutes: int) -> Any:
    return int(minutes)


def days_ago_param(days: int) -> Any:
    return int(days)


def days_ahead_param(days: int) -> Any:
    return int(days)


def json_param(value: Any) -> Any:
    from psycopg.types.json import Jsonb

    return Jsonb(value)


def format_ts_for_api(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(TAIPEI).strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
    return value


def _qmark_to_pyformat(sql: str) -> str:
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
    def __init__(self, conn):
        self._conn = conn
        self.lastrowid: Optional[int] = None
        self.rowcount: int = -1

    def execute(self, sql: str, params: Any = None):
        sql_work = re.sub(
            r"INSERT\s+OR\s+IGNORE\s+INTO\s+user_profiles",
            "INSERT INTO user_profiles",
            sql,
            flags=re.IGNORECASE,
        )

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
        proxy.lastrowid = self.lastrowid
        proxy.rowcount = self.rowcount
        return proxy

    def executescript(self, script: str):
        self._conn.execute(script)
        return self

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        pass


class _RowDict(dict):
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


def _pool_settings() -> dict[str, Any]:
    on_vercel = os.getenv("VERCEL", "").strip() == "1"
    return {
        "min_size": int(os.getenv("PG_POOL_MIN", "0" if on_vercel else "1")),
        "max_size": int(os.getenv("PG_POOL_MAX", "2" if on_vercel else "10")),
        "timeout": float(os.getenv("PG_POOL_TIMEOUT", "30")),
        "max_idle": float(os.getenv("PG_POOL_MAX_IDLE", "60" if on_vercel else "300")),
        "max_lifetime": float(os.getenv("PG_POOL_MAX_LIFETIME", "600" if on_vercel else "3600")),
    }


def _ensure_pool():
    global _pool
    if _pool is not None:
        return _pool
    conninfo = resolve_database_url()
    _load_psycopg()
    try:
        from psycopg_pool import ConnectionPool
    except ImportError as e:
        raise RuntimeError(
            'psycopg_pool missing. Install with: pip install "psycopg[binary,pool]>=3.1"'
        ) from e

    settings = _pool_settings()
    _pool = ConnectionPool(
        conninfo=conninfo,
        kwargs={"row_factory": _dict_row},
        open=True,
        **settings,
    )
    return _pool


@contextmanager
def get_conn() -> Iterator[Any]:
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


def init_postgres_schema(conn_proxy: Optional[Any] = None) -> None:
    if not PG_SCHEMA_PATH.is_file():
        raise FileNotFoundError(f"PG schema not found: {PG_SCHEMA_PATH}")
    ddl = PG_SCHEMA_PATH.read_text(encoding="utf-8")
    if conn_proxy is not None:
        _run_pg_ddl(conn_proxy._conn, ddl)
        return
    with get_conn() as conn:
        _run_pg_ddl(conn._conn, ddl)


def _run_pg_ddl(raw_conn, ddl: str) -> None:
    raw_conn.execute(ddl)


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def check_connection() -> None:
    """Ping database; raises on failure (health checks / startup diagnostics)."""
    with get_conn() as conn:
        conn.execute("SELECT 1")
