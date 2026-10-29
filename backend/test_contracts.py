"""Regression contracts using isolated in-memory SQLite and real API handlers.

Run from backend: python -m unittest test_contracts
No business database, external model call, or filesystem cleanup is involved.
"""
import sqlite3
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
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

    async def test_alert_claim_assign_detail_desensitized(self):
        student = database.get_or_create_user("student-claim", "testing123", "student")
        event = database.save_risk_event(
            student, "university", "red", 95, ["危机倾向"], "脱敏摘要不含原文"
        )
        first = self.make_admin("G200")
        second = self.make_admin("G201")

        claimed = await self.client.post(f"/api/admin/alerts/{event}/claim", headers=first)
        self.assertEqual(claimed.status_code, 200, claimed.text)
        body = claimed.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["item"]["assignee"], "G200")
        self.assertIsNotNone(body["item"]["claimed_at"])

        # 列表可见 assignee / claimed_at
        listing = await self.client.get("/api/admin/alerts?handled=false", headers=first)
        self.assertEqual(listing.status_code, 200, listing.text)
        items = listing.json()["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["assignee"], "G200")
        self.assertIsNotNone(items[0]["claimed_at"])
        self.assertNotIn("content", items[0])
        self.assertEqual(items[0]["summary"], "脱敏摘要不含原文")

        # 他人认领冲突
        conflict = await self.client.post(f"/api/admin/alerts/{event}/claim", headers=second)
        self.assertEqual(conflict.status_code, 409, conflict.text)

        # 本人再认领幂等
        again = await self.client.post(f"/api/admin/alerts/{event}/claim", headers=first)
        self.assertEqual(again.status_code, 200, again.text)
        self.assertEqual(again.json()["item"]["assignee"], "G200")

        # 改派
        assigned = await self.client.post(
            f"/api/admin/alerts/{event}/assign",
            headers=first,
            json={"assignee": "G201", "reason": "改派测试"},
        )
        self.assertEqual(assigned.status_code, 200, assigned.text)
        self.assertEqual(assigned.json()["item"]["assignee"], "G201")

        listing2 = await self.client.get("/api/admin/alerts", headers=first)
        self.assertEqual(listing2.json()["items"][0]["assignee"], "G201")

        # 详情脱敏 + 可记审计；不含对话字段
        detail = await self.client.get(f"/api/admin/alerts/{event}", headers=second)
        self.assertEqual(detail.status_code, 200, detail.text)
        payload = detail.json()
        self.assertEqual(payload["item"]["id"], event)
        self.assertEqual(payload["item"]["assignee"], "G201")
        self.assertNotIn("content", payload["item"])
        self.assertNotIn("messages", payload)
        self.assertIsInstance(payload["related"], list)
        with database.get_conn() as conn:
            audit = conn.execute(
                "SELECT action, actor, target_id FROM audit_logs WHERE target_id = ? ORDER BY id",
                (str(event),),
            ).fetchall()
        actions = [r["action"] for r in audit]
        self.assertIn("view_alert", actions)
        self.assertIn("claim_alert", actions)
        self.assertIn("assign_alert", actions)

        # handle 仍可用且不覆盖首次
        handled = await self.client.post(
            f"/api/admin/alerts/{event}/handle",
            headers=second,
            json={"action": "follow_up", "note": "首次跟进"},
        )
        self.assertEqual(handled.status_code, 200, handled.text)
        original = database.list_risk_events()[0]
        retry = await self.client.post(
            f"/api/admin/alerts/{event}/handle",
            headers=first,
            json={"action": "other", "note": "应被忽略"},
        )
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(database.list_risk_events()[0]["note"], original["note"])
        self.assertEqual(database.list_risk_events()[0]["handled_by"], "G201")
        # 认领字段在 handle 后仍保留
        self.assertEqual(database.list_risk_events()[0]["assignee"], "G201")

        missing = await self.client.get("/api/admin/alerts/99999", headers=first)
        self.assertEqual(missing.status_code, 404, missing.text)
        bad_target = await self.client.post(
            f"/api/admin/alerts/{event}/assign",
            headers=first,
            json={"assignee": "not-an-admin", "reason": "目标不存在"},
        )
        self.assertEqual(bad_target.status_code, 404, bad_target.text)

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


    async def test_admin_batch3_status_records_reassess_closure(self):
        """Acceptance_Admin_Batch3: transition / records / reassess / closed filter / legacy handle."""
        student = database.get_or_create_user("student-b3", "testing123", "student")
        event = database.save_risk_event(
            student, "university", "red", 90, ["危机倾向"], "B3脱敏摘要"
        )
        admin = self.make_admin("G301")

        # 新事件默认 pending，待跟进可见
        pending = await self.client.get("/api/admin/alerts?handled=false", headers=admin)
        self.assertEqual(pending.status_code, 200, pending.text)
        self.assertEqual(len(pending.json()["items"]), 1)
        self.assertEqual(pending.json()["items"][0]["status"], "pending")

        # 认领必须走 /claim，流转接口不能代认领（否则没有 assignee 空值条件）
        via_transition = await self.client.post(
            f"/api/admin/alerts/{event}/transition",
            headers=admin,
            json={"to_status": "claimed", "reason": "不得经流转认领"},
        )
        self.assertEqual(via_transition.status_code, 409, via_transition.text)
        still = database.get_risk_event(event)
        self.assertEqual(still["status"], "pending")
        self.assertFalse(still["assignee"])

        # PRD 5.2：未认领不能直接进入干预
        skipped = await self.client.post(
            f"/api/admin/alerts/{event}/transition",
            headers=admin,
            json={"to_status": "intervening", "reason": "未认领不得干预"},
        )
        self.assertEqual(skipped.status_code, 409, skipped.text)
        self.assertEqual(database.get_risk_event(event)["status"], "pending")

        # 非法：closed → monitoring（先认领再关再试）
        claimed = await self.client.post(f"/api/admin/alerts/{event}/claim", headers=admin)
        self.assertEqual(claimed.status_code, 200, claimed.text)
        self.assertEqual(claimed.json()["item"]["status"], "claimed")

        # Acceptance 合法：claimed → intervening
        to_int = await self.client.post(
            f"/api/admin/alerts/{event}/transition",
            headers=admin,
            json={"to_status": "intervening", "reason": "开始干预"},
        )
        self.assertEqual(to_int.status_code, 200, to_int.text)
        self.assertEqual(to_int.json()["item"]["status"], "intervening")

        # 跟进记录
        rec = await self.client.post(
            f"/api/admin/alerts/{event}/records",
            headers=admin,
            json={
                "type": "interview",
                "occurred_at": "2026-10-11 10:00:00",
                "summary": "约谈说明不含原文",
            },
        )
        self.assertEqual(rec.status_code, 200, rec.text)
        self.assertEqual(rec.json()["record"]["type"], "interview")
        listed = await self.client.get(f"/api/admin/alerts/{event}/records", headers=admin)
        self.assertEqual(len(listed.json()["items"]), 1)

        # intervening → monitoring，自动生成复评
        to_mon = await self.client.post(
            f"/api/admin/alerts/{event}/transition",
            headers=admin,
            json={"to_status": "monitoring", "reason": "进入持续关注"},
        )
        self.assertEqual(to_mon.status_code, 200, to_mon.text)
        self.assertEqual(to_mon.json()["item"]["status"], "monitoring")
        ras = to_mon.json().get("reassessments") or []
        self.assertGreaterEqual(len(ras), 1)

        # 到期列表接口可用
        due = await self.client.get("/api/admin/reassessments?due=upcoming", headers=admin)
        self.assertEqual(due.status_code, 200, due.text)
        self.assertIn("today_count", due.json())

        # 手动再创建一次
        created = await self.client.post(
            f"/api/admin/alerts/{event}/reassessments",
            headers=admin,
            json={"due_date": "2026-10-12"},
        )
        self.assertEqual(created.status_code, 200, created.text)

        # 复评 complete：仍有风险 → intervening
        ra_id = created.json()["item"]["id"]
        # 先回到 monitoring 再测 improved；此处用 still_risk
        # 当前已是 monitoring；用刚创建的复评记 still_risk
        done = await self.client.post(
            f"/api/admin/reassessments/{ra_id}/complete",
            headers=admin,
            json={"result": "still_risk", "note": "仍需支持"},
        )
        self.assertEqual(done.status_code, 200, done.text)
        self.assertEqual(done.json()["event"]["status"], "intervening")

        # 再进 monitoring 后 improved → closed + confirmed
        await self.client.post(
            f"/api/admin/alerts/{event}/transition",
            headers=admin,
            json={"to_status": "monitoring", "reason": "再关注"},
        )
        ra2 = await self.client.post(
            f"/api/admin/alerts/{event}/reassessments",
            headers=admin,
            json={"due_date": "2026-10-20"},
        )
        improved = await self.client.post(
            f"/api/admin/reassessments/{ra2.json()['item']['id']}/complete",
            headers=admin,
            json={"result": "improved", "note": "好转"},
        )
        self.assertEqual(improved.status_code, 200, improved.text)
        self.assertEqual(improved.json()["event"]["status"], "closed")
        self.assertEqual(improved.json()["event"]["closure_label"], "confirmed")
        self.assertTrue(improved.json()["event"]["handled"])

        # closed 不在待跟进
        pending2 = await self.client.get("/api/admin/alerts?handled=false", headers=admin)
        self.assertEqual(pending2.json()["items"], [])

        # 非法跳转 409
        bad = await self.client.post(
            f"/api/admin/alerts/{event}/transition",
            headers=admin,
            json={"to_status": "monitoring", "reason": "非法"},
        )
        self.assertEqual(bad.status_code, 409, bad.text)

        # 另一事件：legacy handle 快速结案
        event2 = database.save_risk_event(
            student, "university", "yellow", 70, ["压力"], "legacy摘要"
        )
        handled = await self.client.post(
            f"/api/admin/alerts/{event2}/handle",
            headers=admin,
            json={"action": "follow_up", "note": "快速结案"},
        )
        self.assertEqual(handled.status_code, 200, handled.text)
        rows = [e for e in database.list_risk_events() if e["id"] == event2]
        self.assertEqual(rows[0]["status"], "closed")
        self.assertEqual(rows[0]["closure_label"], "legacy_unlabeled")
        pending3 = await self.client.get("/api/admin/alerts?handled=false", headers=admin)
        self.assertEqual(pending3.json()["items"], [])

        # 结案标注三选一：新事件 transition 到 closed
        event3 = database.save_risk_event(
            student, "university", "yellow", 66, ["压力"], "closure摘要"
        )
        await self.client.post(f"/api/admin/alerts/{event3}/claim", headers=admin)
        await self.client.post(
            f"/api/admin/alerts/{event3}/transition",
            headers=admin,
            json={"to_status": "intervening", "reason": "干预"},
        )
        # 缺标注/说明 → 422
        missing_label = await self.client.post(
            f"/api/admin/alerts/{event3}/transition",
            headers=admin,
            json={"to_status": "closed", "reason": "结案"},
        )
        self.assertEqual(missing_label.status_code, 422, missing_label.text)
        closed = await self.client.post(
            f"/api/admin/alerts/{event3}/transition",
            headers=admin,
            json={
                "to_status": "closed",
                "closure_label": "false_positive",
                "closure_note": "误报说明",
            },
        )
        self.assertEqual(closed.status_code, 200, closed.text)
        self.assertEqual(closed.json()["item"]["closure_label"], "false_positive")

        # 审计含关键动作
        with database.get_conn() as conn:
            actions = [
                r["action"]
                for r in conn.execute(
                    "SELECT action FROM audit_logs WHERE actor = ? ORDER BY id",
                    ("G301",),
                ).fetchall()
            ]
        for need in (
            "transition_alert",
            "add_follow_up_record",
            "complete_reassessment",
            "create_reassessment",
            "handle_alert_legacy_close",
        ):
            self.assertIn(need, actions)


    async def test_risk_trend_includes_whole_calendar_days(self):
        student = database.get_or_create_user("student-trend", "testing123", "student")
        admin = self.make_admin("G127")
        today = datetime.now(timezone(timedelta(hours=8))).date()  # 与 get_risk_trend 的北京时间自然日口径一致
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


    async def test_admin_batch4_metrics_audit_overdue_config(self):
        """Batch4: metrics <5 suppress, audit pagination, overdue mark, config summary."""
        import os
        student = database.get_or_create_user("student-b4", "testing123", "student")
        admin = self.make_admin("G401")

        # Short red SLA for overdue reproducibility
        with patch.dict(os.environ, {"RED_CLAIM_MINUTES": "1", "YELLOW_CLAIM_HOURS": "24", "APP_ENV": "dev"}):
            eid = database.save_risk_event(
                student, "university", "red", 95, ["自伤风险"], "batch4 脱敏摘要"
            )
            # Force due in the past while still pending
            past = (database._now_local() - timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")
            with database.get_conn() as conn:
                conn.execute(
                    "UPDATE risk_events SET claim_due_at = ?, assignee = NULL, status = 'pending' WHERE id = ?",
                    (past, eid),
                )

            alerts = await self.client.get("/api/admin/alerts?handled=false", headers=admin)
            self.assertEqual(alerts.status_code, 200, alerts.text)
            body = alerts.json()
            self.assertGreaterEqual(body.get("overdue_count", 0), 1)
            hit = next(i for i in body["items"] if i["id"] == eid)
            self.assertTrue(hit.get("is_overdue"))
            self.assertGreaterEqual(hit.get("overdue_minutes") or 0, 1)
            self.assertIn("summary", hit)
            # no chat original fields
            self.assertNotIn("content", hit)
            self.assertNotIn("messages", hit)

            # 已写入负责人但状态仍是 pending 时，过截止时间同样算超时
            with database.get_conn() as conn:
                conn.execute(
                    "UPDATE risk_events SET assignee = ?, status = 'pending' WHERE id = ?",
                    ("G401", eid),
                )
            assigned_pending = await self.client.get("/api/admin/alerts?handled=false", headers=admin)
            self.assertEqual(assigned_pending.status_code, 200, assigned_pending.text)
            hit_assigned = next(i for i in assigned_pending.json()["items"] if i["id"] == eid)
            self.assertEqual(hit_assigned.get("status"), "pending")
            self.assertEqual(hit_assigned.get("assignee"), "G401")
            self.assertTrue(hit_assigned.get("is_overdue"))

            overdue = await self.client.get("/api/admin/overdue-count", headers=admin)
            self.assertEqual(overdue.status_code, 200)
            self.assertGreaterEqual(overdue.json()["overdue_count"], 1)

            # metrics: small cell -> "<5"
            metrics = await self.client.get("/api/admin/metrics?days=7", headers=admin)
            self.assertEqual(metrics.status_code, 200, metrics.text)
            m = metrics.json()
            self.assertIn("overdue_count", m)
            self.assertIn("claim_duration", m)
            self.assertIn("status_counts", m)
            # status pending/open cells with n<5 should be suppressed
            for k, v in (m.get("status_counts") or {}).items():
                if isinstance(v, int):
                    self.assertTrue(v == 0 or v >= 5, f"status {k}={v} should be 0 or >=5 or <5 str")
                else:
                    self.assertEqual(v, "<5")
            for cell in m.get("trend") or []:
                for key in ("yellow", "red", "count"):
                    val = cell.get(key)
                    if isinstance(val, int):
                        self.assertTrue(val == 0 or val >= 5)
                    elif val is not None:
                        self.assertEqual(val, "<5")
            # no student account leakage in metrics payload
            dumped = str(m)
            self.assertNotIn("student-b4", dumped)

            cfg = await self.client.get("/api/admin/config-summary", headers=admin)
            self.assertEqual(cfg.status_code, 200, cfg.text)
            c = cfg.json()
            self.assertFalse(c.get("editable"))
            self.assertIn("claim_timeouts", c)
            self.assertEqual(c["claim_timeouts"]["red_minutes"], 1)
            self.assertIn("psych_center", c)
            self.assertIn("hotline", c)

            # help-resources still config-driven (no hardcoded school numbers in module source for phones)
            hr = await self.client.get("/api/help-resources")
            self.assertEqual(hr.status_code, 200)
            self.assertIn("hotlines", hr.json() if "hotlines" in hr.json() else hr.json())

            # seed a few audits then page
            database.write_audit_log("G401", "view_alert", "risk_event", str(eid), {"level": "red"})
            database.write_audit_log("G401", "claim_alert", "risk_event", str(eid), {"ok": True})
            page1 = await self.client.get("/api/admin/audit-logs?limit=1&offset=0", headers=admin)
            self.assertEqual(page1.status_code, 200, page1.text)
            p1 = page1.json()
            self.assertEqual(len(p1["items"]), 1)
            self.assertGreaterEqual(p1["total"], 2)
            self.assertEqual(p1["offset"], 0)
            for item in p1["items"]:
                meta = item.get("meta") or {}
                for banned in ("content", "message", "password", "api_key"):
                    self.assertNotIn(banned, meta)
            page2 = await self.client.get("/api/admin/audit-logs?limit=1&offset=1", headers=admin)
            self.assertEqual(page2.status_code, 200)
            self.assertEqual(page2.json()["offset"], 1)
            # filter by action
            filtered = await self.client.get(
                "/api/admin/audit-logs?action=claim_alert&limit=10", headers=admin
            )
            self.assertEqual(filtered.status_code, 200)
            for item in filtered.json()["items"]:
                self.assertEqual(item["action"], "claim_alert")



if __name__ == "__main__":
    unittest.main()
