"""
TTS 服务：调用小米 MiMo mimo-v2.5-tts 语音合成（OpenAI 兼容 chat/completions 形态）。

机制：
- user 消息放「自然语言风格指令」（控制温柔/语速/情绪），assistant 消息放待合成文本。
- 返回 Base64 编码的 WAV，取 choices[0].message.audio.data。
- 未配置 MIMO_API_KEY 时抛 RuntimeError，由路由层兜底（前端回退浏览器 Web Speech）。
"""
from __future__ import annotations

import os
import base64
import logging

import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

MIMO_API_KEY = os.getenv("MIMO_API_KEY", "")
# token-plan-cn 网关（OpenAI 兼容前缀，代码自动拼 /chat/completions）
MIMO_BASE_URL = os.getenv("MIMO_BASE_URL", "https://token-plan-cn.xiaomimimo.com/v1")
MIMO_TTS_MODEL = os.getenv("MIMO_TTS_MODEL", "mimo-v2.5-tts")
MIMO_TTS_VOICE = os.getenv("MIMO_TTS_VOICE", "茉莉")  # 温柔普通话女声，社区小暖人设
TTS_TIMEOUT = float(os.getenv("TTS_TIMEOUT", "30"))
# 单次合成字符上限（控制延迟与滥用）
TTS_MAX_CHARS = int(os.getenv("TTS_MAX_CHARS", "300"))

# 场景化风格指令：制造「活人感」的核心开关
_STYLE_BY_SCENARIO = {
    "community": (
        "用温柔、亲切、关怀的语气说话，像一位耐心照顾长辈的社区工作者，"
        "语速放慢一点，吐字清晰，带着真诚的暖意。"
    ),
    "university": (
        "用温暖、自然、贴心的语气说话，像一位善解人意的知心学姐，"
        "语气轻松不做作。"
    ),
}


async def synthesize_speech(
    text: str,
    scenario: str = "community",
    voice: str | None = None,
    style: str | None = None,
) -> bytes:
    """
    调用 MiMo TTS 返回 WAV 音频字节。
    失败抛 RuntimeError，由调用方转成 HTTPException。
    """
    if not MIMO_API_KEY or MIMO_API_KEY == "your_api_key_here":
        raise RuntimeError("TTS 未配置：MIMO_API_KEY 缺失")
    text = (text or "").strip()
    if not text:
        raise RuntimeError("待合成文本为空")
    if len(text) > TTS_MAX_CHARS:
        text = text[:TTS_MAX_CHARS]

    style_instruction = style or _STYLE_BY_SCENARIO.get(scenario, _STYLE_BY_SCENARIO["community"])
    voice_id = voice or MIMO_TTS_VOICE

    headers = {
        "Authorization": f"Bearer {MIMO_API_KEY}",
        # 部分网关用 api-key 头，一并带上以兼容；多余的头会被忽略
        "api-key": MIMO_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "model": MIMO_TTS_MODEL,
        "messages": [
            {"role": "user", "content": style_instruction},
            {"role": "assistant", "content": text},
        ],
        "audio": {"format": "wav", "voice": voice_id},
        "stream": False,
    }

    url = f"{MIMO_BASE_URL}/chat/completions"
    async with httpx.AsyncClient(timeout=TTS_TIMEOUT) as client:
        try:
            resp = await client.post(url, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            logger.warning("TTS 网络异常: %s: %s (timeout=%ss)", type(exc).__name__, exc, TTS_TIMEOUT)
            raise RuntimeError("TTS 网络异常，请稍后重试") from exc

    if resp.status_code >= 400:
        body = resp.text[:500]
        logger.warning("TTS 返回错误 %s: %s", resp.status_code, body)
        raise RuntimeError(f"TTS({resp.status_code}): {body}")

    try:
        data = resp.json()
    except Exception as exc:
        raise RuntimeError("TTS 响应解析失败") from exc

    # OpenAI 兼容：choices[0].message.audio.data 为 Base64 WAV
    try:
        b64 = data["choices"][0]["message"]["audio"]["data"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("TTS 响应结构异常: %s", str(data)[:300])
        raise RuntimeError("TTS 响应缺少音频数据") from exc

    if not b64:
        raise RuntimeError("TTS 合成结果为空")
    try:
        return base64.b64decode(b64)
    except Exception as exc:
        raise RuntimeError("TTS 音频解码失败") from exc
