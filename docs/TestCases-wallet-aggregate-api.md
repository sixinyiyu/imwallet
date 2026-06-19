# 测试用例: 钱包聚合接口

## TC-1: 钱包列表聚合接口 `GET /api/v1/wallets/aggregate`

### TC-1.1: 正常获取聚合数据（有钱包有账户）
**前置条件**: 设备已注册，关联2个钱包，每个钱包有不同网络的账户
**步骤**: 发送 `GET /api/v1/wallets/aggregate`，附带设备签名
**预期**:
- HTTP 200
- `wallets` 数组长度 = 2
- 每个钱包包含: id, identifier, alias, address, source, accountCount, createdAt, networks
- `networks` 为去重后的网络名称数组
- **不包含** tokenBalances 和 totalBalanceCny 字段

### TC-1.2: 有钱包无账户
**前置条件**: 设备关联1个钱包，钱包无账户
**预期**:
- HTTP 200
- `wallets[0].networks` 为空数组 `[]`
- `wallets[0].accountCount` = 0

### TC-1.3: 无钱包
**前置条件**: 设备已注册但无关联钱包
**预期**:
- HTTP 200
- `wallets` 为空数组 `[]`

### TC-1.4: 未注册设备
**前置条件**: 设备未注册
**预期**: HTTP 401 或 404

### TC-1.5: 无设备签名
**前置条件**: 不附带设备签名头
**预期**: HTTP 401

## TC-2: 简单钱包列表接口 `GET /api/v1/wallets`

### TC-2.1: 正常获取简单钱包列表
**前置条件**: 设备已注册，关联2个钱包
**预期**:
- HTTP 200
- `wallets` 数组长度 = 2
- 每个钱包包含: id, identifier, alias, address, source, accountCount, createdAt
- **不包含** tokenBalances、totalBalanceCny、networks 字段

### TC-2.2: 无钱包
**预期**: HTTP 200, `wallets` 为空数组

## TC-3: 钱包余额详情接口 `GET /api/v1/wallets/:id/balance`

### TC-3.1: 正常获取余额详情
**前置条件**: 设备关联该钱包，钱包有代币余额
**预期**:
- HTTP 200
- 包含 `totalBalanceUsd`、`totalBalanceCny`、`tokens` 字段
- `tokens` 数组中每个元素包含: id, tokenId, symbol, name, balance, usdValue, cnyValue, decimals, network, iconUrl

### TC-3.2: 钱包无代币余额
**预期**: HTTP 200, `tokens` 为空数组, `totalBalanceUsd` = "0.00"

### TC-3.3: 无权限访问他人钱包
**前置条件**: 设备未关联该钱包
**预期**: HTTP 403

### TC-3.4: 钱包不存在
**预期**: HTTP 404

## TC-4: 移动端 walletStore 集成

### TC-4.1: fetchWalletsAggregate 正常工作
**预期**: store 中 wallets 包含 networks 字段，loading 状态正确切换

### TC-4.2: fetchBalance 使用新接口
**预期**: 调用一次 API 即可获取 totalBalanceUsd 和 tokens，无需两次请求

### TC-4.3: fetchWallets 适配简化结构
**预期**: wallets 不含 tokenBalances 和 totalBalanceCny，页面正常渲染
