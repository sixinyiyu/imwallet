# IMWallet 项目文档

## 项目结构

```
imwallet/
├── apps/
│   ├── mobile/          # Expo React Native 移动端
│   ├── server/          # Rust 后端 (rs-wallet)
│   └── test-device-auth/ # 设备认证集成测试工具
├── scripts/
│   └── local.ps1        # 本地开发环境一键启动脚本
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

## CI 流水线

| 流水线 | 触发条件 | 说明 |
|--------|----------|------|
| Test Mobile | push main / PR main | TypeScript 类型检查 + Jest 测试 |
| Test Server | push main / PR main | cargo fmt + clippy + build + test |
| Server CI | push main / feature/server-rust | Rust server lint & test |
