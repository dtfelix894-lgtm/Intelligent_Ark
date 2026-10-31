# 智伴方舟 (Intelligent Ark)

高校心理陪伴与风险预警平台 — 单校试用目标，本地功能验收版

当前迭代入口：[交付构想与开发测试规范](PDRs/Delivery_Playbook.md)。后续开发以该文档的验收矩阵、阶段任务和最新验证记录为准；下文保留现有运行说明。

---

## 项目简介

**智伴方舟**是一款面向高校的生成式 AI 心理关怀与风险预警平台，提供学生 C 端陪伴和教师/辅导员 B 端干预闭环。

| 端 | 用户 |
|------|---------|
| **学生端** | 面临学业/就业压力的大学生 |
| **高校工作端** | 辅导员、心理中心老师（G 类管理员） |

---

## 项目结构

```
Intelligent_Ark/
├── backend/
│   ├── main.py             # FastAPI 路由总入口
│   ├── llm_service.py      # 完整模型回复、SSE 分段、规则风险判定与兜底
│   ├── asr_service.py      # 智谱 GLM-ASR-2512 语音转写
│   ├── tts_service.py      # 小米 MiMo 语音合成（需配置 MIMO_API_KEY）
│   ├── auth.py             # JWT 鉴权（签发/验证/角色守卫）
│   ├── database.py         # PostgreSQL CRUD（users/chat_messages/risk_events）
│   ├── db.py               # 连接池与 SQL 方言适配
│   ├── schemas.py          # 对话与风险 Pydantic Schema（登录注册模型在 main.py）
│   ├── requirements.txt
│   ├── test_release.py     # 上线前回归测试（需 TEST_DATABASE_URL）
│   └── .env                # 环境变量配置
│
├── frontend/
│   ├── .env.local              # 前端环境变量（默认留空即走同源 /api）
│   └── src/
│       ├── middleware.ts            # Next.js 路由守卫（/chat、/admin 鉴权跳转）
│       ├── app/
│       │   ├── page.tsx            # 首页/落地页
│       │   ├── login/              # C端登录/注册（单页切换）
│       │   ├── admin-login/        # G类高校管理员登录（无注册入口）
│       │   ├── chat/               # 高校学生聊天主页
│       │   │   ├── _components/    # 当前使用：校园侧栏、对话、自助与释放工具
│       │   │   └── components/     # 含仍被引用的 EmotionShredder，不能整目录清理
│       │   ├── admin/              # B端管理大屏
│       │   │   └── _components/    # 概览卡、预警卡、页头
│       │   └── actions/            # Next.js Server Actions
│       ├── components/             # UserSettings 等应用级组件
│       ├── components/ui/          # Shadcn UI 组件库
│       ├── lib/                    # api / scenario-context / use-toast
│       └── types/                  # TypeScript 类型定义
│
├── deploy/                 # 上线操作说明、Nginx 片段、后端环境变量样例
└── PDRs/
    ├── PRD.md              # 产品需求文档
    ├── Tech_Spec.md        # 技术架构与 API 概览（字段约束查 /docs）
    └── UI_Spec.md          # UI 设计与组件规范
```

---

## 快速启动

### 1. 后端

```bash
cd backend
pip install -r requirements.txt
# 编辑 .env：LLM_API_KEY 优先，留空时仍会回退 ZHIPU_API_KEY
# 只有两者均未配置才按无密钥路径兜底；调用异常也会兜底
# ASR 需额外填 ZHIPU_API_KEY；TTS 需额外填 MIMO_API_KEY
uvicorn main:app --reload --port 8001 --host 127.0.0.1
```

### 2. 前端

```bash
cd frontend
npm ci
npm run dev
# 开发服务器：http://localhost:3000
```

### 3. 浏览器入口

| 页面 | 地址 | 说明 |
|------|------|------|
| 首页 | http://localhost:3000 | 导航入口 |
| C端聊天 | http://localhost:3000/chat | 需先登录 |
| C端登录 | http://localhost:3000/login | 学号 + 密码，可切换到注册 |
| B端大屏 | http://localhost:3000/admin | 需管理员登录 |
| B端登录 | http://localhost:3000/admin-login | G 类工号 + 密码 |

---

## 账号：注册与初始化

**数据库初始为空，不预置任何账号。**

**学生账号**：打开 `/login`，点切换按钮进入注册模式，填写学号、密码（至少 6 位），学校和学籍号为可选。注册成功后自动登录并跳转 `/chat`。

**管理员账号**：`/admin-login` 页面**没有注册入口**，只能直接调用后端接口。步骤：

1. 在 `backend/.env` 写入 `ADMIN_INVITE_CODE=<自定义邀请码>`，重启后端。
2. 调用注册接口：

```bash
curl -X POST http://127.0.0.1:8001/api/auth/b-register \
  -H "Content-Type: application/json" \
  -d '{"worker_id":"G001","password":"你的密码","admin_type":"G","school_name":"你的学校","invite_code":"自定义邀请码"}'
```

`worker_id` 必须匹配 `G` + 三位数字。未配置 `ADMIN_INVITE_CODE` 时该接口恒返回 403「管理员注册已关闭」。

**演示数据（可选）**：需要现成的演示账号时，在 `backend/.env` 写入 `SEED_DEMO_USERS=1` 并重启后端，启动钩子会注入学生 `001 / 123456` 与管理员 `G001 / 123456`。不设该变量时这些账号不存在。

---

## 演示与验收路径

当前页面没有路演调试面板。日常预警由后端规则判定；开发环境仍保留下述调试接口。

**准备**：按上文创建学生账号和管理员账号，用两个浏览器窗口分别登录 `/chat` 和 `/admin`。

**触发红码预警：**

1. 仅在隔离测试账号中使用 [风险规则样例](PDRs/Risk_Rule_Acceptance.md)，例如明确风险句“我不想活了”；不能把任意含关键词的否定或教学讨论都当作红色。
2. 规则产生红色等级；离线兜底使用安全支持话术，真实模型收到风险约束提示词，但并非所有模型回复都会被强制替换。消息气泡显示风险信息。
3. `/admin` 默认每 3 秒轮询预警和统计，可在设置中改为 10/30 秒；预警在聊天接口完成保存后由下一次轮询显示，非 WebSocket 实时推送。
4. 点击卡片上的 **「标记已跟进」**，前端调用 `POST /api/admin/alerts/{id}/handle`（`action=follow_up`）落库，卡片从待处理列表移除。

**不依赖模型的降级演示**：`APP_ENV != prod` 时，`/api/chat/stream` 与 `/api/chat/stream-sse` 接受 `dev_override` 参数（`yellow_alert` / `red_alert`），跳过 LLM 直接返回预设剧本。该参数没有 UI 入口，需要用 curl 或浏览器控制台直接调接口。

**风险判定的边界**：有限中文关键词规则，带完整否定句、有限教学/虚构引用排除；LLM 不负责打分。完整规则见 `backend/llm_service.py`，35 条合成样例见 [验收说明](PDRs/Risk_Rule_Acceptance.md)。绿色仅表示本条未命中，不代表确认安全；不宣称医学准确率。正常对话仍保存聊天历史，只是不进入预警池。当前仅支持单校实例，未实现多校数据隔离。

---

## 核心技术亮点

| 特性 | 实现方式 |
|------|----------|
| **三级 CORS 策略** | `ALLOWED_ORIGINS` 精确匹配 → `ALLOW_ANY_ORIGIN=1` 全放开（强制关闭 credentials）→ 默认正则匹配任意 host；`prod` 只允许第一种，且禁止 `ALLOW_ANY_ORIGIN` |
| **双路径对话** | 当前页面使用 JSON `/api/chat/stream`；保留 SSE 接口，完整生成后每 12 字符分段，不是供应商逐 token 流 |
| **关键词风险判定** | `llm_service._risk()` 直接产出 level 与 score，与 LLM 调用解耦，不受模型输出波动影响 |
| **预警跟进闭环** | 黄/红事件落 `risk_events`，工作端轮询预警池并标记跟进，处置状态持久化 |
| **LLM 兜底** | 无 API Key 或调用异常时，按关键词返回高校心理预设剧本，演示不中断 |
| **语音转写** | 高校聊天区通过 Web Audio API 采集 PCM、浏览器封装 WAV，接入智谱 GLM-ASR-2512，识别结果回填输入框确认后发送 |
| **鉴权基础** | JWT HS256 + bcrypt + 双端 HttpOnly Cookie，prod 要求至少 32 字符密钥；不等于完成生产安全审计 |
| **前端路由守卫** | Next.js middleware 统一拦截 `/chat`、`/admin` 未登录访问，自动重定向 |

---

## 环境变量（`backend/.env`）

```env
# ── 对话模型（OpenAI 兼容接口）─────────────────────────────
LLM_API_KEY=                          # 留空回退 ZHIPU_API_KEY；两者均空才无密钥兜底
LLM_BASE_URL=https://api.deepseek.com  # 默认 https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=                            # 填实际供应商支持的模型；空时回退 ZHIPU_MODEL，再回退 glm-5.3-flash
LLM_TIMEOUT=60                         # 单次模型调用超时秒数

# ── 语音转写（智谱 GLM-ASR-2512，可选）────────────────────
ZHIPU_API_KEY=                         # 留空则不启用 ASR
ZHIPU_ASR_MODEL=glm-asr-2512
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_MODEL=                          # 仅作为 LLM_MODEL 的兜底；默认值不保证当前账户有调用权限

# ── 语音合成（小米 MiMo，可选）─────────────────────────────
MIMO_API_KEY=                          # 留空则 /api/tts 恒返回 502
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_TTS_MODEL=mimo-v2.5-tts
MIMO_TTS_VOICE=茉莉

# ── 业务配置 ───────────────────────────────────────────────
CHAT_HISTORY_WINDOW=10                 # API 取历史上限；模型层还截取最近 10 条
DAILY_QUOTE_API_URL=https://v1.hitokoto.cn/  # 每日治愈语来源；失败时自动使用本地安全文案

# ── 账号与数据 ─────────────────────────────────────────────
ADMIN_INVITE_CODE=                     # 管理员注册邀请码，留空则注册接口返回 403
SEED_DEMO_USERS=0                      # 设为 1 时启动注入演示账号 001 / G001
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/intelligent_ark
# Vercel 可改用集成提供的 POSTGRES_URL；测试可用 TEST_DATABASE_URL 指向独立库

# ── 安全配置 ───────────────────────────────────────────────
APP_ENV=dev                            # dev | prod（prod 禁用 dev_override，Cookie 加 secure）
# JWT_SECRET=替换为随机强密钥            # prod 必填至少 32 字符；不要使用空值
JWT_EXPIRE_HOURS=168                   # JWT 过期时间（默认 7 天）

# ── 部署与运维（可选）──────────────────────────────────────
ALLOWED_ORIGINS=                       # 逗号分隔；prod 下为唯一允许的来源
ALLOW_ANY_ORIGIN=                      # 设为 1 放开所有来源（prod 禁止）
LOG_LEVEL=INFO                         # DEBUG / INFO / WARNING / ERROR
ASR_TIMEOUT=30                         # 语音转写超时秒数
ASR_MAX_BYTES=26214400                 # 本项目默认单次上传大小上限；供应商限制上线前另行核对
```

改完 `.env` 必须手动重启后端，`--reload` 不监听 `.env`。

天气和倒计时已从当前学生页面移除。后端兼容接口仍读取 `WEATHER_CITY`、`WEATHER_CITY_COORDS`、`EXAM_DATE`，日常页面不需要配置它们；本轮不删除兼容代码。LLM 的密钥、地址、模型必须属于同一供应商：只配 ASR 的 `ZHIPU_API_KEY` 也可能触发对话模型回退调用，不要据此假设聊天完全离线。

智谱接入参考：[GLM-ASR-2512 模型说明](https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-asr-2512)、[语音转文本 API](https://docs.bigmodel.cn/api-reference/模型-api/语音转文本)、[API 定价](https://docs.bigmodel.cn/cn/guide/start/pricing)。浏览器麦克风在非 localhost 环境下要求 HTTPS。

#### 前端环境变量（`frontend/.env.local`）

```env
# 默认不配置：前端通过同源 /api 访问后端，由 Next.js 或 Nginx 转发。
# 只有前后端确实使用不同域名时才设置 NEXT_PUBLIC_API_BASE。
API_UPSTREAM=http://127.0.0.1:8001
# API_UPSTREAM 在开发启动/生产构建前配置，不加 /api 后缀。
```

---

## API 概览

| 分类 | 端点 | 说明 |
|------|------|------|
| 认证 | `POST /api/auth/c-login` | C端登录 |
| 认证 | `POST /api/auth/c-register` | C端注册 |
| 认证 | `POST /api/auth/c-logout` | C端退出登录 |
| 认证 | `POST /api/auth/b-login` | B端管理员登录 |
| 认证 | `POST /api/auth/b-register` | B端管理员注册（需邀请码） |
| 认证 | `POST /api/auth/b-logout` | B端退出登录 |
| 认证 | `GET /api/auth/me` | 兼容通用身份接口；双端页面不使用它 |
| 认证 | `GET /api/auth/c-me`、`GET /api/auth/b-me` | 学生/管理员分别获取对应身份 |
| 对话 | `POST /api/chat/stream` | 非流式对话 |
| 对话 | `POST /api/chat/stream-sse` | SSE 流式对话 |
| 语音 | `POST /api/asr/transcribe` | 音频转文字（需 ZHIPU_API_KEY） |
| 语音 | `POST /api/tts` | 文字转语音（需 MIMO_API_KEY，否则 502） |
| 历史 | `GET /api/chat/history` | 对话历史查询（limit 1-200） |
| 历史 | `DELETE /api/chat/history` | 保留接口，当前聊天页无入口；本阶段不执行删除 |
| 管理 | `GET /api/admin/alerts` | 风险事件列表（limit 1-500） |
| 管理 | `POST /api/admin/alerts/{event_id}/handle` | 标记事件已跟进 |
| 管理 | `GET /api/admin/stats` | 账号数与预警数统计 |
| 管理 | `GET /api/admin/users` | 学生列表 |
| 管理 | `GET /api/admin/users/{user_id}/activity` | 单个学生活动记录 |
| 管理 | `GET /api/admin/users/{user_id}/interventions` | 单个学生干预记录 |
| 管理 | `GET /api/admin/risk-trend` | 风险趋势 |
| 管理 | `GET /api/admin/risk-tags` | 风险标签分布 |
| 工具 | `GET /api/weather` | 兼容天气接口，当前页面不调用 |
| 工具 | `GET /api/exam-countdown` | 兼容倒计时接口，当前页面不调用 |
| 工具 | `GET /api/scenario/context` | 当前侧栏治愈语、来源及求助资源，不含天气/倒计时 |
| 运维 | `GET /` | 服务状态 |
| 运维 | `GET /health` | 健康检查 |

接口语义见 [Tech_Spec.md](PDRs/Tech_Spec.md)，字段级定义以运行中后端 `/docs`、`/openapi.json` 和 `main.py` 为准。

## 本地验收与发布边界

在根目录运行 `python scripts/verify_project.py`（测试依赖见 `scripts/requirements-test.txt`）。入口使用临时数据库、随机本机端口和 `.next-verify`；保留报告、截图及失败日志，仅停止自己启动的服务，不操作业务库。日常 dev 与 build 共用 `.next`，不能同时运行。

截至 S3-05，本地通过 14 项后端测试（含 35 条风险表达样例）、168 组时间边界和浏览器核心/故障恢复检查。模型使用离线兜底，ASR/治愈语供应商为替身；这不代表真实模型、真实手机麦克风、公网 HTTPS 或多校隔离已通过。最新阶段与证据始终见 [Delivery_Playbook](PDRs/Delivery_Playbook.md)。

---

## 上线部署

见 [deploy/README.md](deploy/README.md)（阿里云 ECS + 宝塔 + Nginx + HTTPS 的操作顺序与验收清单）。

---

## 文档

- [PRD.md](PDRs/PRD.md) — 产品需求文档（角色体系、功能模块、数据流转）
- [Tech_Spec.md](PDRs/Tech_Spec.md) — 技术架构与 API 概览
- [UI_Spec.md](PDRs/UI_Spec.md) — UI 设计与组件规范
