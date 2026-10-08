"""Account-scoped preferences and blocked storage using real disposable auth."""
from playwright.sync_api import expect, sync_playwright


def run_preference_checks(base_url, artifact_dir):
    checks = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            context = browser.new_context()
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            def login(account):
                assert context.request.post(base_url + "/api/auth/c-login", data={"account": account, "password": "ArkTest123!"}).ok
                page.goto(base_url + "/chat")
                page.get_by_role("button", name="打开账户与预警设置").click()
                expect(page.get_by_text(account, exact=True).last).to_be_visible()
            login("20269901")
            page.get_by_role("button", name="知心学长 松弛可靠", exact=True).click()
            assert context.request.post(base_url + "/api/auth/c-register", data={"account": "20269902", "password": "ArkTest123!", "school": "验收测试大学"}).ok
            login("20269902")
            expect(page.get_by_role("button", name="知心学姐 温柔细腻", exact=True)).to_have_attribute("aria-pressed", "true")
            login("20269901")
            expect(page.get_by_role("button", name="知心学长 松弛可靠", exact=True)).to_have_attribute("aria-pressed", "true")
            assert not errors, errors
            checks.append({"id": "S3-04-account-switch", "status": "passed"})
            page.evaluate("""() => {
                localStorage.setItem('ark_companion_persona:20269901', 'invalid-persona');
                localStorage.setItem('ark_companion_persona', 'senior_brother');
            }""")
            login("20269901")
            expect(page.get_by_role("button", name="知心学姐 温柔细腻", exact=True)).to_have_attribute("aria-pressed", "true")
            assert page.evaluate("localStorage.getItem('ark_companion_persona')") == "senior_brother"
            checks.append({"id": "S3-04-invalid-legacy-preference", "status": "passed"})
            context.close()
            for side, path in (("c", "/chat"), ("b", "/admin")):
                context = browser.new_context()
                context.add_init_script("""for (const method of ['getItem', 'setItem', 'removeItem']) {
                    Storage.prototype[method] = function() { throw new DOMException('Storage blocked', 'SecurityError'); };
                }""")
                credentials = {"account": "20269901", "password": "ArkTest123!"} if side == "c" else {"worker_id": "G900", "password": "ArkTest123!"}
                assert context.request.post(base_url + f"/api/auth/{side}-login", data=credentials).ok
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(base_url + path)
                page.get_by_role("button", name="打开账户与预警设置").click()
                if side == "c":
                    page.get_by_role("button", name="知心学长 松弛可靠", exact=True).click()
                    page.keyboard.press("Escape")
                    expect(page.get_by_text("知心学长在线", exact=True)).to_be_visible()
                    expect(page.locator('main [role="alert"]')).to_contain_text("未能保存")
                    page.get_by_label("写下你此刻的感受").fill("今天完成了一件小事")
                    expect(page.get_by_role("button", name="发送消息")).to_be_enabled()
                    with page.expect_response(lambda r: "/api/chat/stream" in r.url and r.request.method == "POST") as pending:
                        page.get_by_role("button", name="发送消息").click()
                    assert pending.value.ok
                    expect(page.get_by_text("今天完成了一件小事", exact=True)).to_be_visible()
                    expect(page.get_by_label("写下你此刻的感受")).to_be_enabled()
                else:
                    page.get_by_role("button", name="10 秒", exact=True).click()
                    expect(page.get_by_role("button", name="10 秒", exact=True)).to_have_attribute("aria-pressed", "true")
                    expect(page.get_by_role("alert").filter(has_text="未能保存")).to_be_visible()
                if side == "c":
                    page.get_by_role("button", name="打开账户与预警设置").click()
                page.get_by_role("button", name="退出当前账号", exact=True).click()
                expect(page).to_have_url(base_url + ("/login" if side == "c" else "/admin-login"))
                if side == "c":
                    page.locator("#student-account").fill("20269901")
                    page.locator("#student-password").fill("ArkTest123!")
                    page.get_by_role("button", name="进入陪伴空间", exact=True).click()
                else:
                    page.locator("#worker-id").fill("G900")
                    page.locator("#admin-password").fill("ArkTest123!")
                    page.get_by_role("button", name="进入高校工作台", exact=True).click()
                expect(page).to_have_url(base_url + path)
                assert not errors, errors
                page.screenshot(path=str(artifact_dir / f"storage-blocked-{side}.png"))
                checks.append({"id": f"S3-04-storage-blocked-{side}", "status": "passed"})
                context.close()
        finally:
            browser.close()
    return {"status": "passed", "checks": checks, "injection": "Storage methods throw SecurityError; real HTTP auth/chat, disposable DB"}
