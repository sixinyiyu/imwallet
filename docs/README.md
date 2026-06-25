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
- PostgreSQL (本地开发或 docker-compose)
- Expo CLI (`npm install -g expo-cli`)

### 本地开发

```bash
# 启动 PostgreSQL
docker-compose up -d

# 一键启动（server + mobile）
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

### Server 配置

Server 使用 `config.toml` 配置文件（`apps/server/config.toml`），环境变量可覆盖：

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | config.toml 中的值 |
| `PORT` | HTTP 服务端口 | 3000 |
| `SERVER_PWD` | 服务配置密码 | config.toml 中的值 |

### Mobile 配置

Mobile 使用 `.env` 文件（`apps/mobile/.env`）：

```
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
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
6. 筳名请求获取钱包列表（GET /wallets）

### 运行方式

```bash
# 默认连接 localhost:3000
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
