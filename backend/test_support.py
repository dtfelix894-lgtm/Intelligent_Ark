"""PostgreSQL fixtures for backend unit tests."""
from __future__ import annotations

import os
import unittest
from contextlib import contextmanager
from typing import Iterator

from db import close_pool

WIPE_TABLES_SQL = """
TRUNCATE TABLE
  audit_logs,
  reassessments,
  follow_up_records,
  event_transitions,
  risk_events,
  chat_messages,
  user_profiles,
  users
RESTART IDENTITY CASCADE;
"""


def test_database_url() -> str:
    for key in ("TEST_DATABASE_URL", "DATABASE_URL"):
        raw = (os.getenv(key) or "").strip()
        if raw.lower().startswith(("postgresql://", "postgres://")):
            return raw
    return ""


def postgres_reachable() -> bool:
    url = test_database_url()
    if not url:
        return False
    prev = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    close_pool()
    try:
        from db import get_conn

        with get_conn() as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False
    finally:
        close_pool()
        if prev is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = prev


requires_postgres = unittest.skipUnless(
    postgres_reachable(),
    "PostgreSQL required: set TEST_DATABASE_URL or DATABASE_URL to a reachable database",
)


def wipe_all_tables() -> None:
    import database

    database.init_db()
    with database.get_conn() as conn:
        conn.execute(WIPE_TABLES_SQL)


@contextmanager
def isolated_test_database() -> Iterator[None]:
    """Ensure schema exists and tables are empty for one test case."""
    url = test_database_url()
    if not url:
        raise RuntimeError("TEST_DATABASE_URL or DATABASE_URL must be set for tests")
    prev = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    close_pool()
    try:
        wipe_all_tables()
        yield
    finally:
        close_pool()
        if prev is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = prev


def acceptance_database_url() -> str:
    for key in ("ARK_TEST_DATABASE_URL", "TEST_DATABASE_URL", "DATABASE_URL"):
        raw = (os.getenv(key) or "").strip()
        if raw.lower().startswith(("postgresql://", "postgres://")):
            return raw
    return ""
