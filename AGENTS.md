# 智伴方舟 (Intelligent Ark) - 项目指南

> 本文件由实际跑通项目后核对更新。详尽产品/接口规范见 `README.md` 与 `PDRs/`。

## 项目概述

智伴方舟是一个心理陪伴 AI 服务系统，B2B2C 双轨架构：
- **高校情绪治理模式**（`university`）：为面临学业/就业压力的大学生提供心理陪伴，AI 人设"知心学姐"
- **社区康养守护模式**（`community`）：为独居/空巢老人提供健康关怀，AI 人设"社区小暖"

## 技术栈

- **后端**：Python 3.12 + FastAPI + SQLite（WAL 模式，单文件 monolith `main.py`）
- **前端**：Next.js 14（App Router）+ React 18 + TypeScript + Tailwind + Shadcn UI
- **AI 服务**：
  - 对话：DeepSeek（OpenAI 兼容接口，`LLM_API_KEY` 配好即生效，未配则关键词兜底）
  - 语音转写：智谱 `glm-asr`
  - 语音合成：小米 MiMo 神经 TTS（未配则前端回退浏览器 Web Speech）

## 项目结构

```
Intelligent_Ark/
├── backend/                 # FastAPI 后端服务
│   ├── main.py              # 主应用入口，定义所有 API 路由
│   ├── auth.py              # JWT HS256 鉴权（get_current_user / require_admin / require_user）
│   ├── llm_service.py       # 对话 LLM 调用、场景 system prompt、关键词兜底、分数校正锁
│   ├── asr_service.py       # 智谱 glm-asr 语音转写
│   ├── tts_service.py       # 小米 MiMo TTS 合成
│   ├── database.py          # SQLite CRUD（4 张表）
│   ├── schemas.py           # Pydantic 数据模型
│   ├── requirements.txt
│   └── .env                 # 环境变量配置
├── frontend/                # Next.js 前端应用
│   └── src/
│       ├── middleware.ts    # 路由守卫（/chat 查 c_token，/admin 查 b_token）
│       ├── app/             # App Router 页面（login / admin-login / chat / admin）
│       ├── components/ui/   # Shadcn UI 组件库
│       └── lib/             # apiFetch / scenario-context / use-toast
├── PDRs/                    # 产品需求与技术规范
└── README.md
```

数据库表（启动自动建表，迁移用 `ALTER TABLE ... ADD COLUMN` + try/except）：
`users` / `user_profiles` / `chat_messages` / `risk_events`

## 后端 API

### 认证
- `POST /api/auth/c-login` — C端登录（字段 `account` / `password` / `scenario`）
- `POST /api/auth/c-register` — C端注册
- `POST /api/auth/c-logout` — C端退出
- `POST /api/auth/b-login` — B端管理员登录（字段 `worker_id` / `password`）
- `POST /api/auth/b-register` — B端注册（需邀请码）
- `POST /api/auth/b-logout` — B端退出
- `GET  /api/auth/me` — 当前登录用户信息

### 对话 / 语音
- `POST /api/chat/stream` — 非流式对话（要求 LLM 输出严格 JSON：reply + risk_assessment）
- `POST /api/chat/stream-sse` — SSE 流式对话（不要求 JSON，事后关键词兜底算风险）
- `POST /api/asr/transcribe` — 音频转文字
- `POST /api/tts` — 文本转语音（未配 MIMO_API_KEY 时返回 502，前端回退）
- `GET  /api/chat/history` / `DELETE /api/chat/history` — 历史查询/清除

### 管理大屏
- `GET  /api/admin/alerts` — 风险事件列表
- `GET  /api/admin/stats` — 概览统计
- `GET  /api/admin/users` — 用户列表
- `GET  /api/admin/users/{user_id}/activity` — 用户活动
- `GET  /api/admin/users/{user_id}/interventions` — 干预记录
- `GET  /api/admin/risk-trend` — 风险趋势
- `GET  /api/admin/risk-tags` — 风险标签分布
- `POST /api/admin/alerts/{event_id}/handle` — 标记事件已处理（持久化闭环）

### 工具 / 运维
- `GET /api/weather` — 实时天气
- `GET /api/exam-countdown` — 考试倒计时
- `GET /api/scenario/context` — 场景聚合上下文
- `GET /` / `GET /health` — 服务状态 / 健康检查

### dev_override（仅 `APP_ENV != prod`）
对话请求可带 `dev_override`，跳过 LLM 直接返回预设剧本，演示稳定不受网络影响：
- `normal` — 正常对话
- `yellow_alert` — 黄色预警（失眠、焦虑等）
- `red_alert` — 红色预警（轻生倾向等）

## 风险评估等级

| 等级 | 分数范围 | 说明 |
|------|----------|------|
| green | 0-30 | 情绪平稳 |
| yellow | 31-70 | 轻度困扰，需关注 |
| red | 71-100 | 严重危机，需立即干预 |

`_force_threshold_lock` 强制按分数区间修正 level，防止 LLM 误判 level 与 score 不一致。

## 启动方式

### 后端（端口 8001）
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8001 --host 0.0.0.0
```

### 前端（端口 3000，自动绑定 0.0.0.0）
```bash
cd frontend
npm install
npm run dev
```

前端自动连接 `http://<同hostname>:8001`，可用 `frontend/.env.local` 的 `NEXT_PUBLIC_API_BASE` 覆盖。

## 演示账号

非 prod 环境启动时自动 seed。

| 角色 | 账号 | 密码 | 说明 |
|------|------|------|------|
| 高校学生 (C端) | `001` | `123456` | role=student |
| 社区居民 (C端) | `002@qq.com` | `123456` | role=social |
| 高校管理员 (B端) | `G001` | `123456` | admin_type=G（保定学院） |
| 社区管理员 (B端) | `C001` | `123456` | admin_type=C |

## 环境变量 (`backend/.env`)

```env
# 对话走 DeepSeek（OpenAI 兼容）
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=                 # 留空则对话走关键词兜底
LLM_MODEL=deepseek-v4-pro

# 智谱（ASR 用）
ZHIPU_API_KEY=
ZHIPU_MODEL=glm-4.7          # 对话兜底/旧路径用

# 小米 MiMo TTS（社区端朗读）
MIMO_API_KEY=               # 留空时 /api/tts 返回 502，前端回退 Web Speech
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_TTS_MODEL=mimo-v2.5-tts

# 业务 / 安全
APP_ENV=dev                 # dev | prod（prod 禁用 dev_override，强制强密钥）
JWT_SECRET=                 # prod 必须 ≥32 位
EXAM_DATE=2026-12-20
WEATHER_CITY=Baoding
ALLOWED_ORIGINS=http://localhost:3000
```

## 开发注意事项

1. **无测试套件、无后端 lint**；前端 `npm run lint`（eslint-config-next）可用，现存若干预存告警/报错（未转义引号等），与功能无关。
2. **CORS 三级策略**：`ALLOWED_ORIGINS` 精确匹配 → `ALLOW_ANY_ORIGIN=1` 全放 → 默认正则匹配任意 host。
3. **数据库** `backend/intelligent_ark.db` 启动自动创建并 seed 演示账号。
4. **LLM 兜底**：无 API Key 或调用异常时按场景 + 关键词返回预设剧本，演示不中断。
5. **跨 Tab 预警**：C端产生 yellow/red 时写 `localStorage.latest_ark_alert`，B端 admin 监听 `StorageEvent` 实时弹卡，无需 WebSocket。
6. **路演触发预警**：`/chat` 页面 3 秒内连续点击 AI 头像 3 次打开 Dev Panel。

## 验证记录（2026-06-05）

跑通校对：后端 8001 启动正常，`GET /`、`GET /health` 返回正常；C端 `001` / B端 `G001` 登录成功；`POST /api/chat/stream` 带 `dev_override=yellow_alert` 返回 reply + 风险评估（level=yellow, score=65）；前端 lint 可运行（含预存告警）。
