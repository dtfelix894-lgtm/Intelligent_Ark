# DB PostgreSQL Design (v1)

> Status: draft v1 — SQLite → PostgreSQL migration prep  
> Author: Ark 数据库  
> Date: 2026-10-11 (Asia/Taipei)  
> Scope: Intelligent_Ark backend (`backend/database.py` + deploy)  
> Constraints: no commit; no delete of user data; design only

---

## 1. Current state summary (inventory)

### 1.1 Stack today

| Item | Current |
| --- | --- |
| Engine | SQLite file (`intelligent_ark.db`) |
| Driver | stdlib `sqlite3` (sync), no ORM, no Alembic |
| Access pattern | `@contextmanager get_conn()` — open per call, `commit` on exit, close |
| Pragmas | `WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `timeout=10.0` |
| Path | `DB_PATH` env, default `backend/intelligent_ark.db`; prod example `/www/ark-data/intelligent_ark.db` |
| Init | `main.py` `@app.on_event("startup")` → `init_db()` + `purge_demo_users()` |
| Deploy | Single uvicorn worker (`--workers 1`); Baota/Nginx; **explicitly SQLite-only** in `deploy/README.md` |
| Docker / compose | None found |
| Requirements | fastapi, uvicorn, bcrypt, pyjwt, … — **no** asyncpg / psycopg / SQLAlchemy |

Live local DB (2026-10-11): ~122 KB; row counts — users 11, user_profiles 11, chat_messages 20, risk_events 3, event_transitions 3, audit_logs 5, follow_up_records 0, reassessments 0.

### 1.2 Tables (effective schema)

Schema is defined in `init_db()` via `CREATE TABLE IF NOT EXISTS` plus idempotent `ALTER TABLE … ADD COLUMN` (catch `OperationalError`). There is **no** versioned migration history.

#### `users`

| Column | SQLite type | Constraints / notes |
| --- | --- | --- |
| id | INTEGER | PK, AUTOINCREMENT |
| account | TEXT | NOT NULL, UNIQUE |
| password_hash | TEXT | NOT NULL (bcrypt) |
| role | TEXT | NOT NULL DEFAULT `'student'` — `student` \| `admin` |
| is_demo | INTEGER | NOT NULL DEFAULT 0 (boolean affinity); added via ALTER |
| created_at | TEXT | NOT NULL; intended default `datetime('now','+8 hours')` |

#### `user_profiles`

| Column | SQLite type | Constraints / notes |
| --- | --- | --- |
| user_id | INTEGER | PK, FK → `users(id)` |
| school | TEXT | nullable |
| student_id | TEXT | nullable |
| education | TEXT | nullable |
| qq_email | TEXT | nullable |
| admin_type | TEXT | ALTER — `G` \| `C` (admin) |
| school_name | TEXT | ALTER |
| companion_persona | TEXT | ALTER only (not in original CREATE) |

#### `chat_messages`

| Column | SQLite type | Constraints / notes |
| --- | --- | --- |
| id | INTEGER | PK AUTOINCREMENT |
| user_id | INTEGER | NOT NULL, FK → `users(id)` |
| scenario | TEXT | NOT NULL (prod fixed `university`) |
| role | TEXT | NOT NULL — `user` \| `assistant` |
| content | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL |

**Index:** `idx_chat_messages_user ON chat_messages(user_id, created_at)`

#### `risk_events`

| Column | SQLite type | Constraints / notes |
| --- | --- | --- |
| id | INTEGER | PK AUTOINCREMENT |
| user_id | INTEGER | NOT NULL, FK → `users(id)` |
| scenario | TEXT | NOT NULL |
| level | TEXT | NOT NULL — `green` \| `yellow` \| `red` |
| score | INTEGER | NOT NULL |
| tags | TEXT | NOT NULL — JSON array string |
| summary | TEXT | NOT NULL |
| handled | INTEGER | NOT NULL DEFAULT 0 (boolean) |
| created_at | TEXT | NOT NULL |
| handled_at | TEXT | ALTER |
| handled_by | TEXT | ALTER |
| action | TEXT | ALTER |
| note | TEXT | ALTER |
| assignee | TEXT | ALTER |
| claimed_at | TEXT | ALTER |
| status | TEXT | ALTER — `pending` \| `claimed` \| `closed` (+ legacy backfill) |
| closed_at | TEXT | ALTER |
| closure_label | TEXT | ALTER |
| closure_other_person | INTEGER | ALTER, NOT NULL DEFAULT 0 |
| closure_note | TEXT | ALTER |
| claim_due_at | TEXT | ALTER |
| escalated_at | TEXT | ALTER |

**Index:** `idx_risk_events_level ON risk_events(level, created_at)`

**Bootstrap data fix in `init_db`:** UPDATE legacy rows so `handled=1` → `status=closed` (+ `legacy_unlabeled`), assignee without handled → `claimed`, else `pending`.

#### `event_transitions` (append-only)

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK AI | |
| event_id | INTEGER FK → risk_events | NOT NULL |
| from_status | TEXT | NOT NULL |
| to_status | TEXT | NOT NULL |
| actor | TEXT | NOT NULL |
| reason | TEXT | nullable |
| created_at | TEXT | NOT NULL |

#### `follow_up_records` (append-only)

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK AI | |
| event_id | INTEGER FK → risk_events | |
| type | TEXT | NOT NULL |
| occurred_at | TEXT | NOT NULL (event time, not always = created_at) |
| summary | TEXT | NOT NULL |
| referral_target | TEXT | nullable |
| actor | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL |

#### `reassessments`

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK AI | |
| event_id | INTEGER FK → risk_events | |
| due_date | TEXT | NOT NULL (date-like string) |
| completed_at | TEXT | nullable |
| result | TEXT | nullable |
| actor | TEXT | nullable |
| created_at | TEXT | NOT NULL |

#### `audit_logs` (append-only)

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER PK AI | |
| actor | TEXT | NOT NULL |
| action | TEXT | NOT NULL |
| target_type | TEXT | NOT NULL |
| target_id | TEXT | NOT NULL (stringified ids) |
| meta | TEXT | nullable JSON |
| created_at | TEXT | NOT NULL |

### 1.3 ALTER history pattern

Idempotent try/except `OperationalError` for each `ADD COLUMN`. **Implication for PG:** replace with versioned migrations (Alembic or numbered SQL). Do not port try/except ALTER loops.

### 1.4 Timezone / time handling (critical)

**Dominant hack:** wall-clock Asia/Taipei stored as **naive TEXT** via SQLite:

```sql
datetime('now','+8 hours')   -- ~32 call sites in database.py (+ defaults)
```

Python mirror:

```python
def _now_local():
    return datetime.utcnow() + timedelta(hours=8)
```

Also:

- Trend queries: `datetime.now(timezone(timedelta(hours=8))).date()` and SQL `date(datetime('now','+8 hours'))`
- Claims / escalation compare TEXT timestamps with `_parse_ts` + `_now_local`
- JWT (`auth.py`) correctly uses **UTC** (`datetime.now(timezone.utc)`) — already good; leave alone
- `main.py` some debug `ts` use `datetime.now()` (host local) — separate from DB

**Live DB quirk:** older tables still show column default `datetime('now')` (no `+8`) because `CREATE TABLE IF NOT EXISTS` never rewrote defaults; **inserts** mostly pass explicit `datetime('now','+8 hours')`. Sample values look like `YYYY-MM-DD HH:MM:SS` without offset (interpreted as CST/+8 wall time).

**Risk if migrated naively:** treating those strings as UTC, or applying `+8` again on cutover → 8-hour shift bugs in claim windows, overdue, trends, reassessment due dates.

### 1.5 Connection / open patterns

- Sync only; one connection per `with get_conn()`
- `check_same_thread=False` (SQLite-specific)
- No connection pool
- Tests (`test_contracts.py`) patch `get_conn` to in-memory SQLite; `test_release.py` uses temp `DB_PATH`
- Publish/subscribe for risk alerts is **in-process** (threading), not DB LISTEN/NOTIFY

### 1.6 Out of scope / not found

- No Alembic, no SQLAlchemy models, no `.sql` migration files
- No PostgreSQL references in code or deploy
- No Docker Compose Postgres service

---

## 2. Target PostgreSQL design

### 2.1 Design principles

1. **Store UTC, display CST/+8** — `TIMESTAMPTZ` everywhere for instants; app formats Asia/Taipei for UI.
2. **Real types** — `BOOLEAN`, `JSONB`, `DATE`, `IDENTITY` instead of SQLite affinity tricks.
3. **Keep domain model stable** — same tables/columns; thin adapter in `database.py` first (minimize API churn).
4. **Versioned DDL** — no more silent ALTER try/except.
5. **Single-school** remains; no multi-tenant schemas in v1.

### 2.2 SQLite → PostgreSQL type mapping

| SQLite | PostgreSQL | Notes |
| --- | --- | --- |
| INTEGER PK AUTOINCREMENT | `BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | Preserve ids on import with `OVERRIDING SYSTEM VALUE` / set sequence |
| INTEGER (bool 0/1) | `BOOLEAN NOT NULL DEFAULT FALSE` | `is_demo`, `handled`, `closure_other_person` |
| INTEGER (score) | `INTEGER NOT NULL` | |
| TEXT (timestamps) | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Migrate: interpret source as `Asia/Taipei` → UTC |
| TEXT (date only, `due_date`) | `DATE NOT NULL` | |
| TEXT (JSON array/object) | `JSONB NOT NULL` / `JSONB` | `tags`, `meta` |
| TEXT (enums as strings) | `TEXT` + `CHECK` (v1) or PG `ENUM` (optional later) | role, level, status, scenario |
| TEXT UNIQUE | `TEXT UNIQUE` | `users.account` |
| FK REFERENCES | same + `ON DELETE RESTRICT` (default) | Match current NO ACTION |

### 2.3 Target DDL (v1)

```sql
-- Optional: dedicated schema
-- CREATE SCHEMA IF NOT EXISTS ark;
-- SET search_path TO ark, public;

CREATE TABLE users (
    id              BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account         TEXT        NOT NULL UNIQUE,
    password_hash   TEXT        NOT NULL,
    role            TEXT        NOT NULL DEFAULT 'student'
                        CHECK (role IN ('student', 'admin')),
    is_demo         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
    user_id             BIGINT PRIMARY KEY REFERENCES users(id),
    school              TEXT,
    student_id          TEXT,
    education           TEXT,
    qq_email            TEXT,
    admin_type          TEXT CHECK (admin_type IS NULL OR admin_type IN ('G', 'C')),
    school_name         TEXT,
    companion_persona   TEXT
);

CREATE TABLE chat_messages (
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id),
    scenario    TEXT        NOT NULL,
    role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_user ON chat_messages (user_id, created_at);

CREATE TABLE risk_events (
    id                    BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id               BIGINT      NOT NULL REFERENCES users(id),
    scenario              TEXT        NOT NULL,
    level                 TEXT        NOT NULL CHECK (level IN ('green', 'yellow', 'red')),
    score                 INTEGER     NOT NULL,
    tags                  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    summary               TEXT        NOT NULL,
    handled               BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at            TIMESTAMPTZ,
    handled_by            TEXT,
    action                TEXT,
    note                  TEXT,
    assignee              TEXT,
    claimed_at            TIMESTAMPTZ,
    status                TEXT        CHECK (status IS NULL OR status IN ('pending', 'claimed', 'closed')),
    closed_at             TIMESTAMPTZ,
    closure_label         TEXT,
    closure_other_person  BOOLEAN     NOT NULL DEFAULT FALSE,
    closure_note          TEXT,
    claim_due_at          TIMESTAMPTZ,
    escalated_at          TIMESTAMPTZ
);

CREATE INDEX idx_risk_events_level ON risk_events (level, created_at);
CREATE INDEX idx_risk_events_status ON risk_events (status, created_at);
CREATE INDEX idx_risk_events_assignee ON risk_events (assignee) WHERE assignee IS NOT NULL;
CREATE INDEX idx_risk_events_user ON risk_events (user_id, created_at);

CREATE TABLE event_transitions (
    id           BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id     BIGINT      NOT NULL REFERENCES risk_events(id),
    from_status  TEXT        NOT NULL,
    to_status    TEXT        NOT NULL,
    actor        TEXT        NOT NULL,
    reason       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_transitions_event ON event_transitions (event_id, created_at);

CREATE TABLE follow_up_records (
    id               BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id         BIGINT      NOT NULL REFERENCES risk_events(id),
    type             TEXT        NOT NULL,
    occurred_at      TIMESTAMPTZ NOT NULL,
    summary          TEXT        NOT NULL,
    referral_target  TEXT,
    actor            TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_follow_up_event ON follow_up_records (event_id, created_at);

CREATE TABLE reassessments (
    id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id      BIGINT      NOT NULL REFERENCES risk_events(id),
    due_date      DATE        NOT NULL,
    completed_at  TIMESTAMPTZ,
    result        TEXT,
    actor         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reassessments_event ON reassessments (event_id, due_date);

CREATE TABLE audit_logs (
    id           BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    actor        TEXT        NOT NULL,
    action       TEXT        NOT NULL,
    target_type  TEXT        NOT NULL,
    target_id    TEXT        NOT NULL,
    meta         JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_target ON audit_logs (target_type, target_id);
```

### 2.4 Indexes / constraints (summary)

| Object | Purpose |
| --- | --- |
| PK / UNIQUE / FK | Integrity matching SQLite |
| CHECKs on role/level/status/admin_type | Catch bad writes early |
| Existing composite indexes | Preserve query plans for chat history & risk list |
| New: status, assignee, user_id on risk_events | Admin pool / claim / per-user views |
| New: FK child indexes on event_id | Transitions / follow-ups / reassessments |
| Partial index on assignee | Sparse claim workload |

### 2.5 Timezone strategy (decision)

**Recommendation: `TIMESTAMPTZ` + store UTC; display Asia/Taipei.**

| Concern | Decision |
| --- | --- |
| DB default | `DEFAULT now()` (UTC instant) |
| App writes | Prefer `datetime.now(timezone.utc)` or omit column and use DEFAULT |
| App reads for UI / “today” | Convert to `ZoneInfo("Asia/Taipei")` |
| SQL “today in Taipei” | `(now() AT TIME ZONE 'Asia/Taipei')::date` — **not** `now() + interval '8 hours'` |
| Migration of TEXT | Parse `YYYY-MM-DD HH:MM:SS` as `Asia/Taipei` naive → aware → store UTC |
| Remove | All `datetime('now','+8 hours')`, `_now_local = utcnow()+8`, and trend `timezone(timedelta(hours=8))` hacks |

**Why not keep “store +8 as naive timestamp”?**  
PG `TIMESTAMP WITHOUT TIME ZONE` + app +8 invites double-shift bugs (DST policy changes, host TZ drift, JWT already UTC). `TIMESTAMPTZ` is the standard fix and matches user locale Asia/Taipei without baking offset into stored values.

**Claim / overdue windows:** compare `timestamptz` to `now()`; schedule `claim_due_at` as UTC instant computed from configured minutes/hours.

---

## 3. Migration steps (safe order)

1. **Backup SQLite**  
   - Stop writers or use `sqlite3.Connection.backup` API (do **not** copy only the main file while WAL is hot).  
   - Keep offline copy + checksum; do not delete originals.

2. **Stand up PostgreSQL**  
   - Local/dev: install PG 16+ (or Docker later).  
   - Prod (Baota): add PostgreSQL; create role/db; restrict to localhost; strong password in env only.

3. **Apply schema**  
   - Run v1 DDL (section 2.3) in a transaction; record migration version.

4. **Data copy (offline or dual-read window)**  
   - Order: `users` → `user_profiles` → `chat_messages` → `risk_events` → children (`event_transitions`, `follow_up_records`, `reassessments`) → `audit_logs`.  
   - Cast: bool ints → boolean; JSON TEXT → jsonb (validate); timestamps → timestamptz with Asia/Taipei assumption; `due_date` → date.  
   - After load: `SELECT setval(pg_get_serial_sequence(...), (SELECT MAX(id) FROM ...))` for each IDENTITY table.

5. **App cutover**  
   - Ship code that speaks PostgreSQL (`DATABASE_URL`).  
   - Point env away from `DB_PATH`; restart single worker; smoke: login, chat, risk claim/close, audit list.  
   - Keep SQLite file read-only backup for rollback.

6. **Rollback**  
   - Revert env to `DB_PATH` + previous code artifact; restart.  
   - Only restore SQLite from backup if PG cutover wrote divergent data that must be discarded.  
   - Document that dual-write was **not** in v1 (open question).

7. **Post-cutover**  
   - Enable automated PG backups (pg_dump / base backup).  
   - Optionally raise uvicorn workers > 1 once pool is sized (SQLite forced workers=1).

---

## 4. Change & risk list

### 4.1 `main.py` / app factory / lifespan

| Change | Detail |
| --- | --- |
| Startup | Keep `init_db()` but make it “ensure schema / run migrations” against PG, not SQLite script |
| Imports | Drop `sqlite3.IntegrityError`; map to driver integrity errors or wrap in domain exception |
| Lifespan | Prefer FastAPI lifespan over deprecated `@app.on_event("startup")` when touching this area |
| Debug timestamps | Align any `datetime.now()` logging with explicit zone if compared to DB |

### 4.2 Connection string / env / config

| Change | Detail |
| --- | --- |
| New | `DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/intelligent_ark` (or discrete `PGHOST`/`PGUSER`/…) |
| Deprecate | `DB_PATH` for primary store (keep read-only import tool maybe) |
| Examples | Update `deploy/backend.env.example` — remove sole SQLite path; document PG vars |
| Secrets | DB password only on server; never commit |

### 4.3 Deploy (Baota / host / CI)

| Change | Detail |
| --- | --- |
| `deploy/README.md` | Replace “维持当前单机 SQLite / 不必安装 MySQL” with PostgreSQL install + backup guidance |
| Process | Still uvicorn; may keep `--workers 1` initially; pool size = workers × connections |
| Data dir | `/www/ark-data` for backups; PG data in PG data directory, not next to code |
| CI | No GitHub remote for this project; local `unittest` must use PG testcontainer or ephemeral local DB |
| Docker | Optional later; not required for v1 if Baota PG is chosen |

### 4.4 Drivers / data layer

| Option | Pros | Cons |
| --- | --- | --- |
| **A. `psycopg` (v3) sync** (recommended v1) | Closest to current sync `get_conn()` shape; smaller rewrite | Still blocking IO under async FastAPI routes |
| B. `asyncpg` + rewrite | Fits async FastAPI | Large rewrite of every `database.py` function |
| C. SQLAlchemy / SQLModel | Migrations + models | Heavier than current style |

**v1 recommendation:** sync `psycopg` + connection pool (`ConnectionPool`), keep function signatures; parameter style `%s` or `psycopg.sql` (replace `?`). Add `psycopg[binary]` to `requirements.txt`. Introduce Alembic (or `migrations/*.sql` runner) for DDL.

Replace SQLite-only SQL:

- `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`
- `datetime('now','+8 hours')` → `now()` or omit
- `date(datetime('now','+8 hours'), ?)` → `(now() AT TIME ZONE 'Asia/Taipei')::date + ?`
- `lastrowid` → `RETURNING id`
- Boolean comparisons `handled = 0/1` → `FALSE/TRUE`
- JSON: pass Python list/dict to JSONB

### 4.5 Top risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **Timezone double-apply** (+8 again on already-local TEXT) | High | One conversion rule: TEXT = Asia/Taipei wall → UTC; delete +8 SQL after cutover; golden tests on claim/overdue |
| **Timezone under-apply** (treat TEXT as UTC) | High | Same rule; verify sample rows against known wall times |
| Boolean / affinity mistakes | Medium | Explicit map 0/1 ↔ bool; CHECK / NOT NULL |
| AUTOINCREMENT → IDENTITY sequence drift | Medium | `setval` after import; use `OVERRIDING SYSTEM VALUE` if inserting explicit ids |
| JSON invalid in `tags`/`meta` | Medium | Validate before cast; quarantine bad rows |
| Concurrent writes / multi-worker | Medium | Pool + PG MVCC; start workers=1; tune later |
| Path / WAL assumptions in ops docs | Medium | Rewrite backup runbooks; stop file-copy DB backups |
| Test suite tied to sqlite3 | Medium | Dual backend or PG-only tests with fixture DB |
| Partial cutover (code PG, env still SQLite) | High | Fail fast if neither/ both URLs misconfigured |
| Data loss on failed cutover | High | Immutable SQLite backup; no DELETE of `.db`; rollback plan rehearsed |
| FK order / orphan rows | Low–Med | Load parents first; enable constraints after validate |
| `CREATE TABLE IF NOT EXISTS` hiding drift | Low | Versioned migrations only |

---

## 5. Open questions / decisions needed

1. **Driver:** confirm sync `psycopg` v1 vs jump to `asyncpg`.  
2. **Migration tooling:** Alembic vs hand-numbered SQL files.  
3. **Cutover mode:** offline maintenance window vs dual-write (dual-write out of v1 unless product requires zero downtime).  
4. **Enum style:** TEXT+CHECK (flexible) vs PostgreSQL ENUM (stricter, harder to alter).  
5. **Prod hosting:** Baota-managed PostgreSQL vs external managed PG (Aliyun RDS).  
6. **Whether to keep `DB_PATH` import path** as a one-shot `sqlite_to_pg` CLI in `scripts/`.  
7. **Workers:** when to allow `--workers > 1` and what pool size.  
8. **Soft-delete / retention** for chat & audit (not in current SQLite; confirm still N/A).

---

## 6. Suggested follow-on (for Ark 后端, not this doc)

- Implement `get_conn()` PG pool behind same façade.  
- Replace all `+8 hours` call sites; add timezone unit tests.  
- `scripts/migrate_sqlite_to_pg.py` (read-only source DB).  
- Update `test_contracts.py` / `test_release.py`.  
- Update `deploy/README.md` + `backend.env.example`.

---

## 7. 本机 Windows Postgres 割接（runbook）

> Ground truth（2026-10-11，用户/协调实测）  
> - PostgreSQL **17**（`psql (PostgreSQL) 17.11`）  
> - 服务名：`postgresql-x64-17` — **Running**  
> - 工具：`C:\Program Files\PostgreSQL\17\bin\psql.exe`（同目录还有 `createdb.exe`、`pg_isready.exe`、`pg_dump.exe`）  
> - SQLite 源库：`D:\PycharmProjects\Intelligent_Ark\backend\intelligent_ark.db`（约 120KB）  
> - **禁止**：删除用户数据 / `.db`、改 Postgres 全局配置、DROP 生产库、git commit/reset/stash  
> - **凭证**：下文密码均为占位符，勿编造；用安装时设定的超级用户密码或新建业务角色密码

### 7.1 工具与就绪检查

在 **PowerShell** 中：

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" --version
# 期望: psql (PostgreSQL) 17.x

& "C:\Program Files\PostgreSQL\17\bin\pg_isready.exe" -h localhost -p 5432
# 期望: localhost:5432 - accepting connections

Get-Service postgresql-x64-17
# 期望: Status = Running
```

若 `pg_isready` 失败：先确认服务 Running，再查安装时是否改过端口（默认 5432）。**不要**在未确认前改 `postgresql.conf`。

可选：把 `C:\Program Files\PostgreSQL\17\bin` 加入当前会话 `PATH`，后续可省略完整路径：

```powershell
$env:Path = "C:\Program Files\PostgreSQL\17\bin;" + $env:Path
```

### 7.2 创建角色与数据库（示例）

建议业务库名：`intelligent_ark`；应用角色：`ark_app`（最小权限）；超级用户一般为安装时的 `postgres`。

```powershell
$PGBIN = "C:\Program Files\PostgreSQL\17\bin"
# 会提示输入 postgres 超级用户密码（安装时自设；此处不写入文档）
& "$PGBIN\psql.exe" -h localhost -p 5432 -U postgres -c "SELECT version();"
```

用 SQL 一次性创建（在 `psql` 交互里执行，或 `-c` / `-f`）：

```sql
-- 以超级用户连接后执行
CREATE ROLE ark_app WITH LOGIN PASSWORD 'REPLACE_WITH_APP_PASSWORD';
CREATE DATABASE intelligent_ark OWNER ark_app
  ENCODING 'UTF8'
  LC_COLLATE 'Chinese (Simplified)_China.utf8'
  LC_CTYPE 'Chinese (Simplified)_China.utf8'
  TEMPLATE template0;

-- 若 locale 名称因 Windows 区域设置报错，可简化为：
-- CREATE DATABASE intelligent_ark OWNER ark_app ENCODING 'UTF8' TEMPLATE template0;

GRANT CONNECT ON DATABASE intelligent_ark TO ark_app;
\c intelligent_ark
GRANT USAGE, CREATE ON SCHEMA public TO ark_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ark_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ark_app;
```

等价 CLI（创建库）：

```powershell
$PGBIN = "C:\Program Files\PostgreSQL\17\bin"
$env:PGPASSWORD = "REPLACE_WITH_POSTGRES_SUPERUSER_PASSWORD"   # 仅当前会话；用完后 Remove-Item Env:PGPASSWORD
& "$PGBIN\createdb.exe" -h localhost -p 5432 -U postgres -O ark_app -E UTF8 intelligent_ark
Remove-Item Env:PGPASSWORD
```

**不要**把真实密码写进仓库或本 PDR。

### 7.3 `DATABASE_URL` / 环境变量约定

当前 `deploy/backend.env.example` 仅有：

```env
DB_PATH=/www/ark-data/intelligent_ark.db
```

割接后（应用代码改完前可先只配 env，代码仍读 SQLite）：

```env
# 新主连接（推荐）
DATABASE_URL=postgresql://ark_app:REPLACE_WITH_APP_PASSWORD@127.0.0.1:5432/intelligent_ark

# 可选拆分（若后端日后支持）
# PGHOST=127.0.0.1
# PGPORT=5432
# PGUSER=ark_app
# PGPASSWORD=REPLACE_WITH_APP_PASSWORD
# PGDATABASE=intelligent_ark

# 割接完成后：保留 DB_PATH 仅作只读备份/回滚指针，不再作为主库
# DB_PATH=D:\PycharmProjects\Intelligent_Ark\backend\intelligent_ark.db
```

本机开发 `.env`（`backend/.env`）示例片段（勿提交密钥）：

```env
APP_ENV=dev
DATABASE_URL=postgresql://ark_app:REPLACE_WITH_APP_PASSWORD@127.0.0.1:5432/intelligent_ark
```

URL 编码提醒：密码含 `@` `#` `:` 等时必须 percent-encode。

### 7.4 SQLite → Postgres：推荐路径

| 方案 | Windows 可行性 | 建议 |
| --- | --- | --- |
| **自定义 Python（sqlite3 + psycopg）** | 高（与现栈一致） | **推荐** |
| pgloader | Windows 原生支持弱（常需 Docker/WSL） | 不作为本机默认 |
| 纯 CSV + `COPY` | 可行但类型/JSON/时区易错 | 仅作兜底 |

**推荐理由：** 现库无 ORM、表少（8 张）、需把 naive `+8` TEXT → `TIMESTAMPTZ` UTC、INTEGER 0/1 → BOOLEAN、JSON TEXT → JSONB；用脚本可单点控制转换，避免 pgloader 规则难写。

#### 步骤总览（有序）

1. **备份 SQLite（必做）**  
   - 停写或接受短暂只读：复制整个文件到备份目录（若存在 `-wal`/`-shm`，先停应用或用 Python `sqlite3` backup API 打一致性副本）。  
   - 示例目标：`D:\PycharmProjects\Intelligent_Ark\_backups\intelligent_ark_YYYYMMDD_HHMM.db`  
   - **禁止删除**原 `backend\intelligent_ark.db`。

2. **在 PG 建 schema**  
   - 用超级用户或 `ark_app` 连接 `intelligent_ark`，执行本文 **§2.3 Target DDL**（含索引与 CHECK）。  
   - 可将 DDL 存为 `scripts/pg_schema_v1.sql`（由 Ark 后端落地；本 runbook 不强制已存在）。

3. **跑数据迁移脚本（待实现；契约如下）**  
   - 建议路径：`scripts/migrate_sqlite_to_pg.py`  
   - 读：`SQLITE_PATH`（默认上述 `.db`）+ `DATABASE_URL`  
   - 顺序：`users` → `user_profiles` → `chat_messages` → `risk_events` → `event_transitions` / `follow_up_records` / `reassessments` → `audit_logs`  
   - 每表：`INSERT ... OVERRIDING SYSTEM VALUE`（保留原 id）→ 结束后 `setval` 调 IDENTITY  
   - 转换规则见 §7.5  
   - 默认 **不** `TRUNCATE`；若目标表非空则失败退出（防误覆盖）。显式 `--wipe-target` 仅用于空库重跑实验。

4. **校验**（§7.6）通过后再改应用连接。

5. **应用割接**  
   - Ark 后端切换 `get_conn()` → psycopg + `DATABASE_URL`；本地 `uvicorn` 重启。  
   - 失败则：改回 `DB_PATH` + 旧代码进程（SQLite 备份未动）。

6. **回滚**  
   - 环境改回 SQLite；不要 `DROP DATABASE` 除非确认仅是空实验库。

### 7.5 时区转换（防双重 +8）

源数据语义（见 §1.4）：

- 库内 TEXT 形如 `2026-10-11 12:31:17`，表示 **Asia/Taipei 墙钟**，**不是** UTC。  
- 写入时 SQL 已用 `datetime('now','+8 hours')`（相对 SQLite UTC now 加 8），故字符串本身已是 +8 墙钟。

**正确迁移（只转换一次）：**

```text
naive_text  --parse as-->  Asia/Taipei aware  --astimezone UTC-->  timestamptz 写入 PG
```

Python 伪代码：

```python
from datetime import datetime
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")
UTC = ZoneInfo("UTC")

def wall_plus8_text_to_utc(ts: str | None):
    if not ts:
        return None
    # 常见格式: YYYY-MM-DD HH:MM:SS
    naive = datetime.strptime(ts.strip()[:19], "%Y-%m-%d %H:%M:%S")
    return naive.replace(tzinfo=TAIPEI).astimezone(UTC)

# due_date（reassessments）: 仅日期 → date 类型，不做 +8
# date_str -> datetime.strptime(date_str[:10], "%Y-%m-%d").date()
```

**禁止：**

- 再对 TEXT 做 `+ timedelta(hours=8)` 或 SQL `+ interval '8 hours'`  
- 把 TEXT 当 UTC `timestamptz '...'` 直接吸入（会整体偏 −8h）  
- 迁移后再让应用写 `datetime('now','+8 hours')` 等价逻辑（应用应改 `now()` / UTC）

布尔：`0/1` → `False/True`。  
JSON：`tags`/`meta` 用 `json.loads`，失败则记录行 id 并跳过或中止（推荐中止）。

### 7.6 验证清单

在 SQLite 与 PG 两侧分别执行（数字应对齐）：

| 检查 | SQLite | Postgres |
| --- | --- | --- |
| 行数 | `SELECT COUNT(*) FROM users` 等 8 表 | 同名表 COUNT |
| 最大 id | `MAX(id)` users/risk_events/… | 同；且 `nextval`/`setval` 后新插入不撞号 |
| 登录 | 已知账号登录 API | 同账号 bcrypt 校验仍过 |
| 连接 | — | `psql` 与应用 `DATABASE_URL` 均能连 |
| 时区抽样 | 取 1～3 条 `created_at` 墙钟 | PG：`created_at AT TIME ZONE 'Asia/Taipei'` 显示与原文一致（秒级） |
| 业务烟测 | — | 发一条聊天、黄/红预警、claim/close、audit 列表 |
| 池/进程 | — | uvicorn 能起；workers=1 先验证 |

抽查 SQL（PG）：

```sql
SELECT id, created_at,
       created_at AT TIME ZONE 'Asia/Taipei' AS local_wall
FROM users
ORDER BY id DESC
LIMIT 5;
```

`local_wall` 的 `YYYY-MM-DD HH:MM:SS` 应与 SQLite 中该行 TEXT 一致（允许亚秒差）。

行数核对示例（PowerShell + psql / python 均可）：迁移脚本结束打印两侧 COUNT 表。

### 7.7 可执行清单（给 Ark 协调 / 操作者）

1. 确认服务 `postgresql-x64-17` Running；`pg_isready` OK。  
2. 用 `postgres` 超户创建角色 `ark_app` + 库 `intelligent_ark`（密码自备）。  
3. 对 `D:\PycharmProjects\Intelligent_Ark\backend\intelligent_ark.db` 做文件或 API **备份**（不删原库）。  
4. 在 `intelligent_ark` 执行 §2.3 DDL。  
5. 运行（待 Ark 后端提供）`scripts/migrate_sqlite_to_pg.py`：SQLite → PG，按 §7.5 转时区。  
6. §7.6 行数 + 时区抽样 + 登录烟测。  
7. 配置 `DATABASE_URL`；后端切 psycopg 后重启；保留 `DB_PATH` 备份指针。  
8. 失败则回切 SQLite；成功后再谈 workers>1 / 部署文档更新。

**当前阻塞（文档级，非环境挂掉）：**

- 应用代码仍只认 SQLite（`database.py` / `DB_PATH`）；**尚不能**只改 env 就连上 PG。  
- `scripts/migrate_sqlite_to_pg.py` 与 `pg_schema_v1.sql` **尚未落地**（需 Ark 后端按本契约实现）。  
- 本机 `postgres` / `ark_app` **密码未知**（占位符；需用户在 pgAdmin 或安装记录中提供，文档不收录明文）。

---


### 7.8 已落地产物与本机用法（Windows）

| 产物 | 路径 |
| --- | --- |
| Schema DDL v1 | `backend/sql/pg_schema_v1.sql`（对齐 §2.3，`IF NOT EXISTS`） |
| 迁移脚本 | `backend/scripts/migrate_sqlite_to_pg.py` |
| 依赖 | `pip install "psycopg[binary]>=3.1"`（写入脚本 docstring；尚未改 `requirements.txt` 主依赖时可先装到 venv） |

**PowerShell 示例（密码占位，勿提交明文）：**

```powershell
cd D:\PycharmProjects\Intelligent_Ark\backend

# 1) 仅校验 SQLite 转换（无需 Postgres 密码）
python scripts/migrate_sqlite_to_pg.py --sqlite-only-check

# 2) 建库/角色（人工，用安装时的 postgres 密码；脚本不会代建）
# & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -f sql\pg_schema_v1.sql ...
# 或在创建 intelligent_ark 后：
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h 127.0.0.1 -p 5432 -U ark_app -d intelligent_ark -f sql\pg_schema_v1.sql

# 3) dry-run（需真实 DATABASE_URL；占位密码会被脚本拒绝）
$env:DATABASE_URL = "postgresql://ark_app:REPLACE_WITH_APP_PASSWORD@127.0.0.1:5432/intelligent_ark"
python scripts/migrate_sqlite_to_pg.py --dry-run --apply-schema

# 4) 正式写入
python scripts/migrate_sqlite_to_pg.py --apply-schema
```

脚本行为摘要：父→子表顺序加载；TEXT 墙钟按 Asia/Taipei **一次**转为 UTC `timestamptz`；布尔/JSONB；保留 id 后 `setval`；目标表非空则拒绝；`--dry-run` 事务末 `ROLLBACK`。


## Appendix A — Inventory file sources

- `backend/database.py` (~1770 lines): schema, ALTERs, ~32× `datetime('now','+8 hours')`, `_now_local`
- `backend/main.py`: `init_db()` on startup; `sqlite3.IntegrityError` on register
- `backend/auth.py`: JWT UTC (OK)
- `backend/test_contracts.py` / `test_release.py`: SQLite test doubles
- `deploy/README.md`, `deploy/backend.env.example`: SQLite ops（仍为 `DB_PATH`；割接后需并行增加 `DATABASE_URL`）
- Live DB: `backend/intelligent_ark.db` (inspected read-only via PRAGMA)

## Appendix B — Document location & Windows tools

- Design + runbook: `PDRs/DB_PostgreSQL_Design.md`（本节 §7 为本机 Windows 割接）
- Postgres 17 bin: `C:\Program Files\PostgreSQL\17\bin\`（`psql.exe`, `createdb.exe`, `pg_isready.exe`, `pg_dump.exe`）
- Service: `postgresql-x64-17`
- SQLite source: `D:\PycharmProjects\Intelligent_Ark\backend\intelligent_ark.db`
