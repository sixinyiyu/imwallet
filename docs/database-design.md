# IMWallet 数据库设计文档

> **数据库**: PostgreSQL 16（服务端） + SQLite / IndexedDB（客户端）  
> **ORM**: Prisma Client 6.x（服务端） + 自定义 DatabaseAdapter（客户端）  
> **外键约束**: 无（服务端和客户端均不建立数据库外键，数据完整性和级联删除由业务代码保证）  
> **字符编码**: UTF-8  
> **时区**: Asia/Shanghai（Prisma 连接时设置 session timezone）  
> **架构原则**: 服务端仅存储标识与业务数据，密码/助记词/别名等敏感信息存储在客户端本地数据库

---

## 目录

- [1. 架构概述](#1-架构概述)
- [2. 枚举类型](#2-枚举类型)
- [3. 服务端表清单总览](#3-服务端表清单总览)
- [4. 客户端表清单总览](#4-客户端表清单总览)
- [5. 服务端表关系图](#5-服务端表关系图)
- [6. 服务端表详细设计](#6-服务端表详细设计)
  - [6.1 devices — 设备表](#61-devices--设备表)
  - [6.2 chains — 区块链网络表](#62-chains--区块链网络表)
  - [6.3 assets — 资产表](#63-assets--资产表)
  - [6.4 wallets — 钱包表](#64-wallets--钱包表)
  - [6.5 wallets_addresses — 钱包地址表](#65-wallets_addresses--钱包地址表)
  - [6.6 assets_addresses — 资产地址表](#66-assets_addresses--资产地址表)
  - [6.7 wallet_subscriptions — 钱包设备订阅表](#67-wallet_subscriptions--钱包设备订阅表)
  - [6.8 transactions — 交易记录表](#68-transactions--交易记录表)
  - [6.9 notifications — 通知表](#69-notifications--通知表)
  - [6.10 notification_reads — 通知阅读状态表](#610-notification_reads--通知阅读状态表)
  - [6.11 fiat_currencies — 法币汇率表](#611-fiat_currencies--法币汇率表)
  - [6.12 app_configs — 应用配置表](#612-app_configs--应用配置表)
  - [6.13 recharges — 充值记录表](#613-recharges--充值记录表)
  - [6.14 app_logs — 应用日志表](#614-app_logs--应用日志表)
- [7. 客户端表详细设计](#7-客户端表详细设计)
  - [7.1 wallets — 本地钱包表](#71-wallets--本地钱包表)
  - [7.2 accounts — 本地账户表](#72-accounts--本地账户表)
  - [7.3 addresses — 本地地址本表](#73-addresses--本地地址本表)
- [8. 服务端表关系详解](#8-服务端表关系详解)
- [9. 数据库初始化方式](#9-数据库初始化方式)
- [10. 重构历史](#10-重构历史)

---

## 1. 架构概述

IMWallet 采用 **服务端/客户端双数据库架构**：

| 层 | 数据库 | 存储内容 | 设计原则 |
|---|--------|---------|---------|
| **服务端** | PostgreSQL | 设备标识、钱包标识、链上地址、资产余额、交易记录、通知、配置 | 仅存储业务必需的标识与状态数据，不存储任何敏感信息 |
| **客户端** | SQLite (Native) / IndexedDB (Web) | 钱包别名、密码哈希、助记词哈希、派生路径、地址本联系人 | 存储用户隐私数据，通过 SecureStore 加密存储助记词原文 |

**核心数据流**：
- 客户端创建钱包 → 本地存储密码/助记词 → 向服务端注册钱包标识
- 客户端派生链地址 → 本地存储派生信息 → 向服务端同步地址到 `wallets_addresses`
- 服务端管理余额 → `assets_addresses` 记录每个地址的各资产余额
- 客户端地址本 → 仅存储在本地 `addresses` 表，服务端无 `contacts` 表

---

## 2. 枚举类型

### 服务端枚举（PostgreSQL）

| 枚举名 | 值 | 说明 |
|--------|-----|------|
| `WalletSource` | `IMPORT`, `CREATE` | 钱包来源：CREATE=新建钱包, IMPORT=导入钱包 |
| `TxStatus` | `PENDING`, `CONFIRMED`, `FAILED` | 交易状态：PENDING=待确认, CONFIRMED=已确认, FAILED=失败 |
| `NotificationType` | `TRANSFER_IN`, `TRANSFER_OUT` | 通知类型：转入通知/转出通知 |
| `Platform` | `ios`, `android`, `web` | 设备平台 |

---

## 3. 服务端表清单总览

| # | 表名 | Prisma 模型 | 说明 | 变更说明 |
|---|------|-------------|------|---------|
| 1 | `devices` | Device | 设备信息，主键=Ed25519公钥hex | **精简重构**：移除大量设备详情字段，仅保留验签所需 |
| 2 | `chains` | Chain | 系统支持的区块链网络 | 无变更 |
| 3 | `assets` | Asset | 每条链支持的资产定义（原生币/代币） | 无变更 |
| 4 | `wallets` | Wallet | 钱包标识，主键=确定性ID | **精简重构**：移除identifier/password/mnemonic_hash等字段 |
| 5 | `wallets_addresses` | WalletAddress | 链上地址（全局唯一） | **新增**：替代原 accounts 表在服务端的角色 |
| 6 | `assets_addresses` | AssetsAddress | 每个地址持有的各资产余额 | **新增**：替代原 account_assets 表，关联键改为 address_id |
| 7 | `wallet_subscriptions` | WalletSubscription | 钱包-设备多对多订阅关联 | **重构**：device_id 从 INT 改为 VARCHAR(64) |
| 8 | `transactions` | Transaction | 钱包间转账记录 | 无变更 |
| 9 | `notifications` | Notification | 站内信通知（关联钱包） | 无变更 |
| 10 | `notification_reads` | NotificationRead | 每设备对每通知的独立阅读状态 | **重构**：device_id 从 INT 改为 VARCHAR(64) |
| 11 | `fiat_currencies` | FiatCurrency | 法币对 USDT 的汇率 | 无变更 |
| 12 | `app_configs` | AppConfig | 系统级 key-value 配置 | 无变更 |
| 13 | `recharges` | Recharge | 管理员充值记录 | **重构**：wallet_address 改为 account_address |
| 14 | `app_logs` | AppLog | 客户端崩溃日志和业务失败日志 | 无变更 |

> **已移除的表**：`accounts`（服务端）、`account_assets`（服务端）、`contacts`（服务端）。详见 [10. 重构历史](#10-重构历史)。

---

## 4. 客户端表清单总览

| # | 表名 | 说明 | 存储位置 |
|---|------|------|---------|
| 1 | `wallets` | 本地钱包信息（别名、密码哈希、助记词哈希等） | SQLite / IndexedDB |
| 2 | `accounts` | 本地账户信息（派生路径、链上地址、扩展公钥等） | SQLite / IndexedDB |
| 3 | `addresses` | 本地地址本/联系人 | SQLite / IndexedDB |

> 助记词原文通过 `SecureStore` 加密存储，不在数据库表中。

---

## 5. 服务端表关系图

```
┌──────────────┐         ┌──────────────────────────┐         ┌──────────────┐
│   devices    │◄────────│   wallet_subscriptions    │────────►│   wallets    │
│ (id=公钥hex) │  N    1 │                          │  1    N │ (id=确定性ID) │
└──────┬───────┘         └──────────────────────────┘         └──────┬───────┘
       │                                                       │
       │                                                       │ 1
       │                                                       │
       │                                                       │ N
       │                                                       │
       │                                              ┌────────┴───────────┐
       │                                              │ wallets_addresses  │
       │                                              │ (链上地址，全局唯一) │
       │                                              └──────┬────────────┘
       │                                                     │
       │                                                     │ 1
       │                                                     │
       │                                                     │ N
       │                                                     │
       │                                              ┌────────┴───────────┐
       │                                              │  assets_addresses  │
       │                                              │ (地址×资产 余额)    │
       │                                              └──────┬────────────┘
       │                                                     │
       │                                                     │ N
       │                                                     │
       │                                                     │ 1
       │                                                     │
       │                                              ┌────────┴───────────┐
       │                                              │      assets        │
       │                                              │ (资产定义)          │──► chains
       │                                              └────────────────────┘    (逻辑)

┌──────────────┐         ┌──────────────────────────┐         ┌──────────────┐
│   devices    │◄────────│   notification_reads     │────────►│notifications │
│ (id=公钥hex) │  N    1 │                          │  N    1 │              │
└──────────────┘         └──────────────────────────┘         └──────┬───────┘
                                                                    │
                                                               N:1  │
                                                                    │
                                                               ┌────┴───────┐
                                                               │  wallets   │
                                                               └────────────┘

┌──────────────┐         ┌──────────────┐               ┌──────────────────┐
│  recharges   │────────►│   wallets    │               │ fiat_currencies  │
│              │  N:1    │              │               │                  │
└──────────────┘         └──────────────┘               └──────────────────┘

┌──────────────┐               ┌──────────────┐         ┌──────────────┐
│  app_logs    │               │  app_configs │         │transactions │
│              │               │              │         │              │
└──────────────┘               └──────────────┘         └──────────────┘
```

> **注意**：数据库层面无外键约束，以上关系为**逻辑关系**，由业务代码维护。

---

## 6. 服务端表详细设计

### 6.1 `devices` — 设备表

> 存储设备验签信息。设备标识 = Ed25519 公钥 hex（64 字符），客户端生成密钥对后注册到服务端。  
> **重构说明**：原表包含大量设备详情字段（os/model/locale/version/token等），现已精简为仅保留验签所需字段。完整设备信息存储在客户端本地。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | VARCHAR(64) | PK | 设备标识，Ed25519 公钥 hex（64 字符），客户端生成的密钥对公钥，直接作为主键 |
| `platform` | Platform | NOT NULL | 设备平台：ios / android / web |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `devices_pkey` — PRIMARY KEY (`id`)

**与旧版差异**:
- ❌ 移除 `device_id`（原为 UNIQUE 列，现 `id` 直接是公钥hex）
- ❌ 移除 `platform_store`、`os`、`model`、`locale`、`version`、`currency`（完整设备信息在客户端）
- ❌ 移除 `token`、`is_push_enabled`、`is_price_alerts_enabled`（推送功能暂未实现）
- ❌ 移除 `subscriptions_version`（增量同步机制简化）
- ✅ `id` 从 SERIAL 自增改为 VARCHAR(64) 直接存储公钥hex

---

### 6.2 `chains` — 区块链网络表

> 存储系统支持的区块链网络，每条链对应一种地址派生规则。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PK, 自增 | 主键 |
| `name` | VARCHAR(64) | UNIQUE, NOT NULL | 链名称，如 Tron、Ethereum、Bitcoin |
| `display_name` | VARCHAR(64) | NOT NULL | 显示名称，如 "Tron (TRX)" |
| `account_enable` | BOOLEAN | NOT NULL, DEFAULT true | 是否支持创建账户（派生链地址） |
| `derivation_path` | VARCHAR(128) | NOT NULL, DEFAULT '' | BIP44 派生路径前缀，如 m/44'/195'/0'/0 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `chains_pkey` — PRIMARY KEY (`id`)
- `chains_name_key` — UNIQUE (`name`)

**种子数据**:

| name | display_name | account_enable | derivation_path |
|------|-------------|----------------|-----------------|
| Tron | Tron (TRX) | true | m/44'/195'/0'/0 |
| Ethereum | Ethereum (ETH) | true | m/44'/60'/0'/0 |
| Bitcoin | Bitcoin (BTC) | true | m/44'/0'/0'/0 |

---

### 6.3 `assets` — 资产表

> 定义每条链支持的资产（原生主币和代币）。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK | 主键，UUID |
| `symbol` | VARCHAR(16) | NOT NULL | 资产符号，如 TRX、USDT、ETH、BTC |
| `name` | VARCHAR(64) | NOT NULL | 资产名称，如 Tether USD、Tron |
| `decimals` | INT | NOT NULL, DEFAULT 6 | 精度（小数位数） |
| `chain` | VARCHAR(64) | NOT NULL | 所属链（如 Tron、Ethereum、Bitcoin），逻辑关联 chains.name |
| `type` | VARCHAR(16) | NOT NULL, DEFAULT 'NATIVE' | 资产类型：NATIVE=原生主币, TOKEN=代币(ERC20/TRC20) |
| `token_id` | VARCHAR(66) | NOT NULL, DEFAULT '' | 合约地址（NATIVE 为空字符串，TOKEN 为链上合约地址） |
| `icon_url` | VARCHAR(512) | NOT NULL, DEFAULT '' | 图标 URL |
| `is_default` | BOOLEAN | NOT NULL, DEFAULT true | 是否默认可见（NATIVE=true，常见代币=true，其他需手动添加） |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT true | 是否启用（控制该资产是否在客户端展示） |
| `is_tradable` | BOOLEAN | NOT NULL, DEFAULT true | 是否支持交易（控制该资产是否可转账） |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `assets_pkey` — PRIMARY KEY (`id`)
- `assets_symbol_chain_key` — UNIQUE (`symbol`, `chain`)

**种子数据**:

| id | symbol | name | decimals | chain | type | token_id | is_active | is_tradable |
|----|--------|------|----------|-------|------|----------|-----------|-------------|
| asset-trx-tron | TRX | Tron | 6 | Tron | NATIVE | '' | true | true |
| asset-usdt-tron | USDT | Tether USD | 6 | Tron | TOKEN | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | true | true |
| asset-eth-ethereum | ETH | Ethereum | 18 | Ethereum | NATIVE | '' | false | false |
| asset-usdt-ethereum | USDT | Tether USD | 6 | Ethereum | TOKEN | 0xdAC17F958D2ee523a2206206994597C13D831ec7 | false | false |
| asset-btc-bitcoin | BTC | Bitcoin | 8 | Bitcoin | NATIVE | '' | false | false |

---

### 6.4 `wallets` — 钱包表

> 存储钱包标识信息。钱包 ID 由客户端确定性生成（aqud + SHA256(mnemonic)前32位hex），同一助记词始终产生同一 ID。  
> **重构说明**：原表包含 identifier/password/mnemonic_hash/password_hint/memo 等字段，现已精简。密码哈希、助记词哈希、别名等敏感信息存储在客户端本地数据库。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK | 钱包 ID，确定性生成：aqud + 32位助记词SHA256哈希前缀，同一助记词始终产生同一 ID |
| `alias` | VARCHAR(64) | NOT NULL, DEFAULT '' | 钱包别名（服务端快照，主要别名在客户端本地） |
| `source` | WalletSource | NOT NULL, DEFAULT 'CREATE' | 钱包来源：CREATE=新建, IMPORT=导入 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `wallets_pkey` — PRIMARY KEY (`id`)

**与旧版差异**:
- ❌ 移除 `identifier`（原为 UNIQUE 列，Base62随机字符串；现 `id` 直接是确定性哈希）
- ❌ 移除 `mnemonic_hash`（助记词哈希存储在客户端本地 wallets 表）
- ❌ 移除 `password`（密码 bcrypt hash 存储在客户端本地 wallets 表）
- ❌ 移除 `password_hint`（密码提示存储在客户端本地 wallets 表）
- ❌ 移除 `memo`（备注功能暂未实现）

---

### 6.5 `wallets_addresses` — 钱包地址表

> **新增表**：替代原 `accounts` 表在服务端的角色。存储链上地址（全局唯一），客户端创建账户后同步地址到此表。  
> 地址与钱包的关联通过 `wallet_subscriptions` 实现（wallet_id + address_id 组合）。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK | 主键，UUID |
| `chain` | VARCHAR(64) | NOT NULL | 链名称（如 Tron、Ethereum、Bitcoin） |
| `address` | VARCHAR(64) | NOT NULL | 链上地址（Tron: T+33位, EVM: 0x+40位hex, BTC: 1.../3...） |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `wallets_addresses_pkey` — PRIMARY KEY (`id`)
- `wallets_addresses_chain_address_key` — UNIQUE (`chain`, `address`)
- `wallets_addresses_address_idx` — INDEX (`address`)

**设计说明**:
- 同一链上地址全局唯一，无论属于哪个钱包。同一地址不会重复存储。
- 地址与钱包的归属关系通过 `wallet_subscriptions` 的 `(wallet_id, address_id)` 组合表达。
- 客户端创建账户（派生地址）后，调用同步接口将地址注册到此表。

---

### 6.6 `assets_addresses` — 资产地址表

> **新增表**：替代原 `account_assets` 表。存储每个链上地址持有的各资产余额。  
> 关联键从 `account_id` 改为 `address_id`（关联 `wallets_addresses.id`）。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK | 主键，UUID |
| `address_id` | VARCHAR(36) | NOT NULL | 关联钱包地址 ID（wallets_addresses.id） |
| `asset_id` | VARCHAR(36) | NOT NULL | 关联资产 ID（assets.id） |
| `chain` | VARCHAR(64) | NOT NULL, DEFAULT '' | 链名称（如 Tron、Ethereum、Bitcoin） |
| `balance` | DECIMAL(30,8) | NOT NULL, DEFAULT 0 | 资产余额 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `assets_addresses_pkey` — PRIMARY KEY (`id`)
- `assets_addresses_address_id_asset_id_key` — UNIQUE (`address_id`, `asset_id`)

**设计说明**:
- 每个地址×每种资产只有一条余额记录。
- 转账时通过 `upsert` 操作余额：若记录不存在则创建，存在则 `increment` 金额。
- 查询钱包总余额时，先通过 `wallet_subscriptions` 获取该钱包的所有 `address_id`，再聚合 `assets_addresses` 中这些地址的余额。

---

### 6.7 `wallet_subscriptions` — 钱包设备订阅表

> 钱包与设备的多对多关联表。一个钱包可被多个设备订阅，一个设备可订阅多个钱包。  
> **重构说明**：`device_id` 从 INT（引用 devices 表自增主键）改为 VARCHAR(64)（直接存储 Ed25519 公钥hex）。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PK, 自增 | 主键 |
| `wallet_id` | VARCHAR(36) | NOT NULL | 钱包 ID，逻辑关联 wallets.id |
| `device_id` | VARCHAR(64) | NOT NULL | 设备 ID（Ed25519 公钥 hex），逻辑关联 devices.id |
| `chain` | VARCHAR(32) | NOT NULL, DEFAULT '' | 链标识（预留字段，当前为空字符串） |
| `address_id` | VARCHAR(36) | NOT NULL, DEFAULT '' | 地址标识（关联 wallets_addresses.id，标识该订阅对应的链上地址） |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `wallet_subscriptions_pkey` — PRIMARY KEY (`id`)
- `wallet_subscriptions_wallet_id_device_id_chain_address_id_key` — UNIQUE (`wallet_id`, `device_id`, `chain`, `address_id`)

**设计说明**:
- 每条订阅记录表示"某设备可以访问某钱包的某链上地址"。
- 当 `address_id` 为空字符串时，表示该设备对整个钱包的访问权限（兜底）。
- 删除钱包时，先删除该设备对此钱包的所有订阅记录。

---

### 6.8 `transactions` — 交易记录表

> 存储钱包间的转账记录。交易记录通过链地址（from_address/to_address）关联钱包，不存储 wallet_id。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK | 主键，UUID |
| `tx_hash` | VARCHAR(66) | UNIQUE, NOT NULL | 交易哈希，链上唯一标识（服务端生成的内部哈希） |
| `from_address` | VARCHAR(64) | NOT NULL | 付款链地址（如 T.../0x...） |
| `to_address` | VARCHAR(128) | NOT NULL | 收款链地址（始终记录，如 T.../0x...；VARCHAR(128) 支持外部长地址） |
| `token_symbol` | VARCHAR(16) | NOT NULL | 代币符号（如 USDT、TRX），直接存储便于过滤和展示 |
| `amount` | DECIMAL(30,8) | NOT NULL | 交易金额 |
| `fee` | DECIMAL(30,8) | NOT NULL, DEFAULT 0 | 手续费 |
| `status` | TxStatus | NOT NULL, DEFAULT 'PENDING' | 交易状态：PENDING=待确认 / CONFIRMED=已确认 / FAILED=失败 |
| `memo` | VARCHAR(256) | NOT NULL, DEFAULT '' | 交易备注 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `transactions_pkey` — PRIMARY KEY (`id`)
- `transactions_tx_hash_key` — UNIQUE (`tx_hash`)

**设计说明**:
- 交易表不存储 wallet_id，通过链地址关联钱包。查询时获取钱包的所有链地址，再按 from_address/to_address 过滤交易。
- `to_address` 使用 VARCHAR(128) 以支持外部长地址格式。

---

### 6.9 `notifications` — 通知表

> 站内信通知，关联到钱包（非设备），同一钱包的多个设备共享通知。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK | 主键，UUID |
| `wallet_id` | VARCHAR(36) | NOT NULL | 关联钱包 ID，逻辑关联 wallets.id |
| `title` | VARCHAR(128) | NOT NULL | 通知标题 |
| `content` | TEXT | NOT NULL | 通知内容 |
| `type` | NotificationType | NOT NULL | 通知类型：TRANSFER_IN=收到转账 / TRANSFER_OUT=转出转账 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `notifications_pkey` — PRIMARY KEY (`id`)
- `notifications_wallet_id_idx` — INDEX (`wallet_id`)

---

### 6.10 `notification_reads` — 通知阅读状态表

> 每个设备对每条通知的独立阅读状态。同一通知对不同设备有独立的已读/未读状态。  
> **重构说明**：`device_id` 从 INT 改为 VARCHAR(64)，直接存储 Ed25519 公钥hex。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PK, 自增 | 主键 |
| `notification_id` | TEXT | NOT NULL | 通知 ID，逻辑关联 notifications.id |
| `device_id` | VARCHAR(64) | NOT NULL | 设备 ID（Ed25519 公钥 hex），逻辑关联 devices.id |
| `is_read` | BOOLEAN | NOT NULL, DEFAULT false | 是否已读 |
| `read_at` | TIMESTAMP(3) | NULL | 阅读时间（标记已读时记录） |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `notification_reads_pkey` — PRIMARY KEY (`id`)
- `notification_reads_notification_id_device_id_idx` — UNIQUE (`notification_id`, `device_id`)

---

### 6.11 `fiat_currencies` — 法币汇率表

> 存储各法币对 USDT 的兑换汇率，用于资产法币估值计算。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK | 主键，UUID |
| `code` | VARCHAR(8) | UNIQUE, NOT NULL | 货币代码，如 USD、CNY、EUR |
| `name` | VARCHAR(32) | NOT NULL | 货币名称，如 US Dollar、人民币 |
| `symbol` | VARCHAR(4) | NOT NULL | 货币符号，如 $、¥、€ |
| `rate` | DECIMAL(18,8) | NOT NULL | 对 USDT 的汇率（1 USDT = rate 法币） |
| `decimals` | INT | NOT NULL, DEFAULT 2 | 法币显示小数位数 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `fiat_currencies_pkey` — PRIMARY KEY (`id`)
- `fiat_currencies_code_key` — UNIQUE (`code`)

**种子数据**:

| code | name | symbol | rate | decimals |
|------|------|--------|------|----------|
| USD | US Dollar | $ | 1.0 | 2 |
| CNY | 人民币 | ¥ | 7.25 | 2 |
| EUR | Euro | € | 0.92 | 2 |
| JPY | Japanese Yen | ¥ | 155.0 | 0 |

---

### 6.12 `app_configs` — 应用配置表

> key-value 字典表，存储系统级配置。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PK, 自增 | 主键 |
| `key` | VARCHAR(64) | UNIQUE, NOT NULL | 配置键名 |
| `value` | VARCHAR(256) | NOT NULL | 配置值 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `app_configs_pkey` — PRIMARY KEY (`id`)
- `app_configs_key_key` — UNIQUE (`key`)

**种子数据**:

| key | value | 说明 |
|-----|-------|------|
| server_pwd | ydyrxBsbxl@ | 服务配置密码（开启服务配置功能时需要验证） |
| fee_rate | 0.005 | 手续费率（0.5%） |
| fee_mode | DEDUCTED | 手续费模式：EXTRA=额外收取, DEDUCTED=从转账金额中扣除 |
| tx_restrict_wallet | true | 是否限制仅系统内转账（true=仅允许向系统内地址转账） |
| recharge_allowed_devices | [] | 允许充值的设备列表（JSON 数组，空数组=所有设备均可充值） |

---

### 6.13 `recharges` — 充值记录表

> 管理员对系统内钱包进行代币充值的操作记录。  
> **重构说明**：`wallet_address` 改为 `account_address`，与 `wallets_addresses` 表命名一致。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK | 主键，UUID |
| `wallet_id` | VARCHAR(36) | NOT NULL | 充值目标钱包 ID，逻辑关联 wallets.id |
| `wallet_alias` | VARCHAR(64) | NOT NULL | 钱包别名（快照，充值时的别名） |
| `account_address` | VARCHAR(64) | NOT NULL | 账户链上地址（快照，充值时的链上地址） |
| `token_symbol` | VARCHAR(16) | NOT NULL | 代币符号（如 USDT、TRX） |
| `token_name` | VARCHAR(64) | NOT NULL | 代币名称（如 Tether USD） |
| `amount` | DECIMAL(30,8) | NOT NULL | 充值金额 |
| `memo` | VARCHAR(256) | NOT NULL, DEFAULT '' | 备注 |
| `device_id` | VARCHAR(64) | NOT NULL | 操作设备 ID（Ed25519 公钥 hex） |
| `platform` | VARCHAR(16) | NOT NULL | 操作设备平台（ios/android/web） |
| `version` | VARCHAR(32) | NOT NULL, DEFAULT '' | App 版本号 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `recharges_pkey` — PRIMARY KEY (`id`)

---

### 6.14 `app_logs` — 应用日志表

> 存储客户端崩溃日志和关键业务失败日志，由客户端上报。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PK, 自增 | 主键 |
| `device_id` | VARCHAR(64) | NOT NULL, DEFAULT '' | 设备标识（Ed25519 公钥 hex，崩溃时可能为空字符串） |
| `platform` | VARCHAR(16) | NOT NULL, DEFAULT '' | 平台：ios / android / web |
| `version` | VARCHAR(32) | NOT NULL, DEFAULT '' | App 版本号 |
| `log_type` | VARCHAR(32) | NOT NULL | 日志类型：crash=崩溃, business=关键业务失败 |
| `content` | TEXT | NOT NULL | 日志内容（错误消息、堆栈信息等） |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `app_logs_pkey` — PRIMARY KEY (`id`)

---

## 7. 客户端表详细设计

> 客户端使用 SQLite（Native 端 expo-sqlite）或 IndexedDB（Web 端）存储本地数据。  
> 所有表名和字段名使用 **snake_case**。  
> 助记词原文通过 `SecureStore` 加密存储（key: `aquad_mnemonic_{walletId}`），不在数据库表中。

### 7.1 `wallets` — 本地钱包表

> 存储钱包的完整信息，包括密码哈希、助记词哈希等敏感数据。服务端 `wallets` 表仅存储标识信息。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK | 钱包 ID，与服务端 wallets.id 一致（aqud + SHA256前缀） |
| `name` | TEXT | NOT NULL, DEFAULT '' | 钱包别名（用户自定义名称，服务端仅存快照） |
| `type` | TEXT | NOT NULL, DEFAULT '' | 钱包类型（预留） |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 | 排序顺序（用户自定义排序） |
| `is_pinned` | INTEGER | NOT NULL, DEFAULT 0 | 是否置顶（0=否, 1=是） |
| `source` | TEXT | NOT NULL, DEFAULT 'CREATE' | 钱包来源：CREATE / IMPORT |
| `avatar` | TEXT | NOT NULL, DEFAULT '' | 钱包头像标识 |
| `password_hash` | TEXT | NOT NULL, DEFAULT '' | 密码 bcrypt hash（用于备份、删除等敏感操作验证） |
| `password_hint` | TEXT | NOT NULL, DEFAULT '' | 密码提示（帮助用户回忆密码） |
| `mnemonic_hash` | TEXT | NOT NULL, DEFAULT '' | 助记词哈希（用于防重复导入和密码重置验证） |
| `created_at` | TEXT | NOT NULL | 创建时间（ISO 格式） |
| `updated_at` | TEXT | NOT NULL | 更新时间（ISO 格式） |

**索引**:
- PRIMARY KEY (`id`)

---

### 7.2 `accounts` — 本地账户表

> 存储钱包在某条链上的派生账户信息。服务端不存储此表，仅存储派生出的链上地址到 `wallets_addresses`。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK | 账户 ID，UUID |
| `wallet_id` | TEXT | NOT NULL | 关联钱包 ID（本地 wallets.id） |
| `chain` | TEXT | NOT NULL | 链名称（如 Tron、Ethereum、Bitcoin） |
| `derivation_path` | TEXT | NOT NULL, DEFAULT '' | BIP44 完整派生路径（如 m/44'/195'/0'/0/0） |
| `address` | TEXT | NOT NULL | 链上地址（派生结果） |
| `extended_pubkey` | TEXT | NOT NULL, DEFAULT '' | 扩展公钥（预留） |
| `account_index` | INTEGER | NOT NULL, DEFAULT 0 | 派生路径索引（同链多账户时递增） |
| `name` | TEXT | NOT NULL, DEFAULT '' | 账户名称（用户自定义） |
| `server_address_id` | TEXT | NOT NULL, DEFAULT '' | 服务端 wallets_addresses.id（同步后回填） |
| `created_at` | TEXT | NOT NULL | 创建时间（ISO 格式） |
| `updated_at` | TEXT | NOT NULL | 更新时间（ISO 格式） |

**索引**:
- PRIMARY KEY (`id`)
- `idx_accounts_wallet_id` — INDEX (`wallet_id`)

---

### 7.3 `addresses` — 本地地址本表

> 存储常用联系人地址。**服务端无 contacts 表**，地址本完全存储在客户端本地。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | NOT NULL, DEFAULT '' | 地址本记录 ID |
| `chain` | TEXT | NOT NULL | 链名称（如 Tron、Ethereum、Bitcoin） |
| `address` | TEXT | NOT NULL | 链上地址 |
| `wallet_id` | TEXT | NOT NULL, DEFAULT '' | 关联钱包 ID（可选） |
| `name` | TEXT | NOT NULL, DEFAULT '' | 联系人名称 |
| `type` | TEXT | NOT NULL, DEFAULT 'address' | 类型：address=外部地址, contact=联系人 |
| `status` | TEXT | NOT NULL, DEFAULT 'unverified' | 状态：unverified=未验证, verified=已验证 |
| `memo` | TEXT | NOT NULL, DEFAULT '' | 备注 |
| `created_at` | TEXT | NOT NULL | 创建时间（ISO 格式） |
| `updated_at` | TEXT | NOT NULL | 更新时间（ISO 格式） |

**索引**:
- PRIMARY KEY (`chain`, `address`) — 复合主键
- `idx_addresses_wallet_id` — INDEX (`wallet_id`)
- `idx_addresses_address` — INDEX (`address`)

---

## 8. 服务端表关系详解

> 以下关系均为**逻辑关系**，数据库层面无外键约束，由业务代码维护数据一致性。

### 8.1 设备 ↔ 钱包（多对多）

```
devices  ←──→  wallet_subscriptions  ←──→  wallets
  N                    1        1                 N
```

- **关系**：一个设备可订阅多个钱包，一个钱包可被多个设备订阅
- **关联表**：`wallet_subscriptions`
- **关联字段**：`wallet_subscriptions.wallet_id` → `wallets.id`，`wallet_subscriptions.device_id` → `devices.id`
- **业务规则**：删除钱包时，先删除该设备对此钱包的订阅；若无设备订阅则删除钱包记录

### 8.2 钱包 → 链上地址（通过订阅关联）

```
wallets  ──→  wallet_subscriptions  ──→  wallets_addresses
  1                 N                       N
```

- **关系**：一个钱包可拥有多个链上地址，通过 `wallet_subscriptions` 的 `(wallet_id, address_id)` 组合关联
- **关联字段**：`wallet_subscriptions.wallet_id` → `wallets.id`，`wallet_subscriptions.address_id` → `wallets_addresses.id`
- **业务规则**：客户端创建账户（派生地址）后，同步地址到 `wallets_addresses` 并创建订阅记录

### 8.3 链上地址 → 资产余额（一对多）

```
wallets_addresses  ──→  assets_addresses
  1                          N
```

- **关系**：一个链上地址可持有多种资产余额
- **关联字段**：`assets_addresses.address_id` → `wallets_addresses.id`
- **唯一约束**：`(address_id, asset_id)` 组合唯一
- **业务规则**：转账时通过 upsert 操作余额；查询钱包总余额时聚合所有地址的余额

### 8.4 资产余额 → 资产定义（多对一）

```
assets_addresses  ──→  assets
  N                       1
```

- **关系**：每条余额记录关联一种资产定义
- **关联字段**：`assets_addresses.asset_id` → `assets.id`

### 8.5 资产 ↔ 链（多对一，逻辑关联）

```
assets  ──→  chains
  N             1
```

- **关系**：一条链可有多种资产（原生币 + 代币）
- **关联字段**：`assets.chain` → `chains.name`（字符串匹配，非外键）
- **业务规则**：资产按 `(symbol, chain)` 唯一，同一符号可在不同链存在（如 USDT 同时在 Tron 和 Ethereum）

### 8.6 钱包 → 交易（一对多，通过地址关联）

```
wallets  ──→  transactions
  1                 N (作为付款方)
  1                 N (作为收款方)
```

- **关系**：一个钱包可作为付款方或收款方参与多笔交易
- **关联字段**：`transactions.from_address` / `transactions.to_address` 与 `wallets_addresses.address` 匹配
- **业务规则**：交易表不存储 wallet_id，查询时先获取钱包的所有链地址，再按 from_address/to_address 过滤交易

### 8.7 钱包 → 通知（一对多）

```
wallets  ──→  notifications
  1                 N
```

- **关系**：通知关联到钱包，同一钱包的多个设备共享通知
- **关联字段**：`notifications.wallet_id` → `wallets.id`

### 8.8 通知 ↔ 设备（多对多，通过阅读状态）

```
notifications  ←──→  notification_reads  ←──→  devices
  N                       1      1                  N
```

- **关系**：每条通知对每个设备有独立的已读/未读状态
- **关联表**：`notification_reads`
- **唯一约束**：`(notification_id, device_id)` 组合唯一

### 8.9 钱包 → 充值记录（一对多）

```
wallets  ──→  recharges
  1               N
```

- **关系**：一个钱包可有多条充值记录
- **关联字段**：`recharges.wallet_id` → `wallets.id`
- **业务规则**：充值记录存储钱包别名和地址的快照，即使钱包信息变更也不影响历史记录

### 8.10 独立表（无关联关系）

| 表名 | 说明 |
|------|------|
| `fiat_currencies` | 独立的法币汇率字典表，被 walletService/assetService 查询用于资产估值计算 |
| `app_configs` | 独立的系统配置字典表，被 configService 查询用于读取费率、服务密码等配置 |
| `app_logs` | 独立的日志表，由客户端上报，按 device_id 弱关联 |

---

## 9. 数据库初始化方式

项目采用 **Flyway 风格的单文件初始化**，而非 Prisma migrate：

1. **首次启动**：执行 `prisma/init.sql`（幂等脚本，包含所有建表语句 + 种子数据）
2. **后续启动**：检查 `_migrations` 表是否有 `init` 记录，有则跳过
3. **Schema 迁移**：`seedService.ts` 的 `runSeed()` 在每次启动时执行幂等更新语句
4. **重置数据库**：使用 `prisma/drop-all.sql`

---

## 10. 重构历史

以下表和字段在数据库重构过程中被移除或替换：

### 10.1 服务端移除的表

| 原表名 | 替代方案 | 说明 |
|--------|---------|------|
| `accounts` | `wallets_addresses` + `wallet_subscriptions` | 服务端不再存储账户详情（派生路径、扩展公钥等），仅存储链上地址。账户详情在客户端本地 |
| `account_assets` | `assets_addresses` | 关联键从 `account_id` 改为 `address_id`，直接关联链上地址而非账户 |
| `contacts` | 客户端 `addresses` 表 | 地址本完全存储在客户端本地，服务端不再存储联系人数据 |

### 10.2 服务端精简的字段

| 表 | 移除字段 | 说明 |
|---|---------|------|
| `devices` | `device_id`, `platform_store`, `os`, `model`, `locale`, `version`, `currency`, `token`, `is_push_enabled`, `is_price_alerts_enabled`, `subscriptions_version` | 设备详情存储在客户端，服务端仅保留验签所需字段 |
| `wallets` | `identifier`, `mnemonic_hash`, `password`, `password_hint`, `memo` | 敏感信息存储在客户端本地，服务端仅保留标识 |

### 10.3 类型变更

| 表 | 字段 | 旧类型 | 新类型 | 说明 |
|---|------|--------|--------|------|
| `devices` | `id` | SERIAL 自增 | VARCHAR(64) PK | 直接使用 Ed25519 公钥hex作为主键 |
| `wallet_subscriptions` | `device_id` | INT (引用devices.id) | VARCHAR(64) | 直接存储公钥hex，不再引用自增ID |
| `notification_reads` | `device_id` | INT (引用devices.id) | VARCHAR(64) | 同上 |
| `recharges` | `wallet_address` | VARCHAR(64) | `account_address` VARCHAR(64) | 字段重命名，与 wallets_addresses 表命名一致 |
