"""
ASR 服务：调用智谱 glm-asr 音频转写接口（OpenAI 兼容格式）。
失败时抛 HTTPException，由路由层兜底。
"""
from __future__ import annotations

import os
import logging
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

ZHIPU_API_KEY = os.getenv("ZHIPU_API_KEY", "")
ZHIPU_BASE_URL = os.getenv("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
ZHIPU_ASR_MODEL = os.getenv("ZHIPU_ASR_MODEL", "glm-asr")
ASR_TIMEOUT = float(os.getenv("ASR_TIMEOUT", "30"))
# 限制单次上传大小（防止滥用），默认 10MB
ASR_MAX_BYTES = int(os.getenv("ASR_MAX_BYTES", str(10 * 1024 * 1024)))


async def transcribe_audio(
    file_bytes: bytes,
    filename: str = "audio.webm",
    content_type: Optional[str] = "audio/webm",
) -> str:
    """
    调用智谱 ASR 返回识别文本。
    失败抛 RuntimeError，由调用方转成 HTTPException。
    """
    if not ZHIPU_API_KEY or ZHIPU_API_KEY == "your_api_key_here":
        raise RuntimeError("ASR 未配置：ZHIPU_API_KEY 缺失")
    if not file_bytes:
        raise RuntimeError("音频内容为空")
    if len(file_bytes) > ASR_MAX_BYTES:
        raise RuntimeError(f"音频超过 {ASR_MAX_BYTES // 1024 // 1024}MB 限制")

    headers = {"Authorization": f"Bearer {ZHIPU_API_KEY}"}
    files = {
        "file": (filename, file_bytes, content_type or "application/octet-stream"),
    }
    data = {"model": ZHIPU_ASR_MODEL}

    url = f"{ZHIPU_BASE_URL}/audio/transcriptions"
    async with httpx.AsyncClient(timeout=ASR_TIMEOUT) as client:
        try:
            resp = await client.post(url, headers=headers, files=files, data=data)
        except httpx.HTTPError as exc:
            logger.warning("ASR 网络异常: %s", exc)
            raise RuntimeError("ASR 网络异常，请稍后重试") from exc

    if resp.status_code >= 400:
        body = resp.text[:500]
        logger.warning("ASR 返回错误 %s: %s", resp.status_code, body)
        raise RuntimeError(f"ASR({resp.status_code}): {body}")

    try:
        payload = resp.json()
    except Exception as exc:
        raise RuntimeError("ASR 响应解析失败") from exc

    # OpenAI 兼容：{"text": "..."}
    text = (payload.get("text") or "").strip()
    if not text:
        # 部分实现可能把结果放在 data/segments 中
        segs = payload.get("segments") or []
        text = "".join((s.get("text") or "") for s in segs).strip()

    if not text:
        raise RuntimeError("识别结果为空")
    return text
