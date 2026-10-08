"""Real browser acceptance against the disposable services started by verify_project.

No core API is intercepted. The caller owns service/database setup and teardown.
Requires Python Playwright and its Chromium browser (`python -m playwright install chromium`).
"""
from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit

from playwright.sync_api import Page, expect, sync_playwright


STUDENT = "20269901"
PASSWORD = "ArkTest123!"
SCHOOL = "验收测试大学"


def run_browser_checks(base_url: str, artifact_dir: Path) -> dict:
    """Return a JSON-serializable report; failed assertions remain visible in checks.

    Preconditions: empty isolated database, admin G900/ArkTest123!, school 验收测试大学,
    offline LLM fallback and controlled external quote/ASR providers. Do not point
    this function at a deployment or a database containing real users.
    """
    artifact_dir = Path(artifact_dir).resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)
    origin = urlsplit(base_url)
    report: dict = {
        "status": "running", "checks": [], "screenshots": [], "page_errors": [],
        "console_errors": [], "unexpected_http": [], "expected_http": [],
        "unverified": [
            "真实 LLM/ASR 供应商、真实麦克风授权和录音质量、HTTPS、实体手机与跨设备网络。",
            "浏览器仅验证现有规则的预警联动，不验证心理风险医学准确率。",
        ],
        "transport": "真实浏览器→Next 同源转发→FastAPI→隔离 SQLite；无核心接口 route mock",
    }
    state = {"case": "setup", "wrong_password": False}
    chat_requests: list[dict] = []
    created_alert_ids: list[int] = []

    def snapshot(page: Page, name: str) -> str:
        target = artifact_dir / f"{name}.png"
        page.screenshot(path=str(target), full_page=True, animations="disabled", timeout=10000)
        report["screenshots"].append(str(target))
        return str(target)

    def watch(page: Page, side: str) -> None:
        def on_response(response):
            parsed = urlsplit(response.url)
            if (parsed.scheme, parsed.netloc) != (origin.scheme, origin.netloc):
                return
            if response.status < 400:
                return
            entry = {"case": state["case"], "side": side, "status": response.status,
                     "url": response.url}
            expected = state["wrong_password"] and parsed.path == "/api/auth/c-login" and response.status == 401
            report["expected_http" if expected else "unexpected_http"].append(entry)

        def on_console(message):
            if message.type != "error":
                return
            entry = {"case": state["case"], "side": side, "text": message.text,
                     "location": message.location}
            # Chromium reports the deliberately rejected password as a resource error.
            if state["wrong_password"] and "401" in message.text and "Failed to load resource" in message.text:
                return
            report["console_errors"].append(entry)

        def on_request(request):
            if urlsplit(request.url).path == "/api/chat/stream" and request.method == "POST":
                chat_requests.append(request.post_data_json)

        page.on("response", on_response)
        page.on("console", on_console)
        page.on("request", on_request)
        page.on("pageerror", lambda error: report["page_errors"].append(
            {"case": state["case"], "side": side, "message": str(error)}))

    def check(case_id: str, title: str, page: Page, action: Callable[[], dict | None]) -> bool:
        state["case"] = case_id
        start = time.monotonic()
        result = {"id": case_id, "title": title, "status": "passed"}
        try:
            result["evidence"] = action() or {}
            result["screenshot"] = snapshot(page, case_id.replace("/", "-"))
        except Exception as exc:
            result.update(status="failed", detail=f"{type(exc).__name__}: {exc}")
            try:
                result["screenshot"] = snapshot(page, f"{case_id}-failed")
            except Exception as screenshot_error:
                result["screenshot_error"] = str(screenshot_error)
        result["duration_seconds"] = round(time.monotonic() - start, 3)
        report["checks"].append(result)
        return result["status"] == "passed"

    def api(page: Page, path: str) -> dict:
        response = page.context.request.get(f"{base_url}{path}")
        assert response.ok, f"Real API {path}: HTTP {response.status}"
        return response.json()

    def close_dialog(page: Page) -> None:
        dialog = page.get_by_role("dialog").last
        # Pin the element: after a nested modal closes, `.last` would point at
        # the still-open parent drawer rather than the dialog being dismissed.
        dialog_id = dialog.get_attribute("id")
        dialog.get_by_role("button", name="关闭", exact=True).click()
        expect(page.locator(f'[id="{dialog_id}"]')).not_to_be_visible()

    def send_message(page: Page, text: str, *, enter: bool = False) -> dict:
        messages = page.locator("section[aria-label$='对话'] article")
        request_count = len(chat_requests)
        textarea = page.get_by_label("写下你此刻的感受", exact=True)
        expect(textarea).to_be_enabled()
        textarea.fill(text)
        expect(page.get_by_role("button", name="发送消息", exact=True)).to_be_enabled()
        before = messages.count()
        with page.expect_response(lambda response: urlsplit(response.url).path == "/api/chat/stream"
                                  and response.request.method == "POST", timeout=15000) as pending:
            textarea.press("Enter") if enter else page.get_by_role("button", name="发送消息", exact=True).click()
        response = pending.value
        assert response.ok, f"Chat returned HTTP {response.status}"
        payload = response.json()
        expect(messages).to_have_count(before + 2)
        expect(textarea).to_be_enabled()
        assert len(chat_requests) == request_count + 1, "One submit must produce exactly one chat request"
        assert messages.last.inner_text().strip(), "Assistant reply must not be blank"
        return payload

    def stats(page: Page, pending: int) -> dict:
        overview = page.get_by_role("region", name="数据概览")
        expect(overview.locator("[aria-label$='加载中']")).to_have_count(0)
        expect(overview.locator("article").filter(has_text="已注册学生账号")).to_contain_text("1人")
        expect(overview.locator("article").filter(has_text="待跟进预警")).to_contain_text(f"{pending}条")
        expect(overview.locator("article").filter(has_text="数据范围")).to_contain_text("高校场景")
        return {"registered_students": 1, "pending_alerts": pending, "skeletons": 0}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        student_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True,
                                              has_touch=True, locale="zh-CN", timezone_id="Asia/Shanghai")
        admin_context = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN",
                                            timezone_id="Asia/Shanghai")
        student, admin = student_context.new_page(), admin_context.new_page()
        for page in (student, admin):
            page.set_default_timeout(8000)
            page.set_default_navigation_timeout(20000)
        watch(student, "student")
        watch(admin, "admin")
        try:
            def guards():
                student.goto(f"{base_url}/chat")
                expect(student).to_have_url(re.compile(r"/login(?:\?.*)?$"))
                admin.goto(f"{base_url}/admin")
                expect(admin).to_have_url(re.compile(r"/admin-login(?:\?.*)?$"))
                return {"student_redirect": student.url, "admin_redirect": admin.url}

            check("F01", "未登录页面守卫", student, guards)

            def registration():
                student.goto(f"{base_url}/login")
                student.get_by_role("button", name="首次使用？创建学生账号").click()
                student.locator("#student-account").fill(STUDENT)
                student.locator("#student-password").fill(PASSWORD)
                student.locator("#school").fill(SCHOOL)
                student.locator("#student-id").fill(STUDENT)
                student.get_by_role("button", name="注册并进入", exact=True).click()
                expect(student).to_have_url(f"{base_url}/chat")
                student.get_by_role("button", name="打开账户与预警设置").click()
                expect(student.get_by_role("dialog")).to_contain_text(SCHOOL)
                expect(student.get_by_role("dialog")).to_contain_text(STUDENT)
                student.get_by_role("button", name="退出当前账号").click()
                expect(student).to_have_url(f"{base_url}/login")
                student.locator("#student-account").fill(STUDENT)
                student.locator("#student-password").fill("WrongPassword123!")
                state["wrong_password"] = True
                try:
                    with student.expect_response(lambda response: urlsplit(response.url).path == "/api/auth/c-login") as pending:
                        student.get_by_role("button", name="进入陪伴空间", exact=True).click()
                    assert pending.value.status == 401
                    expect(student.locator('main [role="alert"]')).to_be_visible()
                    student.wait_for_timeout(150)
                finally:
                    state["wrong_password"] = False
                student.locator("#student-password").fill(PASSWORD)
                student.get_by_role("button", name="进入陪伴空间", exact=True).click()
                expect(student).to_have_url(f"{base_url}/chat")
                expect(student.get_by_text("欢迎回来，先在这里缓一缓。", exact=True)).not_to_be_visible()
                return {"account": STUDENT, "school": SCHOOL, "wrong_password_http": 401,
                        "registered_and_relogged": True}

            student_ready = check("F02", "学生注册、退出及错误/正确密码登录", student, registration)

            def admin_login():
                admin.goto(f"{base_url}/admin-login")
                admin.get_by_label("管理员工号", exact=True).fill("G900")
                admin.locator("#admin-password").fill(PASSWORD)
                admin.get_by_role("button", name="进入高校工作台", exact=True).click()
                expect(admin).to_have_url(f"{base_url}/admin")
                expect(admin.get_by_role("heading", name="学生心理风险管理")).to_be_visible()
                return stats(admin, 0)

            admin_ready = check("F04-login", "独立桌面会话登录真实工作台", admin, admin_login)
            if student_ready and admin_ready:
                def normal_chat():
                    payload = send_message(student, "今天在图书馆看了一本有趣的书，想和你分享。")
                    assert payload["risk_assessment"]["level"] == "green"
                    student.reload()
                    expect(student.locator("section[aria-label$='对话'] article")).to_have_count(2)
                    expect(student.get_by_text("今天在图书馆看了一本有趣的书，想和你分享。", exact=True)).to_be_visible()
                    assert api(admin, "/api/admin/alerts?scenario=university&handled=false")["items"] == []
                    return {"history_messages": 2, "normal_chat_risk": "green", **stats(admin, 0)}

                check("F05", "正常聊天一问一答、历史恢复且预警为零", student, normal_chat)

                def risk_flow():
                    timings = []
                    for level, message, count in [
                        ("red", "我不想活了，感觉活不下去。", 1),
                        ("yellow", "最近持续失眠，学习压力很大。", 2),
                    ]:
                        payload = send_message(student, message)
                        assert payload["risk_assessment"]["level"] == level
                        returned = time.monotonic()
                        expect(admin.get_by_role("button", name="标记已跟进", exact=True)).to_have_count(count, timeout=6000)
                        elapsed = time.monotonic() - returned
                        assert elapsed <= 6, f"Automatic polling took {elapsed:.2f}s"
                        timings.append({"risk": level, "seconds_after_reply": round(elapsed, 3)})
                        # SQLite timestamps currently have second precision; make chronology deterministic.
                        if level == "red":
                            student.wait_for_timeout(1100)
                    alerts = api(admin, "/api/admin/alerts?scenario=university&handled=false")["items"]
                    assert len(alerts) == 2 and {item["account"] for item in alerts} == {STUDENT}
                    assert {item["level"] for item in alerts} == {"red", "yellow"}
                    created_alert_ids.extend(item["id"] for item in alerts)
                    return {"polling": timings, "alert_ids": created_alert_ids.copy(), **stats(admin, 2)}

                risk_ready = check("F06", "一个学生触发两级预警并自动进入工作台", admin, risk_flow)
                if risk_ready:
                    def priority():
                        cards = admin.locator("article").filter(has=admin.get_by_role("button", name="标记已跟进", exact=True))
                        expect(cards.first).to_contain_text("高风险")
                        admin.get_by_role("button", name="打开账户与预警设置").click()
                        toggle = admin.get_by_role("switch", name="红色高风险优先")
                        bounds = toggle.bounding_box()
                        assert bounds and bounds["height"] >= 44 and bounds["width"] >= 44
                        expect(toggle).to_have_attribute("aria-checked", "true")
                        toggle.click()
                        expect(toggle).to_have_attribute("aria-checked", "false")
                        expect(admin.get_by_text("按时间", exact=True)).to_be_visible()
                        close_dialog(admin)
                        expect(cards.first).to_contain_text("需关注")
                        admin.reload()
                        expect(cards).to_have_count(2)
                        expect(cards.first).to_contain_text("需关注")
                        admin.get_by_role("button", name="打开账户与预警设置").click()
                        expect(toggle).to_have_attribute("aria-checked", "false")
                        toggle.press("Space")
                        expect(toggle).to_have_attribute("aria-checked", "true")
                        close_dialog(admin)
                        expect(cards.first).to_contain_text("高风险")
                        return {"toggle_target": bounds, "sort_changed": True, "reload_preserved": True,
                                "keyboard_space": True}

                    check("F07", "风险优先开关与排序持久化", admin, priority)

                    def follow_up():
                        admin.goto(f"{base_url}/admin")
                        expect(admin.get_by_role("button", name="标记已跟进", exact=True)).to_have_count(2)
                        handled_ids = []
                        for remaining in (1, 0):
                            with admin.expect_response(lambda response: re.search(r"/api/admin/alerts/\d+/handle$", response.url)
                                                       and response.request.method == "POST") as pending:
                                admin.get_by_role("button", name="标记已跟进", exact=True).first.click()
                            response = pending.value
                            assert response.ok
                            event_id = int(re.search(r"/alerts/(\d+)/handle", response.url).group(1))
                            assert event_id in created_alert_ids
                            handled_ids.append(event_id)
                            expect(admin.get_by_role("button", name="标记已跟进", exact=True)).to_have_count(remaining)
                        admin.reload()
                        expect(admin.get_by_role("heading", name="当前没有待跟进预警")).to_be_visible()
                        handled = api(admin, "/api/admin/alerts?scenario=university&handled=true")["items"]
                        assert {item["id"] for item in handled} == set(created_alert_ids)
                        assert all(item["handled_by"] == "G900" and item["handled_at"] for item in handled)
                        admin.goto(f"{base_url}/")
                        admin.goto(f"{base_url}/admin")
                        expect(admin.get_by_role("heading", name="当前没有待跟进预警")).to_be_visible()
                        return {"handled_ids": handled_ids, "handled_by": "G900", "persistent": True, **stats(admin, 0)}

                    check("F08", "准确跟进本次两条预警并持久保存", admin, follow_up)
                else:
                    for case_id in ("F07", "F08"):
                        report["checks"].append({"id": case_id, "status": "blocked", "detail": "F06 未通过，预警依赖不满足"})
            else:
                for case_id in ("F05", "F06", "F07", "F08"):
                    report["checks"].append({"id": case_id, "status": "blocked", "detail": "注册/管理登录失败"})

            if student_ready:
                def persona():
                    student.goto(f"{base_url}/chat")
                    student.get_by_role("button", name="打开账户与预警设置").click()
                    brother = student.get_by_role("button", name="知心学长 松弛可靠", exact=True)
                    brother.click()
                    expect(brother).to_have_attribute("aria-pressed", "true")
                    close_dialog(student)
                    expect(student.get_by_text("知心学长在线", exact=True)).to_be_visible()
                    student.reload()
                    expect(student.get_by_text("知心学长在线", exact=True)).to_be_visible()
                    payload = send_message(student, "学长，今天完成了一个小目标。")
                    assert chat_requests[-1]["companion_persona"] == "senior_brother"
                    assert isinstance(chat_requests[-1]["campus_context"]["local_hour"], int)
                    assert "学长" in payload["reply"]
                    return {"persona": "senior_brother", "request_matches_header": True, "reload_preserved": True}

                check("F10", "学长偏好、页面称呼和真实请求一致", student, persona)

                def ime():
                    student.goto(f"{base_url}/chat")
                    textarea = student.get_by_label("写下你此刻的感受", exact=True)
                    expect(student.locator("section[aria-label$='对话'] article")).not_to_have_count(0)
                    expect(textarea).to_be_enabled()
                    message = "中文输入法确认验收文字"
                    textarea.fill(message)
                    before = len(chat_requests)
                    textarea.dispatch_event("compositionstart")
                    textarea.dispatch_event("keydown", {"key": "Enter", "code": "Enter", "keyCode": 229,
                                                         "which": 229, "isComposing": True, "bubbles": True})
                    student.wait_for_timeout(350)
                    assert len(chat_requests) == before, "IME confirmation sent a message prematurely"
                    expect(textarea).to_have_value(message)
                    textarea.dispatch_event("compositionend")
                    send_message(student, message, enter=True)
                    assert len(chat_requests) == before + 1
                    return {"composing_enter_requests": 0, "normal_enter_requests": 1}

                check("F11", "中文输入法确认不误发、普通 Enter 只发一次", student, ime)

                def responsive():
                    student.goto(f"{base_url}/chat")
                    measures = []
                    for width, height in [(375, 812), (390, 844), (844, 390)]:
                        student.set_viewport_size({"width": width, "height": height})
                        textarea = student.get_by_label("写下你此刻的感受", exact=True)
                        expect(textarea).to_be_visible()
                        textarea.scroll_into_view_if_needed()
                        geometry = student.evaluate("""() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
                            body: document.body.scrollWidth })""")
                        assert geometry["width"] <= width + 1 and geometry["body"] <= width + 1, geometry
                        box = textarea.bounding_box()
                        assert box and 0 <= box["x"] and box["x"] + box["width"] <= width + 1
                        assert 0 <= box["y"] < height and box["y"] + box["height"] <= height + 1
                        measures.append({"width": width, "height": height, "geometry": geometry})
                        snapshot(student, f"F14-{width}x{height}")
                    student.set_viewport_size({"width": 390, "height": 844})
                    desktop = admin.evaluate("() => ({viewport: innerWidth, width: document.documentElement.scrollWidth})")
                    assert desktop["width"] <= desktop["viewport"] + 1, desktop
                    return {"mobile": measures, "desktop": desktop}

                check("F14", "手机竖横屏和桌面无横向溢出且输入可触达", student, responsive)

                def tools():
                    student.goto(f"{base_url}/chat")
                    student.set_viewport_size({"width": 390, "height": 844})
                    student.get_by_role("button", name="打开校园信息").click()
                    campus = student.get_by_role("dialog")
                    expect(campus.get_by_role("heading", name="每日治愈", exact=True)).to_be_visible()
                    assert campus.locator("blockquote").inner_text().strip("“” "), "Daily quote is blank"
                    close_dialog(student)
                    student.get_by_role("button", name="打开自助工具").click()
                    drawer = student.get_by_role("dialog", name="自助工具", exact=True)
                    play = drawer.get_by_role("button", name="钢琴纯音 轻音乐", exact=True)
                    play.click()
                    expect(play).to_have_attribute("aria-pressed", "true")
                    audio = drawer.locator("audio[src='/sounds/piano.mp3']")
                    student.wait_for_function("() => [...document.querySelectorAll('[role=dialog] audio')].some(a => a.src.endsWith('/sounds/piano.mp3') && !a.paused && a.currentTime > 0)")
                    progress = audio.evaluate("a => ({time: a.currentTime, paused: a.paused, ready: a.readyState})")
                    play.click()
                    expect(play).to_have_attribute("aria-pressed", "false")
                    assert audio.evaluate("a => a.paused")
                    rain = drawer.get_by_role("button", name="雨声", exact=True)
                    rain.click()
                    expect(rain).to_have_attribute("aria-pressed", "true")
                    rain.click()
                    expect(rain).to_have_attribute("aria-pressed", "false")
                    drawer.get_by_role("button", name="学业解压锦囊 一条现在就能做的小建议", exact=True).click()
                    tips = student.get_by_role("dialog", name="学业解压锦囊", exact=True)
                    expect(tips.get_by_text("呼吸调节 · 1/3", exact=True)).to_be_visible()
                    tips.get_by_role("button", name="换一条建议").click()
                    expect(tips.get_by_text("呼吸调节 · 2/3", exact=True)).to_be_visible()
                    close_dialog(student)
                    drawer.get_by_role("tab", name="释放", exact=True).click()
                    drawer.get_by_role("button", name="电子木鱼 用轻敲找回片刻专注", exact=True).click()
                    fish = student.get_by_role("dialog", name="电子木鱼", exact=True)
                    fish.get_by_role("button", name="敲电子木鱼", exact=True).click()
                    expect(fish.get_by_text("1", exact=True)).to_be_visible()
                    assert student.evaluate("localStorage.getItem('ark_wooden_fish_count')") == "1"
                    close_dialog(student)
                    drawer.get_by_role("button", name="情绪碎纸机 写下烦恼，再亲手放下", exact=True).click()
                    shredder = student.get_by_role("dialog", name="情绪碎纸机", exact=True)
                    shredder.get_by_placeholder("写下此刻压在心里的烦恼…").fill("验收用的小烦恼")
                    shredder.get_by_role("button", name="把它揪出来 →", exact=True).click()
                    worry = shredder.get_by_text("验收用的小烦恼", exact=True)
                    expect(worry).to_be_visible()
                    worry.dispatch_event("pointerdown", {"pointerId": 1, "pointerType": "touch", "bubbles": True})
                    expect(shredder.get_by_placeholder("写下此刻压在心里的烦恼…")).to_be_visible()
                    expect(shredder.get_by_placeholder("写下此刻压在心里的烦恼…")).to_have_value("")
                    assert student.evaluate("localStorage.getItem('shredder_released')") == "1"
                    close_dialog(student)
                    drawer.get_by_role("button", name="打字发泄墙 文字只在本页飘散", exact=True).click()
                    typing = student.get_by_role("dialog", name="打字发泄墙", exact=True)
                    typing.get_by_label("在打字发泄墙输入文字", exact=True).fill("放松")
                    expect(typing.get_by_label("在打字发泄墙输入文字", exact=True)).to_have_value("")
                    expect(typing.locator(".ark-fly-away")).to_have_count(2)
                    close_dialog(student)
                    drawer.get_by_role("tab", name="帮助", exact=True).click()
                    expect(drawer.get_by_role("heading", name="需要现实中的帮助？")).to_be_visible()
                    assert drawer.locator("a[href^='tel:']").count() >= 1
                    close_dialog(student)
                    expect(student.get_by_label("写下你此刻的感受", exact=True)).to_be_visible()
                    return {"daily_quote": True, "real_local_audio": progress, "audio_stopped": True,
                            "mindfulness": True, "next_tip": True, "wooden_fish_count": 1,
                            "shredded_count": 1, "typing_cleared": True, "help_visible": True}

                check("F13", "每日治愈、播放停止、解压与全部现有释放工具", student, tools)

                def dual_sessions():
                    student.goto(f"{base_url}/admin-login")
                    student.get_by_label("管理员工号", exact=True).fill("G900")
                    student.locator("#admin-password").fill(PASSWORD)
                    student.get_by_role("button", name="进入高校工作台", exact=True).click()
                    expect(student).to_have_url(f"{base_url}/admin")
                    c_profile = api(student, "/api/auth/c-me")
                    b_profile = api(student, "/api/auth/b-me")
                    assert c_profile["account"] == STUDENT and b_profile["account"] == "G900"
                    student.goto(f"{base_url}/chat")
                    expect(student.get_by_label("写下你此刻的感受", exact=True)).to_be_visible()
                    return {"same_browser_student": c_profile["account"], "same_browser_admin": b_profile["account"]}

                check("F04", "同浏览器双身份保持正确会话", student, dual_sessions)
            else:
                for case_id in ("F10", "F11", "F13", "F14", "F04"):
                    report["checks"].append({"id": case_id, "status": "blocked", "detail": "学生注册登录未通过"})
        finally:
            student_context.close()
            admin_context.close()
            browser.close()

    errors = len(report["page_errors"]) + len(report["console_errors"]) + len(report["unexpected_http"])
    report["checks"].append({"id": "F16-browser", "title": "正常操作无未捕获异常/非预期 HTTP 错误",
                              "status": "passed" if errors == 0 else "failed",
                              "evidence": {"page_errors": len(report["page_errors"]),
                                           "console_errors": len(report["console_errors"]),
                                           "unexpected_http": len(report["unexpected_http"]),
                                           "allowed_wrong_password_responses": len(report["expected_http"])}})
    report["status"] = "passed" if all(item["status"] == "passed" for item in report["checks"]) else "failed"
    return report
