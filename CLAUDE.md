# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

智伴方舟 (Intelligent Ark) — 心理陪伴 AI 服务系统，挑战杯创业竞赛演示版。B2B2C 双轨架构：
- **高校情绪治理** (`university`)：面向大学生的心理陪伴，AI 人设"知心学姐"
- **社区康养守护** (`community`)：面向独居老人的健康关怀，AI 人设"社区小暖"

## 启动

```bash
# 后端（端口 8001）
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8001 --host 0.0.0.0

# 前端（端口 3000，自动绑定 0.0.0.0）
cd frontend
npm install
npm run dev
```

前端自动连接 `http://<同hostname>:8001`，可通过 `frontend/.env.local` 中 `NEXT_PUBLIC_API_BASE` 覆盖。

## 演示账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 高校学生 (C端) | `001` | `123456` |
| 社区居民 (C端) | `002@qq.com` | `123456` |
| 高校管理员 (B端) | `G001` | `123456` |
| 社区管理员 (B端) | `C001` | `123456` |

非 prod 环境启动时自动 seed。

## 架构要点

### 后端 (Python + FastAPI + SQLite)

所有路由定义在 `backend/main.py`（单文件 monolith），模块职责：
- `auth.py` — JWT HS256 鉴权，`get_current_user` / `require_admin` / `require_user` 作为 FastAPI 依赖注入
- `llm_service.py` — 智谱 GLM 调用，场景化 system prompt，关键词兜底，分数校正锁 `_force_threshold_lock`
- `database.py` — SQLite WAL 模式，bcrypt 密码，4 张表 (users / user_profiles / chat_messages / risk_events)
- `asr_service.py` — 智谱 glm-asr 语音转写
- `schemas.py` — Pydantic 模型，`Scenario` / `RiskLevel` / `DevOverride` 类型字面量

关键机制：
- **双路径对话**：`/api/chat/stream`（非流式 JSON）和 `/api/chat/stream-sse`（SSE 流式）。非流式要求 LLM 输出严格 JSON（含 reply + risk_assessment），流式不要求 JSON 输出，事后用关键词兜底计算风险。
- **LLM 兜底**：无 API Key 或调用异常时，根据场景 + 关键词匹配返回预设剧本，演示不中断。
- **dev_override**：`APP_ENV != "prod"` 时可跳过 LLM 直接返回预设的 yellow/red 预警剧本。
- **In-flight 去重**：5 秒窗口内相同 (user_id, scenario, message) 复用同一 Task。
- **CORS 三级策略**：`ALLOWED_ORIGINS` 精确匹配 → `ALLOW_ANY_ORIGIN=1` 全放 → 默认正则匹配任意 host。

### 前端 (Next.js 14 App Router + Tailwind + Shadcn UI)

- `middleware.ts` — 路由守卫：`/chat` 检查 `c_token` cookie，`/admin` 检查 `b_token` cookie
- `lib/api.ts` — 统一 `apiFetch`：自动附 Bearer token + 401 自动跳转登录。token 双写 localStorage + cookie（cookie 供 middleware 读）
- `lib/scenario-context.tsx` — `useScenario()` 全局场景状态，持久化到 localStorage
- `app/chat/page.tsx` — 聊天主页（2500+ 行大组件），含：WAV 录音 + ASR、TTS 朗读、Dev Panel（三击头像）、字号缩放、称呼偏好、能量电台/正念放松/木鱼/打字墙等解压功能
- `app/admin/page.tsx` — B 端管理大屏，跨 Tab 实时预警（localStorage StorageEvent 同步）
- `app/chat/components/LeftPanel.tsx` / `RightPanel.tsx` — 侧边栏组件，按场景差异化渲染

### 跨 Tab 预警同步

C 端对话产生 yellow/red 风险时，写入 `localStorage.latest_ark_alert`；B 端 admin 页面监听 `StorageEvent` 实时弹出预警卡片。无需 WebSocket。

## 风险评估

| 等级 | 分数 | 含义 |
|------|------|------|
| green | 0-30 | 情绪平稳 |
| yellow | 31-70 | 轻度困扰 |
| red | 71-100 | 严重危机 |

`_force_threshold_lock` 会强制按分数区间修正 level，防止 LLM 误判。

## 环境变量

后端 `backend/.env` 关键项（完整列表见 README.md）：

```env
ZHIPU_API_KEY=          # 留空走关键词兜底
ZHIPU_MODEL=glm-4-flash # 对话模型
APP_ENV=dev             # dev | prod（prod 禁用 dev_override，强制强密钥）
JWT_SECRET=             # prod 必须 ≥32 位
```

## 开发注意事项

- 后端无测试套件，无 lint 配置；前端有 `npm run lint`（eslint-config-next），无测试
- SQLite 数据库文件 `backend/intelligent_ark.db` 启动时自动创建，表迁移通过 `ALTER TABLE ... ADD COLUMN` + try/except 实现
- 路演触发预警：`/chat` 页面 3 秒内连续点击 AI 头像 3 次打开 Dev Panel
- 完整 API 规范和产品需求文档在 `PDRs/` 目录下
