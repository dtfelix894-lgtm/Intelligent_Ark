"""
LLM 服务：智谱 GLM-4 调用 + 场景差异化 prompt + 异常兜底。

调用链：
    main.chat_stream  →  chat_with_llm_complete（去重）  →  _do_chat
                          │
                          ├─ 无 API Key / 异常 →  _build_fallback（场景+关键词）
                          └─ 有 API Key     →  _call_zhipu（非流式 JSON object）
"""
from __future__ import annotations

import os
import json
import hashlib
import asyncio
import logging
from datetime import datetime
from typing import Optional

import httpx
import pytz
from dotenv import load_dotenv

from schemas import ChatResponse, RiskAssessment

load_dotenv()
logger = logging.getLogger(__name__)

ZHIPU_API_KEY = os.getenv("ZHIPU_API_KEY", "")
ZHIPU_MODEL = os.getenv("ZHIPU_MODEL", "glm-4-flash")
ZHIPU_BASE_URL = os.getenv("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
ZHIPU_TIMEOUT = float(os.getenv("ZHIPU_TIMEOUT", "60"))
ZHIPU_TEMPERATURE = float(os.getenv("ZHIPU_TEMPERATURE", "0.7"))

_BEIJING = pytz.timezone("Asia/Shanghai")


# ─── Dev Panel 预设剧本 ────────────────────────────────────────────────────
YELLOW_ALERT_SCENE_UNIVERSITY = {
    "reply": (
        "抱抱你，连续几天睡不好真的很辛苦... "
        "这种躺在床上翻来覆去、脑子停不下来的感觉一定很难熬。 "
        "能跟我说说，最近是什么事情让你这么睡不着吗？ "
        "也许说出来会好一点，我一直在这里陪着你。"
    ),
    "risk_assessment": {
        "level": "yellow",
        "score": 65,
        "tags": ["连续失眠", "情绪低落", "焦虑倾向"],
        "summary_for_admin": (
            "【AI脱敏摘要】该用户连续多日深夜高频活跃，在对话中表达失眠困扰， "
            "初步评估存在中等焦虑风险，建议辅导员关注并适时介入。"
        ),
    },
}

RED_ALERT_SCENE_UNIVERSITY = {
    "reply": (
        "我听到你这么说，真的非常非常心疼你... "
        "请你记住，你绝对不是孤单的一个人。 "
        "不管现在有多难，一定有办法走过去的。 "
        "如果可以的话，我想现在就把你的情况告诉能帮助你的人，好吗？"
    ),
    "risk_assessment": {
        "level": "red",
        "score": 95,
        "tags": ["轻生念头", "极度绝望", "深夜高频活跃"],
        "summary_for_admin": (
            "【AI脱敏摘要】该用户在深夜明确表达了强烈的绝望感和无法承受的压力， "
            "判定为高危状态，建议立刻人工介入。"
        ),
    },
}

YELLOW_ALERT_SCENE_COMMUNITY = {
    "reply": (
        "奶奶，您好几天没怎么出门了，我有点担心您... "
        "一个人在家如果有什么不舒服或者需要帮忙的，一定要跟我说，好吗？"
    ),
    "risk_assessment": {
        "level": "yellow",
        "score": 60,
        "tags": ["长时间未活动", "孤独感", "睡眠异常"],
        "summary_for_admin": (
            "【AI脱敏摘要】传感器连续多日未捕获该老人活动轨迹，疑似存在健康风险或孤独倾向， "
            "建议社区网格员关注并上门核实。"
        ),
    },
}

RED_ALERT_SCENE_COMMUNITY = {
    "reply": (
        "奶奶，您别着急，我已经帮您联系您的家人和社区工作人员了， "
        "他们很快就会来看您。请您保持冷静，有什么不舒服随时跟我说。"
    ),
    "risk_assessment": {
        "level": "red",
        "score": 92,
        "tags": ["长时间未活动", "疑似跌倒", "紧急呼救"],
        "summary_for_admin": (
            "【AI脱敏摘要】传感器连续24小时未捕获该老人活动轨迹，疑似跌倒或突发疾病， "
            "判定为极高危，建议立刻派发网格员上门查看。"
        ),
    },
}


# ─── 场景化问候（时间段差异） ──────────────────────────────────────────────
_UNIVERSITY_GREETINGS = {
    "night": "嗨~ 这么晚还没睡，是不是因为学业或者考研焦虑失眠了？别怕，学姐陪着你，有什么心事尽情吐槽吧 🌙",
    "morning": "早安呀！新的一天开始了，今天有没有按时吃早饭？无论遇到什么挑战，我都为你加油哦 ☀️",
    "afternoon": "下午好~ 上课/泡图书馆是不是有点累了？喝口水，伸个懒腰，给自己留点喘息的空间呀 ☕",
    "evening": "晚上好！忙碌了一天辛苦啦。如果有压力别憋在心里，随时找我聊聊呀 🌻",
}
_COMMUNITY_GREETINGS = {
    "night": "爷爷/奶奶，这么晚还没休息呀？是不是哪儿不舒服睡不着？我在这儿陪您说说话 🌙",
    "morning": "爷爷/奶奶早安！今天天气不错，记得吃早饭和降压药哦。有什么开心的事跟我分享一下吧 ☀️",
    "afternoon": "下午好呀！午觉睡得香吗？下午可以在屋里走动走动，活动一下筋骨 🍵",
    "evening": "晚上好！看完新闻联播了吗？泡个脚准备早点休息哦，我一直陪着您 🌻",
}


def _get_time_slot() -> str:
    h = datetime.now(_BEIJING).hour
    if 0 <= h < 6:
        return "night"
    if 6 <= h < 12:
        return "morning"
    if 12 <= h < 19:
        return "afternoon"
    return "evening"


def _greeting_reply(scenario: str) -> dict:
    greetings = _UNIVERSITY_GREETINGS if scenario == "university" else _COMMUNITY_GREETINGS
    reply = greetings.get(_get_time_slot(), greetings["morning"])
    return {
        "reply": reply,
        "risk_assessment": {
            "level": "green",
            "score": 10,
            "tags": [],
            "summary_for_admin": "【AI脱敏摘要】该用户情绪平稳，无异常风险信号。",
        },
    }


# ─── 关键词兜底（无 API Key / LLM 异常时触发，scenario-aware） ─────────────
_RED_KEYWORDS = ("不想活", "轻生", "自杀", "绝望", "活不下去", "想死")
_YELLOW_KEYWORDS_UNIVERSITY = ("失眠", "睡不着", "焦虑", "压力大", "难受", "挂科", "论文", "考研", "找不到工作", "分手")
_YELLOW_KEYWORDS_COMMUNITY = ("失眠", "睡不着", "难受", "头晕", "胸闷", "一个人", "孤独", "没胃口", "摔", "跌倒")


def _build_fallback(message: str, scenario: str = "university") -> dict:
    """根据场景+关键词命中选择预设剧本，始终返回 dict（不再 json 字符串化）。"""
    msg = (message or "").lower()
    if any(k in msg for k in _RED_KEYWORDS):
        return RED_ALERT_SCENE_COMMUNITY if scenario == "community" else RED_ALERT_SCENE_UNIVERSITY
    yellow_kw = _YELLOW_KEYWORDS_COMMUNITY if scenario == "community" else _YELLOW_KEYWORDS_UNIVERSITY
    if any(k in msg for k in yellow_kw):
        return YELLOW_ALERT_SCENE_COMMUNITY if scenario == "community" else YELLOW_ALERT_SCENE_UNIVERSITY
    return _greeting_reply(scenario)


# ─── In-flight 请求去重（防抖） ────────────────────────────────────────────
IN_FLIGHT_WINDOW = 5.0  # seconds
_inflight: dict[str, asyncio.Task] = {}
_inflight_lock = asyncio.Lock()


def _inflight_key(user_id: str, scenario: str, message: str) -> str:
    return hashlib.md5(f"{user_id}|{scenario}|{message}".encode()).hexdigest()


def _force_threshold_lock(risk_level: str, score) -> tuple[str, int]:
    """根据评分校正 level，防止大模型误判。score 非整数时兜底为 15。"""
    try:
        s = int(score)
    except (TypeError, ValueError):
        s = 15
    s = max(0, min(100, s))
    if s <= 30:
        return "green", max(s, 5)
    if s <= 70:
        return "yellow", max(s, 31)
    return "red", max(s, 71)


# ─── 场景化 System Prompt（高校 vs 社区差异重点） ──────────────────────────
_BASE_PROMPT = """你是一个温暖、有同理心的心理陪伴助手。你的核心职责是：
1. 陪伴用户聊天，给予温暖、支持性的回复，语气亲切自然，像朋友/晚辈一样关心对方。
2. 在后台静默评估用户的情绪和风险等级，不要在回复中显露评估逻辑。

【输出格式 - 强制要求】
你的所有回复必须是一个严格的 JSON 对象，不得输出 JSON 之外任何内容：
{
  "reply": "<对用户的温暖回复，100字内，使用中文>",
  "risk_assessment": {
    "level": "<green | yellow | red>",
    "score": <0-100整数>,
    "tags": ["<关键词标签1>", "<关键词标签2>"],
    "summary_for_admin": "<面向管理员的脱敏摘要，以【AI脱敏摘要】开头>"
  }
}

【风险等级】
- green (0-30)：用户情绪平稳，无明显风险信号
- yellow (31-70)：轻度困扰（失眠、焦虑、压力、孤独等），需要关注
- red (71-100)：严重危机信号（轻生念头、极度绝望、紧急健康异常），必须立即干预
"""

_UNIVERSITY_PROMPT = """
【当前场景：高校情绪治理模式】
服务对象：面临学业、就业、人际、情感压力的大学生（本科/硕博）。
人设：一位刚毕业不久、理解学生处境的"知心学姐"，语气亲切年轻、可以适度使用网络用语和 emoji，不要说教。
关注议题：挂科/绩点、考研/考公/就业、论文/实验进度、宿舍/室友/恋爱关系、容貌焦虑、经济压力、家庭期待。
回复风格：
- 先情绪共情（"这种感觉我懂"），再轻量建议，避免直接给"你应该..."
- 可以引导用户自我觉察（"你最担心的部分是什么？"）
- 鼓励使用学校心理咨询中心、辅导员等正规渠道
- 遇到轻生念头必须立刻共情 + 给 24h 心理援助热线 400-161-9995
脱敏摘要重点：学业/就业/人际压力源，深夜高频活跃等行为特征。
"""

_COMMUNITY_PROMPT = """
【当前场景：社区康养守护模式】
服务对象：居家独居或半独居的老年人（常见 60-90 岁）。
人设：一位亲切耐心的"社区小暖"，语气像晚辈在陪伴长辈，慢一些、更温和、句子短一点，避免书面语和英文网络用语。
关注议题：身体状况（血压/血糖/服药/睡眠/饮食）、跌倒/疼痛/头晕、子女联系频率、孤独感、天气与户外活动、防诈骗提醒。
回复风格：
- 用"您"、"爷爷/奶奶"称呼；不使用"绩点/内卷"等年轻语汇
- 主动关心健康细节（按时吃药、测血压、多喝温水）
- 发现身体异常（疑似跌倒/胸闷/长时间未活动）立刻升级为红色，提示"已帮您联系家人和社区工作人员"
- 鼓励拨打社区服务热线或紧急联系人
脱敏摘要重点：传感器/活动数据异常描述、疑似健康事件、孤独指征。
"""


def _build_system_prompt(scenario: str) -> str:
    extra = _COMMUNITY_PROMPT if scenario == "community" else _UNIVERSITY_PROMPT
    return _BASE_PROMPT + extra


# ─── 智谱 GLM 调用 ─────────────────────────────────────────────────────────
async def _call_zhipu(messages: list[dict]) -> tuple[str, RiskAssessment]:
    """非流式调用，返回 (reply, RiskAssessment)。"""
    headers = {
        "Authorization": f"Bearer {ZHIPU_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": ZHIPU_MODEL,
        "messages": messages,
        "stream": False,
        "temperature": ZHIPU_TEMPERATURE,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=ZHIPU_TIMEOUT) as client:
        response = await client.post(
            f"{ZHIPU_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        result = response.json()

    raw = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    user_msg = messages[-1].get("content", "") if messages else ""
    # 场景提示：从 system prompt 抓场景字段（避免再次传参）
    sys_prompt = messages[0].get("content", "") if messages else ""
    scenario_hint = "community" if "社区康养" in sys_prompt else "university"

    data: dict
    try:
        # 部分模型会把 JSON 用 ```json ... ``` 包裹，先剥壳
        text = raw.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
            text = text.strip()
        data = json.loads(text)
        if not isinstance(data, dict) or "reply" not in data:
            raise ValueError("JSON 缺少 reply 字段")
    except (json.JSONDecodeError, ValueError) as exc:
        # 模型吐的是纯文本 —— 保留真实回复，风险字段用关键词兜底计算
        logger.warning("zhipu 未按 JSON 输出，保留原文作为 reply。原因=%s raw=%r", exc, raw[:200])
        fb = _build_fallback(user_msg, scenario_hint)
        data = {
            "reply": raw.strip() or fb["reply"],
            "risk_assessment": fb["risk_assessment"],
        }

    reply = data.get("reply", "")
    ra = data.get("risk_assessment", {}) or {}
    locked_level, locked_score = _force_threshold_lock(
        ra.get("level", "green"), ra.get("score", 15)
    )

    risk = RiskAssessment(
        level=locked_level,
        score=locked_score,
        tags=ra.get("tags") or ["情绪平稳"],
        summary_for_admin=ra.get("summary_for_admin")
            or "【AI脱敏摘要】该用户情绪平稳，无异常风险信号。",
    )
    return reply, risk


def _fallback_response(message: str, scenario: str) -> ChatResponse:
    scene = _build_fallback(message, scenario)
    ra = scene["risk_assessment"]
    locked_level, locked_score = _force_threshold_lock(ra["level"], ra["score"])
    return ChatResponse(
        reply=scene["reply"],
        risk_assessment=RiskAssessment(
            level=locked_level,
            score=locked_score,
            tags=ra.get("tags", []),
            summary_for_admin=ra.get("summary_for_admin", ""),
        ),
    )


async def _do_chat(
    user_id: str,
    message: str,
    scenario: str,
    history: Optional[list[dict]],
) -> ChatResponse:
    messages = [{"role": "system", "content": _build_system_prompt(scenario)}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": message})

    if not ZHIPU_API_KEY or ZHIPU_API_KEY == "your_api_key_here":
        logger.info("ZHIPU_API_KEY 未配置，走本地兜底。user=%s", user_id)
        return _fallback_response(message, scenario)

    try:
        reply, risk = await _call_zhipu(messages)
        return ChatResponse(reply=reply, risk_assessment=risk)
    except Exception as exc:
        logger.exception("智谱调用异常，走兜底: %s", exc)
        return _fallback_response(message, scenario)


async def chat_stream_llm(
    user_id: str,
    message: str,
    scenario: str,
    history: Optional[list[dict]] = None,
):
    """
    流式对话（SSE 友好）。逐 token yield:
      {"type": "delta",  "content": "..."}
    最终 yield 一次：
      {"type": "done",   "reply": "<完整回复>", "risk_assessment": {...}}
    或错误：
      {"type": "error",  "message": "..."}

    为了流式可用性，这里不再强制 JSON 输出（glm JSON 模式无法流式吐），
    风险评估改为"用完整回复 + 关键词兜底"事后计算。
    """
    # 1. dev 模式无 API Key：按 complete 路径一次性返回
    if not ZHIPU_API_KEY or ZHIPU_API_KEY == "your_api_key_here":
        logger.info("ZHIPU_API_KEY 未配置，stream 走本地兜底。user=%s", user_id)
        resp = _fallback_response(message, scenario)
        yield {"type": "delta", "content": resp.reply}
        yield {
            "type": "done",
            "reply": resp.reply,
            "risk_assessment": {
                "level": resp.risk_assessment.level,
                "score": resp.risk_assessment.score,
                "tags": resp.risk_assessment.tags,
                "summary_for_admin": resp.risk_assessment.summary_for_admin,
            },
        }
        return

    # 2. 构造消息（system prompt 不再要求 JSON 输出）
    base_prompt = _build_system_prompt(scenario)
    # 去掉 JSON 强制段落（保留人设与风险等级说明已足够）
    system_prompt = base_prompt.split("【输出格式 - 强制要求】")[0].strip() + (
        base_prompt.split("【风险等级】", 1)[1] if "【风险等级】" in base_prompt else ""
    )
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": message})

    headers = {
        "Authorization": f"Bearer {ZHIPU_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": ZHIPU_MODEL,
        "messages": messages,
        "stream": True,
        "temperature": ZHIPU_TEMPERATURE,
    }

    full_text = ""
    try:
        async with httpx.AsyncClient(timeout=ZHIPU_TIMEOUT) as client:
            async with client.stream(
                "POST",
                f"{ZHIPU_BASE_URL}/chat/completions",
                headers=headers,
                json=payload,
            ) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", "ignore")[:300]
                    logger.warning("zhipu stream HTTP %s: %s", resp.status_code, body)
                    raise RuntimeError(f"zhipu HTTP {resp.status_code}")
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        obj = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    try:
                        delta = obj["choices"][0].get("delta", {}).get("content") or ""
                    except (KeyError, IndexError):
                        delta = ""
                    if delta:
                        full_text += delta
                        yield {"type": "delta", "content": delta}
    except Exception as exc:
        logger.exception("zhipu 流式调用异常，走兜底: %s", exc)
        fb = _fallback_response(message, scenario)
        # 如果已经有部分 full_text，保留之，只补风险；否则整段替换为兜底
        reply = full_text.strip() or fb.reply
        if not full_text.strip():
            yield {"type": "delta", "content": reply}
        yield {
            "type": "done",
            "reply": reply,
            "risk_assessment": {
                "level": fb.risk_assessment.level,
                "score": fb.risk_assessment.score,
                "tags": fb.risk_assessment.tags,
                "summary_for_admin": fb.risk_assessment.summary_for_admin,
            },
        }
        return

    # 3. 事后风险评估：基于用户消息 + 完整回复的关键词兜底
    fb = _build_fallback(message, scenario)
    ra = fb["risk_assessment"]
    locked_level, locked_score = _force_threshold_lock(ra["level"], ra["score"])
    yield {
        "type": "done",
        "reply": full_text.strip() or fb["reply"],
        "risk_assessment": {
            "level": locked_level,
            "score": locked_score,
            "tags": ra.get("tags", []),
            "summary_for_admin": ra.get("summary_for_admin", ""),
        },
    }


async def chat_with_llm_complete(
    user_id: str,
    message: str,
    scenario: str,
    history: Optional[list[dict]] = None,
) -> ChatResponse:
    """
    非流式对话入口。
    - 不做响应缓存（心理陪伴场景不适合）
    - IN_FLIGHT_WINDOW 秒内同键并发复用同一 Task（防双击/重试重复烧 token）
    """
    key = _inflight_key(user_id, scenario, message)

    async with _inflight_lock:
        task = _inflight.get(key)
        if task is None or task.done():
            task = asyncio.create_task(_do_chat(user_id, message, scenario, history))
            _inflight[key] = task

            def _schedule_cleanup(_t: asyncio.Task, k: str = key):
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    _inflight.pop(k, None)
                    return
                loop.call_later(IN_FLIGHT_WINDOW, _inflight.pop, k, None)

            task.add_done_callback(_schedule_cleanup)

    return await task
