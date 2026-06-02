import json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
API = "http://127.0.0.1:8001"


def login_token(req, worker_id):
    r = req.post(f"{API}/api/auth/b-login",
                 data=json.dumps({"worker_id": worker_id, "password": "123456"}),
                 headers={"Content-Type": "application/json"})
    return r.json()["token"]


def run(admin_type, worker_id, label):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        req = ctx.request
        token = login_token(req, worker_id)

        ctx.add_cookies([
            {"name": "b_token", "value": token, "url": BASE},
            {"name": "b_role", "value": "university" if admin_type == "G" else "community", "url": BASE},
        ])
        page = ctx.new_page()
        page.goto(BASE)
        page.evaluate(
            """([t, info]) => { localStorage.setItem('ark_b_token', t); localStorage.setItem('b_admin_info', info); }""",
            [token, json.dumps({"type": admin_type, "workerId": worker_id, "schoolName": "保定学院" if admin_type == "G" else ""})],
        )
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(f"{BASE}/admin")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)
        shot = f"/tmp/admin_{label}.png"
        page.screenshot(path=shot, full_page=True)

        # 抓两个图卡的关键文本，确认真实数据渲染
        body = page.inner_text("body")
        has_trend = "风险走势" in body
        has_tags = ("高频风险标签" in body) or ("康养风险标签" in body)
        # 趋势空状态 / 标签条目数
        empty_trend = "近 7 天暂无风险预警" in body
        print(f"[{label}] type={admin_type} 走势卡={has_trend} 标签卡={has_tags} 趋势空态={empty_trend} 截图={shot}")
        if errors:
            print(f"[{label}] console errors:", errors[:5])
        browser.close()


run("C", "C001", "community")
run("G", "G001", "university")
