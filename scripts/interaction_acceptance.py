"""Explicit fault-injection/StrictMode suite, separate from real core workflow."""
from __future__ import annotations

from pathlib import Path
from playwright.sync_api import expect, sync_playwright


def run_interaction_checks(base_url: str, artifact_dir: Path) -> dict:
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        ])
        context = browser.new_context(viewport={"width": 390, "height": 844}, permissions=["microphone"])
        response = context.request.post(base_url + "/api/auth/c-login", data={"account": "20269901", "password": "ArkTest123!"})
        assert response.ok, "Fixture student login failed"
        page = context.new_page()
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            # Hold actual history response until the input/submit state is checked.
            page.add_init_script("""(() => {
                const originalFetch = window.fetch.bind(window);
                window.__heldHistory = [];
                window.fetch = (...args) => {
                    if (String(args[0]).includes('/api/chat/history') &&
                        sessionStorage.getItem('acceptance-history-released') !== '1') {
                        return new Promise((resolve, reject) => {
                            window.__heldHistory.push(() => originalFetch(...args).then(resolve, reject));
                        });
                    }
                    return originalFetch(...args);
                };
            })();""")
            page.goto(base_url + "/chat", wait_until="domcontentloaded")
            page.wait_for_function("window.__heldHistory?.length > 0")
            composer = page.get_by_label("写下你此刻的感受")
            composer.fill("历史尚未返回时编辑的草稿")
            expect(page.get_by_role("button", name="发送消息")).to_be_disabled()
            page.wait_for_timeout(300)
            assert page.evaluate("window.__heldHistory.length") > 0, "History request was not delayed"
            page.evaluate("sessionStorage.setItem('acceptance-history-released', '1'); window.__heldHistory.forEach(release => release());")
            expect(page.get_by_role("button", name="发送消息")).to_be_enabled()
            expect(composer).to_have_value("历史尚未返回时编辑的草稿")
            results.append({"id": "F05-history-race", "status": "passed", "evidence": "Draft remains editable; submit waits for actual history."})

            page.route("**/api/chat/history?**", lambda route: route.fulfill(status=503, json={"detail": "测试历史不可用"}))
            page.reload(wait_until="domcontentloaded")
            retry = page.get_by_role("button", name="重新加载聊天记录")
            expect(retry).to_be_visible()
            page.unroute("**/api/chat/history?**")
            retry.click()
            expect(retry).to_have_count(0)
            results.append({"id": "F05-history-retry", "status": "passed", "evidence": "Injected 503 recovers to real persisted history."})

            page.route("**/api/chat/stream", lambda route: route.fulfill(status=503, json={"detail": "测试发送失败"}))
            draft = "发送失败后这段文字需要保留"
            composer.fill(draft)
            page.get_by_role("button", name="发送消息").click()
            expect(page.locator('main [role="alert"]')).to_contain_text("文字已保留在输入框")
            expect(composer).to_have_value(draft)
            expect(page.get_by_role("button", name="发送消息")).to_be_enabled()
            page.unroute("**/api/chat/stream")
            composer.fill("")
            results.append({"id": "F15-send-recovery", "status": "passed", "evidence": "Injected 503 restores editable draft without automatic resend."})

            # Shorten only the explicit chat deadline. Simulate a connection
            # that never returns headers but still obeys AbortSignal.
            page.evaluate("""() => {
                const fetchBefore = window.fetch;
                const timerBefore = window.setTimeout;
                window.__restoreTimeoutTest = () => { window.fetch = fetchBefore; window.setTimeout = timerBefore; };
                window.setTimeout = (callback, delay, ...args) => timerBefore(callback, delay === 75000 ? 150 : delay, ...args);
                window.fetch = (url, options) => String(url).includes('/api/chat/stream')
                    ? new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
                    : fetchBefore(url, options);
            }""")
            composer.fill("网络超时后保留的文字")
            page.get_by_role("button", name="发送消息").click()
            expect(page.locator('main [role="alert"]')).to_contain_text("请求超时")
            expect(composer).to_have_value("网络超时后保留的文字")
            expect(page.get_by_role("button", name="发送消息")).to_be_enabled()
            page.evaluate("window.__restoreTimeoutTest()")
            composer.fill("")
            results.append({"id": "F15-timeout", "status": "passed", "evidence": "Aborted hanging fetch with accelerated 75s chat deadline; clear error and draft recovery."})

            # Synthetic microphone produces a real WAV, upload crosses real
            # Next/auth/FastAPI; only provider transcript is a server fixture.
            def record():
                page.get_by_role("button", name="开始语音输入").click()
                stop = page.get_by_role("button", name="停止录音", exact=False)
                expect(stop).to_be_visible()
                page.wait_for_timeout(1300)
                stop.click()

            for _ in range(2):
                record()
                expect(page.get_by_role("button", name="开始语音输入")).to_be_enabled()
                expect(composer).to_have_value("今天想给自己一点休息的时间")
                composer.fill("")
            results.append({"id": "F12-asr-strict-mode", "status": "passed", "evidence": "Two real WAV uploads in dev StrictMode; transcript filled, button reset both times."})

            page.route("**/api/asr/transcribe", lambda route: route.fulfill(status=502, json={"detail": "测试语音服务不可用"}))
            record()
            expect(page.get_by_text("测试语音服务不可用", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="开始语音输入")).to_be_enabled()
            page.unroute("**/api/asr/transcribe")
            results.append({"id": "F12-asr-failure", "status": "passed", "evidence": "Injected ASR 502 is explained and recorder unlocks."})

            page.evaluate("() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied by test', 'NotAllowedError'); }; }")
            page.get_by_role("button", name="开始语音输入").click()
            expect(page.get_by_text("麦克风权限未开启", exact=False)).to_be_visible()
            expect(page.get_by_role("button", name="开始语音输入")).to_be_enabled()
            results.append({"id": "F12-permission-denied", "status": "passed", "evidence": "Injected permission denial explains recovery and unlocks button."})

            admin = browser.new_context(viewport={"width": 1440, "height": 900})
            assert admin.request.post(base_url + "/api/auth/b-login", data={"worker_id": "G900", "password": "ArkTest123!"}).ok
            work = admin.new_page()
            work.on("pageerror", lambda error: errors.append(str(error)))
            work.route("**/api/admin/alerts?**", lambda route: route.fulfill(status=503, json={"detail": "测试预警暂不可用"}))
            work.route("**/api/admin/stats?**", lambda route: route.fulfill(status=503, json={"detail": "测试统计暂不可用"}))
            work.goto(base_url + "/admin", wait_until="domcontentloaded")
            expect(work.locator('main [role="alert"]')).to_contain_text("预警列表加载失败")
            expect(work.locator('[aria-label$="加载中"]')).to_have_count(0)
            work.unroute("**/api/admin/alerts?**")
            work.unroute("**/api/admin/stats?**")
            work.get_by_role("button", name="重试", exact=True).click()
            expect(work.get_by_text("当前没有待跟进预警", exact=True)).to_be_visible()
            expect(work.locator('main [role="alert"]')).to_have_count(0)
            results.append({"id": "F09-admin-retry", "status": "passed", "evidence": "Both failed data blocks exit loading, retry restores real server state."})
            assert not errors, f"Uncaught browser errors: {errors}"
            return {"status": "passed", "checks": results, "page_errors": errors,
                    "injected_failures": ["history/chat/admin HTTP 503", "ASR HTTP 502", "microphone permission denied"],
                    "not_verified": ["Physical microphone and provider transcription"]}
        except Exception:
            page.screenshot(path=str(artifact_dir / "interaction-failure.png"), full_page=True)
            raise
        finally:
            browser.close()
