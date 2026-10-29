import os
import json
import logging
import asyncio

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Response, Depends, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import AfterValidator, BaseModel
from typing import Annotated, Literal, Optional

from schemas import ChatRequest, ChatResponse, Scenario
from llm_service import (
    chat_with_llm_complete,
    chat_stream_llm,
    YELLOW_ALERT_SCENE_UNIVERSITY,
    RED_ALERT_SCENE_UNIVERSITY,
)
from fastapi.responses import StreamingResponse
from database import (
    init_db,
    purge_demo_users,
    IntegrityError,
    integrity_errors,
    verify_user,
    get_or_create_user,
    get_admin_profile,
    save_chat_message,
    save_risk_event,
    list_risk_events,
    get_risk_event,
    list_peer_risk_events,
    claim_risk_event,
    assign_risk_event,
    get_admin_account,
    list_admin_accounts,
    write_audit_log,
    mark_risk_event_handled,
    transition_risk_event,
    list_event_transitions,
    add_follow_up_record,
    list_follow_up_records,
    list_reassessments,
    complete_reassessment,
    create_reassessment,
    next_statuses_for,
    list_risk_events_enriched,
    enrich_risk_event_timeout,
    count_overdue_alerts,
    get_admin_metrics,
    list_audit_logs,
    get_admin_config_summary,
    subscribe_risk_alerts,
    unsubscribe_risk_alerts,
    list_user_interventions,
    get_recent_chat_history,
    clear_chat_history,
    count_users_by_role,
    list_users_with_stats,
    get_user_activity,
    get_risk_trend,
    get_risk_tag_distribution,

    set_companion_persona,
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

# ========== 启动事件：初始化数据库 & 清理演示账号 ==========

@app.on_event("startup")
def startup():
    init_db()
    # 不再注入演示账号；启动时清理 is_demo=1（及历史学生种子 001）
    result = purge_demo_users()
    if result.get("deleted_users"):
        logger.info("purged demo users: %s", result.get("accounts"))
    # SEED_DEMO_USERS 已废弃；若仍配置则告警，避免误以为还会 seed
    if os.getenv("SEED_DEMO_USERS", "").strip():
        logger.warning("SEED_DEMO_USERS is deprecated and ignored; demo seeding is disabled")



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
    except IntegrityError:
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


class CPreferencesRequest(BaseModel):
    companion_persona: Literal["senior_sister", "senior_brother"]


@app.patch("/api/auth/c-preferences")
async def update_student_preferences(
    req: CPreferencesRequest,
    user: dict = Depends(require_user),
):
    """COMP-06：人设偏好写入 user_profiles，跨设备恢复。"""
    try:
        set_companion_persona(int(user["id"]), req.companion_persona)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的人设")
    return {"success": True, "companion_persona": req.companion_persona}


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
    except IntegrityError:
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
        payload = {"reply": reply, "risk_assessment": ra}
        crisis = build_crisis_support(ra.get("level"))
        if crisis is not None:
            payload["crisis_support"] = crisis
        return payload

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
    payload = {"reply": response.reply, "risk_assessment": ra}
    crisis = build_crisis_support(ra.get("level"))
    if crisis is not None:
        payload["crisis_support"] = crisis
    return payload


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
            done = {'type': 'done', 'reply': reply, 'risk_assessment': ra}
            crisis = build_crisis_support(ra.get('level'))
            if crisis is not None:
                done['crisis_support'] = crisis
            yield f"data: {json.dumps(done, ensure_ascii=False)}\n\n"
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
                    crisis = build_crisis_support(
                        (final_ra or {}).get("level") if isinstance(final_ra, dict) else None
                    )
                    if crisis is not None:
                        evt = dict(evt)
                        evt["crisis_support"] = crisis
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
    events = list_risk_events_enriched(level=level, scenario=scenario, handled=handled, limit=limit)
    # 默认按入池时间新→旧；超时/红色排序由前端设置控制
    events.sort(key=lambda e: e.get("created_at") or "", reverse=True)
    overdue_count = sum(1 for e in events if e.get("is_overdue"))
    return {"items": events, "total": len(events), "overdue_count": overdue_count}


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


class AlertAssignRequest(BaseModel):
    assignee: str
    reason: str = ""



@app.get("/api/admin/staff")
async def admin_staff(admin: dict = Depends(require_admin)):
    """工作人员工号列表，供分派/改派下拉使用。"""
    return {"items": list_admin_accounts()}



@app.get("/api/admin/alerts/stream")
async def admin_alerts_stream(
    scenario: str = Query("university", pattern="^university$"),
    admin: dict = Depends(require_admin),
):
    """SSE：新 risk_events 写入后推送脱敏事件；定期心跳。

    鉴权同其他 admin 接口（Bearer 或 b_token Cookie）。
    事件仅含摘要/标签等，无对话原文。单进程内存订阅；前端也可继续 1s 轮询。
    """
    q = subscribe_risk_alerts()
    heartbeat_secs = max(5, int(os.getenv("ADMIN_ALERTS_SSE_HEARTBEAT_SECS", "15")))

    async def event_gen():
        import json as _json
        from datetime import datetime
        try:
            # 首包：方便前端确认连通
            ready = {
                "type": "ready",
                "scenario": scenario,
                "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
            yield f"event: ready\ndata: {_json.dumps(ready, ensure_ascii=False)}\n\n"
            while True:
                try:
                    payload = await asyncio.to_thread(q.get, True, heartbeat_secs)
                except Exception:
                    # queue.Empty 或超时 → 心跳
                    hb = {
                        "type": "heartbeat",
                        "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    }
                    yield f"event: heartbeat\ndata: {_json.dumps(hb, ensure_ascii=False)}\n\n"
                    continue
                # 过滤 scenario（当前仅 university）
                item = (payload or {}).get("item") or {}
                if scenario and item.get("scenario") and item.get("scenario") != scenario:
                    continue
                yield f"event: alert\ndata: {_json.dumps(payload, ensure_ascii=False)}\n\n"
        finally:
            unsubscribe_risk_alerts(q)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/admin/alerts/{event_id}")
async def admin_alert_detail(
    event_id: int,
    response: Response,
    scenario: str = Query("university", pattern="^university$"),
    admin: dict = Depends(require_admin),
):
    """脱敏详情：仅风险摘要/标签等，不含对话原文；访问写入审计。"""
    if response is not None:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    event = get_risk_event(event_id, scenario=scenario)
    if not event:
        raise HTTPException(status_code=404, detail="风险事件不存在")
    event = enrich_risk_event_timeout(event)
    related = list_peer_risk_events(
        event["user_id"], scenario=scenario, exclude_id=event_id, limit=20
    )
    write_audit_log(
        actor=admin.get("account") or "",
        action="view_alert",
        target_type="risk_event",
        target_id=str(event_id),
        meta={"level": event.get("level"), "account": event.get("account")},
    )
    transitions = list_event_transitions(event_id)
    records = list_follow_up_records(event_id)
    reassessments = list_reassessments(event_id=event_id, include_completed=True, limit=50)
    return {
        "item": event,
        "related": related,
        "transitions": transitions,
        "records": records,
        "reassessments": reassessments,
        "next_statuses": next_statuses_for(event.get("status") or "pending"),
    }


@app.post("/api/admin/alerts/{event_id}/claim")
async def admin_alert_claim(
    event_id: int,
    admin: dict = Depends(require_admin),
):
    """当前管理员认领；已由本人认领则幂等成功，已被他人认领返回 409。"""
    account = admin.get("account") or ""
    status, event = claim_risk_event(event_id, account)
    if status == "missing":
        raise HTTPException(status_code=404, detail="风险事件不存在")
    if status == "conflict":
        other = (event or {}).get("assignee") or "他人"
        raise HTTPException(status_code=409, detail=f"已被{other}认领")
    write_audit_log(
        actor=account,
        action="claim_alert",
        target_type="risk_event",
        target_id=str(event_id),
        meta={"assignee": account},
    )
    return {"success": True, "item": event}


@app.post("/api/admin/alerts/{event_id}/assign")
async def admin_alert_assign(
    event_id: int,
    req: AlertAssignRequest,
    admin: dict = Depends(require_admin),
):
    """改派给指定工号（须为 admin）；I1 无子角色限制，任意 admin 可操作。须填原因。"""
    target = (req.assignee or "").strip()
    reason = (req.reason or "").strip()
    if not target:
        raise HTTPException(status_code=422, detail="assignee 不能为空")
    if not reason:
        raise HTTPException(status_code=422, detail="改派原因不能为空")
    if get_admin_account(target) is None:
        raise HTTPException(status_code=404, detail="目标管理员不存在")
    before = get_risk_event(event_id, scenario="university")
    if not before:
        raise HTTPException(status_code=404, detail="风险事件不存在")
    previous = before.get("assignee")
    status, event = assign_risk_event(event_id, target)
    if status == "missing":
        raise HTTPException(status_code=404, detail="风险事件不存在")
    write_audit_log(
        actor=admin.get("account") or "",
        action="assign_alert",
        target_type="risk_event",
        target_id=str(event_id),
        meta={"assignee": target, "reason": reason, "previous": previous},
    )
    return {"success": True, "item": event}



class AlertTransitionRequest(BaseModel):
    to_status: str
    reason: Optional[str] = None
    closure_label: Optional[str] = None
    closure_other_person: bool = False
    closure_note: Optional[str] = None


class AlertRecordRequest(BaseModel):
    type: str
    occurred_at: str
    summary: str
    referral_target: Optional[str] = None
    advance_to_referred: bool = False


class ReassessmentCompleteRequest(BaseModel):
    result: str  # improved | still_risk
    note: Optional[str] = None


@app.post("/api/admin/alerts/{event_id}/transition")
async def admin_alert_transition(
    event_id: int,
    req: AlertTransitionRequest,
    admin: dict = Depends(require_admin),
):
    """状态流转（CASE-01）；非法边 409；结案须标注+说明。"""
    actor = admin.get("account") or ""
    status, event = transition_risk_event(
        event_id,
        to_status=req.to_status,
        actor=actor,
        reason=req.reason,
        closure_label=req.closure_label,
        closure_other_person=req.closure_other_person,
        closure_note=req.closure_note,
    )
    if status == "missing":
        raise HTTPException(status_code=404, detail="风险事件不存在")
    if status == "illegal":
        raise HTTPException(status_code=409, detail="非法状态流转")
    if status == "bad_closure":
        raise HTTPException(status_code=422, detail="结案须填写标注与说明，重开须填写原因")
    write_audit_log(
        actor=actor,
        action="transition_alert",
        target_type="risk_event",
        target_id=str(event_id),
        meta={
            "to_status": req.to_status,
            "reason": req.reason,
            "closure_label": req.closure_label,
        },
    )
    return {
        "success": True,
        "item": event,
        "next_statuses": next_statuses_for((event or {}).get("status") or "pending"),
        "transitions": list_event_transitions(event_id),
        "reassessments": list_reassessments(event_id=event_id, include_completed=True, limit=50),
    }


@app.post("/api/admin/alerts/{event_id}/records")
async def admin_alert_add_record(
    event_id: int,
    req: AlertRecordRequest,
    admin: dict = Depends(require_admin),
):
    """追加跟进记录（CASE-02）；不可改删。"""
    actor = admin.get("account") or ""
    status, record, event = add_follow_up_record(
        event_id,
        record_type=req.type,
        occurred_at=req.occurred_at,
        summary=req.summary,
        actor=actor,
        referral_target=req.referral_target,
        advance_to_referred=req.advance_to_referred,
    )
    if status == "missing":
        raise HTTPException(status_code=404, detail="风险事件不存在")
    if status == "illegal":
        raise HTTPException(status_code=409, detail="当前状态不可新增跟进记录")
    if status == "bad_input":
        raise HTTPException(status_code=422, detail="记录类型/时间/说明不合法（说明≤500字）")
    write_audit_log(
        actor=actor,
        action="add_follow_up_record",
        target_type="risk_event",
        target_id=str(event_id),
        meta={"type": req.type, "record_id": (record or {}).get("id")},
    )
    return {
        "success": True,
        "record": record,
        "item": event,
        "records": list_follow_up_records(event_id),
    }


@app.get("/api/admin/alerts/{event_id}/records")
async def admin_alert_list_records(
    event_id: int,
    admin: dict = Depends(require_admin),
):
    event = get_risk_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="风险事件不存在")
    return {"items": list_follow_up_records(event_id)}


@app.get("/api/admin/reassessments")
async def admin_reassessments(
    due: Optional[str] = Query(None, pattern="^(today|overdue|upcoming|all)$"),
    event_id: Optional[int] = Query(None),
    include_completed: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    admin: dict = Depends(require_admin),
):
    """复评列表（CASE-03）；站内提醒用。"""
    items = list_reassessments(
        due=due,
        event_id=event_id,
        include_completed=include_completed,
        limit=limit,
    )
    today_count = len(list_reassessments(due="today", limit=500))
    overdue_count = len(list_reassessments(due="overdue", limit=500))
    return {
        "items": items,
        "today_count": today_count,
        "overdue_count": overdue_count,
    }



class ReassessmentCreateRequest(BaseModel):
    due_date: str  # YYYY-MM-DD


@app.post("/api/admin/alerts/{event_id}/reassessments")
async def admin_alert_create_reassessment(
    event_id: int,
    req: ReassessmentCreateRequest,
    admin: dict = Depends(require_admin),
):
    """创建复评提醒（CASE-03 子集）。"""
    actor = admin.get("account") or ""
    status, item = create_reassessment(event_id, due_date=req.due_date, actor=actor)
    if status == "missing":
        raise HTTPException(status_code=404, detail="风险事件不存在")
    if status == "illegal":
        raise HTTPException(status_code=409, detail="当前状态不可创建复评")
    if status == "bad_input":
        raise HTTPException(status_code=422, detail="due_date 须为 YYYY-MM-DD")
    write_audit_log(
        actor=actor,
        action="create_reassessment",
        target_type="risk_event",
        target_id=str(event_id),
        meta={"due_date": req.due_date, "reassessment_id": (item or {}).get("id")},
    )
    return {"success": True, "item": item}


@app.post("/api/admin/reassessments/{reassessment_id}/complete")
async def admin_reassessment_complete(
    reassessment_id: int,
    req: ReassessmentCompleteRequest,
    admin: dict = Depends(require_admin),
):
    actor = admin.get("account") or ""
    status, ra, event = complete_reassessment(
        reassessment_id, result=req.result, actor=actor, note=req.note,
    )
    if status == "missing":
        raise HTTPException(status_code=404, detail="复评不存在")
    if status == "done":
        raise HTTPException(status_code=409, detail="该复评已完成")
    if status == "bad_input":
        raise HTTPException(status_code=422, detail="result 须为 improved 或 still_risk")
    write_audit_log(
        actor=actor,
        action="complete_reassessment",
        target_type="reassessment",
        target_id=str(reassessment_id),
        meta={"result": req.result, "event_id": (ra or {}).get("event_id")},
    )
    return {"success": True, "item": ra, "event": event}


@app.post("/api/admin/alerts/{event_id}/handle")
async def admin_alert_handle(
    event_id: int,
    req: AlertHandleRequest = AlertHandleRequest(),
    admin: dict = Depends(require_admin),
):
    """幂等确认跟进：重复提交仍成功，但保留首次处理人、时间、动作与备注。"""
    actor = admin.get("account") or ""
    before = get_risk_event(event_id, scenario="university")
    ok = mark_risk_event_handled(
        event_id,
        handled_by=actor,
        action=req.action,
        note=req.note,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="风险事件不存在")
    after = get_risk_event(event_id, scenario="university")
    write_audit_log(
        actor=actor,
        action="handle_alert_legacy_close",
        target_type="risk_event",
        target_id=str(event_id),
        meta={
            "action": req.action,
            "from_status": (before or {}).get("status"),
            "closure_label": (after or {}).get("closure_label"),
        },
    )
    return {"success": True}




@app.get("/api/admin/metrics")
async def admin_metrics(
    scenario: str = Query("university", pattern="^university$"),
    days: int = Query(7, ge=1, le=30),
    admin: dict = Depends(require_admin),
):
    """匿名聚合看板（ADM-04）；不含学生账号与原文。"""
    return get_admin_metrics(scenario=scenario, days=days)


@app.get("/api/admin/audit-logs")
async def admin_audit_logs(
    actor: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: dict = Depends(require_admin),
):
    """审计日志列表（ADM-05）：分页；无对话原文。查看本身写一条。"""
    items, total = list_audit_logs(actor=actor, action=action, limit=limit, offset=offset)
    write_audit_log(
        actor=admin.get("account") or "",
        action="view_audit_logs",
        target_type="audit_logs",
        target_id="list",
        meta={
            "count": len(items),
            "total": total,
            "offset": offset,
            "filter_actor": actor,
            "filter_action": action,
        },
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@app.get("/api/admin/config-summary")
async def admin_config_summary(admin: dict = Depends(require_admin)):
    """只读配置摘要：认领时限、复评间隔、热线/预约等。"""
    return get_admin_config_summary()


@app.get("/api/admin/overdue-count")
async def admin_overdue_count(
    scenario: str = Query("university", pattern="^university$"),
    admin: dict = Depends(require_admin),
):
    return {"overdue_count": count_overdue_alerts(scenario)}



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


# ─── 求助资源 / 危机支持（ADM-02 / COMP-04）────────────────────────────────
# 号码与链接只来自环境变量，代码内不得写死真实或仿真实电话。
# 未配置时 hotlines 为空；dev 环境返回 missing_hint，prod 仅提示联系学校心理中心。

_DEFAULT_CRISIS_MESSAGE = (
    "你不是孤单一个人。请先保证当下安全，联系学校心理中心或身边可信任的人；"
    "需要时也可拨打下方热线或使用预约入口。"
)


def _env_flag(name: str, default: str = "") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def _parse_extra_hotlines(raw: str) -> list[dict[str, str]]:
    text = (raw or "").strip()
    if not text:
        return []
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("EXTRA_HOTLINES_JSON 不是合法 JSON，已忽略")
        return []
    if not isinstance(data, list):
        logger.warning("EXTRA_HOTLINES_JSON 应为数组，已忽略")
        return []
    out: list[dict[str, str]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        phone = str(item.get("phone") or "").strip()
        if label and phone:
            out.append({"label": label, "phone": phone})
    return out


def get_help_resources() -> dict:
    """从环境变量组装求助资源配置；无号码时不返回虚构电话。"""
    psych_label = (os.getenv("SCHOOL_PSYCH_CENTER_LABEL") or "学校心理中心").strip()
    psych_phone = (os.getenv("SCHOOL_PSYCH_CENTER_PHONE") or "").strip()
    hotline_label = (os.getenv("HOTLINE_24H_LABEL") or "24h 心理援助热线").strip()
    hotline_phone = (os.getenv("HOTLINE_24H_PHONE") or "").strip()
    appointment_label = (os.getenv("APPOINTMENT_LABEL") or "预约心理咨询").strip()
    appointment_url = (os.getenv("APPOINTMENT_URL") or "").strip()
    crisis_message = (os.getenv("CRISIS_SUPPORT_MESSAGE") or _DEFAULT_CRISIS_MESSAGE).strip()
    is_placeholder = _env_flag("HELP_RESOURCES_IS_PLACEHOLDER")

    hotlines: list[dict[str, str]] = []
    if hotline_phone:
        hotlines.append({"label": hotline_label, "phone": hotline_phone})
    hotlines.extend(_parse_extra_hotlines(os.getenv("EXTRA_HOTLINES_JSON", "")))

    psych_center = None
    if psych_phone:
        psych_center = {"label": psych_label, "phone": psych_phone}

    # 侧栏兼容字段：心理中心电话优先，其后为热线列表
    flat_hotlines: list[dict[str, str]] = []
    if psych_center:
        flat_hotlines.append(psych_center)
    flat_hotlines.extend(hotlines)

    appointment = None
    if appointment_url:
        appointment = {"label": appointment_label, "url": appointment_url}

    configured = bool(flat_hotlines or appointment)
    missing_hint = None
    if not configured:
        missing_hint = (
            "开发提示：尚未配置 SCHOOL_PSYCH_CENTER_PHONE / HOTLINE_24H_PHONE / APPOINTMENT_URL，"
            "请在 backend/.env 填写本校求助资源（见 ADM-02）。"
            if is_dev_env()
            else None
        )

    return {
        "psych_center": psych_center,
        "hotlines": hotlines,
        "appointment": appointment,
        "crisis_message": crisis_message,
        "configured": configured,
        "is_placeholder": is_placeholder,
        "missing_hint": missing_hint,
        # 兼容旧字段消费者：合并后的可拨号列表
        "flat_hotlines": flat_hotlines,
    }


def build_crisis_support(risk_level: str | None) -> dict | None:
    """仅 red 返回危机支持卡片载荷；yellow/green 返回 None。"""
    if (risk_level or "").lower() != "red":
        return None
    hr = get_help_resources()
    resources: list[dict[str, str]] = []
    if hr["psych_center"]:
        resources.append({**hr["psych_center"], "kind": "psych_center"})
    for item in hr["hotlines"]:
        resources.append({**item, "kind": "hotline"})
    return {
        "message": hr["crisis_message"],
        "resources": resources,
        "appointment": hr["appointment"],
        "configured": hr["configured"],
        "is_placeholder": hr["is_placeholder"],
        "missing_hint": hr["missing_hint"],
        "trust_prompt": "现在就告诉身边信任的人，并联系学校心理中心。",
    }


@app.get("/api/help-resources")
async def help_resources_config():
    """ADM-02：返回本校求助资源配置（无鉴权，供学生端常驻入口与危机卡片共用）。"""
    hr = get_help_resources()
    return {
        "psych_center": hr["psych_center"],
        "hotlines": hr["hotlines"],
        "appointment": hr["appointment"],
        "crisis_message": hr["crisis_message"],
        "configured": hr["configured"],
        "is_placeholder": hr["is_placeholder"],
        "missing_hint": hr["missing_hint"],
    }


@app.get("/api/scenario/context")
async def scenario_context(
    scenario: str = Query("university", pattern="^university$"),
):
    """返回高校侧栏所需的每日治愈语与求助资源。"""
    quote = await _get_daily_quote()
    hr = get_help_resources()
    return {
        "scenario": "university",
        "daily_quote": quote["text"],
        "daily_quote_source": quote["source"],
        "hotlines": hr["flat_hotlines"],
        "help_resources": {
            "psych_center": hr["psych_center"],
            "hotlines": hr["hotlines"],
            "appointment": hr["appointment"],
            "crisis_message": hr["crisis_message"],
            "configured": hr["configured"],
            "is_placeholder": hr["is_placeholder"],
            "missing_hint": hr["missing_hint"],
        },
    }
