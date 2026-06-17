# imwallet 本地开发环境指南

## 架构概览

```
imwallet/
├── apps/
│   ├── server/          # Express + Prisma + PostgreSQL 后端
│   │   ├── .env         # ← 本地开发配置（已配置好，连接本地PG）
│   │   ├── .env.production  # 生产环境模板（部署时填写真实值）
│   │   └── src/
│   ├── mobile/          # Expo React Native 前端
│   │   ├── .env         # ← 本地开发配置（API指向localhost:3000）
│   │   ├── .env.production  # 生产环境配置（API指向远程服务器）
│   │   └── src/
├── scripts/
│   └── local.ps1        # ← 一键启动/停止脚本
├── .pids/               # 运行时PID记录（自动生成，已加入gitignore）
└── package.json         # npm workspace + local命令
```

## 环境配置原理

### 环境切换机制

| 服务 | 本地开发 | 生产部署 | 切换方式 |
|------|---------|---------|---------|
| **Server** | 读 `apps/server/.env` | 读 `apps/server/.env.production` 或环境变量 | dotenv 自动加载 `.env` |
| **Mobile API URL** | `EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1` | `EXPO_PUBLIC_API_URL=https://imwallet.dpdns.org/api/v1` | Expo SDK 49+ 自动注入 `process.env.EXPO_PUBLIC_*` |

Mobile 的 `api.ts` URL 优先级：
1. `process.env.EXPO_PUBLIC_API_URL` ← 来自 `.env` 文件（本地开发自动生效）
2. `Constants.expoConfig?.extra?.apiBaseUrl` ← 来自 `app.json`（打包时 fallback）
3. 硬编码 `https://imwallet.dpdns.org/api/v1` ← 最终兜底

**本地开发时**：只要 `apps/mobile/.env` 存在且包含 `EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1`，Mobile 就自动连接本地 Server，无需改 `app.json`，无需重启 Expo。

---

## 前置条件

| 依赖 | 版本 | 验证命令 |
|------|------|---------|
| Node.js | ≥ 18 | `node --version` |
| PostgreSQL | 16/18 | `Get-Service postgresql*` 确认 Running |
| PowerShell 7 | ≥ 7 | `pwsh --version` |

### PostgreSQL 配置

本地 PostgreSQL 需要创建 `imwallet` 数据库和用户：

```powershell
# 用超级用户执行（替换为你的postgres密码）
$env:PGPASSWORD="你的postgres密码"

& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -c `
  "CREATE USER imwallet WITH PASSWORD 'imwallet_dev' CREATEDB;"

& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -c `
  "CREATE DATABASE imwallet OWNER imwallet;"

& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d imwallet -c `
  "GRANT ALL ON SCHEMA public TO imwallet;"
```

### 首次初始化

```powershell
# 1. 安装依赖
npm install

# 2. 生成 Prisma Client + 推送 schema
npm run db:generate
npm run db:push

# 3. 确认 .env 文件存在
#    apps/server/.env  ← 已有，连接本地PG
#    apps/mobile/.env  ← 已有，API指向localhost
```

---

## 快速命令

### 一键启动（推荐）

```powershell
# 启动全部服务（Server + Mobile Web）
npm run local

# 等价于
.\scripts\local.ps1
.\scripts\local.ps1 start
```

启动后浏览器访问 **http://localhost:8081**

### 单独启动

```powershell
# 仅启动 Server（http://localhost:3000）
npm run local:server

# 仅启动 Mobile Web（http://localhost:8081）
npm run local:mobile
```

### 停止服务

```powershell
# 停止全部
npm run local:stop
```

### 查看状态

```powershell
# 查看各服务运行状态 + 配置信息
npm run local:status
```

输出示例：
```
  imwallet 本地环境状态
  ─────────────────────
  Server:  ✅ 运行中  PID=12345  http://localhost:3000
  Mobile:  ✅ 运行中  PID=12346  http://localhost:8081
  DB:      ✅ PostgreSQL 运行中

  配置文件:
    Server .env:  ✅ 存在
    Mobile .env:  ✅ 存在
    API URL:      http://localhost:3000/api/v1
```

### scripts/local.ps1 全部参数

| 参数 | 作用 | 等价 npm 命令 |
|------|------|---------------|
| `start` (默认) | 启动 Server + Mobile | `npm run local` |
| `server` | 仅启动 Server | `npm run local:server` |
| `mobile` | 仅启动 Mobile | `npm run local:mobile` |
| `stop` | 停止全部 | `npm run local:stop` |
| `status` | 查看运行状态 | `npm run local:status` |

---

## 手动操作（不用脚本）

如果不想用脚本，也可以手动启动：

```powershell
# 启动 Server（在 apps/server 目录）
cd apps/server
npm run dev
# Server 运行在 http://localhost:3000

# 启动 Mobile（在 apps/mobile 目录）
cd apps/mobile
npm run start
# Mobile Web 运行在 http://localhost:8081
```

手动停止：关闭对应终端窗口，或 `Ctrl+C`

---

## 数据库操作

```powershell
# 生成 Prisma Client（修改 schema 后必须执行）
npm run db:generate

# 推送 schema 变更到数据库（开发环境用，不创建迁移文件）
npm run db:push

# 创建正式迁移（生产部署用）
npm run db:migrate

# 运行种子数据
npm run db:seed
```

**注意**：`db:push` 和 `db:generate` 在 Server 运行时可能因文件锁失败。需要先停止 Server 再执行，或用 `npm run local:stop` 停止后再操作。

---

## 测试

```powershell
# Server 单元测试
npm run test:server

# Server 测试（watch模式）
cd apps/server && npm run test:watch
```

---

## 端口一览

| 服务 | 端口 | URL |
|------|------|------|
| PostgreSQL | 5432 | `127.0.0.1:5432` |
| Server API | 3000 | `http://localhost:3000` |
| Mobile Web (Metro) | 8081 | `http://localhost:8081` |

---

## 常见问题

### Q: Mobile 页面请求发到了远程服务器而不是本地？

检查 `apps/mobile/.env` 是否存在且内容正确：
```
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```
如果 `.env` 缺失，Mobile 会 fallback 到 `app.json` 中的生产 URL。重新创建 `.env` 后需要重启 Expo（`npm run local:stop` 再 `npm run local:mobile`）。

### Q: 端口被占用 / 启动失败？

```powershell
# 先停止所有服务
npm run local:stop

# 如果仍有残留进程，手动清理
.\scripts\local.ps1 stop   # 脚本会自动按端口杀进程

# 再重新启动
npm run local
```

### Q: Prisma generate 报 EPERM 错误？

这是因为 Server 进程锁住了 `query_engine-windows.dll.node`。解决方法：
```powershell
npm run local:stop          # 先停止 Server
npm run db:generate         # 再生成
npm run local               # 再启动
```

### Q: 如何切换到生产环境测试？

Mobile 端：删除或清空 `apps/mobile/.env`，重启 Expo，即 fallback 到 `app.json` 中的生产 URL。

Server 端：生产部署使用 `.env.production` 或直接设置环境变量，本地开发不需要切换。

### Q: 数据库连接失败？

1. 确认 PostgreSQL 服务运行：`Get-Service postgresql*`
2. 确认 `imwallet` 用户和数据库存在
3. 检查 `apps/server/.env` 中 `DATABASE_URL` 是否正确
4. 测试连接：
```powershell
$env:PGPASSWORD="imwallet_dev"
& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U imwallet -h 127.0.0.1 -p 5432 -d imwallet -c "SELECT 1;"
```

---

## 文件清单

| 文件 | 用途 | 是否提交 Git |
|------|------|-------------|
| `apps/server/.env` | Server 本地配置 | ❌ 不提交（含密钥） |
| `apps/server/.env.production` | Server 生产模板 | ✅ 提交（只有占位符） |
| `apps/server/.env.example` | Server 配置说明 | ✅ 提交 |
| `apps/mobile/.env` | Mobile 本地 API URL | ❌ 不提交 |
| `apps/mobile/.env.production` | Mobile 生产 API URL | ❌ 不提交 |
| `apps/mobile/app.json` | Mobile 打包配置（含生产 fallback URL） | ✅ 提交 |
| `scripts/local.ps1` | 启动/停止脚本 | ✅ 提交 |
| `.pids/` | 运行时 PID 文件 | ❌ 不提交 |
