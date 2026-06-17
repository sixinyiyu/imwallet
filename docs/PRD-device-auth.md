# PRD: imwallet 设备认证体系重构

## 项目概述

将 imwallet 从基于 User 表的 JWT 认证体系，重构为基于 Device 表的 Ed25519 签名认证体系。核心变化：去掉 User 表，新增 Device 表，设备标识 = Ed25519 公钥 hex，请求验签替代 JWT，钱包与设备通过 WalletSubscription 多对多关联。

---

## 功能需求

### FR-1: 去掉 User 表及相关模型

- 删除 `User` model
- 删除 `UserWallet` model（中间表）
- 删除 `UserStatus` / `UserRole` enum
- 删除 `NotificationType` 中的 `ACCOUNT_ACTIVATED` / `ACCOUNT_REJECTED`
- 保留极简 `Admin` 表（id, device_id, role, created_at），管理员通过直接修改数据库绑定设备标识

### FR-2: 新增 Device 表

```
Device:
  id           Int       @id @default(autoincrement())
  device_id    String    @unique @db.VarChar(64)   // Ed25519 公钥 hex (64字符)
  platform     String    @db.VarChar(16)           // ios/android/web
  platform_store String? @db.VarChar(32)           // appStore/googlePlay/fdroid/null
  os           String?   @db.VarChar(32)
  model        String?   @db.VarChar(64)
  locale       String?   @db.VarChar(16)
  version      String?   @db.VarChar(32)           // app version
  currency     String?   @db.VarChar(8)
  token        String?   @db.VarChar(256)          // push token
  is_push_enabled      Boolean @default(false)
  is_price_alerts_enabled Boolean @default(false)
  subscriptions_version Int? @default(0)
  created_at   DateTime  @default(now())
  updated_at   DateTime  @updatedAt
```

### FR-3: 新增 WalletSubscription 关联表

```
WalletSubscription:
  id           Int       @id @default(autoincrement())
  wallet_id    String    @db.VarChar(36)
  device_id    Int                                       // → devices.id
  chain        String?   @db.VarChar(32)                 // 预留链标识
  address_id   String?   @db.VarChar(36)                 // 预留地址标识
  created_at   DateTime  @default(now())

  UNIQUE(wallet_id, device_id, chain, address_id)
```

- 一个设备可关联多个钱包
- 一个钱包可被多个设备关联（同一钱包在不同手机上导入）
- 验证钱包归属：通过 WalletSubscription 查询确认

### FR-4: 设备标识生成与验签

**核心机制**：设备标识 = Ed25519 密钥对的公钥 hex（64字符）

- iOS: Curve25519.Signing 密钥对，存 Keychain
- Android: Ed25519Sign.KeyPair (Google Tink)，存 DataStore + Android Keystore
- **Web 端兼容**：使用 `@noble/ed25519` 或浏览器 Web Crypto API 生成 Ed25519 密钥对，存 localStorage

**请求验签**：
- 客户端每个请求携带 headers：
  - `x-device-id`: 公钥 hex（64字符）
  - `x-signature`: Ed25519 签名 hex
  - `x-timestamp`: Unix timestamp（秒）
  - `x-nonce`: 随机字符串（防重放）
- 签名内容：`timestamp + method + path + bodyHash`
  - bodyHash = SHA-256(body) 的 hex，空 body 时 bodyHash = ""
- 服务端验证：
  1. 检查 timestamp 在 ±5 分钟内
  2. 用 device_id（公钥）验证签名
  3. nonce 防重放（可选，Redis 或内存缓存）

### FR-5: 设备注册与更新 API

- `POST /v1/devices` — 注册新设备（首次启动）
  - Body: { device_id, platform, platform_store, os, model, locale, version, currency }
  - 如果 device_id 已存在，返回 409（设备已注册，应使用 PUT 更新）
- `PUT /v1/devices` — 更新设备信息
  - Headers: 需携带设备签名
  - Body: { platform, os, model, locale, version, currency, token, is_push_enabled, is_price_alerts_enabled }

### FR-6: 钱包-设备关联 API

- `POST /v1/devices/wallets` — 设备订阅钱包（导入钱包时）
  - 签名验证 + Body: { wallet_id, chain?, address_id? }
- `DELETE /v1/devices/wallets/:wallet_id` — 设备取消订阅钱包（删除钱包时）
- `GET /v1/devices/wallets` — 获取当前设备订阅的所有钱包

### FR-7: Web 端兼容测试

- Web 端 platform = "web"，platform_store = null
- Web 端密钥对生成：使用 tweetnacl 或 @noble/ed25519
- Web 端密钥存储：localStorage（开发测试用）
- 提供一个 Web 测试页面或 API 测试脚本，方便本地测试验签流程

### FR-8: Admin 极简表

```
Admin:
  id         Int      @id @default(autoincrement())
  device_id  String   @unique @db.VarChar(64)   // 绑定管理员设备的公钥 hex
  role       String   @default("ADMIN") @db.VarChar(16)
  created_at DateTime @default(now())
```

- 管理员通过直接修改数据库将 device_id 绑定到 Admin 表
- Admin 路由：设备签名验证 + 查 Admin 表确认管理员身份
- Admin API：
  - `GET /v1/admin/devices` — 获取所有设备列表
  - `GET /v1/admin/wallets` — 获取所有钱包列表
  - `PUT /v1/admin/devices/:device_id/role` — 设置设备角色

---

## 非功能需求

### NFR-1: 安全性
- Ed25519 签名验证所有非公开接口请求
- timestamp ±5 分钟窗口防时间攻击
- nonce 防重放攻击（内存缓存，5分钟过期）
- 管理员操作需 Admin 表验证

### NFR-2: 兼容性
- Web 端可正常注册设备、签名请求、关联钱包
- 移动端（iOS/Android）密钥对生成逻辑不变

### NFR-3: 数据迁移
- 旧 User 表数据不迁移（重构，全新开始）
- Admin 表通过数据库手动配置

### NFR-4: 性能
- 签名验证中间件 < 5ms
- nonce 缓存内存占用 < 10MB

---

## 用户故事

### US-1: 移动端用户首次使用
> 用户安装 App → App 生成 Ed25519 密钥对 → POST /v1/devices 注册设备 → 创建钱包 → POST /v1/devices/wallets 关联钱包 → 后续请求携带签名

### US-2: Web 端测试用户
> 开发者打开 Web 测试页 → 页面生成 Ed25519 密钥对存 localStorage → POST /v1/devices 注册设备(platform=web) → 创建钱包 → 关联钱包 → 测试转账等操作

### US-3: 用户换手机导入钱包
> 新手机生成新密钥对 → 注册新设备 → 导入助记词重建钱包 → 新建 WalletSubscription 关联 → 旧设备关联保留

### US-4: 管理员操作
> 管理员设备已在 Admin 表绑定 → 管理员请求携带签名 → 中间件验证签名 + 查 Admin 表确认 → 执行管理操作

---

## 技术约束

- Prisma + PostgreSQL
- Express.js
- Ed25519 签名使用 `@noble/ed25519` npm 包（纯 JS，兼容 Node 和 Web）
- nonce 缓存使用内存 Map（开发阶段，生产可换 Redis）
- 不使用 JWT（除 Admin 内部管理外）
