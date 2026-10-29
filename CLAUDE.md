# 智伴方舟开发说明

智伴方舟是高校心理陪伴与风险预警系统，包含学生端和高校工作端。AI 人设为“知心学姐/知心学长”可选，产品场景固定为 `university`。领域词汇以根目录 `GLOSSARY.md` 与 `docs/adr/` 为准。

## 启动

```bash
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8001 --host 0.0.0.0
cd frontend && npm install && npm run dev
```

数据库初始为空，不预置任何账号。需要演示数据时在 `backend/.env` 写 `SEED_DEMO_USERS=1` 并重启后端，启动钩子才会注入学生 `001 / 123456` 与高校管理员 `G001 / 123456`；不设该变量时这些账号不存在，登录返回 401。

管理员注册接口始终保留，但前端没有注册入口，只能直接调 API：先在 `.env` 配 `ADMIN_INVITE_CODE`（不配则 `POST /api/auth/b-register` 恒返回 403），`worker_id` 需匹配 `^G\d{3}$`。学生端 `/login` 自带登录/注册切换，不受影响。

## 技术架构

- 后端：Python 3.12、FastAPI、SQLite WAL、JWT HS256、bcrypt。
- 前端：Next.js 15 App Router、React 18、TypeScript、Tailwind、Shadcn UI。
- AI：对话走 OpenAI 兼容的 `LLM_*`；未配置密钥时使用高校心理关键词兜底。ASR 走智谱 `ZHIPU_*`；TTS 端点为小米 MiMo `MIMO_*`（未配置时 `/api/tts` 恒 502），前端未接入。
- 数据表：`users`、`user_profiles`、`chat_messages`、`risk_events`。时间口径：所有 `created_at`/`handled_at` 以北京时间墙钟时间存储（`datetime('now','+8 hours')`），趋势统计按北京时间自然日，不依赖服务器时区。

所有业务路由均由 `backend/main.py` 定义，`auth.py` 负责身份和高校角色守卫，`database.py` 负责持久化。`/api/chat/stream` 返回完整 JSON，是前端唯一使用的对话端点；`/api/chat/stream-sse`（SSE 增量）及 `/api/admin/risk-trend`、`/api/admin/risk-tags`、`/api/admin/users`、`/api/tts` 等后端已实现但前端未接入，属预留能力，不宣称交付。风险等级 green/yellow/red 由 `llm_service._risk()` 纯关键词判定（分值随命中标签数浮动：红 `92+3n` 封顶 98、黄 `60+5n` 封顶 80、绿恒 10），LLM 只负责回复文本，并在工作端形成跟进闭环。

`.env` 的加载依赖导入顺序：`load_dotenv()` 只在 `llm_service.py` / `asr_service.py` / `tts_service.py` 内调用，`main.py`、`auth.py`、`database.py` 自身不调用。目前靠 `main.py` 先 import `llm_service` 才让 `ADMIN_INVITE_CODE`、`APP_ENV` 读到 `.env`，调整 `main.py` 顶部 import 顺序可能使这些常量静默回落为默认值。改完 `.env` 需手动重启后端，`--reload` 不监听 `.env`。

## Agent skills

### Issue tracker

Issues are tracked locally as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the repo root and `docs/adr/`. See `docs/agents/domain.md`.

## 开发验证

```bash
python -m py_compile backend/main.py backend/auth.py backend/database.py backend/schemas.py
cd frontend && npm run lint
```

`npm run build` 与 `npm run dev` 共用 `frontend/.next`：dev server 运行期间跑 build 会让页面请求返回 500（`Cannot find module './591.js'`）。需要 build 时先停 dev，跑完再重新 `npm run dev`。
