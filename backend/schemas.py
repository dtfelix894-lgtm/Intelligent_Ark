from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal

Scenario = Literal["university", "community"]
RiskLevel = Literal["green", "yellow", "red"]
DevOverride = Literal["normal", "yellow_alert", "red_alert"]


class ChatRequest(BaseModel):
    # user_id 字段前端兼容保留，后端以 JWT 为准
    user_id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=2000)
    scenario: Scenario
    dev_override: Optional[DevOverride] = None

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
