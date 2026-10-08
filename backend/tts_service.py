"""高校端可选 MiMo TTS；未配置密钥时由前端浏览器语音回退。"""
from __future__ import annotations
import os, base64
import httpx
from dotenv import load_dotenv
load_dotenv()
KEY=os.getenv("MIMO_API_KEY",""); BASE=os.getenv("MIMO_BASE_URL","https://token-plan-cn.xiaomimimo.com/v1").rstrip("/"); MODEL=os.getenv("MIMO_TTS_MODEL","mimo-v2.5-tts"); VOICE=os.getenv("MIMO_TTS_VOICE","茉莉")
async def synthesize_speech(text:str,scenario:str="university",voice:str|None=None,style:str|None=None)->bytes:
    if not KEY or KEY=="your_api_key_here": raise RuntimeError("TTS 未配置：MIMO_API_KEY 缺失")
    text=(text or "").strip()[:300]
    if not text: raise RuntimeError("待合成文本为空")
    instruction=style or "用温暖、自然、贴心的语气说话，像善解人意的知心学姐。"
    async with httpx.AsyncClient(timeout=30) as c:
        r=await c.post(f"{BASE}/chat/completions",headers={"Authorization":f"Bearer {KEY}","api-key":KEY},json={"model":MODEL,"messages":[{"role":"user","content":instruction},{"role":"assistant","content":text}],"audio":{"format":"wav","voice":voice or VOICE},"stream":False})
    if r.status_code>=400: raise RuntimeError(f"TTS({r.status_code})")
    try: return base64.b64decode(r.json()["choices"][0]["message"]["audio"]["data"])
    except Exception as exc: raise RuntimeError("TTS 响应缺少音频数据") from exc
