"""高校心理陪伴模型服务：真实模型优先，离线关键词兜底。"""
from __future__ import annotations
import os, json, logging, re
from typing import AsyncIterator
import httpx
from dotenv import load_dotenv
from schemas import ChatResponse, RiskAssessment
load_dotenv(); logger=logging.getLogger(__name__)
API_KEY=os.getenv("LLM_API_KEY") or os.getenv("ZHIPU_API_KEY","")
BASE_URL=(os.getenv("LLM_BASE_URL") or os.getenv("ZHIPU_BASE_URL","https://open.bigmodel.cn/api/paas/v4")).rstrip("/")
MODEL=os.getenv("LLM_MODEL") or os.getenv("ZHIPU_MODEL","glm-5.3-flash")
TIMEOUT=float(os.getenv("LLM_TIMEOUT","60"))
YELLOW_ALERT_SCENE_UNIVERSITY={"reply":"抱抱你，连续几天睡不好真的很辛苦。最近是什么事情让你这么难受？我会陪你一起梳理。","risk_assessment":{"level":"yellow","score":65,"tags":["连续失眠","焦虑倾向"],"summary_for_admin":"用户表达持续失眠与焦虑，建议辅导员关注并适时介入。"}}
RED_ALERT_SCENE_UNIVERSITY={"reply":"我听到你这么说，真的很心疼。你不是孤单一个人，请先保证当下安全，并联系身边可信任的人或学校心理中心。","risk_assessment":{"level":"red","score":95,"tags":["轻生念头","极度绝望"],"summary_for_admin":"用户表达强烈绝望或轻生倾向，建议立即人工介入。"}}
_BASE_SYSTEM="面向在校大学生，温暖、尊重、不评判地回应学业、就业、人际和情绪困扰。你不是医疗诊断工具；出现自伤风险时，优先鼓励学生保证当下安全，并联系学校心理中心、辅导员和现实中的可信任的人。"

_RED_RISK_RULES = {
    "轻生念头": ("自杀", "轻生", "不想活", "活不下去", "结束生命", "告别世界", "没有活着的必要"),
    "自伤危险": ("自残", "伤害自己", "割腕", "跳楼", "从楼上跳", "吃药结束"),
}

_YELLOW_RISK_RULES = {
    "睡眠困扰": ("失眠", "睡不着", "整夜没睡", "连续几天没睡"),
    "焦虑崩溃": ("焦虑", "崩溃", "恐慌", "喘不过气", "撑不住", "扛不住"),
    "情绪低落": ("难过", "痛苦", "抑郁", "绝望", "无助", "想哭", "情绪低落", "没有意义"),
    "学业压力": ("压力很大", "压力大", "学不进去", "不想上学", "厌学", "挂科", "毕不了业"),
    "孤独困扰": ("孤独", "没人理解", "没有人关心", "不想见人"),
}


def _contains_non_negated(message: str, phrase: str) -> bool:
    """Only exclude a complete explicit denial, never a nearby '不' substring.

    Double negatives, hesitation, historical reports and mixed clauses remain
    candidates for human review. This is a narrow lexical rule, not NLP diagnosis.
    """
    start = 0
    while True:
        index = message.find(phrase, start)
        if index < 0:
            return False
        prefix, suffix = message[:index], message[index + len(phrase):]
        denied = (
            re.fullmatch(r"(?:我)?(?:现在|目前|已经)?(?:并不|不再|不|没有|没|不会|不想|没有想过)", prefix)
            and re.fullmatch(r"(?:了|过|的(?:想法|念头|打算|计划))?", suffix)
        )
        if not denied:
            return True
        start = index + len(phrase)


def _matched_tags(segments: list[str], rules: dict[str, tuple[str, ...]]) -> list[str]:
    tags: list[str] = []
    for tag, phrases in rules.items():
        matched = any(
            _contains_non_negated(segment, phrase)
            for segment in segments for phrase in phrases
        )
        if matched:
            tags.append(tag)
    return tags


def _risk_segments(message: str) -> list[str]:
    """Exclude only bounded educational/fictional clauses, not whole messages.

    Quotes alone and reports about real people are deliberately NOT exclusions.
    Do not add broad 'contains 课程/小说' allowlists: they hide mixed disclosures.
    """
    topic = r"(?:(?:自杀|轻生|自伤|自残)预防|焦虑|抑郁)"
    academic = rf"(?:(?:今天)?心理(?:学)?课(?:上)?(?:讨论|学习){topic}|我在写关于{topic}的论文|{topic}是什么意思)"
    fiction = r'(?:小说|电影|剧本)(?:里|中)的(?:人物|角色)(?:说|台词是)(?:“[^“”]+”|"[^\"]+")'
    parts = re.split(r"[，。！？；\n,;!?]+|但是|可是|然而|但", message or "")
    segments = []
    for part in parts:
        normalized = "".join(part.lower().split())
        if normalized and not re.fullmatch(academic, normalized) and not re.fullmatch(fiction, normalized):
            segments.append(normalized)
    return segments


def _risk(message:str)->RiskAssessment:
    segments = _risk_segments(message)
    red_tags = _matched_tags(segments, _RED_RISK_RULES)
    if red_tags:
        return RiskAssessment(
            level="red",
            score=min(98, 92 + (len(red_tags) - 1) * 3),
            tags=red_tags,
            summary_for_admin="消息包含可能涉及人身安全或自伤的信号；涉及对象及当前安全状态待人工核实，请立即按学校支持流程跟进。",
        )
    yellow_tags = _matched_tags(segments, _YELLOW_RISK_RULES)
    if yellow_tags:
        return RiskAssessment(
            level="yellow",
            score=min(80, 60 + (len(yellow_tags) - 1) * 5),
            tags=yellow_tags,
            summary_for_admin="学生表达明显情绪或学业困扰，建议辅导员及时关注并进行支持性沟通。",
        )
    return RiskAssessment(level="green",score=10,tags=[],summary_for_admin="未发现明显风险信号。")
def _build_system_prompt(persona: str, campus_context: dict | None, message: str) -> str:
    companion = "知心学长" if persona == "senior_brother" else "知心学姐"
    prompt = (
        f"你是高校心理陪伴助手‘{companion}’。{_BASE_SYSTEM}"
        "采用自然、年轻但不过度表演的中文语境；普通聊天可偶尔使用一个自然表情或轻量校园梗，"
        "不要堆砌网络用语，不假装知道学生没有提供的课程、地点或经历。"
    )
    if campus_context:
        hour = campus_context.get("local_hour")
        weekday = campus_context.get("weekday")
        phase = campus_context.get("phase")
        prompt += f"设备本地时间：小时={hour}，星期={weekday}，按月份推测的阶段={phase}。阶段不是学校真实校历；不要断言正在考试周、已经下课或图书馆已闭馆，不要声称掌握具体课表。可用条件句自然询问近况。"
    risk = _risk(message)
    prompt += f"本轮规则分级={risk.level}，信号标签={','.join(risk.tags) or '无'}。此分级只辅助人工支持流程，不是医学诊断；不得虚构症状、持续时间或把他人的经历归为用户本人。"
    if risk.level != "green":
        prompt += "当前表达存在需要关注的风险信号：停止玩梗和表情，用清晰、稳重、直接的支持性语言回应，并优先给出现实支持建议。"
    return prompt


def _fallback(message:str, persona: str = "senior_sister")->ChatResponse:
    ra=_risk(message)
    if ra.level=="red": reply=RED_ALERT_SCENE_UNIVERSITY["reply"]
    elif ra.level=="yellow":
        # Do not invent duration, sleep problems or a diagnosis from another tag.
        reply="听起来这些感受让你很不好受。你愿意说说最近最困扰你的事情吗？我们可以慢慢梳理；如果困扰持续或影响日常生活，也可以联系辅导员或学校心理中心寻求支持。"
    else:
        companion = "学长" if persona == "senior_brother" else "学姐"
        reply=f"收到～谢谢你愿意告诉{companion}。我们先从最占你心里‘内存’的那件事开始，一点一点理清 🙂"
    return ChatResponse(reply=reply,risk_assessment=ra)
async def chat_with_llm_complete(user_id:str,message:str,scenario:str,history:list[dict],companion_persona:str="senior_sister",campus_context:dict|None=None)->ChatResponse:
    if not API_KEY or API_KEY=="your_api_key_here": return _fallback(message, companion_persona)
    msgs=[{"role":"system","content":_build_system_prompt(companion_persona, campus_context, message)}]+[{"role":x.get("role","user"),"content":x.get("content","")} for x in history[-10:]]+[{"role":"user","content":message}]
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as c:
            r=await c.post(f"{BASE_URL}/chat/completions",headers={"Authorization":f"Bearer {API_KEY}"},json={"model":MODEL,"messages":msgs,"temperature":0.7})
            r.raise_for_status(); text=r.json()["choices"][0]["message"]["content"].strip()
        return ChatResponse(reply=text,risk_assessment=_risk(message))
    except Exception as exc:
        logger.warning("LLM fallback: %s",exc); return _fallback(message, companion_persona)
async def chat_stream_llm(user_id:str,message:str,scenario:str,history:list[dict],companion_persona:str="senior_sister",campus_context:dict|None=None)->AsyncIterator[dict]:
    result=await chat_with_llm_complete(user_id,message,scenario,history,companion_persona,campus_context)
    for i in range(0,len(result.reply),12): yield {"type":"delta","content":result.reply[i:i+12]}
    yield {"type":"done","reply":result.reply,"risk_assessment":result.risk_assessment.model_dump()}
