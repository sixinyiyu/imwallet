# imwallet 本地开发环境指南

## 架构概览

```
imwallet/
├── apps/
│   ├── server/              # Express + Prisma + PostgreSQL 后端
│   │   ├── .env             # ← 本地开发配置（连接本地PG，已配好）
│   │   ├── .env.production  # 生产环境模板（部署时填真实值）
│   │   ├── .env.example     # 配置项说明文档
│   │   └── src/
│   ├── mobile/              # Expo React Native 前端
│   │   ├── .env             # ← 本地开发配置（API→localhost:3000）
│   │   ├── .env.production  # 生产配置（API→远程服务器）
│   │   └── src/
│   │       └── services/api.ts  # URL优先级: .env > app.json > 硬编码
├── scripts/
│   └── local.ps1            # ← 一键启动/停止脚本
├── .pids/                   # 运行时PID记录（自动生成，gitignore）
└── package.json             # npm workspace + local 命令
```

---

## 环境配置原理

### 配置切换机制

Mobile 前端 `api.ts` 的 API URL 读取优先级：

```
1. process.env.EXPO_PUBLIC_API_URL   ← 来自 .env 文件（Expo SDK 49+ 自动注入）
2. Constants.expoConfig?.extra?.apiBaseUrl  ← 来自 app.json（打包时 fallback）
3. 硬编码 "https://imwallet.dpdns.org/api/v1"  ← 最终兜底
```

**本地开发**：只要 `apps/mobile/.env` 存在，Mobile 自动连接 `localhost:3000`，无需改 `app.json`，无需手动切换。

**生产部署**：EAS Build 时 `.env.production` 或环境变量覆盖，`app.json` 中的 URL 作为打包 fallback。

Server 后端：`dotenv` 自动加载 `apps/server/.env`，本地开发配置已写好。

---

## 前置条件

| 依赖 | 版本要求 | 验证命令 |
|------|---------|---------|
| Node.js | ≥ 18 | `node --version` |
| PostgreSQL | 16 或 18 | `Get-Service postgresql*` → Status=Running |
| PowerShell 7 (pwsh) | ≥ 7 | `pwsh --version` |
| npm | ≥ 9 | `npm --version` |

---

## 首次搭建

### 1. PostgreSQL 初始化

本地 PostgreSQL 需要创建 `imwallet` 数据库和用户：

```powershell
# 替换为你的 postgres 超级用户密码
$env:PGPASSWORD="你的postgres密码"

# 创建用户（赋予 CREATEDB 权限，Prisma shadow DB 需要）
& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -c `
  "CREATE USER imwallet WITH PASSWORD 'imwallet_dev' CREATEDB;"

# 创建数据库
& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -c `
  "CREATE DATABASE imwallet OWNER imwallet;"

# 授权
& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d imwallet -c `
  "GRANT ALL ON SCHEMA public TO imwallet;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO imwallet;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO imwallet;"

# 验证连接
$env:PGPASSWORD="imwallet_dev"
& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U imwallet -h 127.0.0.1 -p 5432 -d imwallet -c "SELECT 1;"
# 应输出: 1
```

### 2. 项目初始化

```powershell
cd D:\QAX_Fabric_workspace\imwallet

# 安装依赖
npm install

# 生成 Prisma Client
npm run db:generate

# 推送 schema 到数据库
npm run db:push

# 确认配置文件存在
#   apps/server/.env    ← 已有，内容: DATABASE_URL=postgresql://imwallet:imwallet_dev@127.0.0.1:5432/imwallet
#   apps/mobile/.env    ← 已有，内容: EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

---

## 快速命令

### 一键启动（推荐方式）

```powershell
npm run local
```

等价于 `.\scripts\local.ps1 start`，启动 Server + Mobile Web。

启动后浏览器访问 **http://localhost:8081**

### 全部命令一览

| npm 命令 | 作用 | 脚本参数 |
|----------|------|---------|
| `npm run local` | 启动全部 | `start` |
| `npm run local:server` | 仅启动 Server | `server` |
| `npm run local:mobile` | 仅启动 Mobile Web | `mobile` |
| `npm run local:stop` | 停止全部 | `stop` |
| `npm run local:status` | 查看运行状态 | `status` |

也可直接调用脚本：

```powershell
.\scripts\local.ps1           # 默认 = start
.\scripts\local.ps1 start     # 启动全部
.\scripts\local.ps1 server    # 仅 Server
.\scripts\local.ps1 mobile    # 仅 Mobile
.\scripts\local.ps1 stop      # 停止全部
.\scripts\local.ps1 status    # 查看状态
```

### 查看状态输出示例

```
  ╔══════════════════════════════╗
  ║   imwallet 本地开发环境      ║
  ╚══════════════════════════════╝

  🚀 启动 Server (http://localhost:3000) ...
  ✅ Server 已就绪 (PID=12345)
  📱 启动 Mobile Web (http://localhost:8081) ...
  ✅ Mobile Web 已就绪 (PID=12346)

  🎉 本地环境已启动！浏览器访问 http://localhost:8081
```

`npm run local:status` 输出：

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

---

## 手动操作（不用脚本）

```powershell
# 启动 Server
cd apps/server
npm run dev
# → http://localhost:3000

# 启动 Mobile（另一个终端）
cd apps/mobile
npm run start
# → http://localhost:8081
```

停止：`Ctrl+C` 或关闭终端窗口。

---

## 数据库操作

| npm 命令 | 作用 | 说明 |
|----------|------|------|
| `npm run db:generate` | 生成 Prisma Client | 修改 schema 后必须执行 |
| `npm run db:push` | 推送 schema 到数据库 | 开发用，不创建迁移文件 |
| `npm run db:migrate` | 创建正式迁移 | 生产部署用 |
| `npm run db:seed` | 运行种子数据 | 初始化管理员等 |

**⚠️ 重要**：`db:generate` 在 Server 运行时可能因 DLL 文件锁失败。需要先停止 Server：

```powershell
npm run local:stop        # 先停止
npm run db:generate       # 再生成
npm run local             # 再启动
```

---

## 测试

```powershell
# Server 单元测试
npm run test:server

# Server 测试 watch 模式
cd apps/server && npm run test:watch
```

---

## 端口一览

| 服务 | 端口 | URL |
|------|------|------|
| PostgreSQL | 5432 | `127.0.0.1:5432` |
| Server API | 3000 | `http://localhost:3000` |
| Mobile Web (Metro) | 8081 | `http://localhost:8081` |

Server 健康检查：`curl http://localhost:3000/health` → `{"status":"ok"}`

---

## 配置文件详情

### apps/server/.env（本地开发，已配好）

```ini
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://imwallet:imwallet_dev@127.0.0.1:5432/imwallet
JWT_SECRET=dev_jwt_secret_change_in_production
JWT_EXPIRES_IN=7d
SEED_PASSWORD=seed_password_dev
FEE_RATE=0.005
FEE_MODE=DEDUCTED
```

### apps/mobile/.env（本地开发，已配好）

```ini
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

### apps/mobile/.env.production（生产部署）

```ini
EXPO_PUBLIC_API_URL=https://imwallet.dpdns.org/api/v1
```

---

## Git 提交规则

| 文件 | 是否提交 | 原因 |
|------|---------|------|
| `apps/server/.env` | ❌ 不提交 | 含开发密钥 |
| `apps/server/.env.production` | ✅ 提交 | 只有占位符 |
| `apps/server/.env.example` | ✅ 提交 | 配置说明 |
| `apps/mobile/.env` | ❌ 不提交 | 本地配置 |
| `apps/mobile/.env.production` | ❌ 不提交 | 含生产URL |
| `apps/mobile/app.json` | ✅ 提交 | 含生产 fallback URL |
| `scripts/local.ps1` | ✅ 提交 | 启动脚本 |
| `.pids/` | ❌ 不提交 | 运行时临时文件 |

`.gitignore` 已配置忽略 `.env`、`.env.*`、`.pids/`。

---

## 常见问题

### Mobile 请求发到了远程服务器

**原因**：`apps/mobile/.env` 缺失或内容错误。

**解决**：

```powershell
# 确认文件存在
cat apps/mobile/.env
# 应输出: EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1

# 如果缺失，重新创建
echo "EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1" > apps/mobile/.env

# 重启 Mobile
npm run local:stop
npm run local:mobile
```

### 端口被占用 / 启动失败

```powershell
npm run local:stop    # 脚本会自动按端口杀残留进程
npm run local         # 再启动
```

### Prisma generate 报 EPERM

Server 进程锁住了 DLL 文件：

```powershell
npm run local:stop     # 停止 Server
npm run db:generate    # 生成
npm run local          # 重启
```

### 数据库连接失败

```powershell
# 1. 确认 PG 运行
Get-Service postgresql*

# 2. 测试连接
$env:PGPASSWORD="imwallet_dev"
& "D:\Program Files\PostgreSQL\18\bin\psql.exe" -U imwallet -h 127.0.0.1 -p 5432 -d imwallet -c "SELECT 1;"

# 3. 检查 .env
cat apps/server/.env   # DATABASE_URL 应指向 127.0.0.1:5432
```

### 如何临时切换到生产 API 测试

```powershell
# 删除或清空 mobile .env（fallback 到 app.json 中的生产 URL）
Remove-Item apps/mobile/.env

# 重启 Mobile
npm run local:stop
npm run local:mobile
```

恢复本地：

```powershell
echo "EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1" > apps/mobile/.env
npm run local:stop
npm run local:mobile
```
