# PRD: 钱包聚合接口优化

## 1. 项目概述

优化钱包相关页面的数据加载流程，通过聚合接口减少前端请求次数，提升页面加载性能。

### 背景
当前钱包列表页（我→钱包管理→钱包列表）需要 2 个 API 请求才能获取页面所需数据，钱包首页需要 3 个 API 请求。且现有 `GET /wallets` 接口返回了完整的代币余额数据，但钱包列表页并不需要这些数据，造成不必要的性能开销。

### 目标
- 钱包列表页：1 个聚合接口返回页面所需全部数据
- 钱包首页：默认 1 个接口返回简单钱包列表；切换钱包时 1 个接口返回总余额+代币余额

## 2. 功能需求

### FR-1: 钱包列表聚合接口（服务端）

**接口**: `GET /api/v1/wallets/aggregate`

**描述**: 返回钱包列表页所需的全部数据，一个接口搞定。

**响应结构**:
```json
{
  "wallets": [
    {
      "id": "uuid",
      "identifier": "aqud...",
      "alias": "我的钱包",
      "address": "0x...",
      "source": "CREATE",
      "accountCount": 2,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "networks": ["Tron", "Ethereum"]
    }
  ]
}
```

**不返回的数据**: tokenBalances、totalBalanceCny（钱包列表页不需要）

### FR-2: 简单钱包列表接口（服务端）

**接口**: `GET /api/v1/wallets`（修改现有接口）

**描述**: 返回简单钱包列表数据，不含代币余额。供钱包首页下拉选择器使用。

**响应结构**:
```json
{
  "wallets": [
    {
      "id": "uuid",
      "identifier": "aqud...",
      "alias": "我的钱包",
      "address": "0x...",
      "source": "CREATE",
      "accountCount": 2,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**不返回的数据**: tokenBalances、totalBalanceCny、networks

### FR-3: 钱包余额详情接口（服务端）

**接口**: `GET /api/v1/wallets/:id/balance`

**描述**: 切换钱包时调用，返回总余额和各代币余额。合并原 `GET /tokens/:walletId/balance` 和 `GET /tokens/:walletId/list` 两个接口。

**响应结构**:
```json
{
  "totalBalanceUsd": "0.00",
  "totalBalanceCny": "0.00",
  "tokens": [
    {
      "id": "uuid",
      "tokenId": "uuid",
      "symbol": "USDT",
      "name": "Tether USD",
      "balance": "0",
      "usdValue": "0.00",
      "cnyValue": "0.00",
      "decimals": 6,
      "network": "Tron",
      "iconUrl": "https://..."
    }
  ]
}
```

### FR-4: 移动端适配（客户端）

#### FR-4.1: walletService 更新
- 新增 `getWalletsAggregate()` 方法调用聚合接口
- 新增 `getWalletBalanceDetail(walletId)` 方法调用余额详情接口
- 修改 `getWallets()` 方法适配简化后的返回结构

#### FR-4.2: walletStore 更新
- 新增 `fetchWalletsAggregate()` 方法供钱包列表页使用
- 修改 `fetchBalance()` 方法使用新的余额详情接口（单次请求）
- `fetchWallets()` 适配简化返回结构

#### FR-4.3: WalletManageScreen 更新
- 使用 `fetchWalletsAggregate()` 替代 `fetchWallets()` + `fetchAllWalletNetworks()`
- 移除批量获取网络的逻辑

#### FR-4.4: WalletScreen 更新
- 默认使用 `fetchWallets()` 获取简单钱包列表
- 切换钱包时调用 `fetchBalance()` 获取余额详情

## 3. 非功能需求

- **性能**: 聚合接口响应时间 < 500ms（10个钱包以内）
- **兼容性**: 保持设备签名验证机制不变
- **安全性**: 所有接口需通过 deviceAuthMiddleware 验证
- **向后兼容**: 原 `GET /tokens/:walletId/balance` 和 `GET /tokens/:walletId/list` 接口保留，不删除

## 4. 技术约束

- 服务端: Express + Prisma + TypeScript
- 客户端: React Native + Zustand + TypeScript
- 数据库: PostgreSQL
- 认证: Ed25519 设备签名验证
