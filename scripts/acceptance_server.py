"""Loopback-only test fixture. Never import this entry point in production."""
from __future__ import annotations

import os
from pathlib import Path
import sys


def serve() -> None:
    if os.environ.get("ARK_ACCEPTANCE") != "1":
        raise SystemExit("Use scripts/verify_project.py to start the isolated fixture.")
    artifacts = Path(os.environ["ARK_ARTIFACT_DIR"]).resolve()
    database_path = Path(os.environ["DB_PATH"]).resolve()
    if database_path.parent != artifacts or database_path.name != "acceptance.db":
        raise SystemExit("Refusing a database outside the acceptance artifact directory.")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    import database
    import llm_service
    import asr_service
    import main
    import uvicorn

    # The actual API, auth and persistence are unchanged. Only remote providers
    # are replaced; no billing keys or production data are needed by this suite.
    llm_service.API_KEY = ""

    async def quote():
        return {"text": "今天也请照顾好自己。", "source": "验收固定文案"}

    async def transcribe(data: bytes, **kwargs):
        if not data.startswith(b"RIFF") or len(data) < 44:
            raise RuntimeError("验收收到无效 WAV 音频")
        return "今天想给自己一点休息的时间"

    main._get_daily_quote = quote
    asr_service.transcribe_audio = transcribe
    database.init_db()
    database.get_or_create_user(
        "G900", "ArkTest123!", "admin",
        {"admin_type": "G", "school_name": "验收测试大学"},
    )
    uvicorn.run(main.app, host="127.0.0.1", port=int(os.environ["ARK_BACKEND_PORT"]), log_level="warning")


if __name__ == "__main__":
    serve()
