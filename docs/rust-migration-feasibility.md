# 服务端 TypeScript → Rust 迁移可行性调研

> **调研日期**: 2026-06-22  
> **当前技术栈**: Node.js 18 + Express 4 + Prisma 6 + PostgreSQL 16  
> **代码规模**: 36 个 TS 文件，约 3,342 行代码  
> **目标技术栈**: Rust + Axum + rbatis + PostgreSQL 16 + Tron(tronic)

---

## 目录

- [1. 现状分析](#1-现状分析)
- [2. 迁移可行性评估](#2-迁移可行性评估)
- [3. 技术选型对照](#3-技术选型对照)
- [4. 依赖替换方案](#4-依赖替换方案)
- [5. 迁移策略](#5-迁移策略)
- [6. 模块迁移详细方案](#6-模块迁移详细方案)
  - [6.5 Tron 链交互迁移方案](#65-tron-链交互迁移方案新增模块)
- [7. 迁移收益分析](#7-迁移收益分析)
- [8. 迁移成本与风险](#8-迁移成本与风险)
- [9. 迁移计划与时间线](#9-迁移计划与时间线)
- [10. 结论与建议](#10-结论与建议)

---

## 1. 现状分析

### 1.1 代码规模统计

| 维度 | 数值 |
|------|------|
| TypeScript 源文件 | 36 个 |
| 总代码行数 | ~3,342 行 |
| 路由模块 | 11 个 |
| 服务模块 | 12 个 |
| 中间件 | 4 个 |
| 验证器 | 3 个 |
| API 接口总数 | 36 个 |
| 编译产物大小 | ~281 KB |
| 运行时内存占用 | ~130 MB（Node.js 进程） |

### 1.2 各模块代码量分布

| 模块 | 行数 | 复杂度 | 迁移难度 |
|------|------|--------|---------|
| walletService.ts | 497 | 高（多表关联查询+余额聚合） | ⭐⭐⭐ |
| transactionService.ts | 473 | 高（转账事务+余额操作+通知） | ⭐⭐⭐ |
| deviceService.ts | 184 | 中（订阅管理+多表关联） | ⭐⭐ |
| assetService.ts | 179 | 中（余额聚合计算） | ⭐⭐ |
| rechargeService.ts | 176 | 中（充值+权限校验） | ⭐⭐ |
| deviceAuth.ts | 163 | 高（Ed25519签名验证+防重放） | ⭐⭐⭐ |
| notificationService.ts | 119 | 低（CRUD） | ⭐ |
| config.ts (route) | 115 | 低（字典读写） | ⭐ |
| seedService.ts | 109 | 低（幂等种子数据） | ⭐ |
| rsaService.ts | 92 | 中（RSA密钥管理） | ⭐⭐ |
| accountService.ts | 91 | 低（链列表查询） | ⭐ |
| 其余路由/中间件/工具 | ~760 | 低 | ⭐ |

### 1.3 当前技术依赖清单

| 依赖 | 用途 | Rust 替代方案是否存在 |
|------|------|---------------------|
| express | HTTP 服务器 | ✅ Axum / Actix-web |
| @prisma/client | ORM | ✅ rbatis / SeaORM / Diesel |
| @noble/ed25519 | Ed25519 签名验证 | ✅ ed25519-dalek |
| zod | 请求参数校验 | ✅ serde + validator / garde |
| node-forge | RSA 加密 | ✅ rsa / ring |
| bcryptjs | 密码哈希 | ✅ bcrypt |
| uuid | UUID 生成 | ✅ uuid |
| cors | 跨域中间件 | ✅ tower-http |
| dotenv | 环境变量 | ✅ dotenvy |
| jsonwebtoken | JWT（已废弃，设备认证取代） | ✅ 不需要迁移 |
| bip39 | 助记词（derivationService已删除） | ✅ 不需要迁移 |
| bitcoinjs-lib | BTC地址派生（已删除） | ✅ 不需要迁移 |
| ethers | ETH链交互（预留） | ✅ alloy（Rust Ethereum客户端） |
| tronweb | TRX链交互 | ✅ tronic（Rust Tron客户端） |
| hdkey | HD钱包派生（已删除） | ✅ 不需要迁移 |

### 1.4 核心业务特征

```
当前服务端本质：CRUD API + Ed25519 签名验证 + 服务端账户余额管理 + Tron链交互

业务复杂度：中低
- 无复杂算法
- 无实时通信（WebSocket）
- 无消息队列
- 无定时任务
- 无文件处理
- 无机器学习
- 纯 HTTP 请求-响应模式

⚠️ 核心痛点：内存泄漏与资源管理
- Node.js 进程常驻内存 ~130MB，GC 无法有效回收
- V8 引擎内存管理机制导致资源受限时仍保留大量内存
- 事件监听器泄漏、闭包引用未释放等常见 Node.js 内存问题
- 长时间运行后内存持续增长，无法在低规格服务器上稳定运行

📌 余额数据说明：
- 余额是服务端 account_assets 表中的账户余额，非链上实时数据
- 转账/充值操作直接更新服务端数据库，不查询链上余额
- 客户端 GET /wallets/{id}/balance 获取的是服务端聚合计算结果
- 链上余额查询（tronic）仅用于未来扩展的对账功能
```

---

## 2. 迁移可行性评估

### 2.1 总体评估

| 评估维度 | 评分 | 说明 |
|---------|------|------|
| **技术可行性** | ⭐⭐⭐⭐⭐ | 所有 TS 依赖都有成熟的 Rust 替代方案 |
| **工程可行性** | ⭐⭐⭐⭐ | 代码量小（3342行），模块边界清晰，可逐步迁移 |
| **收益显著性** | ⭐⭐⭐ | 性能提升明显，但当前业务量下 TS 性能已足够 |
| **迁移成本** | ⭐⭐⭐ | 中等成本，约 3-5 人周，需 Rust 经验 |
| **风险可控性** | ⭐⭐⭐⭐ | 有完整测试覆盖，可逐步切换 |

### 2.2 可行性结论

**✅ 技术上完全可行**。当前服务端是一个标准的 CRUD API，没有使用任何 TS 特有的运行时特性，所有依赖都有 Rust 对应方案。代码量仅 3,342 行，模块边界清晰（路由→服务→数据库三层架构），适合迁移。

**⚠️ 需要权衡的是收益与成本**。虽然当前 Node.js 的 QPS 性能已够用，但 **内存泄漏和资源管理是核心痛点**：Node.js 进程常驻 130MB 内存且无法有效释放，在资源受限环境下尤为严重。Rust 迁移的核心驱动力正是解决内存安全问题——从 ~130MB 降至 ~10MB，消除 GC 开销和内存泄漏风险，同时获得编译期类型安全保证。

---

## 3. 技术选型对照

### 3.1 框架选型

| 层 | TypeScript (当前) | Rust (推荐) | 选型理由 |
|---|-------------------|-------------|---------|
| HTTP 框架 | Express 4 | **Axum 0.7** | 生态最活跃、Tower 中间件生态、类型安全、async/await 原生支持 |
| 数据库驱动 | Prisma 6 | **rbatis 4.9** | 异步ORM、动态SQL宏、编译期SQL校验、PostgreSQL原生支持、中文社区活跃 |
| 序列化 | JSON.stringify | **serde / serde_json** | Rust 生态标准、零成本序列化 |
| 参数校验 | Zod | **validator / garde** | derive 宏校验，与 serde 无缝集成 |
| 错误处理 | 自定义 AppError | **thiserror + anyhow** | 类型安全错误处理 |
| 日志 | 自定义 logger | **tracing** | 结构化日志 + 分布式追踪 |
| 配置 | dotenv | **figment / config** | 多源配置合并 |
| 区块链交互 | tronweb (已删除) | **tronic 0.5** | 模块化异步Tron客户端，gRPC+JSON-RPC，智能合约类型安全交互 |

### 3.2 为什么选 Axum 而非 Actix-web

| 对比项 | Axum | Actix-web |
|--------|------|-----------|
| 生态 | tokio 团队官方维护，Tower 中间件 | 独立生态 |
| API 风格 | 函数式，类型安全的提取器 | Actor 模型 |
| 学习曲线 | 较平缓（类似 Express 的中间件链） | 较陡（Actor 模型概念） |
| 类型安全 | 编译期保证 Handler 签名正确 | 较弱 |
| 与 rbatis 集成 | 原生 async，完美兼容 | 兼容但需适配 |

### 3.3 为什么选 rbatis 而非 SQLx/Diesel/SeaORM

| 对比项 | rbatis | SQLx | Diesel | SeaORM |
|--------|--------|------|--------|--------|
| 异步支持 | ✅ 原生 async/await | ✅ 原生 async/await | 2.0 才支持 async | ✅ 原生 async |
| ORM 能力 | ✅ 完整ORM（CRUD宏、动态SQL） | ❌ 纯查询构建器 | ✅ 完整ORM | ✅ 完整ORM |
| 编译期校验 | ✅ 动态SQL宏编译期校验 | ✅ SQL语法+类型编译期校验 | ✅ Schema编译期校验 | ❌ 运行时 |
| 原生 SQL | ✅ 完美支持（py宏） | ✅ 完美支持 | ❌ DSL优先 | ⚠️ 有限支持 |
| 动态 SQL | ✅ 核心特性（条件拼接） | ❌ 不支持 | ❌ 不支持 | ⚠️ 有限支持 |
| 迁移工具 | ✅ 内置 | ✅ sqlx-cli migrate | ✅ diesel-cli | ✅ 自带 |
| 学习曲线 | 低（宏+SQL即可） | 低（写SQL即可） | 中（需学DSL） | 中（Entity模型） |
| 中文社区 | ✅ 活跃（国产ORM） | ⚠️ 国际社区 | ⚠️ 国际社区 | ⚠️ 国际社区 |
| 内存效率 | ✅ 极低开销 | ⚠️ 编译期宏开销大 | ⚠️ 中等 | ⚠️ 中等 |
| 适合场景 | 已有SQL+动态查询需求 | 简单查询+类型安全 | 全新项目 | 复杂关联查询 |

> **选 rbatis 的关键原因**：
> 1. **内存效率优先**：rbatis 运行时开销极低，符合本项目"解决内存泄漏"的核心目标
> 2. **动态SQL支持**：项目中的余额聚合、多条件查询等需要动态拼接SQL条件，rbatis 的 `py!` 宏天然支持
> 3. **已有SQL复用**：项目已有完整的 `init.sql`，rbatis 可以直接复用，同时提供ORM层便利
> 4. **Prisma迁移友好**：rbatis 的 CRUD 宏（`crud!`、`select!`、`update!`）与 Prisma Client API 语义接近，迁移更直观
> 5. **中文社区**：rbatis 是国产ORM，文档和社区支持对中文开发者更友好

### 3.4 为什么选 tronic 作为 Tron 链交互库

| 对比项 | tronic | 直接HTTP调用 | tronweb (JS) |
|--------|--------|-------------|-------------|
| 类型安全 | ✅ alloy-sol-types宏编译期保证 | ❌ 手动构造请求 | ❌ JS动态类型 |
| 协议支持 | ✅ gRPC(tonic) + JSON-RPC | ⚠️ 仅HTTP | ✅ HTTP |
| 签名支持 | ✅ LocalSigner + 可插拔后端 | ❌ 需自行实现 | ✅ 内置 |
| TRC-20 | ✅ 类型安全token交互 | ❌ 手动编码 | ✅ JS封装 |
| 事件监听 | ✅ Rich event filtering | ❌ 需自行实现 | ✅ 有限支持 |
| 异步模型 | ✅ tokio原生async | ⚠️ 需手动异步 | ✅ Promise |
| 资源管理 | ✅ 能量/带宽计算 | ❌ 需自行实现 | ✅ 有限支持 |
| 多签支持 | ✅ 完整workflow | ❌ 需自行实现 | ❌ 不支持 |

> **选 tronic 的关键原因**：
> 1. **本项目区块链网络主要执行Tron**：钱包核心业务围绕Tron链，需要与Tron节点深度交互
> 2. **类型安全**：tronic 使用 alloy-sol-types 宏，智能合约调用在编译期即可校验，避免运行时错误
> 3. **gRPC高性能**：通过 tonic gRPC 与 Tron 节点通信，比 HTTP JSON-RPC 性能更高，内存开销更低
> 4. **可插拔签名**：支持 LocalSigner（本地签名）和自定义异步签名后端，灵活适配不同安全需求
> 5. **地址校验**：当前核心用途是 Tron 地址格式校验，替代原 TS 的地址校验逻辑
> 6. **资源委托**：支持带宽/能量冻结/解冻操作，与钱包资源管理业务契合
>
> **⚠️ 注意**：当前余额是服务端 `account_assets` 表数据，非链上实时余额。
> tronic 的链上余额查询仅用于未来扩展的对账功能，不在当前迁移核心范围内。

---

## 4. 依赖替换方案

### 4.1 加密/签名

| 功能 | TS 依赖 | Rust 依赖 | 说明 |
|------|---------|-----------|------|
| Ed25519 签名验证 | @noble/ed25519 | `ed25519-dalek` | 服务端最核心的加密依赖，dalek 是 Rust 生态标准实现 |
| SHA-256 哈希 | node:crypto | `sha2` | 用于请求体哈希 |
| RSA 密钥生成/解密 | node:crypto | `rsa` + `rand` | RSA 密钥对管理和 OAEP 解密 |
| UUID 生成 | uuid | `uuid` | v4 UUID 生成 |
| 随机数 | node:crypto | `rand` | Nonce 生成 |

### 4.2 Web 框架

| 功能 | TS 依赖 | Rust 依赖 | 说明 |
|------|---------|-----------|------|
| HTTP 服务器 | express | `axum` | 路由、中间件、JSON |
| CORS | cors | `tower-http` | CORS 中间件 |
| 请求限流 | express-rate-limit | `tower-governor` | 速率限制 |
| 请求日志 | 自定义 middleware | `tracing` + `tower-http` | 结构化请求日志 |
| JSON 解析 | express.json() | `axum::Json` | 请求体解析 |

### 4.3 数据库

| 功能 | TS 依赖 | Rust 依赖 | 说明 |
|------|---------|-----------|------|
| 数据库连接池 | @prisma/client | `rbatis` (RBatis) | PostgreSQL 连接池 + ORM |
| 查询构建 | Prisma Client API | `rbatis` CRUD宏 + `py!` 动态SQL宏 | 编译期校验的动态 SQL 查询 |
| 事务 | prisma.$transaction | `rbatis` 事务支持 | 显式事务控制 |
| 数据库迁移 | 自定义 migrator + init.sql | `rbatis` 内置迁移 | 复用现有 init.sql |

### 4.5 区块链交互（新增）

| 功能 | TS 依赖 | Rust 依赖 | 说明 |
|------|---------|-----------|------|
| Tron链交互 | tronweb (已删除) | `tronic` | 模块化异步Tron客户端 |
| Tron gRPC通信 | 无 | `tronic` (GrpcProvider) | 高性能gRPC协议 |
| Tron签名 | tronweb内置 | `tronic` (LocalSigner) | 本地签名，可插拔后端 |
| TRC-20交互 | tronweb内置 | `tronic` (TRC-20 builders) | 类型安全token交互 |
| Tron事件监听 | 无 | `tronic` (Event Filtering) | 实时事件订阅 |
| Tron资源管理 | 无 | `tronic` (Resource Delegation) | 能量/带宽冻结解冻 |
| Tron多签 | 无 | `tronic` (Multi-Signature) | 完整多签workflow |

> **⚠️ 余额机制说明**：当前余额是服务端 `account_assets` 表中的账户余额，非链上实时数据。
> 转账/充值操作直接更新服务端数据库，不查询链上余额。
> tronic 的链上余额查询功能仅用于未来扩展的对账功能，不在当前迁移范围内。

### 4.4 其他

| 功能 | TS 依赖 | Rust 依赖 | 说明 |
|------|---------|-----------|------|
| 环境变量 | dotenv | `dotenvy` | .env 文件加载 |
| 参数校验 | zod | `validator` (derive 宏) | 结构体字段校验 |
| 时间处理 | Date | `chrono` | 时间戳处理 |
| 序列化 | JSON | `serde` + `serde_json` | JSON 序列化/反序列化 |

---

## 5. 迁移策略

### 5.1 推荐策略：并行运行 + 逐步切换

```
阶段 1: Rust 服务端开发（与 TS 并行运行）
阶段 2: 接口逐个切换（客户端逐步指向 Rust 服务）
阶段 3: TS 服务端下线
```

```
                    ┌─────────────────┐
                    │   Nginx / 负载   │
                    │   均衡器         │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────┴──────┐ ┌────┴─────┐ ┌──────┴──────┐
     │ TS Server     │ │ Rust     │ │ TS Server   │
     │ (已迁移接口)   │ │ Server   │ │ (未迁移接口) │
     │ → 代理到 Rust  │ │ (新接口)  │ │ (直接处理)   │
     └───────────────┘ └──────────┘ └─────────────┘
```

### 5.2 迁移顺序（按依赖关系排序）

```
第 1 批（基础设施，无业务依赖）：
  ① 配置加载 (config)
  ② 日志 (tracing)
  ③ 数据库连接池 (rbatis RBatis)
  ④ 错误处理 (thiserror)
  ⑤ JSON 序列化 (serde)

第 2 批（认证层，所有接口依赖）：
  ⑥ Ed25519 签名验证中间件 (deviceAuth)
  ⑦ 参数校验中间件 (validator)

第 3 批（简单 CRUD 接口，低风险）：
  ⑧ 健康检查 (GET /health)
  ⑨ 法币汇率 (GET /fiat/rates)
  ⑩ RSA 公钥 (GET /rsa/public-key)
  ⑪ 日志上报 (POST /logs)

第 4 批（设备管理，认证基础）：
  ⑫ 设备注册 (POST /devices)
  ⑬ 设备信息 (GET /devices/me)
  ⑭ 钱包订阅 (POST/DELETE/GET /devices/wallets)

第 5 批（钱包管理，核心业务）：
  ⑮ 钱包 CRUD (GET/POST/DELETE /wallets)
  ⑯ 钱包地址同步 (POST/DELETE/GET /wallets/:id/addresses)
  ⑰ 钱包余额 (GET /wallets/:id/balance)
  ⑱ 钱包聚合 (GET /wallets/aggregate)

第 6 批（资产与交易，最高复杂度）：
  ⑲ 资产列表 (GET /assets)
  ⑳ 资产余额 (GET /assets/:walletId/balance, /list)
  ㉑ 资产交易开关 (PUT /assets/:id/tradable)
  ㉒ 转账 (POST /transactions/transfer) ← 最复杂，需事务
  ㉓ 交易查询 (GET /transactions)
  ㉔ 地址校验 (GET /transactions/check-address)

第 6.5 批（Tron链交互，新增模块）：
  ㉔½ Tron客户端初始化 (tronic GrpcProvider)
  ㉔¾ 地址校验集成 (tronic validate_address) ← 当前核心用途
  ㉔⅝ 链上余额对账 (tronic get_trx_balance / get_trc20_balance) ← 未来扩展
  ㉔⅞ 事件监听 (tronic listen_transfer_events) ← 未来扩展

第 7 批（配置与通知，收尾）：
  ㉕ 配置管理 (GET/POST/PUT /config/*)
  ㉖ 通知管理 (GET/PUT /notifications/*)
  ㉗ 充值管理 (POST/GET /recharges)
  ㉘ 账户查询 (GET /accounts/*)

第 8 批（启动流程）：
  ㉙ 数据库迁移 (migrator)
  ㉚ 种子数据 (seedService)
  ㉛ RSA 密钥初始化 (rsaService)
```

---

## 6. 模块迁移详细方案

### 6.1 项目结构对照

```
TypeScript (当前)                    Rust (目标)
apps/server/src/                     apps/server-rs/src/
├── index.ts                         ├── main.rs
├── config/                          ├── config/
│   ├── index.ts                     │   ├── mod.rs
│   ├── chains.ts                    │   └── chains.rs
│   └── prisma.ts                    │
├── middleware/                      ├── middleware/
│   ├── deviceAuth.ts                │   ├── mod.rs
│   ├── errorHandler.ts              │   ├── device_auth.rs
│   ├── requestLogger.ts             │   ├── error_handler.rs
│   └── validate.ts                  │   └── request_logger.rs
├── routes/                          ├── routes/
│   ├── device.ts                    │   ├── mod.rs
│   ├── wallet.ts                    │   ├── device.rs
│   ├── ...                          │   ├── wallet.rs
├── services/                        │   ├── ...
│   ├── walletService.ts             ├── services/
│   ├── transactionService.ts        │   ├── mod.rs
│   ├── ...                          │   ├── wallet_service.rs
├── validators/                      │   ├── transaction_service.rs
│   ├── wallet.ts                    │   ├── ...
│   ├── ...                          ├── models/          ← 新增
├── utils/                           │   ├── mod.rs
│   └── logger.ts                    │   ├── device.rs
└── __tests__/                       │   ├── wallet.rs
                                     │   ├── transaction.rs
                                     │   └── ...
                                     ├── validators/      ← 新增
                                     │   ├── mod.rs
                                     │   ├── wallet.rs
                                     │   └── ...
                                     └── db/              ← 新增 (rbatis)
                                         ├── mod.rs
                                         ├── queries.rs
                                         └── crud_macros.rs  ← rbatis CRUD宏定义
                                     ├── chain/            ← 新增 (Tron链交互)
                                         ├── mod.rs
                                         ├── tron_client.rs   ← tronic客户端封装
                                         ├── tron_signer.rs   ← Tron签名服务
                                         ├── tron_events.rs   ← 事件监听
                                         └── address_validate.rs ← 地址校验
```

### 6.2 Ed25519 签名验证迁移（最关键模块）

**TypeScript 实现**（deviceAuth.ts, 163行）：

```typescript
// 核心验证逻辑
const valid = await verifyAsync(sigBytes, msgBytes, pubKeyBytes);
```

**Rust 实现方案**：

```rust
use ed25519_dalek::{Verifier, Signature, VerifyingKey};
use sha2::{Sha256, Digest};

/// 设备签名验证中间件
pub async fn device_auth_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    // 1. 提取 headers
    let device_id = req.headers()
        .get("x-device-id")
        .ok_or(AppError::Unauthorized("缺少认证信息"))?;
    let signature = req.headers()
        .get("x-signature")
        .ok_or(AppError::Unauthorized("缺少认证信息"))?;
    let timestamp = req.headers()
        .get("x-timestamp")
        .ok_or(AppError::Unauthorized("缺少认证信息"))?;
    let nonce = req.headers()
        .get("x-nonce")
        .ok_or(AppError::Unauthorized("缺少认证信息"))?;

    // 2. 验证 timestamp ±5分钟
    let ts: i64 = timestamp.parse()
        .map_err(|_| AppError::Unauthorized("时间戳无效"))?;
    let now = chrono::Utc::now().timestamp();
    if (now - ts).abs() > 300 {
        return Err(AppError::Unauthorized("请求已过期"));
    }

    // 3. Nonce 防重放（内存缓存 + 定时清理）
    let nonce_store = &state.nonce_store;
    if nonce_store.contains(nonce).await {
        return Err(AppError::Unauthorized("重复请求"));
    }
    nonce_store.insert(nonce.to_string(), now).await;

    // 4. 构造签名消息: timestamp + method + path + bodyHash
    let body_hash = compute_body_hash(req.body());
    let message = format!("{}{}{}{}", timestamp, method, path, body_hash);

    // 5. Ed25519 签名验证
    let pub_key_bytes = hex::decode(device_id)
        .map_err(|_| AppError::Unauthorized("设备标识格式无效"))?;
    let verifying_key = VerifyingKey::from_bytes(&pub_key_bytes)
        .map_err(|_| AppError::Unauthorized("公钥格式无效"))?;
    let sig_bytes = hex::decode(signature)
        .map_err(|_| AppError::Unauthorized("签名格式无效"))?;
    let signature = Signature::from_slice(&sig_bytes)
        .map_err(|_| AppError::Unauthorized("签名格式无效"))?;

    verifying_key.verify(message.as_bytes(), &signature)
        .map_err(|_| AppError::Unauthorized("签名验证失败"))?;

    // 6. 查询设备是否已注册
    let device: Option<Device> = RBatis::query_as("SELECT * FROM devices WHERE id = $1")
        .bind(device_id)
        .fetch_optional(&state.rb).await?;

    // 7. 设备不存在但签名合法 → 自动重建
    let device = match device {
        Some(d) => d,
        None => {
            RBatis::exec("INSERT INTO devices (id, platform) VALUES ($1, 'android')")
                .bind(device_id)
                .execute(&state.rb).await?;
            // 重新查询
            RBatis::query_as("SELECT * FROM devices WHERE id = $1")
                .bind(device_id)
                .fetch_one(&state.rb).await?
        }
    };

    // 8. 注入设备信息到请求扩展
    req.extensions_mut().insert(DevicePayload {
        device_id: device.id,
        platform: device.platform,
    });

    Ok(next.run(req).await)
}
```

### 6.3 转账事务迁移（最复杂模块）

**TypeScript 实现**（transactionService.ts, 473行核心逻辑）：

```typescript
// 转账核心：多表事务操作
await prisma.$transaction([
  prisma.assetsAddress.upsert({ /* 扣减发送方余额 */ }),
  prisma.assetsAddress.upsert({ /* 增加收款方余额 */ }),
  prisma.transaction.create({ /* 创建交易记录 */ }),
  prisma.notification.create({ /* 通知发送方 */ }),
  prisma.notification.create({ /* 通知收款方 */ }),
]);
```

**Rust 实现方案**：

```rust
pub async fn transfer(
    rb: &RBatis,
    input: TransferInput,
    device_id: &str,
) -> Result<TransactionResult, AppError> {
    // 开启事务
    let mut tx = rb.acquire_begin().await?;

    // 1. 校验发送钱包属于当前设备
    let sub: Option<WalletSubscription> = RBatis::query_as(
        "SELECT * FROM wallet_subscriptions WHERE wallet_id = $1 AND device_id = $2")
        .bind(&input.from_wallet_id)
        .bind(device_id)
        .fetch_optional(&mut *tx).await?;
    if sub.is_none() {
        return Err(AppError::Forbidden("该钱包不属于当前设备"));
    }

    // 2. 查找资产
    let asset: Asset = RBatis::query_as(
        "SELECT * FROM assets WHERE symbol = $1 AND chain = $2")
        .bind(&input.token_symbol)
        .bind(&input.network)
        .fetch_optional(&mut *tx).await?
        .ok_or(AppError::NotFound("代币类型不存在"))?;

    // 3. 查找发送方地址
    let from_address: WalletAddress = RBatis::query_as(
        "SELECT wa.* FROM wallet_subscriptions ws
         JOIN wallets_addresses wa ON wa.id = ws.address_id
         WHERE ws.wallet_id = $1 AND ws.chain = $2 AND ws.address_id != ''")
        .bind(&input.from_wallet_id)
        .bind(&input.network)
        .fetch_optional(&mut *tx).await?
        .ok_or(AppError::BadRequest("未找到发送方地址"))?;

    // 4. 查找发送方余额
    let sender_balance: AccountAsset = RBatis::query_as(
        "SELECT * FROM account_assets WHERE address_id = $1 AND asset_id = $2")
        .bind(&from_address.id)
        .bind(&asset.id)
        .fetch_optional(&mut *tx).await?
        .ok_or(AppError::BadRequest("当前钱包无该代币余额"))?;

    // 5. 获取费率配置
    let fee_config = get_fee_config(&mut *tx).await?;

    // 6. 计算手续费和实收金额
    let amount: Decimal = input.amount.parse()?;
    let fee = amount * fee_config.fee_rate;
    let received = match fee_config.fee_mode {
        FeeMode::Deducted => amount - fee,
        FeeMode::Extra => amount,
    };

    // 7. 校验余额
    if sender_balance.balance < amount + match fee_config.fee_mode {
        FeeMode::Extra => fee,
        FeeMode::Deducted => Decimal::ZERO,
    } {
        return Err(AppError::BadRequest("余额不足"));
    }

    // 8. 检查交易限制
    if fee_config.tx_restrict {
        let in_system: Option<WalletAddress> = RBatis::query_as(
            "SELECT 1 FROM wallets_addresses WHERE address = $1")
            .bind(&input.to_address)
            .fetch_optional(&mut *tx).await?;
        if in_system.is_none() {
            return Err(AppError::BadRequest("收款地址不在系统内"));
        }
    }

    // 9. 扣减发送方余额
    RBatis::exec(
        "UPDATE account_assets SET balance = balance - $1, updated_at = NOW()
         WHERE address_id = $2 AND asset_id = $3")
        .bind(amount + match fee_config.fee_mode { FeeMode::Extra => fee, _ => Decimal::ZERO })
        .bind(&from_address.id)
        .bind(&asset.id)
        .execute(&mut *tx).await?;

    // 10. 增加收款方余额 (upsert)
    RBatis::exec(
        "INSERT INTO account_assets (id, address_id, asset_id, chain, balance)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (address_id, asset_id)
         DO UPDATE SET balance = balance + $5, updated_at = NOW()")
        .bind(Uuid::new_v4())
        .bind(&to_address_id)
        .bind(&asset.id)
        .bind(&input.network)
        .bind(received)
        .execute(&mut *tx).await?;

    // 11. 创建交易记录
    let tx_hash = format!("0x{}", hex::encode(&Sha256::digest(format!(
        "{}{}{}{}", from_address.address, input.to_address, amount, chrono::Utc::now()
    ))));
    RBatis::exec(
        "INSERT INTO transactions (id, tx_hash, from_address, to_address, token_symbol, amount, fee, status, memo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMED', $8)")
        .bind(Uuid::new_v4())
        .bind(&tx_hash)
        .bind(&from_address.address)
        .bind(&input.to_address)
        .bind(&input.token_symbol)
        .bind(amount)
        .bind(fee)
        .bind(&input.memo)
        .execute(&mut *tx).await?;

    // 12. 创建通知
    RBatis::exec(
        "INSERT INTO notifications (id, wallet_id, title, content, type)
         VALUES ($1, $2, '转账成功', $3, 'TRANSFER_OUT')")
        .bind(Uuid::new_v4())
        .bind(&input.from_wallet_id)
        .bind(format!("您已向 {} 转出 {} {}", to_name, amount, input.token_symbol))
        .execute(&mut *tx).await?;

    // 提交事务
    tx.commit().await?;

    Ok(TransactionResult { /* ... */ })
}
```

### 6.4 Prisma → rbatis 查询对照

| Prisma 写法 | rbatis 写法 |
|-------------|------------|
| `prisma.wallet.findUnique({ where: { id } })` | `RBatis::query_as("SELECT * FROM wallets WHERE id = $1").bind(id).fetch_optional(&rb)` |
| `prisma.wallet.findMany({ where: {...} })` | `RBatis::query_as("SELECT * FROM wallets WHERE ...").fetch_all(&rb)` |
| `prisma.wallet.create({ data: {...} })` | `RBatis::exec("INSERT INTO wallets ... VALUES ($1, $2)").bind(...).execute(&rb)` |
| `prisma.wallet.update({ where: {...}, data: {...} })` | `RBatis::exec("UPDATE wallets SET ... WHERE id = $1").bind(...).execute(&rb)` |
| `prisma.wallet.deleteMany({ where: {...} })` | `RBatis::exec("DELETE FROM wallets WHERE ...").execute(&rb)` |
| `prisma.$transaction([...])` | `let mut tx = rb.acquire_begin(); ... tx.commit()` |
| `prisma.$queryRawUnsafe(sql)` | `RBatis::exec(sql).execute(&rb)` |
| `prisma.asset.upsert({ where, update, create })` | `INSERT ... ON CONFLICT ... DO UPDATE SET ...` |

> **rbatis CRUD 宏简化写法**（推荐用于简单CRUD）：
>
> ```rust
> // 使用 crud! 宏自动生成 CRUD 方法
> #[derive(Debug, Clone, Serialize, Deserialize)]
> struct Wallet {
>     id: Option<String>,
>     identifier: Option<String>,
>     source: Option<String>,
>     created_at: Option<NaiveDateTime>,
>     updated_at: Option<NaiveDateTime>,
> }
>
> // crud! 宏自动生成 fetch_by_id / save / update / delete 等方法
> crud!(Wallet { table:"wallets" });
>
> // 使用示例
> let wallet = Wallet::select_by_id(rb, "wallet-001").await?;
> let wallets = Wallet::select_all(rb).await?;
> Wallet::insert(rb, &wallet).await?;
> Wallet::update_by_id(rb, &wallet).await?;
> Wallet::delete_by_id(rb, "wallet-001").await?;
> ```
>
> **动态 SQL 宏**（用于条件查询）：
>
> ```rust
> // py! 宏支持动态条件拼接
> let wallets = py!(
>     "SELECT * FROM wallets
>      WHERE 1=1
>      {{#if source}}
>        AND source = $source
>      {{/if}}
>      {{#if identifier}}
>        AND identifier = $identifier
>      {{/if}}"
> ).fetch_all(&rb).await?;
> ``` |

### 6.5 Tron 链交互迁移方案（新增模块）

**当前状态**：原 TS 服务端中 tronweb 已删除，链交互逻辑在客户端。Rust 迁移后，服务端将重新集成 Tron 链交互能力。

**Rust 实现方案**（使用 tronic 库）：

```rust
use tronic::client::Client;
use tronic::client::pending::AutoSigning;
use tronic::domain::address::TronAddress;
use tronic::provider::grpc::GrpcProvider;
use tronic::signer::LocalSigner;
use tronic::trx;

/// Tron 链客户端封装
pub struct TronService {
    client: Client,
}

impl TronService {
    pub async fn new(grpc_url: &str) -> Result<Self, AppError> {
        let client = Client::builder()
            .provider(
                GrpcProvider::new(
                    grpc_url.parse()?,
                    tronic::client::Auth::None,
                ).await?
            )
            .signer(LocalSigner::rand())  // 或从配置加载密钥
            .build();
        Ok(Self { client })
    }

    /// 地址校验 - 检查Tron地址是否有效
    pub async fn validate_address(&self, address: &str) -> Result<bool, AppError> {
        let tron_addr = TronAddress::try_from(address)?;
        Ok(tron_addr.is_valid())
    }

    /// 查询链上 TRX 余额（未来扩展：用于与服务端余额对账）
    /// ⚠️ 当前余额是服务端 account_assets 表数据，非链上实时余额
    pub async fn get_trx_balance(&self, address: &str) -> Result<u64, AppError> {
        let tron_addr = TronAddress::try_from(address)?;
        let balance = self.client.get_account_balance(tron_addr).await?;
        Ok(balance)
    }

    /// 查询链上 TRC-20 代币余额（未来扩展：用于与服务端余额对账）
    /// ⚠️ 当前余额是服务端 account_assets 表数据，非链上实时余额
    pub async fn get_trc20_balance(
        &self,
        address: &str,
        contract_address: &str,
    ) -> Result<u64, AppError> {
        // 使用 tronic 的 TRC-20 类型安全交互
        let balance = self.client
            .trc20_balance_of(contract_address, address)
            .await?;
        Ok(balance)
    }

    /// 发送 TRX 转账
    pub async fn send_trx(
        &self,
        to_address: &str,
        amount_sun: u64,  // 1 TRX = 1_000_000 SUN
    ) -> Result<String, AppError> {
        let to = TronAddress::try_from(to_address)?;
        let txid = self.client
            .send_trx()
            .to(to)
            .amount(trx!(amount_sun))
            .build::<AutoSigning>()
            .await?
            .broadcast(&())
            .await?;
        Ok(txid.to_string())
    }

    /// 监听 TRC-20 转账事件
    pub async fn listen_transfer_events(
        &self,
        contract_address: &str,
    ) -> Result<(), AppError> {
        // 使用 tronic 的事件过滤功能
        self.client
            .subscribe_transfer_events(contract_address)
            .await?;
        Ok(())
    }
}
```

> **⚠️ 重要说明：余额数据机制**
>
> 当前余额**不是链上实时数据**，而是服务端 `account_assets` 表中的账户余额，由服务端统一管理：
> - 转账操作直接更新服务端数据库中的余额（扣减发送方、增加收款方）
> - 充值操作直接增加服务端数据库中的余额
> - 客户端通过 `GET /wallets/{id}/balance` 获取的是服务端聚合计算结果
> - **不涉及链上实时余额查询**
>
> **tronic 在本项目中的核心用途**：
> 1. **地址校验**：替代原 TS 的地址格式校验，类型安全校验 Tron 地址有效性
> 2. **链上余额对账**（未来扩展）：定期与链上实际余额比对，发现服务端余额偏差
> 3. **转账广播**（未来扩展）：系统内转账的链上确认，确保链上交易成功
> 4. **事件监听**（未来扩展）：监听链上转账事件，辅助服务端余额校准
> 5. **资源管理**：能量/带宽冻结解冻，优化链上操作成本

---

## 7. 迁移收益分析

### 7.1 性能收益

> **⚠️ 核心驱动力：解决内存泄漏与资源管理问题**
>
> 当前 Node.js 服务端的核心痛点不是 QPS 性能瓶颈，而是 **内存泄漏和资源管理**：
> - V8 引擎 GC 无法有效回收，进程常驻 ~130MB 内存
> - 事件监听器泄漏、闭包引用未释放等常见 Node.js 内存问题
> - 长时间运行后内存持续增长，低规格服务器无法稳定运行
> - Rust 迁移后内存从 ~130MB 降至 ~10MB，彻底消除 GC 开销和内存泄漏风险

| 指标 | TypeScript (Node.js) | Rust (预估) | 提升倍数 |
|------|---------------------|-------------|---------|
| **常驻内存占用** | ~130 MB（含GC开销） | ~10 MB | **13x** ⭐核心指标 |
| **内存泄漏风险** | ❌ 高（V8 GC不保证回收） | ✅ 无（所有权系统保证） | **彻底消除** ⭐ |
| 冷启动时间 | ~500ms | ~5ms | **100x** |
| 单核 QPS（简单CRUD） | ~5,000 | ~50,000 | **10x** |
| 单核 QPS（复杂查询） | ~1,000 | ~10,000 | **10x** |
| 二进制大小 | 281KB (JS) + ~80MB (node) | ~15 MB (静态编译) | **更小** |
| Docker 镜像大小 | ~200 MB (node:18-alpine) | ~20 MB (scratch/distroless) | **10x** |

### 7.2 安全收益

| 安全维度 | TypeScript | Rust | 说明 |
|---------|-----------|------|------|
| 内存安全 | ❌ 运行时可能 NPE/undefined，**内存泄漏无法根治** | ✅ 编译期保证，**所有权系统消除内存泄漏** | Rust 所有权系统消除空指针、缓冲区溢出、内存泄漏 |
| 类型安全 | ⚠️ 运行时可被 any 绕过 | ✅ 编译期完整保证 | 无 any 类型，无运行时类型错误 |
| 并发安全 | ❌ 需手动管理 | ✅ Send + Sync 编译期保证 | 无数据竞争 |
| 错误处理 | ⚠️ 异常可能被吞 | ✅ Result 必须处理 | 编译器强制处理所有错误路径 |
| 依赖安全 | ⚠️ npm 供应链风险 | ✅ crates.io 审查更严 | Rust 生态依赖更少更安全 |

### 7.3 运维收益

| 运维维度 | TypeScript | Rust | 说明 |
|---------|-----------|------|------|
| 部署方式 | Node.js 运行时 + 代码 | 单个静态二进制 | 无运行时依赖，scratch 镜像 |
| Docker 镜像 | ~200MB | ~20MB | 10x 更小，拉取更快 |
| 内存消耗 | ~130MB 常驻 | ~10MB 常驻 | 可在更小规格服务器运行 |
| CPU 消耗 | V8 JIT 开销 | 原生机器码 | 更低 CPU 占用 |
| 冷启动 | ~500ms | ~5ms | 适合 Serverless / 弹性伸缩 |
| 监控 | 需 APM 工具 | tracing 原生集成 | 内置分布式追踪 |

### 7.4 长期维护收益

| 维度 | TypeScript | Rust | 说明 |
|------|-----------|------|------|
| 重构信心 | ⚠️ 运行时才发现错误 | ✅ 编译器引导重构 | 大规模重构时编译器是安全网 |
| 代码自文档化 | ⚠️ 类型推断有限 | ✅ 类型签名即文档 | 函数签名完整表达输入输出 |
| 依赖数量 | 20+ npm 依赖 | ~15 crates | 依赖更少，攻击面更小 |
| 编译检查 | 仅类型检查 | 类型 + 借用 + 生命周期 | 编译通过≈正确性保证 |

### 7.5 收益量化总结

```
┌────────────────────────────────────────────────────┐
│                迁移收益雷达图                        │
│                                                    │
│                    性能 (10x)                       │
│                       ★                             │
│                      / \                            │
│                     /   \                           │
│          安全 (5x) ★─────★ 内存效率 (13x) ⭐核心     │
│                   \     /                          │
│                    \   /                           │
│           运维 (5x) ★                               │
│                      \                              │
│                       ★                             │
│                    维护性 (4x)                      │
│                                                    │
│  综合评分: ⭐⭐⭐⭐⭐ (5/5)                            │
│  核心驱动力: 内存泄漏与资源管理问题                    │
│  Rust彻底消除GC开销和内存泄漏风险                    │
└────────────────────────────────────────────────────┘
```

---

## 8. 迁移成本与风险

### 8.1 人力成本

| 工作项 | 估算工时 | 前置条件 |
|--------|---------|---------|
| Rust 项目搭建 + 依赖选型 | 2 人天 | Rust 基础 |
| 数据库层迁移 (rbatis + 模型) | 3 人天 | SQL 熟悉 |
| 认证中间件迁移 (Ed25519) | 2 人天 | 密码学基础 |
| 设备/钱包接口迁移 | 4 人天 | — |
| 资产/交易接口迁移 | 5 人天 | 事务理解 |
| Tron链交互集成 (tronic) | 3 人天 | Tron链理解 |
| 配置/通知/充值/日志接口 | 3 人天 | — |
| 启动流程 (迁移+种子+RSA) | 2 人天 | — |
| 测试编写 + 联调 | 4 人天 | — |
| 部署配置 (Docker/PM2→systemd) | 2 人天 | — |
| **合计** | **~30 人天 (约 6 人周)** | 需 1 名 Rust 经验开发者 |

### 8.2 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Rust 学习曲线陡峭 | 高 | 开发效率降低 | 安排 Rust 培训，或招聘有经验的开发者 |
| rbatis 动态SQL宏学习曲线 | 中 | 开发效率降低 | rbatis 官方文档+示例，宏语法与SQL接近 |
| rbatis 编译期宏校验需连接数据库 | 中 | CI/CD 复杂化 | 使用离线模式或开发环境数据库 |
| Ed25519 签名实现差异 | 低 | 认证失败 | 使用 `ed25519-dalek`，与 `@noble/ed25519` 兼容 |
| Decimal 精度处理差异 | 中 | 金额计算错误 | 使用 `rust_decimal` 库，与 Prisma Decimal 对齐 |
| tronic Tron链交互兼容性 | 中 | 链上操作失败 | tronic v0.5.6 已稳定，先在测试网验证 |
| 并行运行期间数据一致性 | 中 | 双写冲突 | 采用代理切换策略，同一时间只有一个服务处理请求 |
| 团队维护能力 | 高 | 后续迭代困难 | 代码审查 + 文档 + 培训 |

### 8.3 不迁移的代价

| 维度 | 不迁移的影响 |
|------|-------------|
| **内存泄漏** | ❌ V8 GC无法保证回收，内存持续增长，无法根治 |
| 内存占用 | 每实例 130MB，无法在 1GB 服务器上运行多实例 |
| 冷启动 | 500ms，不适合 Serverless 弹性伸缩 |
| 依赖安全 | npm 供应链攻击风险持续存在 |
| 类型安全 | 运行时 `any` 类型可能导致未捕获的错误 |
| 资源受限 | 低规格服务器无法稳定运行，内存泄漏导致服务崩溃 |

---

## 9. 迁移计划与时间线

### 9.1 阶段划分

```
阶段 1: 准备期（第 1 周）
├── Rust 项目搭建 (Cargo + Axum + rbatis)
├── 数据库连接 + 模型定义 (rbatis CRUD宏)
├── 认证中间件 + 错误处理
└── 健康检查 + 法币汇率（验证骨架）

阶段 2: 核心迁移（第 2-3 周）
├── 设备管理接口（5个）
├── 钱包管理接口（9个）
├── 资产管理接口（4个）
└── 单元测试 + 接口测试

阶段 3: 复杂业务 + Tron链交互（第 4 周）
├── 交易接口（4个，含转账事务）
├── 配置/通知/充值/日志接口（10个）
├── Tron链交互集成（tronic客户端 + 地址校验 + 事件监听）
├── 启动流程（迁移+种子+RSA）
└── 集成测试

阶段 4: 切换上线（第 5 周）
├── Docker 镜像构建
├── 并行运行 + 接口逐步切换
├── 监控对比 + 性能验证（重点：内存占用对比）
└── TS 服务端下线

阶段 5: 收尾（第 6 周，缓冲）
├── 文档更新
├── CI/CD 调整
└── 团队培训
```

### 9.2 里程碑

| 里程碑 | 时间 | 验收标准 |
|--------|------|---------|
| M1: 骨架可运行 | 第 1 周末 | Rust 服务启动，`GET /health` 返回 200 |
| M2: 认证通过 | 第 2 周中 | Ed25519 签名验证通过，设备注册成功 |
| M3: 核心接口完成 | 第 3 周末 | 设备+钱包+资产接口全部通过测试 |
| M4: 全部接口+Tron链完成 | 第 4 周末 | 36 个接口全部通过，转账事务正确，Tron链交互集成 |
| M5: 上线切换 | 第 5 周末 | Rust 服务接管全部流量，TS 下线，内存占用对比验证 |
| M6: 内存验证 | 第 5 周末 | 常驻内存 < 15MB，无内存泄漏趋势 |

---

## 10. 结论与建议

### 10.1 结论

| 问题 | 结论 |
|------|------|
| 技术上可行吗？ | ✅ **完全可行**。所有依赖有 Rust 替代，代码量小，架构清晰 |
| 性能能提升吗？ | ✅ **显著提升**。QPS 10x，内存 13x，冷启动 100x |
| **内存泄漏能解决吗？** | ✅ **彻底解决**。Rust所有权系统消除GC开销和内存泄漏，从130MB降至10MB |
| 安全能提升吗？ | ✅ **大幅提升**。内存安全 + 编译期类型安全 + 并发安全 |
| 成本可接受吗？ | ⚠️ **中等成本**。约 6 人周，需 Rust 经验开发者 |
| 现在是迁移的好时机吗？ | ✅ **推荐迁移**。内存泄漏是核心痛点，Rust是根治方案 |

### 10.2 建议方案

#### 方案 A：立即迁移（推荐条件：团队有 Rust 经验）

```
✅ 代码量小（3342行），迁移成本可控
✅ 刚完成代码清理，技术债最少
✅ 业务逻辑稳定，近期无大功能变更
✅ **内存泄漏是核心痛点，Rust是根治方案**
✅ 长期收益明显（性能/安全/运维/内存效率）
→ 建议：按 6 周计划执行
```

#### 方案 B：暂缓迁移（推荐条件：团队无 Rust 经验）

```
⚠️ 学习曲线可能导致工期翻倍（10-12 周）
⚠️ 迁移期间业务迭代可能受阻
✅ 当前 TS 性能足够，无紧急瓶颈
→ 建议：先安排 Rust 培训，3-6 个月后再评估
```

#### 方案 C：部分迁移（折中方案）

```
✅ 仅迁移性能敏感模块（签名验证 + 转账事务）
✅ 其余 CRUD 接口保持 TS
✅ 通过 Nginx 路由分发
✅ 成本约 2 人周，风险最低
→ 建议：作为试点，验证 Rust 可行性后再全面迁移
```

### 10.3 最终推荐

> **推荐方案 A（立即迁移）**，将整个服务端迁移到 Rust (Axum + rbatis + tronic)，彻底解决内存泄漏和资源管理问题。
>
> **理由**：
> 1. **内存泄漏是核心痛点**：Node.js 进程 130MB 常驻内存且无法有效释放，Rust 可降至 10MB，彻底根治
> 2. **Tron链交互需要高性能**：tronic 的 gRPC 协议比 HTTP JSON-RPC 性能更高，内存开销更低
> 3. **rbatis 提供ORM便利**：CRUD宏 + 动态SQL宏兼顾便利性和灵活性，比纯SQLx更易维护
> 4. **代码量小（3342行）**：迁移成本可控，6周可完成
> 5. **长期收益明显**：性能10x、内存13x、安全5x、运维5x
>
> **⚠️ 余额机制不变**：迁移后余额仍为服务端 `account_assets` 表数据，非链上实时余额。
> tronic 仅用于地址校验等链上交互，链上余额对账为未来扩展功能。

### 10.4 Cargo.toml 依赖预览

```toml
[dependencies]
# Web 框架
axum = "0.7"
tokio = { version = "1", features = ["full"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace"] }

# 数据库 ORM
rbatis = { version = "4.9", features = ["default"] }
rbs = "4.5"  # rbatis 序列化库

# Tron 区块链交互
tronic = { version = "0.5", features = ["tonic-tls"] }

# 序列化
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# 加密
ed25519-dalek = "2"
sha2 = "0.10"
rsa = "0.9"
rand = "0.8"
hex = "0.4"

# 工具
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
rust_decimal = { version = "1", features = ["serde"] }
dotenvy = "0.15"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["json"] }
validator = { version = "0.18", features = ["derive"] }
thiserror = "1"
```