# IMWallet 项目架构设计文档

> **版本**: v1.0.7  
> **更新日期**: 2026-06-22  
> **项目定位**: 多链去中心化私有链钱包应用（AquaD），支持 Tron / Ethereum / Bitcoin 三条链

---

## 目录

- [1. 系统架构总览](#1-系统架构总览)
- [2. 技术栈](#2-技术栈)
- [3. 认证架构](#3-认证架构)
- [4. 服务端架构](#4-服务端架构)
- [5. 客户端架构](#5-客户端架构)
- [6. 功能模块详细设计](#6-功能模块详细设计)
- [7. API 接口设计](#7-api-接口设计)
- [8. 数据同步机制](#8-数据同步机制)
- [9. 安全设计](#9-安全设计)
- [10. 部署架构](#10-部署架构)

---

## 1. 系统架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        IMWallet 系统架构                             │
│                                                                     │
│  ┌──────────────────────┐          ┌──────────────────────┐         │
│  │   Mobile App (Expo)  │          │   Server (Express)   │         │
│  │                      │  HTTPS   │                      │         │
│  │  ┌────────────────┐  │◄────────►┌────────────────┐    │         │
│  │  │  React Native  │  │  Ed25519 │  Express +      │    │         │
│  │  │  UI Layer      │  │  签名认证 │  Prisma ORM     │    │         │
│  │  └────────────────┘  │          └────────────────┘    │         │
│  │  ┌────────────────┐  │          ┌────────────────┐    │         │
│  │  │  Zustand Store │  │          │  PostgreSQL 16 │    │         │
│  │  │  (状态管理)     │  │          │  (服务端数据库) │    │         │
│  │  └────────────────┘  │          └────────────────┘    │         │
│  │  ┌────────────────┐  │                                  │
│  │  │  SQLite/IDB    │  │  本地数据                         │
│  │  │  (本地数据库)   │  │                                  │
│  │  └────────────────┘  │                                  │
│  │  ┌────────────────┐  │                                  │
│  │  │  SecureStore   │  │  加密存储                         │
│  │  │  (密钥/助记词)  │  │                                  │
│  │  └────────────────┘  │                                  │
│  └──────────────────────┘                                  │
│                                                                     │
│  ┌──────────────────────┐                                    │
│  │  Docker Compose      │  容器化部署                         │
│  │  (PostgreSQL + App)  │                                    │
│  └──────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────┘
```

**核心设计原则**：

| 原则 | 说明 |
|------|------|
| **服务端精简** | 服务端仅存储标识与业务数据（钱包ID、链上地址、余额、交易记录），不存储任何敏感信息 |
| **客户端富数据** | 密码哈希、助记词哈希、别名、排序等隐私/个性化数据存储在客户端本地 |
| **设备认证** | 使用 Ed25519 签名替代传统 JWT，设备公钥即身份标识，无需登录/注册流程 |
| **确定性ID** | 钱包ID由助记词SHA256确定性生成，同一助记词在不同设备产生相同ID，实现跨设备识别 |
| **无外键约束** | 数据库层面不建立外键，数据一致性由业务代码保证，便于灵活扩展 |

---

## 2. 技术栈

### 服务端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥18 | 运行环境 |
| Express | 4.x | HTTP 服务器 |
| Prisma | 6.x | ORM / 数据库客户端 |
| PostgreSQL | 16 | 关系型数据库 |
| @noble/ed25519 | 3.x | Ed25519 签名验证 |
| Zod | 3.x | 请求参数校验 |
| node-forge | 1.x | RSA 密钥生成与加密 |
| tsx | — | TypeScript 执行器 |

### 客户端

| 技术 | 版本 | 用途 |
|------|------|------|
| Expo (React Native) | 56 | 跨平台移动应用框架 |
| React Native | — | UI 渲染 |
| @react-navigation | 7.x | 页面导航 |
| Zustand | 5.x | 全局状态管理 |
| expo-sqlite | — | Native 端本地数据库 |
| expo-secure-store | — | 加密密钥存储 |
| expo-camera | — | 扫码功能 |
| @noble/ed25519 | 3.x | Ed25519 签名生成 |
| @noble/hashes | — | SHA256/SHA512 哈希 |
| axios | — | HTTP 客户端 |

---

## 3. 认证架构

### 3.1 设备认证流程

IMWallet 采用 **Ed25519 签名认证**，替代传统的 JWT 登录机制：

```
┌──────────────────────────────────────────────────────────────────┐
│                    设备认证流程                                    │
│                                                                  │
│  1. 首次启动                                                      │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐                 │
│  │ App 启动  │────►│生成密钥对 │────►│注册设备   │                 │
│  │          │     │Ed25519   │     │POST /devices│               │
│  └──────────┘     └──────────┘     └──────────┘                 │
│                                                                  │
│  2. 每次API请求                                                   │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐                 │
│  │ 构造请求  │────►│签名请求   │────►│发送请求   │                 │
│  │ body+url │     │timestamp+│     │4个Header  │                 │
│  │          │     │method+   │     │x-device-id│                 │
│  │          │     │path+     │     │x-signature│                 │
│  │          │     │bodyHash  │     │x-timestamp│                 │
│  │          │     │          │     │x-nonce    │                 │
│  └──────────┘     └──────────┘     └──────────┘                 │
│                                                                  │
│  3. 服务端验证                                                    │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐                 │
│  │ 检查Header│────►│验证签名   │────►│查询设备   │                 │
│  │ 完整性   │     │Ed25519   │     │是否已注册 │                 │
│  │ 时间窗口 │     │verify    │     │设置req.device│              │
│  │ nonce防重│     │          │     │          │                 │
│  └──────────┘     └──────────┘     └──────────┘                 │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 签名消息构造

```
签名消息 = timestamp + method + path + bodyHash

示例：
timestamp = "1719259"
method    = "POST"
path      = "/wallets"        (不含 /api/v1 前缀和 query string)
bodyHash  = SHA256(JSON.stringify(body)) 或 "" (GET请求)

完整消息 = "1719259POST/walletsabc123def456..."
```

### 3.3 请求 Headers

| Header | 类型 | 说明 |
|--------|------|------|
| `x-device-id` | String | Ed25519 公钥 hex（64字符），即设备标识 |
| `x-signature` | String | Ed25519 签名 hex（128字符） |
| `x-timestamp` | String | Unix timestamp 秒，±5分钟窗口 |
| `x-nonce` | String | 32字符随机hex，防重放攻击 |
| `x-app-version` | String | App 版本号（可选，充值接口使用） |

### 3.4 无需签名的接口

| 接口 | 说明 |
|------|------|
| `POST /devices` | 设备注册（首次启动，尚未有密钥对） |
| `GET /rsa/public-key` | RSA 公钥获取（公开接口） |
| `GET /fiat/rates` | 法币汇率获取（公开接口） |
| `POST /logs` | 日志上报（崩溃时设备可能未注册） |

---

## 4. 服务端架构

### 4.1 目录结构

```
apps/server/
├── src/
│   ├── index.ts              # 入口：Express 应用 + 启动流程
│   ├── config/
│   │   ├── index.ts          # 端口、费率等配置
│   │   ├── chains.ts         # 链枚举、派生路径映射
│   │   └── prisma.ts         # Prisma Client 单例
│   ├── middleware/
│   │   ├── deviceAuth.ts     # Ed25519 签名验证中间件
│   │   ├── errorHandler.ts   # 统一错误处理
│   │   ├── requestLogger.ts  # 请求日志
│   │   └── validate.ts       # Zod 参数校验中间件
│   ├── routes/               # 路由层（11个路由模块）
│   ├── services/             # 业务逻辑层（12个服务模块）
│   ├── validators/           # Zod Schema 校验器
│   └── utils/
│       └── logger.ts         # 日志工具
├── prisma/
│   ├── schema.prisma         # 数据库 Schema 定义
│   ├── init.sql              # 幂等初始化脚本
│   └── drop-all.sql          # 重置脚本
├── scripts/                  # 数据库管理脚本
├── Dockerfile                # Docker 构建
├── ecosystem.config.js       # PM2 部署配置
└── deploy.sh / deploy-pm2.sh # 部署脚本
```

### 4.2 启动流程

```
Server 启动顺序：
1. runMigrations()   → 执行 Flyway 风格数据库迁移
2. runSeed()         → 幂等种子数据（chains/assets/fiat/app_configs）
3. initRSAKeys()     → 生成 RSA 密钥对（用于密码加密，预留）
4. app.listen()      → 启动 HTTP 服务
```

### 4.3 中间件链

```
请求处理链：
Request → CORS → JSON Parser → Request Logger → Route Handler → Error Handler → Response

需要认证的路由额外插入：
Request → CORS → JSON Parser → Request Logger → deviceAuthMiddleware → Route Handler → Error Handler → Response
```

---

## 5. 客户端架构

### 5.1 目录结构

```
apps/mobile/
├── App.tsx                   # 应用入口
├── src/
│   ├── navigation/
│   │   ├── RootStack.tsx     # 主导航栈（27个页面）
│   │   ├── MainTabs.tsx      # 底部标签页（钱包/我）
│   ├── screens/              # 页面层（24个页面）
│   ├── components/           # 组件层
│   │   ├── icons/            # SVG 图标组件（27个）
│   │   ├── ActionButtons.tsx # 转账/收款/扫码操作按钮
│   │   ├── AppAlert.tsx      # 跨平台 Alert 组件
│   │   ├── BalanceCard.tsx   # 余额卡片
│   │   ├── EmptyState.tsx    # 空数据提示
│   │   ├── GreenToggle.tsx   # 绿色主题开关
│   │   ├── Skeleton.tsx      # 骨架屏（10种布局）
│   │   ├── TokenList.tsx     # 代币列表
│   ├── stores/               # 状态管理层
│   │   ├── walletStore.ts    # 钱包核心状态（创建/导入/删除/切换）
│   │   ├── authStore.ts      # 设备认证状态
│   │   ├── fiatStore.ts      # 法币汇率与选择
│   ├── services/             # 服务层（API调用 + 本地数据操作）
│   ├── hooks/
│   │   ├── useAlert.ts       # 跨平台 Alert Hook
│   ├── db/                   # 本地数据库层
│   │   ├── database.ts       # 数据库单例 + 建表SQL
│   │   ├── sqliteAdapter.ts  # SQLite 适配器
│   │   ├── indexedDbAdapter.ts # IndexedDB 适配器
│   │   ├── types.ts          # 数据库抽象接口
│   ├── utils/                # 工具层
│   │   ├── mnemonic.ts       # BIP39 助记词生成/校验
│   │   ├── derivation.ts     # BIP44 地址派生
│   │   ├── address.ts        # 地址格式校验/网络检测
│   │   ├── secureStorage.ts  # SecureStore 封装
│   ├── types/                # TypeScript 类型定义
│   │   ├── index.ts          # 业务类型
│   │   ├── navigation.ts     # 导航路由类型
```

### 5.2 页面清单

| 页面 | 路由名 | 功能 |
|------|--------|------|
| StartScreen | Start | 启动页/引导页，根据钱包状态跳转 |
| WalletCreateScreen | WalletCreate | 创建新钱包（设置密码） |
| WalletImportScreen | WalletImport | 导入钱包（输入助记词） |
| WalletAddAccountScreen | WalletAddAccount | 添加链上账户（选择链） |
| BackupConfirmScreen | BackupConfirm | 备份确认（输入密码验证） |
| BackupGuideScreen | BackupGuide | 备份引导说明 |
| BackupMnemonicScreen | BackupMnemonic | 显示助记词 |
| ConfirmMnemonicScreen | ConfirmMnemonic | 确认助记词（按顺序选择） |
| WalletScreen | Main/Wallet | 钱包首页（余额+代币列表） |
| ProfileScreen | Main/Profile | "我"页面（菜单入口） |
| ScanScreen | Scan | 扫码页面 |
| TradeDetailScreen | TradeDetail | 交易详情 |
| TokenDetailScreen | TokenDetail | 代币详情 |
| TransferScreen | Transfer | 转账页面 |
| ReceiveScreen | Receive | 收款页面（二维码） |
| RecordsScreen | Records | 交易记录列表 |
| WalletManageScreen | WalletManage | 钱包管理列表 |
| WalletDetailScreen | WalletDetail | 钱包详情（账户列表） |
| AddressBookScreen | AddressBook | 地址本管理 |
| SettingsScreen | Settings | 通用设置（开关配置） |
| ServiceConfigScreen | ServiceConfig | 服务配置入口（密码验证） |
| ConfigManageScreen | ConfigManage | 配置管理（费率/限制/充值/代币） |
| RechargeScreen | Recharge | 充值管理 |
| TokenManageScreen | TokenManage | 代币管理（开关交易） |
| SecurityScreen | Security | 安全与隐私设置 |
| AboutScreen | About | 关于我们 |
| NotificationScreen | Notifications | 消息通知列表 |
| ForgotPasswordScreen | ForgotPassword | 忘记密码（助记词验证） |
| ResetPasswordScreen | ResetPassword | 重置密码（输入新密码） |

### 5.3 状态管理（walletStore）

walletStore 是客户端的核心状态管理，承载了钱包的全生命周期操作：

```
walletStore 核心方法：
┌─────────────────────────────────────────────────────┐
│  loadLocalState()     → 加载本地钱包列表+设备初始化     │
│  createWallet()       → 创建钱包（生成助记词→派生地址） │
│  importWallet()       → 导入钱包（验证助记词→派生地址） │
│  deleteWallet()       → 删除钱包（本地+服务端同步清理） │
│  addAccount()         → 添加账户（派生新地址→同步服务端）│
│  fetchAccounts()      → 刷新账户列表                   │
│  fetchAssets()        → 刷新资产余额                   │
│  setActiveWallet()    → 切换当前钱包                   │
│  verifyPassword()     → 验证钱包密码                   │
│  backupWallet()       → 标记备份完成                   │
│  resetPassword()      → 重置钱包密码                   │
└─────────────────────────────────────────────────────┘
```

---

## 6. 功能模块详细设计

### 6.1 钱包管理模块

**功能描述**：钱包的创建、导入、删除、切换、备份等全生命周期管理。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 创建钱包 | 生成12词助记词 → SHA256生成walletId → 派生默认链地址 → 本地存储密码hash/助记词hash → SecureStore加密存储助记词 | `POST /wallets` 注册钱包 → `POST /wallets/{id}/addresses` 同步地址 → `POST /devices/wallets` 创建订阅 |
| 导入钱包 | 用户输入助记词 → 校验词数和有效性 → SHA256生成walletId → 派生地址 → 本地存储 | 同创建钱包的服务端流程 |
| 删除钱包 | 验证密码 → 本地删除钱包/账户/地址数据 → SecureStore清除助记词 | `DELETE /wallets/{id}` 取消订阅 → `DELETE /wallets/{id}/addresses/{addressId}` 删除地址 |
| 切换钱包 | 更新activeWallet → fetchAccounts → fetchAssets | `GET /wallets/{id}/balance` 获取余额 |
| 备份钱包 | 验证密码 → 显示助记词 → 确认助记词顺序 → SecureStore标记已备份 | 无（纯本地操作） |
| 重置密码 | 验证助记词 → 输入新密码 → 更新本地password_hash | 无（纯本地操作） |

### 6.2 账户管理模块

**功能描述**：在已有钱包上添加/删除链上账户（派生地址）。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 添加账户 | 选择链 → 从助记词派生地址 → 本地存储account → | `POST /wallets/{id}/addresses` 同步地址 → `POST /devices/wallets` 更新订阅 |
| 删除账户 | 本地删除account → | `DELETE /wallets/{id}/addresses/{addressId}` 删除地址 |
| 查看可用链 | — | `GET /accounts/chains/available` 获取支持创建账户的链列表 |

### 6.3 赬产与余额模块

**功能描述**：查看钱包总余额、各代币余额、代币详情。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 钱包总余额 | 切换钱包时自动刷新 | `GET /wallets/{id}/balance` 获取总余额+各资产余额 |
| 钱包列表聚合 | 首页钱包列表展示 | `GET /wallets/aggregate` 获取钱包列表含网络信息 |
| 代币详情 | 点击代币进入详情页 | `GET /transactions?walletId&tokenSymbol` 获取该代币的交易记录 |
| 代币管理 | 开关代币交易状态 | `PUT /assets/{id}/tradable` 更新交易开关 |

### 6.4 转账模块

**功能描述**：系统内钱包间转账，支持手续费扣除/额外收取两种模式。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 转账 | 选择收款地址 → 输入金额 → 验证密码 → | `POST /transactions/transfer` 执行转账 |
| 地址校验 | 输入地址时实时校验 | `GET /transactions/check-address?address=xxx` 查询地址是否在系统内 |
| 交易记录 | 查看历史交易 | `GET /transactions?walletId&type&timeRange&search&tokenSymbol` 分页查询 |
| 交易详情 | 点击交易进入详情 | `GET /transactions/{id}` 获取详情 |

**转账业务逻辑（服务端）**：

```
1. 校验发送钱包属于当前设备
2. 查找资产（tokenSymbol + network）
3. 校验发送方有足够余额
4. 获取费率配置（fee_rate + fee_mode）
5. 计算手续费和实收金额：
   - DEDUCTED模式：实收 = 金额 × (1 - fee_rate)
   - EXTRA模式：实收 = 金额，手续费 = 金额 × fee_rate
6. 检查交易限制（tx_restrict_wallet）：若开启，收款地址必须在系统内
7. 扣减发送方余额（assets_addresses upsert decrement）
8. 增加收款方余额（assets_addresses upsert increment）
9. 创建交易记录（transactions 表）
10. 创建通知（notifications 表，分别通知双方）
```

### 6.5 收款模块

**功能描述**：生成收款二维码，展示当前钱包地址。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 展示地址 | 显示当前钱包的链上地址 + 二维码 | 无（地址从本地account获取） |
| 分享地址 | 复制地址/分享链接 | 无 |

### 6.6 地址本模块

**功能描述**：管理常用联系人地址，完全存储在客户端本地。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 添加联系人 | 输入名称+地址 → 自动检测链类型 → 本地存储 | 无（纯本地操作） |
| 编辑联系人 | 修改名称/备注 → 本地更新 | 无 |
| 删除联系人 | 本地删除 | 无 |
| 选择联系人 | 转账时从地址本选择收款人 | 无 |

### 6.7 配置管理模块

**功能描述**：系统级配置的查看和修改，需要密码验证才能进入。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 密码验证 | 输入服务配置密码 → | `POST /config/verify-password` 验证密码 |
| 查看配置 | 进入配置管理页面 → | `GET /config/all` 获取所有配置项 |
| 修改费率 | 编辑费率值 → | `PUT /config/update` 更新配置 |
| 修改交易限制 | 开关交易限制 → | `PUT /config/update` 更新配置 |
| 开关服务配置 | 本地SecureStore记录开关状态 | 无（纯本地开关） |
| 开关多账户 | 本地SecureStore记录开关状态 | 无（纯本地开关） |

### 6.8 充值管理模块

**功能描述**：管理员对系统内钱包进行代币充值。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 充值 | 选择钱包 → 选择代币 → 输入金额 → | `POST /recharges` 执行充值 |
| 充值记录 | 查看历史充值记录 | `GET /recharges?walletId&tokenSymbol&page&limit` 分页查询 |

**充值业务逻辑（服务端）**：

```
1. 校验设备是否有充值权限（recharge_allowed_devices 配置）
2. 查找目标钱包
3. 查找资产（tokenSymbol + network）
4. 查找链上地址（wallets_addresses）
5. 增加地址余额（assets_addresses upsert increment）
6. 创建充值记录（recharges 表）
```

### 6.9 通知模块

**功能描述**：站内信通知，转账成功后自动创建。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 通知列表 | 查看所有通知 | `GET /notifications` 获取通知列表 |
| 标记已读 | 点击通知标记已读 | `PUT /notifications/{id}/read` |
| 全部已读 | 一键标记所有已读 | `PUT /notifications/read-all` |

### 6.10 法币汇率模块

**功能描述**：资产法币估值，支持多种法币切换。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 获取汇率 | 启动时/切换法币时获取 | `GET /fiat/rates` 获取所有法币汇率 |
| 法币切换 | 用户选择法币 → fiatStore更新 → 余额重新计算 | 无（本地计算） |

### 6.11 日志模块

**功能描述**：客户端崩溃日志和关键业务失败日志的上报与查看。

| 子功能 | 客户端流程 | 服务端接口 |
|--------|-----------|-----------|
| 上报日志 | 捕获异常 → 本地暂存 → 用户开启上报后上传 | `POST /logs` 上报日志 |
| 查看日志数量 | 设置页显示待上报数量 | 无（本地计数） |

---

## 7. API 接口设计

### 7.1 接口总览

| 模块 | 基路径 | 需签名 | 接口数 |
|------|--------|--------|--------|
| 设备 | `/api/v1/devices` | 部分 | 5 |
| 钱包 | `/api/v1/wallets` | 全部 | 9 |
| 资产 | `/api/v1/assets` | 全部 | 4 |
| 交易 | `/api/v1/transactions` | 全部 | 4 |
| 账户 | `/api/v1/accounts` | 全部 | 2 |
| 配置 | `/api/v1/config` | 全部 | 4 |
| 通知 | `/api/v1/notifications` | 全部 | 3 |
| 充值 | `/api/v1/recharges` | 全部 | 2 |
| 法币 | `/api/v1/fiat` | 否 | 1 |
| RSA | `/api/v1/rsa` | 否 | 1 |
| 日志 | `/api/v1/logs` | 否 | 1 |
| 健康检查 | `/health` | 否 | 1 |
| **合计** | | | **36** |

### 7.2 设备接口 (`/api/v1/devices`)

| 方法 | 路径 | 签名 | 说明 | 请求体/参数 | 响应 |
|------|------|------|------|------------|------|
| POST | `/` | ❌ | 注册设备 | `{ device_id: hex64, platform: "ios"|"android"|"web" }` | `{ id, platform, created_at, updated_at }` 201/200 |
| GET | `/me` | ✅ | 获取当前设备信息 | — | `{ id, platform, created_at, updated_at }` |
| POST | `/wallets` | ✅ | 订阅钱包 | `{ wallet_id, chain?, address_id? }` | `{ id, wallet_id, device_id, chain, address_id, created_at }` 201 |
| DELETE | `/wallets/:wallet_id` | ✅ | 取消订阅钱包 | — | 204 |
| GET | `/wallets` | ✅ | 获取设备订阅的钱包列表 | — | `{ wallets: [...] }` |

### 7.3 钱包接口 (`/api/v1/wallets`)

| 方法 | 路径 | 说明 | 请求体/参数 | 响应 |
|------|------|------|------------|------|
| GET | `/` | 获取当前设备的钱包列表 | — | `{ wallets: [...] }` |
| GET | `/aggregate` | 获取钱包列表聚合数据（含网络） | — | `{ wallets: [{ ...SimpleWallet, networks: ["Tron"] }] }` |
| GET | `/all` | 获取所有系统钱包（搜索+分页） | `?search=&page=1&limit=20` | `{ wallets: [...], total }` |
| POST | `/` | 创建/导入钱包 | `{ walletId, alias?, source: "CREATE"|"IMPORT" }` | `{ id, alias, source, created_at, updated_at }` 201 |
| GET | `/:id` | 获取钱包详情 | — | `{ id, name, source, tokenBalances, totalBalanceCny, ... }` |
| GET | `/:id/balance` | 获取钱包余额详情 | — | `{ totalBalanceUsd, totalBalanceCny, assets: [...] }` |
| DELETE | `/:id` | 删除钱包（取消订阅） | — | 204 |
| POST | `/:id/addresses` | 同步地址到服务端 | `{ chain, address }` | `{ id, chain, address, created_at }` 201 |
| DELETE | `/:id/addresses/:addressId` | 删除服务端地址 | — | 204 |
| GET | `/:id/addresses` | 查询钱包的所有链上地址 | — | `{ addresses: [{ id, chain, address, created_at }] }` |

### 7.4 资产接口 (`/api/v1/assets`)

| 方法 | 路径 | 说明 | 请求体/参数 | 响应 |
|------|------|------|------------|------|
| GET | `/` | 获取所有活跃资产列表 | — | `{ assets: [{ id, symbol, name, decimals, chain, type, ... }] }` |
| GET | `/:walletId/balance` | 获取钱包总余额 | — | `{ totalBalanceCny, totalBalanceUsd }` |
| GET | `/:walletId/list` | 获取钱包各资产余额 | — | `{ assets: [{ id, symbol, balance, usdValue, cnyValue, ... }] }` |
| PUT | `/:id/tradable` | 切换资产交易开关 | `{ isTradable: boolean }` | `{ id, symbol, isTradable }` |

### 7.5 交易接口 (`/api/v1/transactions`)

| 方法 | 路径 | 说明 | 请求体/参数 | 响应 |
|------|------|------|------------|------|
| POST | `/transfer` | 执行转账 | `{ fromWalletId, toAddress, amount, tokenSymbol, network, memo? }` | `{ id, txHash, fromAddress, toAddress, amount, fee, receivedAmount, feeMode, status, ... }` 201 |
| GET | `/` | 查询交易列表 | `?walletId(必填)&page&limit&type&timeRange&search&tokenSymbol` | `{ transactions: [...], total }` |
| GET | `/check-address` | 校验地址是否在系统内 | `?address=xxx` | `{ inSystem: boolean, inContacts: false }` |
| GET | `/:id` | 获取交易详情 | — | `{ id, txHash, fromAddress, toAddress, ... }` |

### 7.6 账户接口 (`/api/v1/accounts`)

| 方法 | 路径 | 说明 | 请求体/参数 | 响应 |
|------|------|------|------------|------|
| GET | `/wallets/networks/batch` | 批量获取钱包网络列表 | `?walletIds=id1,id2,id3` | `{ wallets: [{ walletId, networks: ["Tron"] }] }` |
| GET | `/chains/available` | 获取支持创建账户的链列表 | — | `{ chains: [{ id, name, displayName, accountEnable, derivationPath, assets: [...] }] }` |

### 7.7 配置接口 (`/api/v1/config`)

| 方法 | 路径 | 说明 | 请求体/参数 | 响应 |
|------|------|------|------------|------|
| GET | `/fee` | 获取费率配置 | — | `{ feeRate: 0.005, feeMode: "DEDUCTED" }` |
| GET | `/all` | 获取所有配置项 | — | `[{ key: "fee_rate", value: "0.005" }, ...]` |
| POST | `/verify-password` | 验证服务配置密码 | `{ password: string }` | `{ verified: true }` 或 403 |
| PUT | `/update` | 更新配置项 | `{ key: string, value: string }` | `{ key, value }` |

### 7.8 通知接口 (`/api/v1/notifications`)

| 方法 | 路径 | 说明 | 请求体/参数 | 响应 |
|------|------|------|------------|------|
| GET | `/` | 获取通知列表 | — | `{ notifications: [{ id, title, content, type, isRead, createdAt }] }` |
| PUT | `/:id/read` | 标记单条已读 | — | `{ message: "Notification marked as read" }` |
| PUT | `/read-all` | 标记全部已读 | — | `{ message: "All notifications marked as read" }` |

### 7.9 充值接口 (`/api/v1/recharges`)

| 方法 | 路径 | 说明 | 请求体/参数 | 响应 |
|------|------|------|------------|------|
| POST | `/` | 执行充值 | `{ walletId, walletAlias, tokenSymbol, network, accountAddress, amount, memo? }` | `{ id, walletId, walletAlias, accountAddress, tokenSymbol, amount, ... }` 201 |
| GET | `/` | 查询充值记录 | `?walletId&tokenSymbol&page&limit` | `{ recharges: [...], total }` |

### 7.10 其他接口

| 方法 | 路径 | 签名 | 说明 | 响应 |
|------|------|------|------|------|
| GET | `/api/v1/fiat/rates` | ❌ | 获取法币汇率 | `{ rates: [{ code, name, symbol, rate }] }` |
| GET | `/api/v1/rsa/public-key` | ❌ | 获取RSA公钥 | `{ publicKey: "-----BEGIN PUBLIC KEY-----..." }` |
| POST | `/api/v1/logs` | ❌ | 上报日志 | `{ device_id?, platform?, version?, log_type: "crash"|"mnemonic", content }` → `{ success: true }` 201 |
| GET | `/health` | ❌ | 健康检查 | `{ status: "ok" }` |

---

## 8. 数据同步机制

### 8.1 同步策略

IMWallet 采用 **客户端主导、服务端确认** 的同步策略：

```
客户端操作优先 → 本地数据库先写入 → 再同步到服务端

创建钱包：本地生成 → POST /wallets → POST /wallets/{id}/addresses → POST /devices/wallets
添加账户：本地派生 → POST /wallets/{id}/addresses → POST /devices/wallets
删除钱包：本地删除 → DELETE /wallets/{id}
删除账户：本地删除 → DELETE /wallets/{id}/addresses/{addressId}
```

### 8.2 余额获取策略

余额数据 **不从客户端同步到服务端**，而是由服务端统一管理：

```
客户端获取余额流程：
1. GET /wallets/{id}/balance → 服务端计算总余额+各资产余额
2. 服务端通过 wallet_subscriptions → wallets_addresses → assets_addresses 链路聚合计算
3. 客户端仅展示，不存储余额到本地数据库
```

### 8.3 地址本同步策略

地址本 **完全存储在客户端本地**，不与服务端同步：

```
地址本操作：
添加/编辑/删除 → 仅操作本地 SQLite addresses 表
转账时选择联系人 → 从本地地址本读取
```

---

## 9. 安全设计

### 9.1 密钥存储

| 数据 | 存储位置 | 加密方式 |
|------|---------|---------|
| Ed25519 私钥 | SecureStore | 系统级加密（iOS Keychain / Android Keystore） |
| Ed25519 公钥 | SecureStore | 系统级加密 |
| 助记词原文 | SecureStore | 系统级加密，key: `aquad_mnemonic_{walletId}` |
| 密码 Hash | 本地 SQLite | bcrypt hash，明文密码不存储 |
| 助记词 Hash | 本地 SQLite | SHA256 hash，用于防重复导入 |

### 9.2 通信安全

| 安全措施 | 说明 |
|---------|------|
| HTTPS | 生产环境强制 HTTPS |
| Ed25519 签名 | 每次API请求都带签名，防篡改 |
| Timestamp 窗口 | ±5分钟有效期，防过期请求 |
| Nonce 防重放 | 每次请求唯一nonce，5分钟缓存防重复 |
| Body Hash | 签名包含请求体SHA256，防body篡改 |
| CORS 白名单 | 仅允许指定域名跨域访问 |

### 9.3 业务安全

| 安全措施 | 说明 |
|---------|------|
| 交易限制 | `tx_restrict_wallet` 配置可限制仅系统内转账 |
| 充值权限 | `recharge_allowed_devices` 配置控制充值权限 |
| 密码验证 | 备份、删除钱包等敏感操作需验证密码 |
| 服务配置密码 | 进入配置管理需验证独立密码 |
| 截屏警告 | 备份助记词页面检测截屏并警告 |

---

## 10. 部署架构

### 10.1 Docker Compose

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: imwallet
      POSTGRES_USER: imwallet
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  app:
    build: ./apps/server
    environment:
      DATABASE_URL: postgresql://imwallet:${DB_PASSWORD}@db:5432/imwallet
      PORT: 3000
      NODE_ENV: production
    depends_on:
      - db
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

### 10.2 PM2 部署

```bash
# 生产环境部署
./deploy-pm2.sh

# 或手动
pm2 start ecosystem.config.js
```

### 10.3 移动端构建

```bash
# EAS Build (Expo Application Services)
eas build --platform android --profile production
eas build --platform ios --profile production
```

### 10.4 本地开发

```bash
# 一键启动本地开发环境
npm run local        # 启动 PostgreSQL + Server + Mobile
npm run local:server # 仅启动服务端
npm run local:mobile # 仅启动移动端
npm run local:stop   # 停止所有服务
npm run local:status # 查看服务状态
```
