"""Session recovery over real auth; only logout outages are injected."""
from pathlib import Path
from urllib.parse import urljoin
import time
import jwt
from playwright.sync_api import expect, sync_playwright


def run_session_checks(base_url: str, artifact_dir: Path, signing_key: str) -> dict:
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for side, path, login_path in (("c", "/chat", "/login"), ("b", "/admin", "/admin-login")):
                for mode in ("logout-unavailable", "logout-network", "expired", "invalid"):
                    context = browser.new_context()
                    creds = {"c": {"account": "20269901", "password": "ArkTest123!"},
                             "b": {"worker_id": "G900", "password": "ArkTest123!"}}
                    tokens = {}
                    for other in ("c", "b"):
                        response = context.request.post(base_url + f"/api/auth/{other}-login", data=creds[other])
                        assert response.ok
                        tokens[other] = response.json()["token"]
                    opposite = "b" if side == "c" else "c"
                    redirect = context.request.get(base_url + login_path, headers={"RSC": "1", "Next-Router-Prefetch": "1"}, max_redirects=0)
                    assert redirect.status == 307
                    assert urljoin(base_url, redirect.headers.get("location", "")) == base_url + path, redirect.headers
                    page = context.new_page()
                    errors = []
                    page.on("pageerror", lambda e: errors.append(str(e)))
                    page.route(f"**/api/auth/{side}-logout", lambda r: r.abort("internetdisconnected") if mode == "logout-network" else r.fulfill(status=503, json={"detail": "Injected logout outage"}))
                    if mode in ("expired", "invalid"):
                        token = "invalid-session"
                        if mode == "expired":
                            payload = jwt.decode(tokens[side], signing_key, algorithms=["HS256"])
                            payload["exp"] = int(time.time()) - 60
                            token = jwt.encode(payload, signing_key, algorithm="HS256")
                        context.add_cookies([{"name": side + "_token", "value": token, "url": base_url, "httpOnly": True}])
                    try:
                        page.goto(base_url + path)
                        if mode.startswith("logout-"):
                            page.get_by_role("button", name="打开账户与预警设置").click()
                            page.get_by_role("button", name="退出当前账号").click()
                        expect(page).to_have_url(base_url + login_path, timeout=10000)
                        page.wait_for_timeout(350)
                        cookies = {c["name"]: c["value"] for c in context.cookies(base_url)}
                        assert side + "_token" not in cookies, "Stale HttpOnly token survived recovery"
                        assert cookies.get(opposite + "_token") == tokens[opposite], "Other side was logged out"
                        page.reload()
                        expect(page).to_have_url(base_url + login_path)
                        page.unroute(f"**/api/auth/{side}-logout")
                        if side == "c":
                            page.locator("#student-account").fill("20269901")
                            page.locator("#student-password").fill("ArkTest123!")
                            page.get_by_role("button", name="进入陪伴空间", exact=True).click()
                        else:
                            page.locator("#worker-id").fill("G900")
                            page.locator("#admin-password").fill("ArkTest123!")
                            page.get_by_role("button", name="进入高校工作台", exact=True).click()
                        expect(page).to_have_url(base_url + path)
                        assert context.request.get(base_url + f"/api/auth/{side}-me").ok
                        assert context.request.get(base_url + f"/api/auth/{opposite}-me").ok
                        assert not errors, errors
                        results.append({"id": f"S3-03-{side}-{mode}", "status": "passed",
                                        "evidence": "HttpOnly cleared, login stable on reload, opposite session preserved, UI relogin succeeded"})
                    except Exception:
                        page.screenshot(path=str(artifact_dir / f"session-{side}-{mode}-failed.png"))
                        raise
                    finally:
                        context.close()
        finally:
            browser.close()
    return {"status": "passed", "checks": results,
            "injection": "Logout endpoint 503/network abort; invalid and correctly signed expired cookies in disposable browser contexts; website remains reachable"}
