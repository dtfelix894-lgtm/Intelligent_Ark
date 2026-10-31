# 高校版上线操作说明

本轮只修复已有登录、聊天、历史、预警与跟进流程和运行配置，不增加业务功能。项目不是 Java 应用，不能生成 WAR：交付物是 Python 后端源码和 requirements.txt、Next.js 源码和 lockfile；在 Linux 服务器安装依赖并构建 .next。不要上传 Windows node_modules、虚拟环境、开发 .env 或演示数据库。

## 平台和软件

| 项目 | 官方入口 | 用法 |
| --- | --- | --- |
| 云服务器 | https://www.aliyun.com/product/ecs | 创建 Linux 服务器、获取公网 IP、配置安全组 |
| 域名 | https://wanwang.aliyun.com/domain/ | 注册域名、完成实名与续费设置 |
| DNS | https://help.aliyun.com/zh/dns/pubz-add-website-parsing | 为 campus 子域名添加 A 记录，值为服务器公网 IPv4 |
| 宝塔 | https://docs.bt.cn/getting-started/quick-installation-of-bt-panel | 在服务器 SSH 终端使用官网当前安装步骤 |
| 宝塔运行环境 | https://docs.bt.cn/getting-started/install-basic-environment | 软件商店安装 Nginx、Python/Node 运行环境或进程管理插件 |
| Python | https://www.python.org/downloads/ | 使用 Python 3.12 系列，与开发环境一致 |
| Node.js | https://nodejs.org/en/download | 使用受支持的 LTS，构建和运行保持同一版本 |

本地使用 Windows Terminal 的 ssh/scp 即可连接和上传。生产需 PostgreSQL（本机或托管）；不必安装 Tomcat 或 JDK。

## 顺序

1. 准备 Linux 主机；小规模单校试用可先按 2 核 4 GB 估算，Next 构建内存与真实并发需实测。该估算不是容量承诺。
2. 安全组开放网站 80/443；SSH 与宝塔管理端口只允许管理来源。后端与 Next 只监听回环地址。
3. 安装宝塔和 Nginx；通过面板 Python/Node 管理工具选择运行时。不要同时由面板和 systemd 重复启动同一服务。
4. 上传源码到 /www/wwwroot/intelligent-ark；PostgreSQL 独立安装或使用托管实例，在 backend.env 中配置 `DATABASE_URL`。
5. 配置后端环境变量，参考同目录的 backend.env.example。JWT_SECRET 使用 python -c "import secrets; print(secrets.token_hex(32))" 生成，密钥只写服务器。填写现有模型账户实际支持的 LLM_MODEL；没有密钥时只能验证关键词兜底，不能称为真实模型已验收。

在服务器项目目录执行：

```bash
cd /www/wwwroot/intelligent-ark/backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
# 在宝塔进程管理中设置上述环境变量、工作目录与以下命令
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8001 --workers 1
```

前端在独立终端/面板任务构建：

```bash
cd /www/wwwroot/intelligent-ark/frontend
npm ci
npm run lint
npm run build
npm run start -- -H 127.0.0.1 -p 3000
```

NEXT_PUBLIC_API_BASE 保持未设置，浏览器默认请求同源 /api。next.config.js 为本地开发提供转发；后端不是 8001 时在构建/开发启动前设置 API_UPSTREAM。正式站点由 Nginx 直接转发 /api，保持原路径，proxy_pass 末尾不能加会吞掉 /api 的斜杠。

6. 宝塔新建域名站点，配置 nginx.locations.conf 中两个 location；不要让网站根目录指向包含 .env 或数据库的后端目录。配置检查成功再 reload。
7. 域名 DNS 添加 campus 的 A 记录指向公网 IP；用 nslookup 验证。中国内地服务器绑定域名前按服务商要求完成 ICP 备案，依据上方阿里云 DNS 官方说明；备案由账户主体办理。
8. DNS 生效、80 验证路径可访问后，在宝塔网站 SSL 页面申请证书，确认签发后启用 HTTPS 跳转，启用并检查自动续期。不能仅在前端改成 https 就认为证书已配置。
9. 为两个进程设置自动重启/开机启动，重启服务与服务器各验证一次。生产保持 SEED_DEMO_USERS=0（数据库默认不注入任何账号，学生自行在 /login 注册）。初始管理员可通过现有 b-register 接口和临时 ADMIN_INVITE_CODE 创建 G 工号账号，随后清空邀请码并重启；不在浏览器或仓库暴露邀请码。
10. 手机蜂窝网络访问 https://campus.example.com/login，电脑访问同域名 /admin-login。独立账号登录，发送测试消息，最多约 10 秒观察预警；标记跟进、刷新确认持久化；退出后必须回到登录页且重新登录可用。

## 数据库与发布回退

应用仅支持 PostgreSQL（`DATABASE_URL`）。单校部署仍是一个后端实例连一个库；备份使用 `pg_dump` 或托管快照，备份文件单独存放并限制访问。更新源码时不覆盖 `DATABASE_URL` 与服务器密钥；保留上一个代码发布目录，失败时切回代码和依赖并重启。

## 验证与当前边界

backend/test_release.py 在 `TEST_DATABASE_URL` 或 `DATABASE_URL` 指向的 Postgres 上清空表后验证登录、风险消息落库等。运行：cd backend 后 python -m unittest test_release。请使用独立测试库，避免污染生产数据。

上线验收还需要在实际域名上核对证书、网络防火墙、模型账户、备份恢复。当前权限是单校角色模型，不具备多高校租户隔离；不要作为多校共享 SaaS 发布。现有风险判定为纯关键词匹配（红：自杀/轻生/不想活/结束生命/自残；黄：失眠/睡不着/焦虑/崩溃/压力很大/抑郁/绝望），不含关键词的委婉危机表达会被判为绿色，上线前需评估是否可接受；SSE 当前是生成完整回复后按 12 字符分段发送；本轮不扩展算法或业务能力。


## 数据库（PostgreSQL）

- 必填 `DATABASE_URL=postgresql://ark_app:…@127.0.0.1:5432/intelligent_ark`（Vercel 集成可改用 `POSTGRES_URL`）。
- `pip install -r requirements.txt`（含 `psycopg[binary,pool]`）；启动时 `init_db()` 加载 `backend/sql/pg_schema_v1.sql`。
- 时间策略：PG 存 `TIMESTAMPTZ` UTC；API 对外仍输出 Asia/Taipei 墙钟字符串。
- Vercel：`vercel.json` 将 `/api` 路由到 FastAPI 服务；设置集成 Postgres 环境变量与 `JWT_SECRET` 等密钥。

