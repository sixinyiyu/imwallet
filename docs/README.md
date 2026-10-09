# IMWallet 项目文档

## 项目结构

```
imwallet/
├── apps/
│   ├── mobile/          # Expo React Native 移动端
│   ├── server/          # Rust 后端 (rs-wallet)
│   └── test-device-auth/ # 设备认证集成测试工具
├── scripts/
│   ├── local.ps1        # 本地开发环境一键启动脚本
│   └── trigger-pipeline.js # CI/CD 流水线触发脚本（指定版本一键触发）
├── .github/workflows/   # GitHub Actions 流水线定义
├── Cargo.toml           # Rust workspace 根配置
├── package.json          # npm workspace 根配置
└── docker-compose.yml   # PostgreSQL 本地开发数据库
```

## 快速开始

### 前置依赖

- Node.js >= 18
- Rust stable (rustup)
- Docker（用于本地 PostgreSQL）
- Expo CLI (`npm install -g expo-cli`)

### Server 本地启动（3 步）

**只需修改 `config.toml` + 启动数据库 + 运行，无需其他手动操作。**

#### 第 1 步：修改 `apps/server/config.toml`

将 `database.url` 中的 `CHANGE_ME` 替换为本地 PostgreSQL 密码：

```toml
[database]
url = "postgresql://imwallet:imwallet_dev@localhost:5432/imwallet"
```

> 对应 `docker-compose.yml` 中默认配置：`POSTGRES_USER=imwallet`, `POSTGRES_PASSWORD=imwallet_dev`, `POSTGRES_DB=imwallet`

#### 第 2 步：启动 PostgreSQL

```bash
docker-compose up -d
```

#### 第 3 步：运行 Server

```bash
cd apps/server
cargo run
```

**启动时自动完成以下操作，无需手动干预：**

| 操作 | 说明 |
|------|------|
| RSA 密钥 | `keys/rsa_private.pem` 和 `keys/rsa_public.pem` 不存在时**自动生成** |
| 数据库迁移 | 自动执行 `migrations/V1_init.sql`（建表 + 种子数据） |
| 日志初始化 | 从 `config.toml [logging]` 读取级别 |

> `.env` 文件不是必需的。`dotenvy::dotenv()` 只是可选加载，`config.toml` 是主配置源。

#### 环境变量覆盖

`config.toml` 中的值可被环境变量覆盖，无需修改文件：

| 环境变量 | 覆盖字段 | 示例 |
|----------|----------|------|
| `DATABASE_URL` | `[database].url` | `postgresql://user:pass@host:5432/db` |
| `PORT` | `[server].port` | `3000` |
| `SERVER_PWD` | `[service].password` | `my_secret_pwd` |

### Mobile 本地启动

创建 `apps/mobile/.env`：

```
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

然后运行：

```bash
cd apps/mobile
npx expo start --clear
```

### 一键启动（PowerShell）

```bash
# 启动全部（server + mobile）
npm run local

# 仅启动 server
npm run local:server

# 仅启动 mobile
npm run local:mobile

# 停止所有服务
npm run local:stop

# 查看运行状态
npm run local:status
```

## Server 常用命令

```bash
# 编译检查
cargo check --workspace

# 构建 release
npm run build:server

# 运行测试
npm run test:server

# 代码格式检查 + clippy
npm run lint:server
```

## Mobile 常用命令

```bash
# 类型检查
cd apps/mobile && npx tsc --noEmit

# 启动 Expo
npm run dev:mobile
```

## test-device-auth 集成测试工具

设备签名认证的端到端集成测试客户端，模拟移动端的 Ed25519 签名流程。

### 功能

1. 生成 Ed25519 密钥对
2. 注册设备（POST /devices，无签名）
3. 签名请求获取设备信息（GET /devices/me）
4. 签名请求创建钱包（POST /wallets）
5. 签名请求获取设备钱包列表（GET /devices/wallets）
6. 签名请求获取钱包列表（GET /wallets）

### 运行方式

```bash
# 默认连接 localhost:3000（需先启动 server）
cargo run -p test-device-auth

# 指定 server 地址
API_URL=http://your-server:3000/api/v1 cargo run -p test-device-auth

# 或设置环境变量后运行
export API_URL=http://your-server:3000/api/v1
cargo run -p test-device-auth
```

### 前置条件

- Server 已启动并可访问
- PostgreSQL 数据库已运行
- 依赖：ureq（同步 HTTP）、ed25519-dalek（签名）、sha2（哈希）

### 签名机制

与移动端一致的 Ed25519 设备签名认证：

```
签名消息 = timestamp + method + path + body_hash
body_hash = SHA256(body_json) 或空字符串（无 body 时）
签名 = Ed25519Sign(privateKey, 签名消息)
```

请求头：
- `x-device-id`: Ed25519 公钥（hex）
- `x-signature`: Ed25519 签名（hex）
- `x-timestamp`: Unix 时间戳（秒）
- `x-nonce`: 随机防重放 nonce

## Docker 部署

```bash
# 启动 PostgreSQL
docker-compose up -d

# 停止
docker-compose down
```

## 服务端部署与升级

> 详细说明见 [`apps/server/DEPLOY.md`](../apps/server/DEPLOY.md)。以下为常用方式速查。
> 制品来自 `server-release.yml` 发布的 GitHub Release。

### 方式一：Linux 二进制 + systemd（推荐）

发布产物：`rs-wallet-<版本>-x86_64-linux-musl.tar.gz`（musl 静态链接，零动态依赖，适用于所有 x86_64 发行版）。

```bash
# 部署 / 升级到指定版本（脚本会替换二进制、保留 config.toml 与 keys）
curl -sL https://github.com/sixinyiyu/imwallet/releases/download/v0.2.10/rs-wallet-v0.2.10-x86_64-linux-musl.tar.gz | tar xz

# 首次安装
sudo bash install.sh v0.2.10
# 后续升级
sudo bash upgrade.sh v0.2.10

# 查看状态 / 日志
sudo systemctl status rs-wallet
sudo journalctl -u rs-wallet -f
```

> 迁移 SQL 已内嵌到二进制，启动时自动执行，制品包自包含，无需外部 `migrations/` 目录。
> 敏感配置（`DATABASE_URL`、`SERVER_PWD`）通过 `/opt/rs-wallet/env` 注入，切勿硬编码。

### 方式二：Windows 二进制

发布产物：`rs-wallet-<版本>-x86_64-windows.zip`。

```powershell
# 1. 下载并解压新版本
Expand-Archive rs-wallet-v0.2.10-x86_64-windows.zip -DestinationPath rs-wallet-new
# 2. 替换二进制（保留原有 config.toml 与 keys 目录）
Copy-Item rs-wallet-new\rs-wallet.exe rs-wallet\rs-wallet.exe
# 3. 重新运行
.\rs-wallet.exe
```

### 方式三：Docker 镜像

发布产物：`ghcr.io/sixinyiyu/imwallet-server:<tag>`（由 `server-docker.yml` 构建推送）。

```bash
# 部署
docker pull ghcr.io/sixinyiyu/imwallet-server:latest
docker run -d --name rs-wallet --restart unless-stopped -p 3000:3000 \
  -e DATABASE_URL=postgresql://imwallet:YOUR_PASSWORD@db-host:5432/imwallet \
  -e SERVER_PWD=YOUR_SERVICE_PASSWORD \
  -v rs-wallet-keys:/opt/rs-wallet/keys \
  ghcr.io/sixinyiyu/imwallet-server:latest

# 升级
docker pull ghcr.io/sixinyiyu/imwallet-server:latest
docker stop rs-wallet && docker rm rs-wallet
# 重新执行上面的 docker run
```

---

## CI/CD 流水线

| 流水线 | 文件 | 触发条件 | 说明 |
|--------|------|----------|------|
| Test Mobile | `test-mobile.yml` | push/PR main | TypeScript 类型检查 + Jest 测试 |
| Test Server | `test-server.yml` | push/PR main | cargo fmt + clippy + build + test |
| Server CI | `server-ci.yml` | push main / `feature/server-rust` / 手动 | Rust server lint & test |
| Build Android (GitHub) | `build-android-github.yml` | push main（版本号变更）/ 手动 | GitHub runner 本地构建签名 APK |
| Build Android (EAS) | `build-android.yml` | tag `android-v*` / 手动 | EAS 云构建 APK |
| Build iOS | `build-ios.yml` | tag `ios-v*` / 手动 | EAS 云构建 IPA |
| Build iOS & Submit | `build-ios-store.yml` | 手动 | EAS 构建并提交 App Store |
| Server Release | `server-release.yml` | 手动 | 构建 Linux/Windows 二进制并发布 Release |
| Server Docker | `server-docker.yml` | 手动 | 构建并推送 Docker 镜像到 ghcr.io |

---

## 在 GitHub 上触发流水线

对于支持 `workflow_dispatch` 的流水线（上表“手动”列），可在网页端触发：

1. 打开仓库 **Actions** 标签页
2. 左侧选择目标流水线（如 *Server Release (Rust Binary)*）
3. 点击右侧 **Run workflow** 下拉
4. 选择分支（通常 `main`），按需填写参数（如 `version` = `v0.2.10`）
5. 点击绿色 **Run workflow** 确认
6. 刷新页面即可看到新运行，点进去可查看日志

---

## 使用脚本触发流水线

项目提供跨平台脚本 [`scripts/trigger-pipeline.js`](../scripts/trigger-pipeline.js)（仅依赖 Node.js 内置模块），可在本地一条命令触发指定流水线。

```bash
# 语法
node scripts/trigger-pipeline.js <target> [version] [options]

# 服务端二进制 Release（version 必填）
node scripts/trigger-pipeline.js server v0.2.10

# Android APK（GitHub 本地构建），version 可省略（读取 apps/mobile/package.json）
node scripts/trigger-pipeline.js android 1.2.25

# Android（EAS 云构建）/ iOS IPA / iOS App Store
node scripts/trigger-pipeline.js android-eas 1.2.25
node scripts/trigger-pipeline.js ios 1.2.25
node scripts/trigger-pipeline.js ios-store 1.2.25

# 服务端 Docker 镜像（tag 必填）
node scripts/trigger-pipeline.js server-docker latest

# 触发并实时跟踪运行状态
node scripts/trigger-pipeline.js server v0.2.10 --watch
```

### target 对照表

| target | 流水线 | 参数 |
|--------|--------|------|
| `android` | Android APK（GitHub 本地构建） | `version`（可选） |
| `android-eas` | Android APK（EAS 云构建） | `version`（可选） |
| `ios` | iOS IPA（EAS 云构建） | `version`（可选） |
| `ios-store` | iOS App Store（EAS 构建并提交） | `version`（可选） |
| `server` | 服务端二进制 Release | `version`（必填，如 `v0.2.10`） |
| `server-docker` | 服务端 Docker 镜像 | `tag`（必填，如 `latest`） |
| `server-ci` | 服务端 CI（lint/test） | 无 |

### 可选参数

| 参数 | 说明 | 默认 |
|------|------|------|
| `--ref <branch\|tag>` | 触发使用的 ref | `main` |
| `--watch` | 触发后轮询并打印运行状态直到结束 | 关闭 |
| `--repo <owner/repo>` | 指定仓库 | 从 `git remote origin` 自动识别 |
| `--token <token>` | GitHub Token | `GITHUB_TOKEN` / `GH_TOKEN` / `~/.git-credentials` |

### npm 快捷方式

```bash
npm run trigger -- server v0.2.10        # 通用
npm run trigger:server -- v0.2.10        # 服务端 Release
npm run trigger:android -- 1.2.25        # Android APK
npm run trigger:ios -- 1.2.25            # iOS IPA
npm run trigger:ios-store -- 1.2.25      # iOS App Store
npm run trigger:server-docker -- latest  # 服务端 Docker
```

> **Token 要求**：触发 `workflow_dispatch` 需要具备 `actions:write` 权限的 Token
> （经典 PAT 勾选 `repo` 权限即可）。脚本默认会依次尝试环境变量与本地 git 凭据。
> 注意：请勿将 Token 写入仓库或提交到版本控制。
