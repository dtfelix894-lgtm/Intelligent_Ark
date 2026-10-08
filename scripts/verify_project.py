"""Run from any directory: python scripts/verify_project.py.

Retains an isolated database, JSON/Markdown reports, screenshots and logs in a
unique system-temp directory. No production API/database or paid provider calls.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
sys.path.insert(0, str(ROOT / "scripts"))


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def port_is_open(port: int) -> bool:
    with socket.socket() as sock:
        sock.settimeout(0.3)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def wait_ready(url: str, process: subprocess.Popen, timeout: int = 60) -> None:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if process.poll() is not None:
            raise RuntimeError(f"Service exited before ready: {url}; inspect service log")
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(0.25)
    raise TimeoutError(f"Service readiness timed out: {url}")


def main() -> int:
    # Bind a dedicated lock port for the duration: prevents two builds writing
    # the same .next-verify concurrently, without files that need deleting.
    lock = socket.socket()
    try:
        lock.bind(("127.0.0.1", 18997))
        lock.listen(1)
    except OSError:
        print("Another acceptance run is active, or lock port 18997 is occupied.", flush=True)
        lock.close()
        return 1

    artifacts = Path(tempfile.mkdtemp(prefix="ark-acceptance-"))
    report = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running", "artifacts": str(artifacts), "steps": [],
        "provider_mode": "Offline LLM fallback; deterministic quote and ASR providers. Real HTTP, auth, database and Next production build.",
        "not_verified": ["Live LLM provider", "Live Zhipu ASR", "Physical phone/microphone", "Public HTTPS deployment", "Multi-school isolation"],
    }
    env = dict(os.environ)
    backend_port, frontend_port = free_port(), free_port()
    while frontend_port == backend_port:
        frontend_port = free_port()
    env.update({
        "ARK_ACCEPTANCE": "1", "ARK_VERIFY": "1", "ARK_ARTIFACT_DIR": str(artifacts),
        "ARK_BACKEND_PORT": str(backend_port), "DB_PATH": str(artifacts / "acceptance.db"),
        "APP_ENV": "dev", "JWT_SECRET": secrets.token_hex(32), "SEED_DEMO_USERS": "0",
        "LLM_API_KEY": "", "ZHIPU_API_KEY": "", "MIMO_API_KEY": "", "ADMIN_INVITE_CODE": "",
        "NEXT_PUBLIC_API_BASE": "", "API_UPSTREAM": f"http://127.0.0.1:{backend_port}",
        "PYTHONIOENCODING": "utf-8", "NEXT_TELEMETRY_DISABLED": "1", "ALLOW_ANY_ORIGIN": "0",
        "ALLOWED_ORIGINS": f"http://127.0.0.1:{frontend_port}",
    })
    # Explicit empty provider keys prevent dotenv fallback to developer secrets.
    env.update({"LLM_BASE_URL": "http://127.0.0.1:1", "ZHIPU_BASE_URL": "http://127.0.0.1:1"})
    processes: list[tuple[str, subprocess.Popen, int]] = []
    logs = []
    print(f"ARTIFACTS={artifacts}", flush=True)

    def run_step(name: str, cmd: list[str], cwd: Path, timeout: int = 240):
        print(f"RUN {name}", flush=True)
        path = artifacts / f"{name}.log"
        started = time.monotonic()
        with path.open("w", encoding="utf-8") as log:
            result = subprocess.run(cmd, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
        report["steps"].append({"name": name, "status": "passed" if result.returncode == 0 else "failed", "log": str(path), "seconds": round(time.monotonic() - started, 2)})
        if result.returncode:
            raise RuntimeError(f"{name} failed; see {path}")

    def start_service(name: str, cmd: list[str], cwd: Path, port: int, health_path: str):
        log = (artifacts / f"{name}.log").open("w", encoding="utf-8")
        logs.append(log)
        process = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        processes.append((name, process, port))
        wait_ready(f"http://127.0.0.1:{port}{health_path}", process)
        return process

    try:
        node = shutil.which("node")
        next_cli = FRONTEND / "node_modules" / "next" / "dist" / "bin" / "next"
        if not node or not next_cli.is_file():
            raise RuntimeError("Install Node and frontend dependencies (npm ci) first.")
        import playwright.sync_api  # Dependency check before building.
        run_step("backend-contracts", [sys.executable, "-m", "unittest", "discover", "-p", "test_*.py", "-v"], ROOT / "backend")
        run_step("frontend-lint", [node, str(next_cli), "lint"], FRONTEND)
        run_step("campus-time-boundaries", [node, str(ROOT / "scripts" / "check_campus_time.cjs")], ROOT)
        run_step("frontend-build", [node, str(next_cli), "build"], FRONTEND, timeout=360)
        start_service("backend", [sys.executable, str(ROOT / "scripts" / "acceptance_server.py")], ROOT, backend_port, "/health")
        front = start_service("frontend-production", [node, str(next_cli), "start", "-H", "127.0.0.1", "-p", str(frontend_port)], FRONTEND, frontend_port, "/login")
        from browser_acceptance import run_browser_checks
        print("RUN browser-acceptance", flush=True)
        report["browser"] = run_browser_checks(f"http://127.0.0.1:{frontend_port}", artifacts)
        if report["browser"].get("status") == "failed":
            raise RuntimeError("Browser acceptance failed; inspect browser report.")

        from session_acceptance import run_session_checks
        print("RUN session-acceptance", flush=True)
        report["sessions"] = run_session_checks(f"http://127.0.0.1:{frontend_port}", artifacts, env["JWT_SECRET"])

        # The ASR mount regression requires development StrictMode specifically.
        front.terminate()
        front.wait(timeout=15)
        start_service("frontend-development", [node, str(next_cli), "dev", "-H", "127.0.0.1", "-p", str(frontend_port)], FRONTEND, frontend_port, "/login")
        from interaction_acceptance import run_interaction_checks
        print("RUN interaction-acceptance", flush=True)
        report["interactions"] = run_interaction_checks(f"http://127.0.0.1:{frontend_port}", artifacts)
        from preference_acceptance import run_preference_checks
        print("RUN preference-acceptance", flush=True)
        report["preferences"] = run_preference_checks(f"http://127.0.0.1:{frontend_port}", artifacts)
        report["status"] = "passed"
    except Exception as exc:
        report["status"] = "failed"
        report["error"] = f"{type(exc).__name__}: {exc}"
        report["traceback"] = traceback.format_exc()
        print(report["error"], flush=True)
    finally:
        # Stop only processes created by this invocation. Preserve all artifacts.
        for name, process, port in reversed(processes):
            if process.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    process.terminate()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        for log in logs:
            log.close()
        report["test_ports_released"] = not port_is_open(frontend_port) and not port_is_open(backend_port)
        if not report["test_ports_released"]:
            report["status"] = "failed"
            report["cleanup_error"] = "A test port is still listening; inspect recorded process logs."
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        (artifacts / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        lines = ["# 智伴方舟功能验收报告", "", f"状态：{report['status']}", f"开始：{report['started_at']}", f"结束：{report['finished_at']}", "", f"外部服务：{report['provider_mode']}", ""]
        for step in report["steps"]:
            lines.append(f"- {step['name']}: {step['status']} ({step['seconds']}s)")
        for section in ("browser", "sessions", "interactions", "preferences"):
            if section in report:
                lines.extend(["", f"## {section}", "", "```json", json.dumps(report[section], ensure_ascii=False, indent=2), "```"])
        if report.get("error"):
            lines.extend(["", f"失败：{report['error']}"])
        lines.extend(["", f"测试端口已释放：{report['test_ports_released']}", "", "待真实环境验证：" + "；".join(report["not_verified"])])
        (artifacts / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        lock.close()
        print(f"RESULT={report['status']} REPORT={artifacts / 'report.md'}", flush=True)
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
