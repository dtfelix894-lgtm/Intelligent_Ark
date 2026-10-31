"""Run with python -m unittest test_release from backend; uses TEST_DATABASE_URL."""
import asyncio
import unittest
from unittest.mock import AsyncMock, patch
import httpx
import database
import main
from auth import create_access_token
from llm_service import _build_system_prompt, _fallback, _risk
from test_support import isolated_test_database, requires_postgres


@requires_postgres
class ReleaseTests(unittest.TestCase):
    def test_campus_risk_levels(self):
        self.assertEqual(_risk("今天心情不错，刚和同学吃完饭").level, "green")
        self.assertEqual(_risk("我好难过").level, "yellow")
        self.assertEqual(_risk("我并不焦虑，状态还可以").level, "green")
        self.assertEqual(_risk("我不想活了，想伤害自己").level, "red")

    def test_companion_persona_and_campus_context(self):
        context = {"local_hour": 23, "weekday": 1, "phase": "exam_season"}
        prompt = _build_system_prompt("senior_brother", context, "今天复习好累")
        self.assertIn("知心学长", prompt)
        self.assertIn("小时=23", prompt)
        self.assertIn("不要声称掌握具体课表", prompt)
        self.assertIn("学长", _fallback("今天还可以", "senior_brother").reply)
        risk_prompt = _build_system_prompt("senior_sister", context, "我不想活了")
        self.assertIn("停止玩梗和表情", risk_prompt)

    def test_existing_workflow_and_guards(self):
        with isolated_test_database():
            database.get_or_create_user(
                "G900",
                "test-pass-900",
                "admin",
                {"admin_type": "G", "school_name": "测试大学"},
            )

            async def run():
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as c:
                    registration = await c.post(
                        "/api/auth/c-register",
                        json={
                            "account": "2026001",
                            "password": "123456",
                            "role": "student",
                            "school": "测试大学",
                            "student_id": "2026001",
                        },
                    )
                    self.assertEqual(registration.status_code, 200)
                    sh = {"Authorization": "Bearer " + registration.json()["token"]}
                    with patch("llm_service.API_KEY", ""):
                        reply = await c.post("/api/chat/stream", headers=sh, json={"message":"失眠","dev_override":"normal","companion_persona":"senior_brother","campus_context":{"local_hour":23,"weekday":1,"phase":"exam_season"}})
                    self.assertEqual(reply.status_code, 200)
                    history = await c.get("/api/chat/history", headers=sh)
                    self.assertEqual(len(history.json()["items"]), 2)
                    self.assertIn("id", history.json()["items"][0])
                    with patch.object(main, "is_dev_env", return_value=False):
                        blocked = await c.post("/api/chat/stream", headers=sh, json={"message":"test","dev_override":"red_alert"})
                    self.assertEqual(blocked.status_code, 403)
                    self.assertEqual(len((await c.get("/api/chat/history", headers=sh)).json()["items"]), 2)
                    with patch("asr_service.transcribe_audio", new=AsyncMock(return_value="最近学习压力有点大")):
                        asr = await c.post(
                            "/api/asr/transcribe",
                            headers=sh,
                            files={"file": ("voice.wav", b"RIFF-test", "audio/wav")},
                        )
                    self.assertEqual(asr.status_code, 200)
                    self.assertEqual(asr.json()["text"], "最近学习压力有点大")
                    unsupported = await c.post(
                        "/api/asr/transcribe",
                        headers=sh,
                        files={"file": ("voice.webm", b"webm-test", "audio/webm")},
                    )
                    self.assertEqual(unsupported.status_code, 415)
                    with patch.object(main, "_get_daily_quote", new=AsyncMock(return_value={"text":"今天也请照顾好自己。","source":"测试来源"})):
                        context = await c.get("/api/scenario/context?scenario=university")
                    self.assertEqual(context.status_code, 200)
                    self.assertEqual(context.json()["daily_quote"], "今天也请照顾好自己。")
                    self.assertEqual(context.json()["daily_quote_source"], "测试来源")
                    self.assertNotIn("weather", context.json())
                    self.assertNotIn("exam_countdown", context.json())
                    admin = await c.post("/api/auth/b-login", json={"worker_id":"G900","password":"test-pass-900"})
                    ah = {"Authorization": "Bearer " + admin.json()["token"]}
                    # 双端 Cookie 同时存在时，右上角账户设置仍须读取各自身份。
                    student_profile = await c.get("/api/auth/c-me")
                    admin_profile = await c.get("/api/auth/b-me")
                    self.assertEqual(student_profile.json()["account"], "2026001")
                    self.assertEqual(student_profile.json()["student_id"], "2026001")
                    self.assertEqual(admin_profile.json()["account"], "G900")
                    self.assertEqual(admin_profile.json()["admin_type"], "G")
                    # 同一浏览器同时持有 c_token 与 b_token 时，两端必须各取各的 Cookie。
                    with patch("llm_service.API_KEY", ""):
                        cookie_reply = await c.post(
                            "/api/chat/stream",
                            json={"message":"双端登录测试","dev_override":"normal"},
                        )
                    self.assertEqual(cookie_reply.status_code, 200)
                    self.assertEqual((await c.get("/api/chat/history")).status_code, 200)
                    self.assertEqual((await c.get("/api/admin/alerts")).status_code, 200)
                    alerts_response = await c.get("/api/admin/alerts", headers=ah)
                    self.assertIn("no-store", alerts_response.headers.get("cache-control", ""))
                    events = alerts_response.json()["items"]
                    self.assertEqual(len(events), 1)
                    self.assertEqual(events[0]["level"], "yellow")
                    with patch("llm_service.API_KEY", ""):
                        red_reply = await c.post(
                            "/api/chat/stream",
                            json={"message":"我不想活了，想伤害自己","dev_override":"normal"},
                        )
                    self.assertEqual(red_reply.status_code, 200)
                    self.assertEqual(red_reply.json()["risk_assessment"]["level"], "red")
                    red_events = (await c.get("/api/admin/alerts?handled=false", headers=ah)).json()["items"]
                    self.assertEqual(len(red_events), 2)
                    self.assertEqual({event["level"] for event in red_events}, {"yellow", "red"})
                    # 同一注册学生触发两条预警后，学生账号数仍只能计为 1。
                    stats = await c.get("/api/admin/stats", headers=ah)
                    self.assertEqual(stats.status_code, 200)
                    self.assertEqual(stats.json()["total_users"], 1)
                    registered_users = (await c.get("/api/admin/users", headers=ah)).json()["items"]
                    self.assertEqual([user["account"] for user in registered_users], ["2026001"])
                    for event in red_events:
                        handled = await c.post(
                            f"/api/admin/alerts/{event['id']}/handle",
                            headers=ah,
                            json={"action":"follow_up"},
                        )
                        self.assertEqual(handled.status_code, 200)
                    self.assertEqual((await c.get("/api/admin/alerts?handled=false", headers=ah)).json()["items"], [])
                    legacy = database.get_or_create_user("old-admin", "testing123", "admin", {"admin_type":"C"})
                    token = create_access_token(legacy, "old-admin", "admin")
                    self.assertEqual((await c.get("/api/admin/stats", headers={"Authorization":"Bearer "+token})).status_code,403)
                    await c.post("/api/auth/c-logout")
                    self.assertNotIn("c_token", c.cookies)
            asyncio.run(run())

if __name__ == "__main__":
    unittest.main()
