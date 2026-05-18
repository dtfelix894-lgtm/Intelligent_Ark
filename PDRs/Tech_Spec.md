# 智伴方舟 — 技术架构与 API 接口规范文档 (Tech_Spec)

> **文档版本:** v3.0（基于已实现版本逆向整理）
> **最后更新:** 2026-04

---

## 1. 技术栈

| 层次 | 技术 | 说明 |
|------|------|------|
| **前端** | Next.js 14+ (App Router) + React + TypeScript | SSR + CSR 混合渲染 |
| **UI库** | TailwindCSS + Shadcn UI | 原子化样式，统一组件系统 |
| **图表** | Recharts | B端折线图、饼图 |
| **后端** | Python 3.10+ + FastAPI + Uvicorn | 异步 ASGI 框架 |
| **数据库** | SQLite (WAL 模式) + bcrypt | 轻量持久化，bcrypt 密码哈希 |
| **鉴权** | JWT (HS256) + HttpOnly Cookie | C端用 Bearer Token，B端用 Cookie |
| **AI 对话** | 智谱 GLM-4 / glm-4.7（JSON Object 模式） | 非流式 + SSE 流式双路径 |
| **AI 语音** | 智谱 glm-asr（OpenAI 兼容格式） | WAV/MP3 音频转写 |
| **HTTP 客户端** | httpx（异步） | 后端调用智谱 API |
| **数据验证** | Pydantic v2 | 请求/响应 Schema |
| **跨端同步** | localStorage + StorageEvent | C端写 → B端监听，零延迟跨 Tab |

---

## 2. 项目目录结构

```
Intelligent_Ark/
├── backend/
│   ├── main.py             # FastAPI 路由总入口（所有 API 端点）
│   ├── llm_service.py      # 智谱 GLM 调用、场景 Prompt、流式生成、兜底逻辑
│   ├── asr_service.py      # 智谱 glm-asr 语音转写服务
│   ├── auth.py             # JWT 签发/验证、角色依赖（require_admin/require_user）
│   ├── database.py         # SQLite 建表/CRUD（users/chat_messages/risk_events）
│   ├── schemas.py          # Pydantic Schema（ChatRequest/ChatResponse/RiskAssessment）
│   ├── requirements.txt    # 依赖（fastapi,uvicorn,zhipuai,pydantic,bcrypt,pyjwt,httpx,pytz）
│   ├── .env                # 环境变量（见下方环境变量说明）
│   └── intelligent_ark.db  # SQLite 数据库文件（运行时自动创建）
│
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx            # 首页/落地页
        │   ├── login/              # C端登录/注册页
        │   │   ├── page.tsx
        │   │   └── components/
        │   │       ├── LoginForm.tsx
        │   │       └── RegisterForm.tsx
        │   ├── admin-login/        # B端管理员登录/注册页
        │   │   ├── page.tsx
        │   │   └── components/
        │   │       ├── AdminLoginForm.tsx
        │   │       ├── AdminRegisterForm.tsx
        │   │       └── SliderCaptcha.tsx  # 滑块验证码
        │   ├── chat/               # C端聊天主页
        │   │   ├── page.tsx        # 主逻辑（2400+ 行）
        │   │   └── components/
        │   │       ├── LeftPanel.tsx       # 场景侧边栏（天气/倒计时/提示）
        │   │       ├── RightPanel.tsx      # 右侧资源面板
        │   │       ├── CampusWidgets.tsx   # 高校专属挂件
        │   │       └── CommunityWidgets.tsx # 社区专属挂件
        │   ├── admin/              # B端管理大屏
        │   │   ├── page.tsx
        │   │   └── layout.tsx
        │   └── actions/            # Next.js Server Actions（如退出登录）
        ├── components/ui/          # Shadcn UI 组件库
        ├── lib/
        │   ├── api.ts              # apiFetch 封装（自动带 Token）
        │   ├── scenario-context.tsx # 全局场景状态（university/community）
        │   └── use-toast.ts
        └── types/                  # TypeScript 类型定义（ChatMessage/AlertCard 等）
```

---

## 3. 环境变量（backend/.env）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `ZHIPU_API_KEY` | — | 智谱 API Key（必填，否则走关键词兜底） |
| `ZHIPU_MODEL` | `glm-4-flash` | 对话模型 ID（实际运行可配置为 glm-4.7） |
| `ZHIPU_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | 智谱 API Base URL |
| `ZHIPU_TIMEOUT` | `60` | 单次请求超时秒数 |
| `ZHIPU_TEMPERATURE` | `0.7` | 模型生成温度 |
| `ZHIPU_ASR_MODEL` | `glm-asr` | 语音转写模型 |
| `APP_ENV` | `dev` | 环境标识（`dev`/`prod`），prod 时禁用 dev_override |
| `JWT_SECRET` | `dev-insecure-secret-...` | JWT 签名密钥（prod 必须配置 ≥32位强密钥） |
| `JWT_EXPIRE_HOURS` | `168` | Token 有效期（小时），默认 7 天 |
| `EXAM_DATE` | `2026-12-20` | 考研倒计时目标日期 |
| `WEATHER_CITY` | `Baoding` | 天气查询城市（映射至经纬度） |
| `WEATHER_CITY_COORDS` | — | 扩展城市坐标（格式：`City:lat,lon;...`） |
| `COMMUNITY_HOTLINE` | `12345` | 社区服务热线 |
| `ALLOWED_ORIGINS` | — | 精确允许的 CORS 来源（逗号分隔） |
| `ALLOW_ANY_ORIGIN` | — | `1` 时放开所有来源（不带 credentials） |
| `ADMIN_INVITE_CODE` | — | 管理员注册邀请码（未配置则注册入口关闭） |
| `SEED_DEMO_USERS` | — | `1` 时强制在 prod 环境也初始化演示账号 |
| `CHAT_HISTORY_WINDOW` | `10` | 每次对话携带的历史消息条数上限 |
| `LOG_LEVEL` | `INFO` | 日志级别 |

---

## 4. 数据库 Schema

### users

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `account` | TEXT UNIQUE | 学号/邮箱/工号 |
| `password_hash` | TEXT | bcrypt 哈希 |
| `role` | TEXT | `student` / `social` / `admin` |
| `created_at` | TEXT | 创建时间 |

### user_profiles

| 字段 | 类型 | 说明 |
|------|------|------|
| `user_id` | INTEGER FK | 关联 users.id |
| `school` | TEXT | 学校名称（学生） |
| `student_id` | TEXT | 学号 |
| `education` | TEXT | 学历 |
| `qq_email` | TEXT | QQ 邮箱（社区用户） |
| `admin_type` | TEXT | `G`（高校）/ `C`（社区），仅 admin |
| `school_name` | TEXT | 学校名称（高校管理员） |

### chat_messages

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增 |
| `user_id` | INTEGER FK | 关联 users.id |
| `scenario` | TEXT | `university` / `community` |
| `role` | TEXT | `user` / `assistant` |
| `content` | TEXT | 消息内容 |
| `created_at` | TEXT | 时间戳 |

### risk_events

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增 |
| `user_id` | INTEGER FK | 关联 users.id |
| `scenario` | TEXT | `university` / `community` |
| `level` | TEXT | `yellow` / `red`（green 不落库） |
| `score` | INTEGER | 风险评分 0-100 |
| `tags` | TEXT | JSON Array 序列化 |
| `summary` | TEXT | AI 生成的脱敏摘要 |
| `handled` | INTEGER | 0=未处理，1=已处理 |
| `created_at` | TEXT | 时间戳 |

---

## 5. 完整 API 端点

### 5.1 认证接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/auth/c-login` | 无 | C端登录，返回 JWT Token + Cookie |
| POST | `/api/auth/c-register` | 无 | C端注册（student/social） |
| POST | `/api/auth/c-logout` | 无 | 清除 c_token Cookie |
| GET | `/api/auth/me` | Bearer | 获取当前登录用户信息 |
| POST | `/api/auth/b-login` | 无 | B端管理员登录，返回 admin_type/role/school_name |
| POST | `/api/auth/b-register` | 无 | B端注册（需邀请码，工号格式 G/C + 3位数字） |
| POST | `/api/auth/b-logout` | 无 | 清除 b_token Cookie |

**C端登录 Request：**
```json
{ "account": "001", "password": "123456" }
```

**C端登录 Response：**
```json
{ "success": true, "role": "student", "user_id": 1, "token": "<jwt>", "message": "登录成功" }
```

**B端登录 Response：**
```json
{
  "success": true, "token": "<jwt>", "user_id": 2,
  "admin_type": "G", "role": "university",
  "school_name": "保定学院", "message": "登录成功"
}
```

---

### 5.2 对话接口

**ChatRequest Schema（前后端共用）：**
```typescript
interface ChatRequest {
  user_id: string;                                    // 实际由 token 覆盖，前端可传任意值
  message: string;                                    // 用户输入文本
  scenario: "university" | "community";               // 场景
  dev_override?: "normal" | "yellow_alert" | "red_alert"; // 路演专用，prod 环境禁用
}
```

**ChatResponse Schema：**
```json
{
  "reply": "AI 的温暖回复，100字内",
  "risk_assessment": {
    "level": "green | yellow | red",
    "score": 42,
    "tags": ["关键词1", "关键词2"],
    "summary_for_admin": "【AI脱敏摘要】..."
  }
}
```

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/chat/stream` | Bearer (C端用户) | 非流式对话，一次性返回完整 JSON |
| POST | `/api/chat/stream-sse` | Bearer (C端用户) | SSE 流式对话，逐 token 推送 |
| GET | `/api/chat/history` | Bearer | 查询对话历史，参数：`scenario`/`limit` |
| DELETE | `/api/chat/history` | Bearer | 清空对话历史，参数：`scenario`（可选） |

**SSE 事件格式：**
```
data: {"type":"delta","content":"抱"}
data: {"type":"delta","content":"抱你"}
data: {"type":"done","reply":"完整回复","risk_assessment":{...}}
```

---

### 5.3 语音识别接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/asr/transcribe` | Bearer | 音频文件（WAV）上传转写，返回 `{"text":"..."}` |

- Content-Type：`multipart/form-data`，字段名 `file`
- 支持格式：WAV（前端以 Web Audio API 采集 PCM 后封包）
- 大小限制：默认 10MB（`ASR_MAX_BYTES` 控制）
- 底层调用：智谱 `glm-asr`，OpenAI 兼容接口 `/audio/transcriptions`

---

### 5.4 管理端接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/admin/alerts` | Bearer (admin) | 查询风险事件列表，参数：`level`/`scenario`/`limit` |
| POST | `/api/admin/alerts/{id}/handle` | Bearer (admin) | 将指定风险事件标记为已处理 |

**风险事件列表 Response：**
```json
{
  "items": [
    {
      "id": 1, "user_id": 3, "account": "001",
      "scenario": "university", "level": "red", "score": 95,
      "tags": ["轻生念头", "极度绝望"], "summary": "【AI脱敏摘要】...",
      "handled": false, "created_at": "2026-04-22T14:30:00"
    }
  ],
  "total": 1
}
```

---

### 5.5 工具接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/weather` | 无 | 获取天气（温度/天气描述/城市），调用 open-meteo.com |
| GET | `/api/exam-countdown` | 无 | 获取考研倒计时天数 `{"days_remaining": 241}` |
| GET | `/api/scenario/context` | 无 | 聚合接口，参数 `scenario`，一次返回天气+倒计时/日程+励志语/提示+热线 |

**`/api/scenario/context?scenario=university` Response：**
```json
{
  "scenario": "university",
  "weather": {"temperature": 22.5, "weather": "晴朗", "city": "Baoding"},
  "exam_countdown": 241,
  "daily_quote": "允许一切发生。此刻的你，已经足够优秀了。",
  "hotlines": [
    {"label": "24h 心理援助热线", "phone": "400-161-9995"},
    {"label": "北京心理危机干预", "phone": "010-82951332"}
  ]
}
```

---

## 6. LLM 服务架构

### 6.1 双路径（非流式 vs 流式）

| 路径 | 接口 | 模型参数 | 风险评估时机 |
|------|------|----------|-------------|
| 非流式 | `/api/chat/stream` | `response_format={"type":"json_object"}` | LLM 直接返回 JSON，含 risk_assessment |
| 流式 SSE | `/api/chat/stream-sse` | 普通 stream 模式（不强制 JSON） | 流结束后，基于用户消息关键词兜底计算 |

### 6.2 System Prompt 结构

```
[基础 Prompt]
- 角色定义：温暖心理陪伴助手
- 输出格式要求：JSON Object（reply + risk_assessment）
- 风险等级说明（green/yellow/red + 分数阈值）

[场景差异化 Prompt（二选一追加）]
- university：知心学姐人设，关注学业就业人际，紧急联系 400-161-9995
- community：社区小暖人设，关注健康服药跌倒，句子短，用"您/爷爷/奶奶"
```

### 6.3 分数校正机制（_force_threshold_lock）

防止 LLM 文字评级与数值评分不一致：
- score ≤ 30 → 强制 level=green
- score 31-70 → 强制 level=yellow
- score ≥ 71 → 强制 level=red

### 6.4 兜底策略（_build_fallback）

无 API Key 或 LLM 异常时，按关键词匹配返回预设剧本（场景感知）：
- 命中红码词（不想活/轻生/自杀/绝望…） → RED_ALERT_SCENE
- 命中黄码词（失眠/睡不着/焦虑/压力大…，社区版另有跌倒/头晕等） → YELLOW_ALERT_SCENE
- 无命中 → 当前时间段问候语（绿码）

### 6.5 In-flight 请求去重

5秒内相同 (user_id + scenario + message) 的并发请求共享同一个 asyncio.Task，防止双击重复消耗 Token。

---

## 7. CORS 策略

三级优先级，无需硬编码 IP：

1. `ALLOWED_ORIGINS` 环境变量（逗号分隔精确匹配）
2. `ALLOW_ANY_ORIGIN=1` → 放开 `*`（此时 credentials 被强制关闭）
3. 默认：正则匹配 `^https?://([a-zA-Z0-9\-._]+|\[[0-9a-fA-F:]+\])(:\d+)?$`，兼容所有 host/IP

---

## 8. 启动方式

### 后端
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8001 --host 0.0.0.0
```

### 前端
```bash
cd frontend
npm install
npm run dev        # 开发：http://localhost:3000
npm run build && npm start  # 生产
```

> **注意：** 实际运行端口为 **8001**（非文档旧版本的 8000）。
