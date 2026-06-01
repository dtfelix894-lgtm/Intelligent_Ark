# 智伴方舟 (Intelligent Ark)

AI 心理陪伴与风险预警平台 — 挑战杯创业竞赛演示版

---

## 项目简介

**智伴方舟**是一款融合生成式 AI 与场景感知的 B2B2C 心理关怀平台，采用"一模两用"双轨架构：

| 模式 | C端用户 | B端管理员 |
|------|---------|-----------|
| **高校情绪治理** | 面临学业/就业压力的大学生 | 辅导员、心理中心老师 |
| **社区康养守护** | 独居/空巢老年人 | 社区网格员、民政社工 |

---

## 项目结构

```
Intelligent_Ark/
├── backend/
│   ├── main.py             # FastAPI 路由总入口
│   ├── llm_service.py      # 智谱 GLM 调用、流式生成、兜底逻辑
│   ├── asr_service.py      # 智谱 glm-asr 语音转写
│   ├── auth.py             # JWT 鉴权（签发/验证/角色守卫）
│   ├── database.py         # SQLite CRUD（users/chat_messages/risk_events）
│   ├── schemas.py          # Pydantic 请求/响应 Schema
│   ├── requirements.txt
│   └── .env                # 环境变量配置
│
├── frontend/
│   ├── .env.local              # 前端环境变量（NEXT_PUBLIC_API_BASE 等）
│   └── src/
│       ├── middleware.ts            # Next.js 路由守卫（/chat、/admin 鉴权跳转）
│       ├── app/
│       │   ├── page.tsx            # 首页/落地页
│       │   ├── login/              # C端登录/注册
│       │   ├── admin-login/        # B端管理员登录/注册（含滑块验证码）
│       │   ├── chat/               # C端聊天主页（双场景）
│       │   │   └── components/     # LeftPanel / RightPanel / CampusWidgets / CommunityWidgets
│       │   ├── admin/              # B端管理大屏
│       │   └── actions/            # Next.js Server Actions
│       ├── components/ui/          # Shadcn UI 组件库
│       ├── lib/                    # apiFetch / scenario-context / use-toast
│       └── types/                  # TypeScript 类型定义
│
└── PDRs/
    ├── PRD.md              # 产品需求文档
    ├── Tech_Spec.md        # 技术架构与完整 API 规范
    └── UI_Spec.md          # UI 设计与组件规范
```

---

## 快速启动

### 1. 后端

```bash
cd backend
pip install -r requirements.txt
# 编辑 .env，至少填写 ZHIPU_API_KEY（不填则走关键词兜底模式）
uvicorn main:app --reload --port 8001 --host 0.0.0.0
```

### 2. 前端

```bash
cd frontend
npm install
npm run dev
# 开发服务器：http://localhost:3000
```

### 3. 浏览器入口

| 页面 | 地址 | 说明 |
|------|------|------|
| 首页 | http://localhost:3000 | 导航入口 |
| C端聊天 | http://localhost:3000/chat | 需先登录 |
| C端登录 | http://localhost:3000/login | 学号或QQ邮箱 |
| B端大屏 | http://localhost:3000/admin | 需管理员登录 |
| B端登录 | http://localhost:3000/admin-login | 工号/密码 |

---

## 演示账号

| 角色 | 账号 | 密码 | 说明 |
|------|------|------|------|
| 高校学生 | `001` | `123456` | C端 student |
| 社区居民 | `002@qq.com` | `123456` | C端 social |
| 高校管理员 | `G001` | `123456` | B端 admin（高校型） |
| 社区管理员 | `C001` | `123456` | B端 admin（社区型） |

---

## 路演操作指南

**准备：** 用两个浏览器 Tab 分别打开 `/chat`（已登录学生账号）和 `/admin`（已登录管理员账号）。

**触发预警演示：**

1. 在 `/chat` 页面，**连续点击顶部 AI 头像 3 次**（3秒内），底部弹出 Dev Panel
2. 点击 **「🚨 注入红码：轻生倾向」**
3. `/admin` 大屏左侧预警池顶部立即出现红色警报卡片（localStorage 跨 Tab 同步）
4. 点击该卡片，右侧操作台展示脱敏摘要与风险评分
5. 点击 **「标记安全并结案」**，调用后端 API 将事件持久化为"已处理"，完成闭环

**场景切换演示：**
- 管理员以 `G001` 登录 → 大屏展示高校模式数据（考研压力/失眠焦虑）
- 管理员以 `C001` 登录 → 大屏展示社区模式数据（长时间未活动/极度孤独）

**社区模式特色功能演示：**
- 登录 `002@qq.com` → 进入社区模式聊天
- 底部右侧点击 Mic 图标切换语音输入，按住说话后自动转写
- 左上角点击字体图标可缩放字号（适老化）

---

## 核心技术亮点

| 特性 | 实现方式 |
|------|----------|
| **三级 CORS 策略** | `ALLOWED_ORIGINS` 精确匹配 → `ALLOW_ANY_ORIGIN` 全放开 → 默认正则匹配任意 IP/域名 |
| **跨 Tab 实时预警** | `localStorage.setItem` + `StorageEvent` 监听，零延迟跨标签同步 |
| **路演稳定保障** | `dev_override` 参数跳过 LLM 调用，直接返回预设剧本，不受网络影响 |
| **双路径对话** | 非流式（`/api/chat/stream`）+ SSE 流式（`/api/chat/stream-sse`），社区老人逐字可见 |
| **语音转文字** | Web Audio API 采集 PCM → WAV 封包 → 智谱 glm-asr 识别 |
| **LLM 兜底** | 无 API Key 或异常时，关键词匹配返回场景化预设剧本，演示不中断 |
| **分数校正锁** | 防止大模型 level 与 score 不一致，强制按分数区间修正 level |
| **适老化设计** | 字号4档缩放、TTS朗读、按住说话、SOS一键求助、称呼偏好 |
| **生产级鉴权** | JWT HS256 + bcrypt 密码哈希 + HttpOnly Cookie，`prod` 环境强制强密钥 |
| **前端路由守卫** | Next.js middleware 统一拦截 `/chat`、`/admin` 未登录访问，自动重定向 |

---

## 环境变量（`backend/.env`）

```env
# 核心 AI 配置
ZHIPU_API_KEY=your_zhipu_api_key      # 智谱 API Key（留空则走关键词兜底）
ZHIPU_MODEL=glm-4-flash               # 对话模型（可改为 glm-4.7 等）
ZHIPU_ASR_MODEL=glm-asr               # 语音转写模型
ZHIPU_BASE_URL=                        # 智谱 API 基础地址（默认官方地址，一般无需修改）

# 业务配置
EXAM_DATE=2026-12-20                   # 考研/考试倒计时日期
WEATHER_CITY=Baoding                   # 天气查询城市
WEATHER_CITY_COORDS=City:lat,lon       # 自定义城市坐标（分号分隔多组，可选）
COMMUNITY_HOTLINE=12345                # 社区服务热线
CHAT_HISTORY_WINDOW=10                 # 每次对话携带的历史消息条数上限

# 安全配置
APP_ENV=dev                            # dev | prod（prod 时禁用 dev_override）
JWT_SECRET=your-secret-key             # prod 必须配置 ≥32位强密钥
JWT_EXPIRE_HOURS=168                   # JWT 过期时间（默认 7 天）
ADMIN_INVITE_CODE=your-invite-code     # 管理员注册邀请码（不配置则注册关闭）
SEED_DEMO_USERS=0                      # prod 下是否注入演示账号（1 = 注入）

# 部署配置（可选）
ALLOWED_ORIGINS=http://192.168.1.100:3000   # 精确指定允许的来源
ALLOW_ANY_ORIGIN=1                           # 或直接放开所有来源（不带 credentials）
LOG_LEVEL=INFO                               # 日志级别（DEBUG / INFO / WARNING / ERROR）
ASR_TIMEOUT=30                               # 语音转写超时秒数
ASR_MAX_BYTES=10485760                       # 单次 ASR 上传大小上限（默认 10MB）
```

#### 前端环境变量（`frontend/.env.local`）

```env
# 远程部署 / cpolar 穿透时，指向后端公网地址
# NEXT_PUBLIC_API_BASE=https://your-backend-host.example.com
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
| 认证 | `GET /api/auth/me` | 获取当前登录用户信息 |
| 对话 | `POST /api/chat/stream` | 非流式对话 |
| 对话 | `POST /api/chat/stream-sse` | SSE 流式对话 |
| 语音 | `POST /api/asr/transcribe` | 音频转文字 |
| 历史 | `GET /api/chat/history` | 对话历史查询 |
| 历史 | `DELETE /api/chat/history` | 清除对话历史 |
| 管理 | `GET /api/admin/alerts` | 风险事件列表 |
| 管理 | `POST /api/admin/alerts/{id}/handle` | 标记事件已处理 |
| 工具 | `GET /api/weather` | 实时天气 |
| 工具 | `GET /api/exam-countdown` | 考试倒计时 |
| 工具 | `GET /api/scenario/context` | 场景聚合上下文 |
| 运维 | `GET /` | 服务状态 |
| 运维 | `GET /health` | 健康检查 |

完整接口规范见 [Tech_Spec.md](PDRs/Tech_Spec.md)。

---

## 文档

- [PRD.md](PDRs/PRD.md) — 产品需求文档（角色体系、功能模块、数据流转）
- [Tech_Spec.md](PDRs/Tech_Spec.md) — 技术架构与完整 API 规范
- [UI_Spec.md](PDRs/UI_Spec.md) — UI 设计与组件规范
