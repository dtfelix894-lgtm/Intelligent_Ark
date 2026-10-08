import os
import json
import logging

from fastapi import FastAPI, HTTPException, Response, Depends, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import AfterValidator, BaseModel
from typing import Annotated, Optional

from schemas import ChatRequest, ChatResponse, Scenario
from llm_service import (
    chat_with_llm_complete,
    chat_stream_llm,
    YELLOW_ALERT_SCENE_UNIVERSITY,
    RED_ALERT_SCENE_UNIVERSITY,
)
from fastapi.responses import StreamingResponse
import sqlite3
from database import (
    init_db,
    seed_demo_users,
    verify_user,
    get_or_create_user,
    get_admin_profile,
    save_chat_message,
    save_risk_event,
    list_risk_events,
    mark_risk_event_handled,
    list_user_interventions,
    get_recent_chat_history,
    clear_chat_history,
    count_users_by_role,
    list_users_with_stats,
    get_user_activity,
    get_risk_trend,
    get_risk_tag_distribution,
)
from auth import (
    create_access_token,
    get_current_user,
    require_admin,
    require_user,
    is_dev_env,
    APP_ENV,
)
import httpx
from datetime import date, timedelta

# 每次对话携带的历史消息上限（user + assistant 合计条数）
CHAT_HISTORY_WINDOW = int(os.getenv("CHAT_HISTORY_WINDOW", "10"))

ADMIN_INVITE_CODE = os.getenv("ADMIN_INVITE_CODE", "")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("ark.main")

app = FastAPI(title="智伴方舟后端服务", version="1.0.0")

# ─── CORS ───────────────────────────────────────────────────────────────────
#
# 支持任意网段部署（内网/公网/临时 IP）：
# 1. ALLOWED_ORIGINS 环境变量（逗号分隔）精确匹配，最高优先级
# 2. ALLOW_ANY_ORIGIN=1 时放开所有来源（此时 allow_credentials 会被强制关闭，
#    因为浏览器不允许 `*` + credentials 组合）
# 3. 默认用正则匹配 http(s)://<host>[:port]，兼容 localhost / 127.0.0.1 /
#    10.x / 172.16-31.x / 192.168.x 以及任意局域网 / 外网 IP / 域名。

import re

_env_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
_allow_any = os.getenv("ALLOW_ANY_ORIGIN", "").lower() in ("1", "true", "yes")

if APP_ENV == "prod" and _allow_any:
    raise RuntimeError("生产环境禁止 ALLOW_ANY_ORIGIN")

if APP_ENV == "prod":
    app.add_middleware(CORSMiddleware, allow_origins=_env_origins,
                       allow_credentials=True, allow_methods=["GET", "POST", "DELETE"],
                       allow_headers=["Authorization", "Content-Type"])
elif _allow_any:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
elif _env_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_env_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # 默认正则：匹配任意 host/IP 上的任意端口（http/https 均放行）
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://([a-zA-Z0-9\-._]+|\[[0-9a-fA-F:]+\])(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# ─── 启动事件：初始化数据库 & 注入演示账号 ────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()
    # 演示账号改为显式开启：只有设 SEED_DEMO_USERS=1 才会注入 001 / G001
    if os.getenv("SEED_DEMO_USERS", "").lower() in ("1", "true", "yes"):
        seed_demo_users()


# ─── 健康检查 ────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "智伴方舟 API 服务运行中", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}


# ─── C端登录 / 注册 ────────────────────────────────────────────────────────────

def _validate_account(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("账号不能为空")
    return value


def _validate_password_bytes(value: str) -> str:
    # bcrypt limits UTF-8 bytes, not characters. Keep passwords unchanged;
    # login still accepts existing passwords shorter than registration allows.
    if len(value.encode("utf-8")) > 72:
        raise ValueError("密码不能超过 72 个 UTF-8 字节（中文通常占 3 字节）")
    return value


def _validate_registration_password(value: str) -> str:
    if len(value) < 6 or not value.strip():
        raise ValueError("密码至少需要 6 位，且不能全部为空白")
    return value


Account = Annotated[str, AfterValidator(_validate_account)]
LoginPassword = Annotated[str, AfterValidator(_validate_password_bytes)]
RegistrationPassword = Annotated[
    LoginPassword, AfterValidator(_validate_registration_password)
]


class CLoginRequest(BaseModel):
    account: Account
    password: LoginPassword


class CLoginResponse(BaseModel):
    success: bool
    role: Optional[str] = None
    user_id: Optional[int] = None
    token: Optional[str] = None
    message: str = ""


class CRegisterRequest(BaseModel):
    account: Account          # 学号
    password: RegistrationPassword
    role: str = "student"
    school: Optional[str] = None
    student_id: Optional[str] = None
    education: Optional[str] = None
    qq_email: Optional[str] = None


@app.post("/api/auth/c-login", response_model=CLoginResponse)
async def c_login(req: CLoginRequest, response: Response):
    user = verify_user(req.account, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="账号或密码错误")
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="请使用 B 端入口登录")

    token = create_access_token(user["id"], user["account"], user["role"])
    response.set_cookie(
        key="c_token",
        value=token,
        httponly=True,
        max_age=7 * 24 * 60 * 60,
        samesite="lax",
        secure=APP_ENV == "prod",
    )
    return CLoginResponse(
        success=True,
        role=user["role"],
        user_id=user["id"],
        token=token,
        message="登录成功",
    )


@app.post("/api/auth/c-register", response_model=CLoginResponse)
async def c_register(req: CRegisterRequest, response: Response):
    if req.role != "student":
        raise HTTPException(status_code=400, detail="高校端仅支持学生账号")
    try:
        user_id = get_or_create_user(
            account=req.account,
            plain_password=req.password,
            role=req.role,
            profile={
                "school": req.school,
                "student_id": req.student_id,
                "education": req.education,
                "qq_email": req.qq_email,
            },
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="该账号已被注册")

    token = create_access_token(user_id, req.account, req.role)
    response.set_cookie(
        key="c_token",
        value=token,
        httponly=True,
        max_age=7 * 24 * 60 * 60,
        samesite="lax",
        secure=APP_ENV == "prod",
    )
    return CLoginResponse(
        success=True,
        role=req.role,
        user_id=user_id,
        token=token,
        message="注册成功",
    )


@app.post("/api/auth/c-logout")
async def c_logout(response: Response):
    response.delete_cookie("c_token")
    return {"success": True, "message": "已退出登录"}


@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return user


@app.get("/api/auth/c-me")
async def student_me(user: dict = Depends(require_user)):
    """返回当前学生身份，避免双端同时登录时读取到管理员 Cookie。"""
    return user


@app.get("/api/auth/b-me")
async def admin_me(admin: dict = Depends(require_admin)):
    """返回当前高校工作人员身份，避免双端同时登录时读取到学生 Cookie。"""
    return admin


# ─── B端管理员登录 / 注册 ────────────────────────────────────────────────────────

class BLoginRequest(BaseModel):
    worker_id: Account
    password: LoginPassword


class BLoginResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user_id: Optional[int] = None
    admin_type: Optional[str] = None  # "G"
    role: Optional[str] = None        # "university"
    school_name: Optional[str] = None
    message: str = ""


class BRegisterRequest(BaseModel):
    worker_id: Account
    password: RegistrationPassword
    admin_type: str = "G"
    school_name: Optional[str] = None
    invite_code: Optional[str] = None


class BRegisterResponse(BaseModel):
    success: bool
    msg: str = ""
    worker_id: Optional[str] = None


@app.post("/api/auth/b-register", response_model=BRegisterResponse, status_code=201)
async def b_register(req: BRegisterRequest):
    # 邀请码校验：未配置 ADMIN_INVITE_CODE 时直接拒绝注册，必须通过线下流程
    if not ADMIN_INVITE_CODE:
        raise HTTPException(
            status_code=403,
            detail="管理员注册已关闭，请联系系统管理员",
        )
    if req.invite_code != ADMIN_INVITE_CODE:
        raise HTTPException(status_code=403, detail="邀请码无效")

    # 验证工号格式
    import re
    pattern = r"^G\d{3}$"
    if not re.match(pattern, req.worker_id):
        raise HTTPException(status_code=400, detail="工号格式错误：G开头 + 3位数字")

    # 验证管理员类型与工号前缀匹配
    if req.worker_id.startswith("G") and req.admin_type != "G":
        raise HTTPException(status_code=400, detail="工号与管理员类型不匹配")
    if req.admin_type != "G":
        raise HTTPException(status_code=400, detail="高校端仅支持 G 类型管理员")

    # 高校管理员必须有学校名称
    if req.admin_type == "G" and not req.school_name:
        raise HTTPException(status_code=400, detail="高校管理员必须填写学校名称")

    try:
        user_id = get_or_create_user(
            account=req.worker_id,
            plain_password=req.password,
            role="admin",
            profile={
                "admin_type": req.admin_type,
                "school_name": req.school_name or "",
            },
        )
        return BRegisterResponse(
            success=True,
            msg="注册成功",
            worker_id=req.worker_id,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="该工号已被注册")


@app.post("/api/auth/b-login", response_model=BLoginResponse)
async def b_login(req: BLoginRequest, response: Response):
    user = verify_user(req.worker_id, req.password)
    if not user or user["role"] != "admin":
        raise HTTPException(status_code=401, detail="工号或密码错误")

    # 高校端只接受 G 类型管理员；旧 C 管理员凭据保持数据但不可登录
    profile = get_admin_profile(req.worker_id)
    if not profile or profile.get("admin_type") != "G":
        raise HTTPException(status_code=403, detail="高校端不支持该管理员账号")

    # 签发 JWT
    token = create_access_token(user["id"], user["account"], user["role"])
    response.set_cookie(
        key="b_token",
        value=token,
        httponly=True,
        max_age=7 * 24 * 60 * 60,
        samesite="lax",
        secure=APP_ENV == "prod",
    )

    return BLoginResponse(
        success=True,
        token=token,
        user_id=user["id"],
        admin_type=profile.get("admin_type") if profile else None,
        role="university",
        school_name=profile.get("school_name") if profile else None,
        message="登录成功",
    )


@app.post("/api/auth/b-logout")
async def b_logout(response: Response):
    response.delete_cookie("b_token")
    return {"success": True, "message": "已退出登录"}


# ─── 核心对话（完整输出，不使用流式） ───────────────────────────────────────

def _scenario_ok(s: str) -> str:
    if s != "university":
        raise HTTPException(status_code=400, detail="当前系统仅支持高校场景")
    return "university"


@app.post("/api/chat/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: dict = Depends(require_user),
):
    """
    对话接口。使用 JWT 鉴权，user_id 以 token 为准（前端传入的 user_id 将被忽略）。
    dev_override 仅在 APP_ENV != 'prod' 时生效。
    """
    scenario = _scenario_ok(request.scenario)
    uid = current_user["id"]
    if request.dev_override and not is_dev_env():
        raise HTTPException(status_code=403, detail="dev_override 已在生产环境中禁用")

    # 1. 先持久化用户消息（这样即使 LLM 失败，用户的话也不丢）
    try:
        save_chat_message(uid, scenario, "user", request.message)
    except Exception as exc:
        logger.exception("save user message failed: %s", exc)
        raise HTTPException(status_code=503, detail="消息保存失败，请稍后重试")

    # 2. dev_override：仅 dev 环境开放
    if request.dev_override and request.dev_override != "normal":
        if not is_dev_env():
            raise HTTPException(status_code=403, detail="dev_override 已在生产环境中禁用")
        if request.dev_override == "yellow_alert":
            scene = YELLOW_ALERT_SCENE_UNIVERSITY
        elif request.dev_override == "red_alert":
            scene = RED_ALERT_SCENE_UNIVERSITY
        elif request.dev_override == "normal":
            pass  # normal 不走 dev_override，正常调用 LLM
        else:
            raise HTTPException(status_code=400, detail="未知的 dev_override 值")

        reply = scene["reply"]
        ra = dict(scene["risk_assessment"])
        _persist_assistant_and_risk(uid, scenario, reply, ra)
        return {"reply": reply, "risk_assessment": ra}

    # 3. 读取最近历史（不含刚写入的这条 user message，所以先取再写入会错位——
    #    为确保历史顺序完整，这里直接取最新 N 条：刚写入的 user message 已经是其中一条
    #    但 LLM 接口期望 history 是"此前"的对话，所以排除最新 1 条）
    full_recent = get_recent_chat_history(uid, scenario, limit=CHAT_HISTORY_WINDOW + 1)
    history = full_recent[:-1] if full_recent else []

    # 4. 调用 LLM
    response = await chat_with_llm_complete(
        user_id=str(uid),
        message=request.message,
        scenario=scenario,
        history=history,
        companion_persona=request.companion_persona,
        campus_context=request.campus_context.model_dump() if request.campus_context else None,
    )
    ra = {
        "level": response.risk_assessment.level,
        "score": response.risk_assessment.score,
        "tags": response.risk_assessment.tags,
        "summary_for_admin": response.risk_assessment.summary_for_admin,
    }
    _persist_assistant_and_risk(uid, scenario, response.reply, ra)
    return {"reply": response.reply, "risk_assessment": ra}


def _persist_assistant_and_risk(
    user_id: int,
    scenario: str,
    assistant_reply: str,
    ra: dict,
) -> None:
    """持久化助手回复；风险事件仅在 yellow/red 时落库，避免预警列表被 green 淹没。"""
    try:
        save_chat_message(user_id, scenario, "assistant", assistant_reply)
        level = ra.get("level", "green")
        if level in ("yellow", "red"):
            save_risk_event(
                user_id=user_id,
                scenario=scenario,
                level=level,
                score=int(ra.get("score", 0)),
                tags=ra.get("tags", []) or [],
                summary=ra.get("summary_for_admin", ""),
            )
    except Exception as exc:
        logger.exception("persist assistant/risk failed: %s", exc)
        raise HTTPException(status_code=503, detail="回复或预警保存失败，请稍后重试")


# ─── 对话历史 ──────────────────────────────────────────────────────────────

@app.post("/api/chat/stream-sse")
async def chat_stream_sse(
    request: ChatRequest,
    current_user: dict = Depends(require_user),
):
    """
    流式对话（SSE），供高校学生端逐字接收回复。
    协议：text/event-stream，每行 `data: {json}\\n\\n`
      - {"type":"delta","content":"..."} 增量
      - {"type":"done","reply":"...","risk_assessment":{...}} 收尾
    dev_override 走非流式一次性返回（仍以 SSE 包装）。
    """
    scenario = _scenario_ok(request.scenario)
    uid = current_user["id"]
    if request.dev_override and not is_dev_env():
        raise HTTPException(status_code=403, detail="dev_override 已在生产环境中禁用")

    try:
        save_chat_message(uid, scenario, "user", request.message)
    except Exception as exc:
        logger.exception("save user message failed: %s", exc)
        raise HTTPException(status_code=503, detail="消息保存失败，请稍后重试")

    # dev_override 预设剧本
    dev_scene = None
    if request.dev_override:
        if not is_dev_env():
            raise HTTPException(status_code=403, detail="dev_override 已在生产环境中禁用")
        if request.dev_override == "yellow_alert":
            dev_scene = YELLOW_ALERT_SCENE_UNIVERSITY
        elif request.dev_override == "red_alert":
            dev_scene = RED_ALERT_SCENE_UNIVERSITY
        elif request.dev_override == "normal":
            dev_scene = None
        else:
            raise HTTPException(status_code=400, detail="未知的 dev_override 值")

    full_recent = get_recent_chat_history(uid, scenario, limit=CHAT_HISTORY_WINDOW + 1)
    history = full_recent[:-1] if full_recent else []

    async def gen():
        if dev_scene is not None:
            reply = dev_scene["reply"]
            ra = dict(dev_scene["risk_assessment"])
            # 切段模拟流式
            chunk_size = 6
            for i in range(0, len(reply), chunk_size):
                yield f"data: {json.dumps({'type':'delta','content':reply[i:i+chunk_size]}, ensure_ascii=False)}\n\n"
            _persist_assistant_and_risk(uid, scenario, reply, ra)
            yield f"data: {json.dumps({'type':'done','reply':reply,'risk_assessment':ra}, ensure_ascii=False)}\n\n"
            return

        final_reply = ""
        final_ra: dict | None = None
        try:
            async for evt in chat_stream_llm(
                user_id=str(uid),
                message=request.message,
                scenario=scenario,
                history=history,
                companion_persona=request.companion_persona,
                campus_context=request.campus_context.model_dump() if request.campus_context else None,
            ):
                if evt.get("type") == "done":
                    final_reply = evt.get("reply", "")
                    final_ra = evt.get("risk_assessment") or {}
                    _persist_assistant_and_risk(uid, scenario, final_reply, final_ra)
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.exception("stream gen 异常: %s", exc)
            err = {"type": "error", "message": "服务暂时不可用"}
            yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"
            return



    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/asr/transcribe")
async def asr_transcribe(
    file: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    from asr_service import transcribe_audio, validate_audio_upload, ASR_MAX_BYTES

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="音频为空")
    if len(data) > ASR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="音频超出大小限制")
    try:
        validate_audio_upload(file.filename or "")
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc))
    try:
        text = await transcribe_audio(
            data,
            filename=file.filename or "audio.webm",
            content_type=file.content_type,
        )
    except RuntimeError as exc:
        logger.warning("ASR 失败 user=%s: %s", user.get("id"), exc)
        raise HTTPException(status_code=502, detail=str(exc))
    return {"text": text}


class TtsRequest(BaseModel):
    text: str
    scenario: Scenario = "university"


@app.post("/api/tts")
async def tts_synthesize(
    req: TtsRequest,
    user: dict = Depends(require_user),
):
    from tts_service import synthesize_speech

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="文本为空")
    try:
        audio = await synthesize_speech(text, scenario=req.scenario)
    except RuntimeError as exc:
        logger.warning("TTS 失败 user=%s: %s", user.get("id"), exc)
        raise HTTPException(status_code=502, detail=str(exc))
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/api/chat/history")
async def chat_history(
    scenario: str = Query("university", pattern="^university$"),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_user),
):
    return {"items": get_recent_chat_history(user["id"], scenario, limit=limit)}


@app.delete("/api/chat/history")
async def chat_history_clear(
    scenario: str = Query("university", pattern="^university$"),
    user: dict = Depends(require_user),
):
    deleted = clear_chat_history(user["id"], scenario=scenario)
    return {"success": True, "deleted": deleted}


# ─── 管理端：风险事件 ──────────────────────────────────────────────────────

@app.get("/api/admin/alerts")
async def admin_alerts(
    response: Response,
    level: Optional[str] = Query(None, regex="^(green|yellow|red)$"),
    scenario: str = Query("university", pattern="^university$"),
    handled: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    admin: dict = Depends(require_admin),
):
    if response is not None:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    events = list_risk_events(level=level, scenario=scenario, handled=handled, limit=limit)
    return {"items": events, "total": len(events)}


@app.get("/api/admin/stats")
async def admin_stats(
    response: Response,
    scenario: str = Query("university", pattern="^university$"),
    admin: dict = Depends(require_admin),
):
    if response is not None:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return {"total_users": count_users_by_role("student")}


@app.get("/api/admin/users")
async def admin_users(
    scenario: str = Query("university", pattern="^university$"),
    admin: dict = Depends(require_admin),
):
    return {"items": list_users_with_stats("student", scenario)}


@app.get("/api/admin/users/{user_id}/activity")
async def admin_user_activity(
    user_id: int,
    scenario: str = Query("university", pattern="^university$"),
    admin: dict = Depends(require_admin),
):
    return get_user_activity(user_id, scenario)


@app.get("/api/admin/users/{user_id}/interventions")
async def admin_user_interventions(
    user_id: int,
    scenario: str = Query("university", pattern="^university$"),
    admin: dict = Depends(require_admin),
):
    return {"items": list_user_interventions(user_id, scenario)}


@app.get("/api/admin/risk-trend")
async def admin_risk_trend(
    scenario: str = Query("university", pattern="^university$"),
    days: int = Query(7, ge=1, le=30),
    admin: dict = Depends(require_admin),
):
    return {"items": get_risk_trend(scenario, days)}


@app.get("/api/admin/risk-tags")
async def admin_risk_tags(
    scenario: str = Query("university", pattern="^university$"),
    limit: int = Query(7, ge=1, le=20),
    admin: dict = Depends(require_admin),
):
    return {"items": get_risk_tag_distribution(scenario, limit)}


class AlertHandleRequest(BaseModel):
    action: Optional[str] = None
    note: Optional[str] = None


@app.post("/api/admin/alerts/{event_id}/handle")
async def admin_alert_handle(
    event_id: int,
    req: AlertHandleRequest = AlertHandleRequest(),
    admin: dict = Depends(require_admin),
):
    """幂等确认跟进：重复提交仍成功，但保留首次处理人、时间、动作与备注。"""
    ok = mark_risk_event_handled(
        event_id,
        handled_by=admin.get("account"),
        action=req.action,
        note=req.note,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="风险事件不存在")
    return {"success": True}


# ─── 天气 & 倒计时 ──────────────────────────────────────────────────────────

WEATHER_CODE_MAP = {
    0: "晴朗", 1: "晴间多云", 2: "多云", 3: "阴天",
    45: "雾", 48: "雾凇", 51: "小毛毛雨", 53: "毛毛雨", 55: "大毛毛雨",
    61: "小雨", 63: "中雨", 65: "大雨",
    71: "小雪", 73: "中雪", 75: "大雪",
    80: "阵雨", 81: "中阵雨", 82: "强阵雨",
    95: "雷暴", 96: "雷暴伴冰雹", 99: "强雷暴伴冰雹",
}


# 内置城市坐标表，通过 WEATHER_CITY_COORDS="City:lat,lon;..." 可扩展
_BUILTIN_CITY_COORDS = {
    "Baoding": (38.8738, 115.4648),
    "Beijing": (39.9042, 116.4074),
    "Shanghai": (31.2304, 121.4737),
    "Guangzhou": (23.1291, 113.2644),
    "Shenzhen": (22.5431, 114.0579),
    "Chengdu": (30.5728, 104.0668),
}


def _resolve_city_coords(city: str) -> tuple[float, float]:
    extra = os.getenv("WEATHER_CITY_COORDS", "")
    table = dict(_BUILTIN_CITY_COORDS)
    for entry in extra.split(";"):
        entry = entry.strip()
        if not entry or ":" not in entry:
            continue
        name, coords = entry.split(":", 1)
        try:
            lat, lon = coords.split(",")
            table[name.strip()] = (float(lat), float(lon))
        except ValueError:
            continue
    return table.get(city, table["Baoding"])


async def _fetch_weather() -> dict:
    city = os.getenv("WEATHER_CITY", "Baoding")
    latitude, longitude = _resolve_city_coords(city)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "temperature_2m,weather_code",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("weather fetch failed: %s", exc)
        return {"temperature": None, "weather": "未知", "city": city}

    current = data.get("current", {})
    return {
        "temperature": current.get("temperature_2m"),
        "weather": WEATHER_CODE_MAP.get(current.get("weather_code", 0), "未知"),
        "city": city,
    }


def _exam_countdown() -> int:
    exam_date_str = os.getenv("EXAM_DATE", "2026-12-20")
    try:
        exam_date = date.fromisoformat(exam_date_str)
    except ValueError:
        return -1
    return (exam_date - date.today()).days


@app.get("/api/weather")
async def get_weather():
    return await _fetch_weather()


@app.get("/api/exam-countdown")
async def get_exam_countdown():
    return {"days_remaining": _exam_countdown()}


# ─── 场景差异化聚合 API ────────────────────────────────────────────────────
#
# 前端一次拉取即可获得当前场景所需的侧边栏数据。
# 每日治愈语由服务端每天获取一次，避免客户端高频请求第三方公益接口。

_DAILY_QUOTES_UNIVERSITY = [
    "允许一切发生。此刻的你，已经足够优秀了。",
    "一步一步走，比一下冲到底更远。",
    "情绪不是敌人，它是提醒你该休息的信号。",
    "绩点不能定义你的全部。",
    "比起卷赢别人，先别让自己垮掉。",
]

_DAILY_QUOTE_API_URL = os.getenv("DAILY_QUOTE_API_URL", "https://v1.hitokoto.cn/")
_DAILY_QUOTE_CACHE: dict[str, dict[str, str]] = {}
_QUOTE_BLOCKED_TERMS = (
    "自杀", "轻生", "死亡", "绝望", "自残", "杀死", "坟墓", "尸体", "地狱",
    "孤独", "痛苦", "抑郁", "悲伤", "遗憾", "离开", "消失", "放弃", "黑暗",
    "噩梦", "折磨", "虚无", "失败",
)


def _fallback_daily_quote(today: date) -> dict[str, str]:
    return {
        "text": _DAILY_QUOTES_UNIVERSITY[today.toordinal() % len(_DAILY_QUOTES_UNIVERSITY)],
        "source": "智伴方舟",
    }


def _quote_is_safe(text: str) -> bool:
    return 4 <= len(text) <= 48 and not any(term in text for term in _QUOTE_BLOCKED_TERMS)


async def _get_daily_quote() -> dict[str, str]:
    """每天随机获取一条短句；当天固定，失败或内容不适宜时使用本地兜底。"""
    today = date.today()
    cache_key = today.isoformat()
    if cache_key in _DAILY_QUOTE_CACHE:
        return _DAILY_QUOTE_CACHE[cache_key]

    quote = _fallback_daily_quote(today)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                _DAILY_QUOTE_API_URL,
                params=[
                    ("c", "e"),
                    ("c", "k"),
                    ("encode", "json"),
                    ("charset", "utf-8"),
                    ("max_length", "48"),
                ],
                headers={"Accept": "application/json", "User-Agent": "Intelligent-Ark/1.0"},
            )
            response.raise_for_status()
            payload = response.json()
        text = " ".join(str(payload.get("hitokoto") or "").split()).strip("“”\" ")
        if _quote_is_safe(text):
            source = " ".join(str(payload.get("from") or "一言").split())[:40]
            quote = {"text": text, "source": source or "一言"}
        else:
            logger.warning("daily quote rejected by safety filter")
    except Exception as exc:
        logger.warning("daily quote fetch failed: %s", exc)

    _DAILY_QUOTE_CACHE.clear()
    _DAILY_QUOTE_CACHE[cache_key] = quote
    return quote

_HOTLINES = {
    "university": [
        {"label": "24h 心理援助热线", "phone": "400-161-9995"},
        {"label": "北京心理危机干预", "phone": "010-82951332"},
    ],
}


@app.get("/api/scenario/context")
async def scenario_context(
    scenario: str = Query("university", pattern="^university$"),
):
    """返回高校侧栏所需的每日治愈语与求助资源。"""
    quote = await _get_daily_quote()
    return {
        "scenario": "university",
        "daily_quote": quote["text"],
        "daily_quote_source": quote["source"],
        "hotlines": _HOTLINES["university"],
    }
