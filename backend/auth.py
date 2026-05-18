"""
JWT 鉴权模块。

- create_access_token：签发 JWT
- get_current_user：FastAPI 依赖，解析 Bearer token / HttpOnly Cookie，返回 {id, account, role}
- require_admin：要求 role=='admin'
- require_roles(...)：要求 role 属于给定集合
- is_dev_env：判断当前是否允许 dev_override
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status

APP_ENV = os.getenv("APP_ENV", "dev").lower()  # dev | prod

_DEFAULT_DEV_SECRET = "dev-insecure-secret-please-change"
JWT_SECRET = os.getenv("JWT_SECRET", _DEFAULT_DEV_SECRET)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "168"))  # 7 天

# 生产环境必须配置强 JWT_SECRET，否则直接拒绝启动
if APP_ENV == "prod":
    if not JWT_SECRET or JWT_SECRET == _DEFAULT_DEV_SECRET:
        raise RuntimeError(
            "APP_ENV=prod 必须配置 JWT_SECRET 环境变量（且不得使用默认值）"
        )
    if len(JWT_SECRET) < 32:
        raise RuntimeError("JWT_SECRET 长度需 ≥ 32 位（建议使用 openssl rand -hex 32 生成）")


def is_dev_env() -> bool:
    """仅 dev 环境允许 dev_override 等调试能力。"""
    return APP_ENV != "prod"


def create_access_token(user_id: int, account: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "account": account,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已过期")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的凭证")


def _extract_token(request: Request) -> Optional[str]:
    # 优先 Authorization: Bearer
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    # 回退 HttpOnly Cookie（B 端）
    return request.cookies.get("b_token") or request.cookies.get("c_token")


def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    payload = _decode(token)
    return {
        "id": int(payload["sub"]),
        "account": payload.get("account", ""),
        "role": payload.get("role", ""),
    }


def get_optional_user(request: Request) -> Optional[dict]:
    token = _extract_token(request)
    if not token:
        return None
    try:
        payload = _decode(token)
    except HTTPException:
        return None
    return {
        "id": int(payload["sub"]),
        "account": payload.get("account", ""),
        "role": payload.get("role", ""),
    }


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return user


def require_user(user: dict = Depends(get_current_user)) -> dict:
    """C 端用户（student/social）。"""
    if user.get("role") not in ("student", "social"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要 C 端用户身份")
    return user
