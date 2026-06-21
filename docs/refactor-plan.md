# IMWallet 数据库重构计划：客户端/服务端表分离

> **日期**: 2026-06-21
> **状态**: ✅ 已完成（服务端+客户端代码重构完成，双端编译通过）

---

## 一、重构目标

将"跟着设备走"的数据从服务端 PostgreSQL 迁移到客户端 SQLite，使钱包核心数据（密码、助记词派生信息、账户、联系人）本地化，减少网络依赖。服务端只保留验签、全局地址、余额、交易等必须中心化的数据。

**核心原则**：
- 助记词相关数据**不离开设备**
- 钱包密码**存储在客户端**
- 余额、交易等涉及多方一致性的数据**保留在服务端**
- 本期不考虑数据迁移、不考虑枚举类型设计

---

## 二、新架构表分布

### 客户端 SQLite（6 张表）

| # | 表名 | 目的 | 存储数据 |
|---|------|------|----------|
| 1 | `wallets` | 钱包主表（本地） | id、名称、类型、排序、是否置顶、来源（导入/创建）、头像、密码hash、密码提示、助记词哈希 |
| 2 | `accounts` | 派生账户 | wallet_id、派生路径、地址、链、扩展公钥、索引、名称 |
| 3 | `addresses` | 地址元信息 | 链、地址、所属钱包、名称、类型 |
| 4 | `contacts` | 联系人 | 名称、头像、备注 |
| 5 | `contacts_addresses` | 联系人多链地址 | contact_id、链、地址、备注 |
| 6 | `devices` | 设备信息（本地完整） | 设备标识（Ed25519公钥）、平台、OS、型号、推送token、推送开关等 |

### 服务端 PostgreSQL（14 张表）

| # | 表名 | 目的 | 存储数据 | 变化 |
|---|------|------|----------|------|
| 1 | `devices` | 设备验签（精简） | id、device_id（公钥）、platform | **精简**：移除 os/model/locale/version/currency/token/推送开关等字段，仅保留验签所需 |
| 2 | `chains` | 区块链网络定义 | 链名称、显示名、account_enable、派生路径 | 不变 |
| 3 | `assets` | 资产定义 | 符号、精度、合约地址、链、类型 | 不变 |
| 4 | `wallets` | 钱包表（服务端） | id、identifier、来源 | **精简**：移除 password/password_hint/mnemonic_hash/memo/alias，仅保留服务端所需标识 |
| 5 | `wallet_subscriptions` | 钱包订阅 | wallet_id、device_id、chain、address_id | 不变 |
| 6 | `wallets_addresses` | 钱包地址（全局唯一） | wallet_id、链、地址 | **新增**：替代原 accounts 在服务端的角色 |
| 7 | `account_assets` | 账户资产余额 | address_id、asset_id、余额 | **重构**：关联键从 account_id 改为 address_id |
| 8 | `transactions` | 交易记录 | 交易哈希、付款/收款地址、代币、金额、手续费、状态 | 不变 |
| 9 | `fiat_currencies` | 法币汇率 | 代码、名称、符号、汇率 | 不变 |
| 10 | `app_configs` | 系统配置 | key-value | 不变 |
| 11 | `recharges` | 充值记录 | 钱包快照、代币、金额、操作设备 | 不变 |
| 12 | `app_logs` | 应用日志 | 设备、平台、日志类型、内容 | 不变 |
| 13 | `notifications` | 站内通知 | wallet_id、标题、内容、类型 | 不变 |
| 14 | `notification_reads` | 通知阅读状态 | notification_id、device_id、是否已读 | 不变 |

> **说明**：`notifications` 和 `notification_reads` 保留在服务端，由转账逻辑触发创建，客户端拉取。

---

## 三、已确认的设计决策

| 决策项 | 结论 |
|--------|------|
| 数据迁移 | 本期不考虑，后续单独处理 |
| `account_assets` 余额表 | **保留服务端**，关联键从 `account_id` 改为 `address_id` |
| `devices` 表 | 客户端存完整设备信息；服务端仅保留精简版（id + device_id + platform），用于验签 |
| 钱包密码 | **存储在客户端** SQLite，服务端不存 |
| 助记词相关 | **不离开设备**，助记词哈希存客户端本地 |
| 枚举类型 | 本期暂不考虑：现有 `WalletSource`/`TxStatus`/`NotificationType`/`Platform` 保持不变，新增字段一律用纯字符串，不做枚举约束 |
| `notifications` | 保留服务端 |

---

## 四、详细改动计划

### 阶段一：服务端数据库重构

#### 4.1 schema.prisma

| 操作 | 详情 |
|------|------|
| **精简** `Device` model | 移除 `platform_store`、`os`、`model`、`locale`、`version`、`currency`、`token`、`is_push_enabled`、`is_price_alerts_enabled`、`subscriptions_version`；仅保留 `id`、`device_id`、`platform`、`created_at`、`updated_at` |
| **精简** `Wallet` model | 移除 `alias`、`password`、`passwordHint`、`mnemonicHash`、`memo`；仅保留 `id`、`identifier`、`source`、`createdAt`、`updatedAt` |
| **删除** model | `Account`、`Contact` |
| **枚举** | 本期暂不考虑枚举类型调整，现有 `WalletSource`/`TxStatus`/`NotificationType`/`Platform` 保持不变，新增字段一律用纯字符串 |
| **新增** model | `WalletAddress`（id、wallet_id、chain、address、createdAt），唯一索引 `(wallet_id, chain, address)` |
| **修改** `AccountAsset` model | `accountId` → `addressId`（关联 `wallets_addresses.id`），唯一索引改为 `(addressId, assetId)` |
| **保留不变** | `Chain`、`Asset`、`Transaction`、`FiatCurrency`、`AppConfig`、`Recharge`、`AppLog`、`Notification`、`NotificationRead`、`WalletSubscription` |

#### 4.2 init.sql

- 精简 `devices` 建表语句（移除多余字段）
- 精简 `wallets` 建表语句（移除 password/alias/mnemonic_hash/memo）
- 删除 `accounts`、`contacts` 建表语句
- 新增 `wallets_addresses` 建表语句 + 唯一索引
- 修改 `account_assets`：`account_id` → `address_id`，唯一索引更新
- 枚举类型保持不变（`WalletSource`/`TxStatus`/`NotificationType`/`Platform`），本期不调整
- 更新种子数据

#### 4.3 seedService.ts

> **本期不考虑数据迁移**，seedService 仅负责全新初始化，不包含任何迁移逻辑。

- **删除** `migrateSchema()` 函数及其全部迁移语句（tokens→assets、wallet_tokens→account_assets 等历史迁移全部移除）
- **保留** `runSeed()` 中的 chains/assets/app_configs 种子数据逻辑
- schema 变更（新增 `wallets_addresses` 表、`account_assets` 改 `address_id`、精简 `devices`/`wallets` 字段）全部通过更新 `init.sql` 实现，不通过运行时迁移
- 后续如需数据迁移，单独开一个迁移阶段处理

---

### 阶段二：服务端代码重构

#### 4.4 walletService.ts

| 函数 | 改动 |
|------|------|
| `createOrImportWallet` | **精简**：服务端只创建 `{ identifier, source }`，不存密码/助记词哈希；返回 wallet.id 给客户端 |
| `resetWalletPassword` | **删除**（密码验证在客户端本地） |
| `verifyWalletPassword` | **删除**（同上） |
| `computeTokenBalances` | **重写**：改查 `wallets_addresses` → `account_assets`（通过 address_id 关联） |
| `getDeviceWallets` | **精简**：移除 accountCount（accounts 不在服务端），tokenBalances 改查 `wallets_addresses` + `account_assets` |
| `getDeviceWalletsAggregate` | **重写**：网络列表改查 `wallets_addresses` |
| `getWalletDetail` | **精简**：移除 passwordHint；tokenBalances 改查 `wallets_addresses` |
| `deleteWallet` | **增加级联**：删除 `wallets_addresses` + `account_assets`（通过 address_id）中该钱包的数据 |
| `updateWalletAlias` | **删除**（别名存客户端本地） |
| `deriveMnemonicHash` | **删除**（助记词不离开设备） |

#### 4.5 accountService.ts

| 函数 | 改动 |
|------|------|
| `createAccount` | **删除**（账户创建在客户端本地） |
| `getWalletAccounts` | **删除**（从客户端本地查询） |
| `getAccountDetail` | **删除** |
| `deleteAccount` | **删除** |
| `getAvailableChains` | **保留**（chains + assets 在服务端） |
| `getWalletsNetworksBatch` | **重写**：改查 `wallets_addresses` 表 |

#### 4.6 新增 wallets_addresses 路由 + service

| 新增 API | 说明 |
|----------|------|
| `POST /wallets/:id/addresses` | 客户端创建账户后，同步地址到服务端 `wallets_addresses` |
| `DELETE /wallets/:id/addresses/:addressId` | 客户端删除账户后，同步删除服务端地址记录 |
| `GET /wallets/:id/addresses` | 查询钱包的所有链上地址（服务端视角） |

#### 4.7 transactionService.ts

| 函数 | 改动 |
|------|------|
| `findWalletByAddress` | 改查 `wallets_addresses` 表（替代 `accounts` 表） |
| `getWalletAddresses` | 改查 `wallets_addresses` 表 |
| `transfer` | 余额查询改查 `account_assets`（通过 `address_id` 关联 `wallets_addresses`）；fromAddress 从 `wallets_addresses` 获取 |
| `getTransactions` | walletByAddressMap 改查 `wallets_addresses`；联系人搜索移除（contacts 在客户端） |
| `getTransactionDetail` | 同上 |
| `formatTransaction` | 联系人名称查找移除（客户端处理） |

#### 4.8 rechargeService.ts

| 函数 | 改动 |
|------|------|
| `recharge` | 余额操作改查 `account_assets`（通过 `address_id`）；`walletAddress` 从 `wallets_addresses` 获取 |

#### 4.9 deviceService.ts

| 函数 | 改动 |
|------|------|
| `registerDevice` | **精简**：只存 device_id + platform |
| `updateDevice` | **删除或精简**：设备详细信息在客户端本地更新 |
| `getDevice` | **精简**：只返回 id + device_id + platform |
| `getDeviceWallets` | 移除 accounts/accountAssets 查询；tokenBalances 改查 `wallets_addresses` + `account_assets` |
| `subscribeWallet` | 不变 |
| `unsubscribeWallet` | 不变 |

#### 4.10 assetService.ts

| 函数 | 改动 |
|------|------|
| `getWalletAssets` | **重写**：改查 `wallets_addresses` → `account_assets`（通过 address_id） |
| `getWalletBalance` | **重写**：同上 |

#### 4.11 contactService.ts — 删除

联系人数据完全移到客户端，服务端不再需要此 service 和对应路由。

#### 4.12 notificationService.ts — 保留

通知保留在服务端，逻辑不变。

#### 4.13 路由文件改动

| 文件 | 改动 |
|------|------|
| `routes/account.ts` | 删除 createAccount/getWalletAccounts/getAccountDetail/deleteAccount 路由；保留 getAvailableChains |
| `routes/contact.ts` | **删除** |
| `routes/transaction.ts` | 地址校验改查 `wallets_addresses`；移除 contacts 查询 |
| `routes/wallet.ts` | 移除密码验证路由；移除 updateWalletAlias；新增 addresses 路由 |
| `routes/device.ts` | 精简 register/update 路由 |

---

### 阶段三：客户端 SQLite 数据库搭建

#### 4.14 引入 SQLite 依赖

- 安装 `expo-sqlite`
- 创建数据库初始化模块 `apps/mobile/src/db/database.ts`

#### 4.15 客户端表结构

```sql
-- devices（本地完整设备信息）
CREATE TABLE devices (
  id TEXT PRIMARY KEY,             -- 设备标识（Ed25519 公钥 hex）
  platform TEXT NOT NULL DEFAULT '',
  platform_store TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL DEFAULT '',
  is_push_enabled INTEGER NOT NULL DEFAULT 0,
  is_price_alerts_enabled INTEGER NOT NULL DEFAULT 0,
  subscriptions_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- wallets（本地钱包主表）
CREATE TABLE wallets (
  id TEXT PRIMARY KEY,             -- 与服务端 wallet.id 一致
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',   -- 多链/单链/私钥/观察（本期用字符串，不做枚举约束）
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'CREATE',
  avatar TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  password_hint TEXT NOT NULL DEFAULT '',
  mnemonic_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- accounts（本地派生账户表）
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  derivation_path TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  extended_pubkey TEXT NOT NULL DEFAULT '',
  account_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- addresses（地址元信息表）
CREATE TABLE addresses (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'account',
  created_at TEXT NOT NULL
);

-- contacts（联系人表）
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- contacts_addresses（联系人多链地址表）
CREATE TABLE contacts_addresses (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
```

#### 4.16 客户端数据访问层

| 新增文件 | 职责 |
|----------|------|
| `db/database.ts` | SQLite 初始化 + 建表 + 版本管理 |
| `services/localWalletService.ts` | 本地钱包 CRUD、密码验证（bcrypt）、助记词哈希比对 |
| `services/localAccountService.ts` | 本地账户 CRUD、BIP44 地址派生 |
| `services/localContactService.ts` | 本地联系人 + 多链地址 CRUD |
| `services/localDeviceService.ts` | 本地设备信息 CRUD |
| `services/syncService.ts` | 客户端→服务端同步（钱包注册、地址同步） |

---

### 阶段四：客户端代码重构

#### 4.17 walletStore.ts — 大幅重写

| 当前逻辑 | 新逻辑 |
|----------|--------|
| `fetchWallets` 调服务端 API | 读本地 SQLite |
| `createWallet` 调服务端（含密码 hash） | 本地创建（存密码 hash + 助记词哈希），同时调服务端注册 identifier |
| `importWallet` 同上 | 同上 |
| `resetPassword` 调服务端验证助记词 | 本地验证 mnemonic_hash |
| `deleteWallet` 调服务端 | 本地删除 + 服务端取消订阅 + 删除 wallets_addresses |
| `fetchAccounts` 调服务端 API | 读本地 SQLite |
| `addAccount` 调服务端创建 | 本地创建 + 派生地址，同步地址到服务端 `wallets_addresses` |
| `deleteAccount` 调服务端 | 本地删除 + 服务端删除 `wallets_addresses` 记录 |

#### 4.18 移动端 service 文件改动

| 文件 | 改动 |
|------|------|
| `services/walletService.ts` | 移除 verifyWalletPassword/resetPassword API；createWallet/importWallet 改为两步（本地+服务端） |
| `services/accountService.ts` | 移除账户 CRUD API；保留 getAvailableChains（服务端） |
| `services/contactService.ts` | **完全重写**为本地 SQLite CRUD |
| `services/rechargeService.ts` | 不变 |
| `services/transactionService.ts` | 不变 |

#### 4.19 移动端 Screen 文件改动

| 文件 | 改动 |
|------|------|
| `WalletDetailScreen.tsx` | 密码验证改本地；地址展示从本地 accounts 读取 |
| `WalletAddAccountScreen.tsx` | 账户创建改本地 SQLite + 地址派生 |
| `AddressBookScreen.tsx` | 联系人 CRUD 改本地 SQLite；支持多链地址 |
| `TransferScreen.tsx` | 联系人选择器改本地查询 |
| `RecordsScreen.tsx` | currentAddress 从本地 accounts 获取 |
| `RechargeScreen.tsx` | 钱包账户列表从本地读取 |
| `TokenDetailScreen.tsx` | currentAddress 从本地获取 |
| `TradeDetailScreen.tsx` | currentAddress 从本地获取 |

#### 4.20 移动端 types/index.ts 更新

- `SimpleWallet` 新增本地字段（sort_order、is_pinned、avatar、type 等）
- `Account` 新增 derivation_path、extended_pubkey 字段
- `Contact` 重构（支持多链地址）
- 新增 `ContactAddress` 类型

---

### 阶段五：同步机制

#### 4.21 钱包创建同步流程

```
客户端创建钱包
  ├─ 1. 本地生成助记词 → 派生 mnemonic_hash
  ├─ 2. 本地 wallets 表插入记录（含 password_hash、mnemonic_hash）
  ├─ 3. 调用服务端 POST /wallets（只传 identifier + source）
  ├─ 4. 服务端创建 wallets 记录 + wallet_subscriptions 记录
  └─ 5. 客户端保存服务端返回的 wallet.id 到本地
```

#### 4.22 账户创建同步流程

```
客户端创建账户
  ├─ 1. 本地通过助记词 + BIP44 派生链上地址
  ├─ 2. 本地 accounts 表插入记录
  ├─ 3. 本地 addresses 表插入地址元信息
  ├─ 4. 调用服务端 POST /wallets/:id/addresses（传 wallet_id + chain + address）
  ├─ 5. 服务端 wallets_addresses 表插入记录（全局唯一地址）
  └─ 6. 服务端自动为该地址创建 account_assets 默认余额记录
```

#### 4.23 联系人同步

- 联系人纯本地，不同步到服务端
- 转账时联系人匹配在客户端完成

---

## 五、影响矩阵

### 服务端文件改动清单

| 文件 | 改动程度 | 说明 |
|------|----------|------|
| `prisma/schema.prisma` | 🔴 重写 | 精简 Device/Wallet，删 Account/Contact，新增 WalletAddress，改 AccountAsset |
| `prisma/init.sql` | 🔴 重写 | 同步 schema 变更 |
| `services/seedService.ts` | 🔴 重写 | 删除全部迁移逻辑，仅保留种子数据初始化 |
| `services/walletService.ts` | 🔴 大幅重写 | 移除密码/助记词逻辑，余额查询改 address_id |
| `services/accountService.ts` | 🔴 大幅删减 | 删除大部分函数，保留 getAvailableChains |
| `services/transactionService.ts` | 🟡 中等重写 | 地址匹配改查 wallets_addresses |
| `services/rechargeService.ts` | 🟡 中等修改 | 地址来源 + 余额逻辑改 address_id |
| `services/deviceService.ts` | 🟡 精简 | 移除多余字段，只保留验签所需 |
| `services/assetService.ts` | 🔴 重写 | 余额聚合改查 wallets_addresses + account_assets |
| `services/contactService.ts` | 🔴 删除 | 联系人移到客户端 |
| `services/notificationService.ts` | 🟢 不变 | 保留服务端 |
| `routes/account.ts` | 🔴 大幅删减 | 删除大部分路由 |
| `routes/contact.ts` | 🔴 删除 | |
| `routes/transaction.ts` | 🟡 中等修改 | 地址校验改查 wallets_addresses |
| `routes/wallet.ts` | 🟡 中等修改 | 移除密码路由，新增 addresses 路由 |
| `routes/device.ts` | 🟡 精简 | 精简 register/update |

### 客户端文件改动清单

| 文件 | 改动程度 | 说明 |
|------|----------|------|
| `db/database.ts` | 🆕 新增 | SQLite 初始化 + 建表 |
| `services/localWalletService.ts` | 🆕 新增 | 本地钱包 CRUD + 密码验证 |
| `services/localAccountService.ts` | 🆕 新增 | 本地账户 CRUD + 地址派生 |
| `services/localContactService.ts` | 🆕 新增 | 本地联系人 CRUD |
| `services/localDeviceService.ts` | 🆕 新增 | 本地设备信息 CRUD |
| `services/syncService.ts` | 🆕 新增 | 客户端→服务端同步 |
| `stores/walletStore.ts` | 🔴 大幅重写 | 数据源从 API 改为本地 SQLite |
| `services/walletService.ts` | 🟡 中等修改 | 移除密码相关 API |
| `services/accountService.ts` | 🟡 中等修改 | 移除账户 CRUD API |
| `services/contactService.ts` | 🔴 重写 | 改为本地 SQLite |
| `types/index.ts` | 🟡 中等修改 | 类型定义更新 |
| `screens/WalletDetailScreen.tsx` | 🟡 中等修改 | 密码验证改本地 |
| `screens/WalletAddAccountScreen.tsx` | 🟡 中等修改 | 账户创建改本地 |
| `screens/AddressBookScreen.tsx` | 🔴 重写 | 多链地址支持 |
| `screens/TransferScreen.tsx` | 🟡 小修改 | 联系人选择器改本地 |
| `screens/RecordsScreen.tsx` | 🟡 小修改 | 地址来源改本地 |
| `screens/RechargeScreen.tsx` | 🟡 小修改 | 账户列表改本地 |
| `screens/TokenDetailScreen.tsx` | 🟡 小修改 | 地址来源改本地 |
| `screens/TradeDetailScreen.tsx` | 🟡 小修改 | 地址来源改本地 |

---

## 六、建议实施顺序

1. **服务端数据库重构**（schema + init.sql + seedService）
2. **服务端代码重构**（services + routes）
3. **客户端 SQLite 搭建**（依赖 + 建表 + DAO 层）
4. **客户端代码重构**（stores + services + screens）
5. **同步机制实现**（syncService）
6. **联调测试**