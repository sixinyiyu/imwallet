# 测试用例: imwallet 设备认证体系重构

## TC-1: 设备注册 (POST /v1/devices)

### TC-1.1 正常注册新设备
- **前置**: 无
- **输入**: { device_id: "a1b2c3..."(64字符hex), platform: "ios", os: "iOS 17", model: "iPhone 15" }
- **预期**: 201, 返回设备信息, devices 表新增记录

### TC-1.2 注册已存在的设备
- **前置**: 设备已注册
- **输入**: 相同 device_id
- **预期**: 409, "Device already registered"

### TC-1.3 注册 Web 平台设备
- **输入**: { device_id: "web1...", platform: "web" }
- **预期**: 201, platform_store 为 null

### TC-1.4 device_id 格式无效
- **输入**: { device_id: "short", platform: "ios" }
- **预期**: 400, 验证失败

### TC-1.5 缺少必填字段
- **输入**: { device_id: "a1b2..." }
- **预期**: 400, platform 必填

---

## TC-2: 设备更新 (PUT /v1/devices)

### TC-2.1 正常更新设备信息
- **前置**: 设备已注册, 请求携带有效签名
- **输入**: { locale: "zh-CN", token: "push-token-123" }
- **预期**: 200, 设备信息已更新

### TC-2.2 无签名更新
- **前置**: 设备已注册
- **输入**: 不携带签名 headers
- **预期**: 401, 签名验证失败

### TC-2.3 签名过期
- **前置**: timestamp 超过 5 分钟
- **输入**: 过期签名
- **预期**: 401, "Request timestamp expired"

### TC-2.4 签名不匹配
- **前置**: 用错误私钥签名
- **输入**: 无效签名
- **预期**: 401, "Invalid signature"

---

## TC-3: 请求验签中间件

### TC-3.1 有效签名通过
- **前置**: 设备已注册
- **输入**: 正确的 x-device-id, x-signature, x-timestamp, 签名内容匹配
- **预期**: next(), req.device 设置正确

### TC-3.2 缺少签名 headers
- **输入**: 不携带 x-device-id
- **预期**: 401

### TC-3.3 设备未注册
- **输入**: x-device-id 对应设备不存在
- **预期**: 401, "Device not registered"

### TC-3.4 重放攻击
- **输入**: 相同 nonce 在 5 分钟内重复使用
- **预期**: 401, "Replay detected"

### TC-3.5 timestamp 超时
- **输入**: timestamp 超过 ±5 分钟
- **预期**: 401, "Timestamp expired"

### TC-3.6 签名内容不匹配
- **输入**: 签名的 bodyHash 与实际 body 不匹配
- **预期**: 401, "Invalid signature"

---

## TC-4: 钱包-设备关联 (WalletSubscription)

### TC-4.1 设备订阅钱包
- **前置**: 设备已注册, 钱包已创建
- **输入**: POST /v1/devices/wallets { wallet_id }
- **预期**: 201, WalletSubscription 新增记录

### TC-4.2 重复订阅
- **前置**: 已订阅
- **输入**: 相同 wallet_id + device_id + chain + address_id
- **预期**: 409, "Already subscribed"

### TC-4.3 取消订阅
- **前置**: 已订阅
- **输入**: DELETE /v1/devices/wallets/:wallet_id
- **预期**: 204, 记录删除

### TC-4.4 获取设备钱包列表
- **前置**: 设备关联了 2 个钱包
- **输入**: GET /v1/devices/wallets
- **预期**: 200, 返回 2 个钱包

### TC-4.5 非本设备取消订阅
- **前置**: 钱包关联到设备 A
- **输入**: 设备 B 尝试取消设备 A 的订阅
- **预期**: 403

---

## TC-5: 钱包操作（重构后）

### TC-5.1 创建钱包并自动关联设备
- **前置**: 设备已注册, 请求携带签名
- **输入**: POST /v1/wallets { alias: "My Wallet" }
- **预期**: 201, 钱包创建 + WalletSubscription 自动创建

### TC-5.2 导入钱包到新设备
- **前置**: 钱包已存在, 新设备已注册
- **输入**: POST /v1/wallets/import + POST /v1/devices/wallets
- **预期**: 钱包不重复创建, 新增 WalletSubscription

### TC-5.3 删除钱包（取消设备订阅）
- **前置**: 钱包关联到当前设备
- **输入**: DELETE /v1/wallets/:id
- **预期**: WalletSubscription 删除, 钱包仍存在（其他设备可能关联）

### TC-5.4 查看非关联钱包
- **前置**: 钱包未关联到当前设备
- **输入**: GET /v1/wallets/:id
- **预期**: 403

---

## TC-6: Admin 操作

### TC-6.1 管理员设备访问管理接口
- **前置**: 设备 device_id 在 Admin 表中
- **输入**: 携带有效签名的管理请求
- **预期**: 200, 正常返回数据

### TC-6.2 非管理员设备访问管理接口
- **前置**: 设备不在 Admin 表中
- **输入**: 携带有效签名但非管理员
- **预期**: 403, "Insufficient permissions"

---

## TC-7: Web 端兼容

### TC-7.1 Web 端密钥对生成
- **前置**: 无
- **输入**: 使用 @noble/ed25519 生成密钥对
- **预期**: 公钥 64 字符 hex, 私钥 64 字符 hex

### TC-7.2 Web 端签名与验证
- **前置**: 密钥对已生成
- **输入**: 用私钥签名消息, 服务端用公钥验证
- **预期**: 验证通过

### TC-7.3 Web 端完整流程
- **前置**: 无
- **输入**: 生成密钥对 → 注册设备 → 创建钱包 → 关联钱包 → 查询钱包
- **预期**: 全流程正常

---

## 边界用例

### E-1: device_id 长度不是 64
- **预期**: 400, 验证失败

### E-2: 签名长度异常
- **预期**: 401, 签名验证失败

### E-3: 并发注册同一设备
- **预期**: 一个成功 201, 另一个 409

### E-4: 空 body 的签名
- **预期**: bodyHash = "", 签名内容为 timestamp + method + path

### E-5: 大 body 的签名
- **预期**: bodyHash = SHA-256(body).hex, 正常验证
