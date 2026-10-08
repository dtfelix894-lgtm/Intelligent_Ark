"""Regression contracts using isolated in-memory SQLite and real API handlers.

Run from backend: python -m unittest test_contracts
No business database, external model call, or filesystem cleanup is involved.
"""
import sqlite3
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta
from unittest.mock import patch

import httpx

import database
import main
from auth import create_access_token


class BackendContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_risk_language_alert_pipeline(self):
        from test_risk_language import CASES
        registration = await self.client.post("/api/auth/c-register", json={
            "account": "risk-language-student", "password": "testing123", "school": "规则验收大学",
        })
        self.assertEqual(registration.status_code, 200)
        student_headers = {"Authorization": "Bearer " + registration.json()["token"]}
        admin_id = database.get_or_create_user("G-RISK", "testing123", "admin", {"admin_type": "G"})
        admin_headers = {"Authorization": "Bearer " + create_access_token(admin_id, "G-RISK", "admin")}
        expected_levels = []
        with patch("llm_service.API_KEY", ""):
            for name, message, level in CASES:
                with self.subTest(name=name):
                    response = await self.client.post("/api/chat/stream", headers=student_headers, json={"message": message})
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()["risk_assessment"]["level"], level)
                    if level != "green":
                        expected_levels.append(level)
                    alerts = await self.client.get("/api/admin/alerts?handled=false", headers=admin_headers)
                    self.assertEqual(alerts.status_code, 200)
                    actual = alerts.json()["items"]
                    self.assertEqual(len(actual), len(expected_levels))
                    self.assertCountEqual([item["level"] for item in actual], expected_levels)
        stats = await self.client.get("/api/admin/stats", headers=admin_headers)
        self.assertEqual(stats.json()["total_users"], 1)

    def setUp(self):
        self.connection = sqlite3.connect(":memory:", check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.addCleanup(self.connection.close)

        @contextmanager
        def memory_connection():
            try:
                yield self.connection
                self.connection.commit()
            except Exception:
                self.connection.rollback()
                raise

        connections = patch.object(database, "get_conn", memory_connection)
        connections.start()
        self.addCleanup(connections.stop)
        invitation = patch.object(main, "ADMIN_INVITE_CODE", "contract-invite")
        invitation.start()
        self.addCleanup(invitation.stop)
        database.init_db()

    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=main.app, raise_app_exceptions=False),
            base_url="http://contract.test",
        )

    async def asyncTearDown(self):
        await self.client.aclose()

    def credentials(self, endpoint, password="testing123"):
        if endpoint.startswith("/api/auth/b-"):
            return {
                "worker_id": "G123",
                "password": password,
                "school_name": "契约测试大学",
                "invite_code": "contract-invite",
            }
        return {"account": "student-123", "password": password}

    def make_admin(self, account):
        user_id = database.get_or_create_user(
            account, "testing123", "admin",
            {"admin_type": "G", "school_name": "契约测试大学"},
        )
        return {"Authorization": "Bearer " + create_access_token(user_id, account, "admin")}

    async def test_account_whitespace_and_duplicate_identity(self):
        for endpoint in (
            "/api/auth/c-register", "/api/auth/c-login",
            "/api/auth/b-register", "/api/auth/b-login",
        ):
            with self.subTest(endpoint=endpoint):
                body = self.credentials(endpoint)
                body["worker_id" if "/b-" in endpoint else "account"] = " \t\n "
                invalid = await self.client.post(endpoint, json=body)
                self.assertEqual(invalid.status_code, 422, invalid.text)
        self.assertEqual(database.count_users_by_role("student"), 0)
        self.assertEqual(database.count_users_by_role("admin"), 0)

        for side, account_key, account, status in (
            ("c", "account", "student-123", 200),
            ("b", "worker_id", "G123", 201),
        ):
            with self.subTest(side=side):
                endpoint = f"/api/auth/{side}-register"
                body = self.credentials(endpoint)
                body[account_key] = f"  {account}\t"
                created = await self.client.post(endpoint, json=body)
                self.assertEqual(created.status_code, status, created.text)
                body[account_key] = account
                duplicate = await self.client.post(endpoint, json=body)
                self.assertEqual(duplicate.status_code, 409, duplicate.text)
                body[account_key] = f"\t{account} "
                login = await self.client.post(f"/api/auth/{side}-login", json=body)
                self.assertEqual(login.status_code, 200, login.text)
                current = await self.client.get(f"/api/auth/{side}-me")
                self.assertEqual(current.json()["account"], account)

    async def test_password_validation_prevents_internal_errors(self):
        for endpoint in (
            "/api/auth/c-register", "/api/auth/c-login",
            "/api/auth/b-register", "/api/auth/b-login",
        ):
            for password in ("x" * 73, "密" * 25):
                with self.subTest(endpoint=endpoint, bytes=len(password.encode("utf-8"))):
                    response = await self.client.post(endpoint, json=self.credentials(endpoint, password))
                    self.assertEqual(response.status_code, 422, response.text)
                    self.assertEqual(response.json()["detail"][0]["loc"], ["body", "password"])
        for endpoint in ("/api/auth/c-register", "/api/auth/b-register"):
            for password in ("", "12345", "      "):
                with self.subTest(endpoint=endpoint, password=repr(password)):
                    response = await self.client.post(endpoint, json=self.credentials(endpoint, password))
                    self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(database.count_users_by_role("student"), 0)
        self.assertEqual(database.count_users_by_role("admin"), 0)

    async def test_72_byte_passwords_round_trip(self):
        for side, key, account, password, status in (
            ("c", "account", "ascii-student", "x" * 72, 200),
            ("c", "account", "utf8-student", "密" * 24, 200),
            ("b", "worker_id", "G121", "x" * 72, 201),
            ("b", "worker_id", "G122", "密" * 24, 201),
        ):
            with self.subTest(side=side, account=account):
                endpoint = f"/api/auth/{side}-register"
                body = self.credentials(endpoint, password)
                body[key] = account
                response = await self.client.post(endpoint, json=body)
                self.assertEqual(response.status_code, status, response.text)
                login = await self.client.post(f"/api/auth/{side}-login", json=body)
                self.assertEqual(login.status_code, 200, login.text)

    async def test_legacy_login_and_password_whitespace_are_preserved(self):
        database.get_or_create_user("legacy-student", "123", "student")
        database.get_or_create_user("G124", "123", "admin", {"admin_type": "G"})
        for endpoint, key, account in (
            ("/api/auth/c-login", "account", "legacy-student"),
            ("/api/auth/b-login", "worker_id", "G124"),
        ):
            login = await self.client.post(endpoint, json={key: account, "password": "123"})
            self.assertEqual(login.status_code, 200, login.text)
        body = {"account": "space-password", "password": " secret "}
        self.assertEqual((await self.client.post("/api/auth/c-register", json=body)).status_code, 200)
        self.assertEqual((await self.client.post("/api/auth/c-login", json=body)).status_code, 200)
        body["password"] = "secret"
        self.assertEqual((await self.client.post("/api/auth/c-login", json=body)).status_code, 401)

    async def test_follow_up_retry_keeps_original_audit(self):
        student = database.get_or_create_user("student-risk", "testing123", "student")
        event = database.save_risk_event(student, "university", "yellow", 65, ["压力"], "测试摘要")
        first_admin = self.make_admin("G125")
        second_admin = self.make_admin("G126")
        first = await self.client.post(
            f"/api/admin/alerts/{event}/handle", headers=first_admin,
            json={"action": "follow_up", "note": "首次沟通记录"},
        )
        self.assertEqual(first.status_code, 200, first.text)
        original = database.list_risk_events()[0]
        for headers in (first_admin, second_admin):
            retry = await self.client.post(
                f"/api/admin/alerts/{event}/handle", headers=headers,
                json={"action": "different", "note": "重复点击不应覆盖"},
            )
            self.assertEqual(retry.status_code, 200, retry.text)
            self.assertEqual(retry.json(), {"success": True})
            self.assertEqual(database.list_risk_events()[0], original)
        pending = await self.client.get("/api/admin/alerts?handled=false", headers=first_admin)
        self.assertEqual(pending.json()["items"], [])
        missing = await self.client.post("/api/admin/alerts/99999/handle", headers=first_admin)
        self.assertEqual(missing.status_code, 404, missing.text)
        legacy_event = database.save_risk_event(student, "community", "yellow", 65, [], "legacy fixture")
        legacy = await self.client.post(f"/api/admin/alerts/{legacy_event}/handle", headers=first_admin)
        self.assertEqual(legacy.status_code, 404, legacy.text)
        self.assertFalse(database.list_risk_events(scenario="community")[0]["handled"])

    async def test_risk_trend_includes_whole_calendar_days(self):
        student = database.get_or_create_user("student-trend", "testing123", "student")
        admin = self.make_admin("G127")
        today = datetime.now().date()
        first = today - timedelta(days=6)
        fixtures = (
            (first - timedelta(days=1), "23:59:59", "red", 99),
            (first, "00:00:00", "red", 90),
            (first, "23:59:59", "yellow", 60),
            (today, "00:00:00", "red", 95),
            (today + timedelta(days=1), "00:00:00", "yellow", 80),
        )
        with database.get_conn() as conn:
            for day, time, level, score in fixtures:
                conn.execute(
                    "INSERT INTO risk_events(user_id, scenario, level, score, tags, summary, created_at) "
                    "VALUES (?, 'university', ?, ?, '[]', 'date fixture', ?)",
                    (student, level, score, f"{day.isoformat()} {time}"),
                )
        week = await self.client.get("/api/admin/risk-trend?days=7", headers=admin)
        self.assertEqual(week.status_code, 200, week.text)
        items = week.json()["items"]
        self.assertEqual(len(items), 7)
        self.assertEqual(items[0]["date"], first.isoformat())
        self.assertEqual((items[0]["red"], items[0]["yellow"], items[0]["count"], items[0]["avg_score"]), (1, 1, 2, 75))
        self.assertEqual(sum(item["count"] for item in items), 3)
        day = await self.client.get("/api/admin/risk-trend?days=1", headers=admin)
        self.assertEqual(day.status_code, 200, day.text)
        self.assertEqual(len(day.json()["items"]), 1)
        self.assertEqual(day.json()["items"][0]["count"], 1)
        self.assertEqual(day.json()["items"][0]["avg_score"], 95)


if __name__ == "__main__":
    unittest.main()
