# 智伴方舟 (Intelligent Ark) - 项目指南

## 项目概述

智伴方舟是一个心理陪伴 AI 服务系统，提供两种服务模式：
- **高校情绪治理模式**：为面临学业、就业压力的大学生提供心理陪伴
- **社区康养守护模式**：为独居老人提供健康监护和陪伴服务

## 技术栈

- **后端**：Python + FastAPI + SQLite
- **前端**：Next.js (React + TypeScript)
- **AI 服务**：智谱 GLM-4 API

## 项目结构

```
Intelligent_Ark/
├── backend/                 # FastAPI 后端服务
│   ├── main.py             # 主应用入口，定义所有 API 路由
│   ├── llm_service.py       # LLM 调用服务（智谱 API）
│   ├── schemas.py           # Pydantic 数据模型
│   ├── database.py          # SQLite 数据库操作
│   └── .env                 # 环境变量配置
├── frontend/                # Next.js 前端应用
│   ├── app/                 # App Router 页面
│   ├── components/          # React 组件
│   └── package.json         # 依赖配置
└── README.md
```

## 后端 API

### 认证接口
- `POST /api/auth/c-login` - C端用户登录
- `POST /api/auth/c-register` - C端用户注册
- `POST /api/auth/b-login` - B端管理员登录

### 核心接口
- `POST /api/chat/stream` - 对话接口，支持 dev_override 参数：
  - `normal` - 正常对话
  - `yellow_alert` - 黄色预警（失眠、焦虑等）
  - `red_alert` - 红色预警（轻生念头等）

### 工具接口
- `GET /api/weather` - 获取天气信息
- `GET /api/exam-countdown` - 考试倒计时

## 风险评估等级

| 等级 | 分数范围 | 说明 |
|------|----------|------|
| green | 0-30 | 情绪平稳 |
| yellow | 31-70 | 轻度困扰，需关注 |
| red | 71-100 | 严重危机，需立即干预 |

## 启动方式

### 后端
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000 --host 0.0.0.0
```

### 前端
```bash
cd frontend
npm install
npm run dev
```

## 环境变量 (.env)

```env
ZHIPU_API_KEY=your_api_key    # 智谱 API Key
ZHIPU_MODEL=glm-4-flash      # 使用的模型
EXAM_DATE=2026-12-20         # 考试日期
WEATHER_CITY=Baoding         # 天气查询城市
```

## 开发注意事项

1. **CORS 配置**：已允许 localhost:3000、127.0.0.1:3000、局域网 IP（如 10.234.17.68:3000），如需新增 IP 直接加到 `allow_origins` 列表中即可
2. **数据库**：使用 SQLite，初始化时会自动创建表和演示账号
3. **演示账号**：
   - 学生账号：学号 `20210001`，密码 `password123`
   - 管理员账号：工号 `admin001`，密码 `admin123`
4. **LLM 兜底**：无 API Key 时，系统会根据关键词返回预设剧本
