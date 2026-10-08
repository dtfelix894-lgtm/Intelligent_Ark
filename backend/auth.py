"""
JWT 鉴权模块。

- create_access_token：签发 JWT
- get_current_user：通用 FastAPI 依赖，解析 Bearer token / HttpOnly Cookie
- get_current_student / get_current_admin：按业务端读取各自的 HttpOnly Cookie
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


def _extract_token(request: Request, cookie_name: Optional[str] = None) -> Optional[str]:
    # 优先 Authorization: Bearer
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    # 业务接口必须读取本端 Cookie，避免同一浏览器双端登录时身份串用。
    if cookie_name:
        return request.cookies.get(cookie_name)
    # 通用接口保留兼容行为；具体业务权限不应依赖这个回退顺序。
    return request.cookies.get("b_token") or request.cookies.get("c_token")


def _resolve_user(token: Optional[str]) -> dict:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    payload = _decode(token)
    try:
        uid = int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="无效的凭证")
    user = {
        "id": uid,
        "account": payload.get("account", ""),
        "role": payload.get("role", ""),
    }
    # Tokens are stateless, but role/scope is authoritative in the database.
    # This invalidates accounts outside the campus product scope.
    try:
        from database import get_user_by_id
        current = get_user_by_id(user["id"])
    except Exception:
        current = None
    if not current or current.get("role") != user["role"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号已失效")
    if current.get("role") not in ("student", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="当前产品不支持该账号")
    user.update({k: current.get(k) for k in ("school", "student_id", "education", "admin_type", "school_name")})
    return user


def get_current_user(request: Request) -> dict:
    """通用身份解析，仅供不区分业务端的接口使用。"""
    return _resolve_user(_extract_token(request))


def get_current_student(request: Request) -> dict:
    """学生业务接口：Bearer 优先，否则只读取 c_token。"""
    return _resolve_user(_extract_token(request, "c_token"))


def get_current_admin(request: Request) -> dict:
    """高校工作端接口：Bearer 优先，否则只读取 b_token。"""
    return _resolve_user(_extract_token(request, "b_token"))


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


def require_admin(user: dict = Depends(get_current_admin)) -> dict:
    if user.get("role") != "admin" or user.get("admin_type") != "G":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return user


def require_user(user: dict = Depends(get_current_student)) -> dict:
    """高校学生用户。"""
    if user.get("role") != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要 C 端用户身份")
    return user
