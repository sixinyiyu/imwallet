# rs-wallet 配置说明

配置文件路径：`apps/server/config.toml`（不存在时使用默认值）

---

## 配置项一览

### `[server]`

| 键 | 类型 | 默认值 | 说明 | 环境变量覆盖 |
|---|------|--------|------|-------------|
| `port` | u16 | 3000 | HTTP 服务监听端口 | `PORT` |

### `[database]`

| 键 | 类型 | 默认值 | 说明 | 环境变量覆盖 |
|---|------|--------|------|-------------|
| `url` | String | 无（必填） | PostgreSQL 连接字符串 | `DATABASE_URL` |

### `[fee]`

| 键 | 类型 | 默认值 | 说明 |
|---|------|--------|------|
| `rate` | f64 | 0.005 | 转账手续费率（0.005 = 0.5%） |
| `mode` | String | "DEDUCTED" | 手续费模式：`DEDUCTED`（从金额中扣除）或 `EXTRA`（额外支付） |
| `tx_restrict_wallet` | bool | true | 是否限制仅向系统内账户转账 |

### `[service]`

| 键 | 类型 | 默认值 | 说明 | 环境变量覆盖 |
|---|------|--------|------|-------------|
| `password` | String | "CHANGE_ME" | 服务配置管理密码（⚠️ 请通过环境变量 `SERVER_PWD` 覆盖，勿提交真实密码） | `SERVER_PWD` |

### `[logging]`

| 键 | 类型 | 默认值 | 说明 |
|---|------|--------|------|
| `default_level` | String | "info" | 日志级别：`trace` / `debug` / `info` / `warn` / `error` |

### `[security]`

| 键 | 类型 | 默认值 | 说明 |
|---|------|--------|------|
| `timestamp_window_secs` | i64 | 300 | Ed25519 签名时间窗口（秒），请求时间戳超出此范围则拒绝 |
| `nonce_cache_capacity` | usize | 100000 | 防重放缓存容量（LRU，签名本身做 key） |

### `[rsa]`

| 键 | 类型 | 默认值 | 说明 | 环境变量覆盖 |
|---|------|--------|------|-------------|
| `private_key_path` | String | "keys/rsa_private.pem" | RSA 私钥 PEM 文件路径 | `RSA_PRIVATE_KEY_PATH` |
| `public_key_path` | String | "keys/rsa_public.pem" | RSA 公钥 PEM 文件路径 | `RSA_PUBLIC_KEY_PATH` |

### `[cors]`（新增）

| 键 | 类型 | 默认值 | 说明 |
|---|------|--------|------|
| `allowed_origins` | Vec<String> | 见下方 | 允许跨域访问的前端域名列表 |

**默认值：**
```toml
allowed_origins = [
    "https://imwallet.dpdns.org",
    "http://localhost:8081",
    "http://localhost:19006",
    "http://localhost:3000",
]
```

**说明：**
- 此配置项控制哪些前端域名可以跨域访问后端 API
- 生产环境只放正式域名（如 `https://imwallet.dpdns.org`）
- 开发环境可加 `localhost` 相关地址
- 不配置 `[cors]` 节时，使用上述默认值
- 修改后需重启服务生效

---

## 完整示例

```toml
# rs-wallet 主配置文件
# 环境相关配置可通过环境变量覆盖（DATABASE_URL, PORT 等）

[server]
port = 3000

[database]
url = "postgresql://imwallet:CHANGE_ME@localhost:5432/imwallet"

[fee]
rate = 0.005
mode = "DEDUCTED"               # DEDUCTED | EXTRA
tx_restrict_wallet = true

[service]
password = "CHANGE_ME"        # 服务配置密码（请通过环境变量 SERVER_PWD 覆盖，勿提交真实密码）

[logging]
default_level = "info"           # trace | debug | info | warn | error

[security]
timestamp_window_secs = 300      # Ed25519 签名时间窗口
nonce_cache_capacity = 100000    # 防重放缓存大小

[rsa]
private_key_path = "keys/rsa_private.pem"   # RSA 私钥文件路径（不存在时自动生成）
public_key_path  = "keys/rsa_public.pem"    # RSA 公钥文件路径（不存在时自动生成）

[cors]
# 允许的跨域来源列表（前端访问后端 API 的域名）
# 生产环境只放正式域名，开发环境可加 localhost
# 不配置时使用默认值
allowed_origins = [
    "https://imwallet.dpdns.org",
    "http://localhost:8081",
    "http://localhost:19006",
    "http://localhost:3000",
]
```

---

## 环境变量覆盖

以下配置项支持通过环境变量覆盖（优先级高于 config.toml）：

| 环境变量 | 覆盖的配置项 |
|---------|------------|
| `PORT` | `[server].port` |
| `DATABASE_URL` | `[database].url` |
| `SERVER_PWD` | `[service].password` |
| `RSA_PRIVATE_KEY_PATH` | `[rsa].private_key_path` |
| `RSA_PUBLIC_KEY_PATH` | `[rsa].public_key_path` |

> `[cors].allowed_origins` 目前不支持环境变量覆盖，仅通过 config.toml 配置。
