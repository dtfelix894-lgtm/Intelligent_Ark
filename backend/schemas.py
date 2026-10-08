from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal

# Production scope is intentionally campus-only.  Keep the literal strict so
# 场景严格限定为高校，避免旧客户端传入已下线场景。
Scenario = Literal["university"]
RiskLevel = Literal["green", "yellow", "red"]
DevOverride = Literal["normal", "yellow_alert", "red_alert"]
CompanionPersona = Literal["senior_sister", "senior_brother"]
CampusTermPhase = Literal["term_start", "term_time", "exam_season", "break"]


class CampusTimeContext(BaseModel):
    # 浏览器本地校园时间轴，只传时间段语义，不上传定位或真实课表内容。
    local_hour: int = Field(..., ge=0, le=23)
    weekday: int = Field(..., ge=0, le=6)
    phase: CampusTermPhase


class ChatRequest(BaseModel):
    # user_id 字段前端兼容保留，后端以 JWT 为准
    user_id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=2000)
    scenario: Scenario = "university"
    dev_override: Optional[DevOverride] = None
    companion_persona: CompanionPersona = "senior_sister"
    campus_context: Optional[CampusTimeContext] = None

    @field_validator("dev_override", mode="before")
    @classmethod
    def _empty_to_none(cls, v):
        if v is None or v == "":
            return None
        return v


class RiskAssessment(BaseModel):
    level: RiskLevel
    score: int = Field(..., ge=0, le=100)
    tags: List[str] = []
    summary_for_admin: str = ""


class ChatResponse(BaseModel):
    reply: str
    risk_assessment: RiskAssessment
