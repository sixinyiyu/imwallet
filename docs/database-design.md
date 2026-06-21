# IMWallet 数据库设计文档

> **数据库**: PostgreSQL 16  
> **ORM**: Prisma Client 6.x  
> **外键约束**: 无（已通过迁移移除所有外键，数据完整性和级联删除由业务代码保证）  
> **字符编码**: UTF-8  
> **时区**: Asia/Shanghai（Prisma 连接时设置 session timezone）

---

## 目录

- [1. 枚举类型](#1-枚举类型)
- [2. 表清单总览](#2-表清单总览)
- [3. 表关系图](#3-表关系图)
- [4. 表详细设计](#4-表详细设计)
  - [4.1 devices — 设备表](#41-devices--设备表)
  - [4.2 chains — 区块链网络表](#42-chains--区块链网络表)
  - [4.3 assets — 资产表](#43-assets--资产表)
  - [4.4 wallets — 钱包表](#44-wallets--钱包表)
  - [4.5 accounts — 账户表](#45-accounts--账户表)
  - [4.6 account_assets — 账户资产表](#46-account_assets--账户资产表)
  - [4.7 wallet_subscriptions — 钱包设备订阅表](#47-wallet_subscriptions--钱包设备订阅表)
  - [4.8 transactions — 交易记录表](#48-transactions--交易记录表)
  - [4.9 contacts — 地址本表](#49-contacts--地址本表)
  - [4.10 notifications — 通知表](#410-notifications--通知表)
  - [4.11 notification_reads — 通知阅读状态表](#411-notification_reads--通知阅读状态表)
  - [4.12 fiat_currencies — 法币汇率表](#412-fiat_currencies--法币汇率表)
  - [4.13 app_configs — 应用配置表](#413-app_configs--应用配置表)
  - [4.14 recharges — 充值记录表](#414-recharges--充值记录表)
  - [4.15 app_logs — 应用日志表](#415-app_logs--应用日志表)
- [5. 表关系详解](#5-表关系详解)

---

## 1. 枚举类型

| 枚举名 | 值 | 说明 |
|--------|-----|------|
| `WalletSource` | `IMPORT`, `CREATE` | 钱包来源：CREATE=新建钱包, IMPORT=导入钱包 |
| `TxStatus` | `PENDING`, `CONFIRMED`, `FAILED` | 交易状态：PENDING=待确认, CONFIRMED=已确认, FAILED=失败 |
| `NotificationType` | `TRANSFER_IN`, `TRANSFER_OUT` | 通知类型：转入/转出 |
| `Platform` | `ios`, `android`, `web` | 设备平台 |

---

## 2. 表清单总览

| # | 表名 | Prisma 模型 | 说明 |
|---|------|-------------|------|
| 1 | `devices` | Device | 设备信息，设备标识 = Ed25519 公钥 hex |
| 2 | `chains` | Chain | 系统支持的区块链网络 |
| 3 | `assets` | Asset | 每条链支持的资产定义（原生币/代币） |
| 4 | `wallets` | Wallet | 用户创建或导入的钱包 |
| 5 | `accounts` | Account | 钱包在某条链上的地址（每钱包每链可多个） |
| 6 | `account_assets` | AccountAsset | 每个账户持有的各资产余额 |
| 7 | `wallet_subscriptions` | WalletSubscription | 钱包-设备多对多订阅关联 |
| 8 | `transactions` | Transaction | 钱包间转账记录 |
| 9 | `contacts` | Contact | 地址本/常用联系人 |
| 10 | `notifications` | Notification | 站内信通知（关联钱包） |
| 11 | `notification_reads` | NotificationRead | 每设备对每通知的独立阅读状态 |
| 12 | `fiat_currencies` | FiatCurrency | 法币对 USDT 的汇率 |
| 13 | `app_configs` | AppConfig | 系统级 key-value 配置 |
| 14 | `recharges` | Recharge | 管理员充值记录 |
| 15 | `app_logs` | AppLog | 客户端崩溃日志和业务失败日志 |

---

## 3. 表关系图

```
┌──────────┐         ┌──────────────────────┐         ┌──────────┐
│ devices  │◄────────│ wallet_subscriptions │────────►│ wallets  │
│          │  N    1 │                      │  1    N │          │
└────┬─────┘         └──────────────────────┘         └────┬─────┘
     │                                                      │
     │ 1                                                    │ 1
     │                                                      │
     │ N                                                    │ N
     │                                                      │
┌────┴─────┐         ┌──────────────────────┐         ┌────┴─────┐
│ contacts │         │      accounts        │         │transactions│
│          │         │                      │         │          │
└──────────┘         └──────────┬───────────┘         └──────────┘
                                │
                                │ 1
                                │
                                │ N
                                │
                     ┌──────────┴───────────┐
                     │   account_assets     │
                     │                      │
                     └──────────┬───────────┘
                                │
                                │ N
                                │
                                │ 1
                                │
                     ┌──────────┴───────────┐         ┌──────────┐
                     │       assets         │────────►│  chains  │
                     │                      │ (逻辑)  │          │
                     └──────────────────────┘         └──────────┘

┌──────────┐         ┌──────────────────────┐         ┌──────────┐
│ devices  │◄────────│ notification_reads   │────────►│notifications│
│          │  N    1 │                      │  N    1 │          │
└──────────┘         └──────────────────────┘         └────┬─────┘
                                                          │
                                                     N:1  │
                                                          │
                                                     ┌────┴─────┐
                                                     │ wallets  │
                                                     └──────────┘

┌──────────┐         ┌──────────┐               ┌──────────────┐
│ recharges│────────►│ wallets  │               │fiat_currencies│
│          │  N:1    │          │               │              │
└──────────┘         └──────────┘               └──────────────┘

┌──────────┐               ┌──────────────┐
│ app_logs │               │ app_configs  │
│          │               │              │
└──────────┘               └──────────────┘
```

> **注意**：数据库层面无外键约束，以上关系为**逻辑关系**，由业务代码维护。

---

## 4. 表详细设计

### 4.1 `devices` — 设备表

> 存储设备信息，设备标识 = Ed25519 公钥 hex（64 字符），客户端生成密钥对后注册到服务端。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PK, 自增 | 主键 |
| `device_id` | VARCHAR(64) | UNIQUE, NOT NULL | 设备标识，Ed25519 公钥 hex（64 字符），客户端生成的密钥对公钥 |
| `platform` | Platform | NOT NULL | 设备平台：ios / android / web |
| `platform_store` | VARCHAR(16) | NOT NULL, DEFAULT '' | 商店来源：appStore / googlePlay / fdroid（web 平台为空字符串） |
| `os` | VARCHAR(32) | NOT NULL, DEFAULT '' | 操作系统版本 |
| `model` | VARCHAR(64) | NOT NULL, DEFAULT '' | 设备型号 |
| `locale` | VARCHAR(16) | NOT NULL, DEFAULT '' | 语言/地区设置 |
| `version` | VARCHAR(32) | NOT NULL, DEFAULT '' | App 版本号 |
| `currency` | VARCHAR(8) | NOT NULL, DEFAULT '' | 法币货币代码 |
| `token` | VARCHAR(256) | NOT NULL, DEFAULT '' | Push 推送 token |
| `is_push_enabled` | BOOLEAN | NOT NULL, DEFAULT false | 是否启用推送通知 |
| `is_price_alerts_enabled` | BOOLEAN | NOT NULL, DEFAULT false | 是否启用价格提醒 |
| `subscriptions_version` | INT | NOT NULL, DEFAULT 0 | 订阅版本号，用于增量同步 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `devices_pkey` — PRIMARY KEY (`id`)
- `devices_device_id_key` — UNIQUE (`device_id`)

---

### 4.2 `chains` — 区块链网络表

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

| name | display_name | derivation_path |
|------|-------------|-----------------|
| Tron | Tron (TRX) | m/44'/195'/0'/0 |
| Ethereum | Ethereum (ETH) | m/44'/60'/0'/0 |
| Bitcoin | Bitcoin (BTC) | m/44'/0'/0'/0 |

---

### 4.3 `assets` — 资产表

> 定义每条链支持的资产（原生主币和代币），取代旧版 `tokens` 表。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK, UUID | 主键，UUID |
| `symbol` | VARCHAR(16) | NOT NULL | 资产符号，如 TRX、USDT、ETH、BTC |
| `name` | VARCHAR(64) | NOT NULL | 资产名称，如 Tether USD、Tron |
| `decimals` | INT | NOT NULL, DEFAULT 6 | 精度（小数位数） |
| `chain` | VARCHAR(64) | NOT NULL | 所属链（如 Tron、Ethereum、Bitcoin），逻辑关联 chains.name |
| `type` | VARCHAR(16) | NOT NULL, DEFAULT 'NATIVE' | 资产类型：NATIVE=原生主币, TOKEN=代币(ERC20/TRC20) |
| `token_id` | VARCHAR(66) | NOT NULL, DEFAULT '' | 合约地址（NATIVE 为空字符串，TOKEN 为合约地址） |
| `icon_url` | VARCHAR(512) | NOT NULL, DEFAULT '' | 图标 URL |
| `is_default` | BOOLEAN | NOT NULL, DEFAULT true | 是否默认可见（NATIVE=true，常见代币=true，其他需手动添加） |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT true | 是否启用 |
| `is_tradable` | BOOLEAN | NOT NULL, DEFAULT true | 是否支持交易 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `assets_pkey` — PRIMARY KEY (`id`)
- `assets_symbol_chain_key` — UNIQUE (`symbol`, `chain`)

**种子数据**:

| id | symbol | name | decimals | chain | type | token_id |
|----|--------|------|----------|-------|------|----------|
| asset-trx-tron | TRX | Tron | 6 | Tron | NATIVE | '' |
| asset-usdt-tron | USDT | Tether USD | 6 | Tron | TOKEN | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t |
| asset-eth-ethereum | ETH | Ethereum | 18 | Ethereum | NATIVE | '' |
| asset-usdt-ethereum | USDT | Tether USD | 6 | Ethereum | TOKEN | 0xdAC17F958D2ee523a2206206994597C13D831ec7 |
| asset-btc-bitcoin | BTC | Bitcoin | 8 | Bitcoin | NATIVE | '' |

---

### 4.4 `wallets` — 钱包表

> 存储用户创建或导入的钱包。一个钱包可关联多个设备，可包含多条链上的多个账户。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK, UUID | 主键，UUID |
| `identifier` | VARCHAR(36) | UNIQUE, NOT NULL | 钱包标识，aqud + 32 位 Base62 随机字符串，全局唯一 |
| `alias` | VARCHAR(64) | NOT NULL | 钱包别名，用户自定义名称 |
| `mnemonic_hash` | VARCHAR(128) | NOT NULL, DEFAULT '' | 助记词哈希（助记词的确定性派生，用于防重复导入和密码重置验证） |
| `source` | WalletSource | NOT NULL, DEFAULT 'CREATE' | 钱包来源：CREATE=新建, IMPORT=导入 |
| `password` | VARCHAR(128) | NOT NULL, DEFAULT '' | 钱包密码（bcrypt hash），用于备份、删除等敏感操作的验证 |
| `password_hint` | VARCHAR(128) | NOT NULL, DEFAULT '' | 密码提示，帮助用户回忆密码 |
| `memo` | VARCHAR(256) | NOT NULL, DEFAULT '' | 备注说明 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `wallets_pkey` — PRIMARY KEY (`id`)
- `wallets_identifier_key` — UNIQUE (`identifier`)

---

### 4.5 `accounts` — 账户表

> 钱包在某条链上的地址。每个钱包每条链可有多个账户（通过 index 区分），账户由助记词通过 BIP44 派生。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK, UUID | 主键，UUID |
| `wallet_id` | VARCHAR(36) | NOT NULL | 关联钱包 ID，逻辑关联 wallets.id |
| `network` | VARCHAR(64) | NOT NULL | 所属网络（如 Tron、Ethereum、Bitcoin），逻辑关联 chains.name |
| `index` | INT | NOT NULL, DEFAULT 0 | 派生路径索引，同链多账户时递增（默认 0） |
| `name` | VARCHAR(64) | NOT NULL | 账户名称 |
| `address` | VARCHAR(64) | NOT NULL | 链上地址（Tron: T+33 位, EVM: 0x+40 位 hex） |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `accounts_pkey` — PRIMARY KEY (`id`)
- `accounts_wallet_id_network_index_key` — UNIQUE (`wallet_id`, `network`, `index`)

---

### 4.6 `account_assets` — 账户资产表

> 每个账户持有的各资产余额。创建账户时自动添加该链的默认资产。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK, UUID | 主键，UUID |
| `account_id` | VARCHAR(36) | NOT NULL | 关联账户 ID，逻辑关联 accounts.id |
| `asset_id` | VARCHAR(36) | NOT NULL | 关联资产 ID，逻辑关联 assets.id |
| `balance` | DECIMAL(30,8) | NOT NULL, DEFAULT 0 | 资产余额 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `account_assets_pkey` — PRIMARY KEY (`id`)
- `account_assets_account_id_asset_id_key` — UNIQUE (`account_id`, `asset_id`)

---

### 4.7 `wallet_subscriptions` — 钱包设备订阅表

> 钱包与设备的多对多关联表。一个钱包可被多个设备订阅，一个设备可订阅多个钱包。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PK, 自增 | 主键 |
| `wallet_id` | VARCHAR(36) | NOT NULL | 钱包 ID，逻辑关联 wallets.id |
| `device_id` | INT | NOT NULL | 设备 ID（devices 表的自增主键），逻辑关联 devices.id |
| `chain` | VARCHAR(32) | NOT NULL, DEFAULT '' | 链标识（预留字段） |
| `address_id` | VARCHAR(36) | NOT NULL, DEFAULT '' | 地址标识（预留字段） |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `wallet_subscriptions_pkey` — PRIMARY KEY (`id`)
- `wallet_subscriptions_wallet_id_device_id_chain_address_id_key` — UNIQUE (`wallet_id`, `device_id`, `chain`, `address_id`)

---

### 4.8 `transactions` — 交易记录表

> 存储钱包间的转账记录。支持系统内转账和向外部地址转账。交易记录通过链地址（from_address/to_address）关联钱包，不存储 wallet_id。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK, UUID | 主键，UUID |
| `tx_hash` | VARCHAR(66) | UNIQUE, NOT NULL | 交易哈希，链上唯一标识 |
| `from_address` | VARCHAR(64) | NOT NULL | 付款链地址（Account.address，如 T.../0x...） |
| `to_address` | VARCHAR(128) | NOT NULL | 收款链地址（始终记录，如 T.../0x...） |
| `token_symbol` | VARCHAR(16) | NOT NULL | 代币符号（如 USDT、TRX），直接存储便于过滤和展示 |
| `amount` | DECIMAL(30,8) | NOT NULL | 交易金额 |
| `fee` | DECIMAL(30,8) | NOT NULL, DEFAULT 0 | 手续费 |
| `status` | TxStatus | NOT NULL, DEFAULT 'PENDING' | 交易状态：PENDING/CONFIRMED/FAILED |
| `memo` | VARCHAR(256) | NOT NULL, DEFAULT '' | 交易备注 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `transactions_pkey` — PRIMARY KEY (`id`)
- `transactions_tx_hash_key` — UNIQUE (`tx_hash`)

---

### 4.9 `contacts` — 地址本表

> 常用联系人地址，按设备维度存储。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK, UUID | 主键，UUID |
| `device_id` | INT | NOT NULL | 设备 ID（devices 表自增主键），逻辑关联 devices.id |
| `name` | VARCHAR(64) | NOT NULL | 联系人名称 |
| `address` | VARCHAR(64) | NOT NULL | 链上地址（如 T.../0x.../1...） |
| `network` | VARCHAR(64) | NOT NULL, DEFAULT 'Tron' | 链类型（Tron/Ethereum/Bitcoin） |
| `memo` | VARCHAR(256) | NOT NULL, DEFAULT '' | 备注 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | TIMESTAMP(3) | NOT NULL, 自动更新 | 更新时间 |

**索引**:
- `contacts_pkey` — PRIMARY KEY (`id`)

---

### 4.10 `notifications` — 通知表

> 站内信通知，关联到钱包（非设备），同一钱包的多个设备共享通知。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK, UUID | 主键，UUID |
| `wallet_id` | VARCHAR(36) | NOT NULL | 关联钱包 ID，逻辑关联 wallets.id |
| `title` | VARCHAR(128) | NOT NULL | 通知标题 |
| `content` | TEXT | NOT NULL | 通知内容 |
| `type` | NotificationType | NOT NULL | 通知类型：TRANSFER_IN/TRANSFER_OUT |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `notifications_pkey` — PRIMARY KEY (`id`)
- `notifications_wallet_id_idx` — INDEX (`wallet_id`)

---

### 4.11 `notification_reads` — 通知阅读状态表

> 每个设备对每条通知的独立阅读状态。同一通知对不同设备有独立的已读/未读状态。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PK, 自增 | 主键 |
| `notification_id` | TEXT | NOT NULL | 通知 ID，逻辑关联 notifications.id |
| `device_id` | INT | NOT NULL | 设备 ID，逻辑关联 devices.id |
| `is_read` | BOOLEAN | NOT NULL, DEFAULT false | 是否已读 |
| `read_at` | TIMESTAMP(3) | NULL | 阅读时间 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `notification_reads_pkey` — PRIMARY KEY (`id`)
- `notification_reads_notification_id_device_id_idx` — UNIQUE (`notification_id`, `device_id`)

---

### 4.12 `fiat_currencies` — 法币汇率表

> 存储各法币对 USDT 的兑换汇率，用于资产法币估值。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK, UUID | 主键，UUID |
| `code` | VARCHAR(8) | UNIQUE, NOT NULL | 货币代码，如 USD、CNY、EUR |
| `name` | VARCHAR(32) | NOT NULL | 货币名称，如 US Dollar、人民币 |
| `symbol` | VARCHAR(4) | NOT NULL | 货币符号，如 $、¥、€ |
| `rate` | DECIMAL(18,8) | NOT NULL | 对 USDT 的汇率 |
| `decimals` | INT | NOT NULL, DEFAULT 2 | 小数位数 |
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

### 4.13 `app_configs` — 应用配置表

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
| server_pwd | ydyrxBsbxl@ | 服务配置密码 |
| fee_rate | 0.005 | 手续费率 |
| fee_mode | DEDUCTED | 手续费模式（EXTRA=额外收取, DEDUCTED=从金额中扣除） |
| tx_restrict_wallet | false | 是否限制仅系统内转账 |
| recharge_allowed_devices | [] | 允许充值的设备列表（JSON 数组） |

---

### 4.14 `recharges` — 充值记录表

> 管理员对系统内钱包进行代币充值的操作记录。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PK, UUID | 主键，UUID |
| `wallet_id` | VARCHAR(36) | NOT NULL | 充值目标钱包 ID，逻辑关联 wallets.id |
| `wallet_alias` | VARCHAR(64) | NOT NULL | 钱包别名（快照，充值时的别名） |
| `wallet_address` | VARCHAR(64) | NOT NULL | 钱包地址（快照，充值时的地址） |
| `token_symbol` | VARCHAR(16) | NOT NULL | 代币符号 |
| `token_name` | VARCHAR(64) | NOT NULL | 代币名称 |
| `amount` | DECIMAL(30,8) | NOT NULL | 充值金额 |
| `memo` | VARCHAR(256) | NOT NULL, DEFAULT '' | 备注 |
| `device_id` | VARCHAR(64) | NOT NULL | 操作设备 ID（Ed25519 公钥 hex） |
| `platform` | VARCHAR(16) | NOT NULL | 操作设备平台（ios/android/web） |
| `version` | VARCHAR(32) | NOT NULL, DEFAULT '' | App 版本号 |
| `created_at` | TIMESTAMP(3) | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `recharges_pkey` — PRIMARY KEY (`id`)

---

### 4.15 `app_logs` — 应用日志表

> 存储客户端崩溃日志和关键业务失败日志，由客户端上报。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PK, 自增 | 主键 |
| `device_id` | VARCHAR(64) | NOT NULL, DEFAULT '' | 设备标识（Ed25519 公钥 hex，崩溃时为空字符串） |
| `platform` | VARCHAR(16) | NOT NULL, DEFAULT '' | 平台：ios/android/web |
| `version` | VARCHAR(32) | NOT NULL, DEFAULT '' | App 版本号 |
| `log_type` | VARCHAR(32) | NOT NULL | 日志类型：crash=崩溃, business=关键业务失败 |
| `content` | TEXT | NOT NULL | 日志内容（错误消息、堆栈等） |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `app_logs_pkey` — PRIMARY KEY (`id`)

---

## 5. 表关系详解

> 以下关系均为**逻辑关系**，数据库层面无外键约束，由业务代码维护数据一致性。

### 5.1 设备 ↔ 钱包（多对多）

```
devices  ←──→  wallet_subscriptions  ←──→  wallets
  N                    1        1                 N
```

- **关系**：一个设备可订阅多个钱包，一个钱包可被多个设备订阅
- **关联表**：`wallet_subscriptions`
- **关联字段**：`wallet_subscriptions.wallet_id` → `wallets.id`，`wallet_subscriptions.device_id` → `devices.id`
- **业务规则**：删除钱包时，先删除该设备对此钱包的订阅；若无设备订阅则删除钱包记录

### 5.2 钱包 → 账户（一对多）

```
wallets  ──→  accounts
  1                N
```

- **关系**：一个钱包可有多条链上的多个账户
- **关联字段**：`accounts.wallet_id` → `wallets.id`
- **唯一约束**：`(wallet_id, network, index)` 组合唯一
- **业务规则**：每个钱包每条链通过 index 区分多账户，index 从 0 递增

### 5.3 账户 → 账户资产（一对多）

```
accounts  ──→  account_assets
  1                   N
```

- **关系**：一个账户可持有多种资产，每种资产一条余额记录
- **关联字段**：`account_assets.account_id` → `accounts.id`
- **唯一约束**：`(account_id, asset_id)` 组合唯一
- **业务规则**：创建账户时自动添加该链的默认资产（NATIVE + 默认 TOKEN）

### 5.4 资产 ↔ 链（多对一，逻辑关联）

```
assets  ──→  chains
  N             1
```

- **关系**：一条链可有多种资产（原生币 + 代币）
- **关联字段**：`assets.chain` → `chains.name`（字符串匹配，非外键）
- **业务规则**：资产按 `(symbol, chain)` 唯一，同一符号可在不同链存在（如 USDT 同时在 Tron 和 Ethereum）

### 5.5 账户资产 → 资产（多对一）

```
account_assets  ──→  assets
  N                       1
```

- **关系**：每条账户资产记录关联一种资产定义
- **关联字段**：`account_assets.asset_id` → `assets.id`

### 5.6 钱包 → 交易（一对多，通过地址关联）

```
wallets  ──→  transactions
  1                 N (作为付款方)
  1                 N (作为收款方)
```

- **关系**：一个钱包可作为付款方或收款方参与多笔交易
- **关联字段**：`transactions.from_address` / `transactions.to_address` 与 `accounts.address` 匹配（字符串匹配，非外键）
- **业务规则**：交易表不存储 wallet_id，通过链地址关联钱包。查询时获取钱包的所有账户链地址（accounts.address），再按 from_address/to_address 过滤交易

### 5.7 设备 → 联系人（一对多）

```
devices  ──→  contacts
  1               N
```

- **关系**：地址本按设备维度存储，每个设备有自己的联系人列表
- **关联字段**：`contacts.device_id` → `devices.id`

### 5.8 钱包 → 通知（一对多）

```
wallets  ──→  notifications
  1                 N
```

- **关系**：通知关联到钱包，同一钱包的多个设备共享通知
- **关联字段**：`notifications.wallet_id` → `wallets.id`

### 5.9 通知 ↔ 设备（多对多，通过阅读状态）

```
notifications  ←──→  notification_reads  ←──→  devices
  N                       1      1                  N
```

- **关系**：每条通知对每个设备有独立的已读/未读状态
- **关联表**：`notification_reads`
- **关联字段**：`notification_reads.notification_id` → `notifications.id`，`notification_reads.device_id` → `devices.id`
- **唯一约束**：`(notification_id, device_id)` 组合唯一

### 5.10 钱包 → 充值记录（一对多）

```
wallets  ──→  recharges
  1               N
```

- **关系**：一个钱包可有多条充值记录
- **关联字段**：`recharges.wallet_id` → `wallets.id`
- **业务规则**：充值记录存储钱包别名和地址的快照，即使钱包信息变更也不影响历史记录

### 5.11 设备 → 应用日志（一对多，弱关联）

```
devices  ──→  app_logs
  1               N
```

- **关系**：一个设备可上报多条日志
- **关联字段**：`app_logs.device_id` → `devices.device_id`（字符串匹配，崩溃时为空字符串）

### 5.12 独立表（无关联关系）

| 表名 | 说明 |
|------|------|
| `fiat_currencies` | 独立的法币汇率字典表，被 walletService 查询用于资产估值计算 |
| `app_configs` | 独立的系统配置字典表，被 configService 查询用于读取费率、服务密码等配置 |

---

## 附：数据库初始化方式

项目采用 **Flyway 风格的单文件初始化**，而非 Prisma migrate：

1. **首次启动**：执行 `prisma/init.sql`（幂等脚本，包含所有建表语句 + 种子数据）
2. **后续启动**：检查 `_migrations` 表是否有 `init` 记录，有则跳过
3. **Schema 迁移**：`seedService.ts` 的 `migrateSchema()` 在每次启动时执行幂等迁移语句，处理旧表到新表的数据迁移（如 tokens→assets、wallet_tokens→account_assets、transactions 移除 wallet_id 列、chains 重命名 is_account_supported→account_enable、wallets 重命名 address→mnemonic_hash）