//! 设备 Ed25519 签名认证中间件
//! 迁移自 IMWallet middleware/deviceAuth.ts
//!
//! 防重放策略：用签名本身做 LRU key（签名确定性 + 不可篡改），
//! 只对写请求（非 GET）检查，GET 请求幂等无需防重放。

use crate::config::RuntimeConfig;
use crate::db::query::{query_one, vals};
use crate::errors::AppError;
use crate::models::Device;
use crate::services::rsa_service::RsaKeys;
use axum::{extract::State, middleware::Next, response::Response};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use lru::LruCache;
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use std::num::NonZeroUsize;
use std::sync::Arc;
use std::sync::RwLock;
use tokio::sync::Mutex;

// ── 请求日志常量与辅助函数 ──

/// 已知的扫描探测路径前缀（降级为 debug 日志）
const SCAN_PATHS: &[&str] = &[
    "/.env",
    "/.git",
    "/.DS_Store",
    "/.vscode",
    "/.well-known",
    "/graphql",
    "/api/graphql",
    "/api/gql",
    "/actuator",
    "/v2/",
    "/config.json",
    "/version",
    "/info.php",
    "/robots.txt",
    "/console",
    "/server-status",
    "/login.action",
    "/debug",
    "/trace.axd",
    "/@vite",
    "/dns-query",
    "/ecp/",
    "/META-INF",
    "/s/",
    "/telescope",
    "/___proxy",
];

/// 需要脱敏的字段名（值替换为 ***）
const SENSITIVE_KEYS: &[&str] = &[
    "encrypted_password",
    "encryptedPassword",
    "password",
    "secret",
    "token",
    "apiKey",
    "api_key",
    "authorization",
];

/// body 参数日志最大长度
const MAX_BODY_LOG_LEN: usize = 500;

fn is_scan_probe(path: &str) -> bool {
    if path == "/" {
        return true;
    }
    SCAN_PATHS.iter().any(|p| path.starts_with(p))
}

fn sanitize_params(input: &str) -> String {
    let mut result = input.to_string();
    for key in SENSITIVE_KEYS {
        // JSON: "key":"value"
        let json_prefix = format!("\"{}\"", key);
        if let Some(start) = result.find(&json_prefix) {
            let after_key = &result[start + json_prefix.len()..];
            let trimmed = after_key.trim_start_matches(':').trim_start_matches(' ');
            if let Some(value_content) = trimmed.strip_prefix('"') {
                if let Some(end_quote) = value_content.find('"') {
                    let value_start =
                        start + json_prefix.len() + (after_key.len() - trimmed.len()) + 1;
                    let value_end = value_start + end_quote;
                    result.replace_range(value_start..value_end, "***");
                }
            }
        }
        // URL/query: key=value
        let url_prefix = format!("{}=", key);
        if let Some(start) = result.find(&url_prefix) {
            let value_start = start + url_prefix.len();
            let value_end = result[value_start..]
                .find('&')
                .map_or(result.len(), |pos| value_start + pos);
            result.replace_range(value_start..value_end, "***");
        }
    }
    result
}

fn truncate_log(s: &str, max_len: usize) -> &str {
    if s.len() <= max_len {
        s
    } else {
        &s[..s.floor_char_boundary(max_len)]
    }
}

// ── 防重放缓存（内联，仅本中间件使用） ──

#[derive(Clone)]
struct ReplayCache {
    inner: Arc<Mutex<LruCache<String, ()>>>,
}

impl ReplayCache {
    fn new(capacity: usize) -> Self {
        let cap = NonZeroUsize::new(capacity.max(1)).unwrap();
        Self {
            inner: Arc::new(Mutex::new(LruCache::new(cap))),
        }
    }

    /// 检查签名是否已使用；未使用则插入，返回 true
    async fn check_and_insert(&self, sig: &str) -> bool {
        let mut cache = self.inner.lock().await;
        if cache.contains(sig) {
            return false;
        }
        cache.put(sig.to_string(), ());
        true
    }
}

// ── AppState ──

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<rbatis::RBatis>,
    pub config: Arc<RuntimeConfig>,
    pub rsa_keys: Arc<RsaKeys>,
    replay_cache: ReplayCache,
    /// USD→CNY 汇率缓存（启动时加载，定时刷新）
    cny_rate: Arc<RwLock<Decimal>>,
    /// 日志上报限频：device_id → 上次上报时间（每设备每分钟最多1次）
    log_rate_limiter: Arc<Mutex<LruCache<String, i64>>>,
    /// 设备信息缓存：device_id → platform（减少每次请求查DB）
    device_cache: Arc<Mutex<LruCache<String, String>>>,
    /// 管理路由前缀（从 config.toml [admin].route_prefix 读取，如 "vault"）
    admin_route_prefix: String,
}

impl AppState {
    pub fn new(
        db: Arc<rbatis::RBatis>,
        config: Arc<RuntimeConfig>,
        rsa_keys: Arc<RsaKeys>,
        replay_cache_capacity: usize,
        cny_rate: Decimal,
        admin_route_prefix: String,
    ) -> Self {
        Self {
            db,
            config,
            rsa_keys,
            replay_cache: ReplayCache::new(replay_cache_capacity),
            cny_rate: Arc::new(RwLock::new(cny_rate)),
            log_rate_limiter: Arc::new(Mutex::new(LruCache::new(NonZeroUsize::new(1000).unwrap()))),
            device_cache: Arc::new(Mutex::new(LruCache::new(NonZeroUsize::new(5000).unwrap()))),
            admin_route_prefix,
        }
    }

    /// 获取设备 platform 缓存（命中则跳过 DB 查询）
    pub async fn get_cached_device_platform(&self, device_id: &str) -> Option<String> {
        let mut cache = self.device_cache.lock().await;
        cache.get(device_id).cloned()
    }

    /// 缓存设备 platform
    pub async fn cache_device_platform(&self, device_id: &str, platform: &str) {
        let mut cache = self.device_cache.lock().await;
        cache.put(device_id.to_string(), platform.to_string());
    }

    /// 日志限频检查：同一 device_id 每分钟最多允许 1 次上报
    pub async fn check_log_rate(&self, device_id: &str) -> bool {
        let now = time::OffsetDateTime::now_utc().unix_timestamp();
        let mut cache = self.log_rate_limiter.lock().await;
        if let Some(last_ts) = cache.get(device_id) {
            if now - *last_ts < 60 {
                return false; // 60秒内已上报过，拒绝
            }
        }
        cache.put(device_id.to_string(), now);
        true
    }

    /// 获取管理路由前缀（如 "vault"）
    pub fn get_admin_route_prefix(&self) -> &str {
        &self.admin_route_prefix
    }

    /// 获取缓存的 USD→CNY 汇率（RwLock 读锁，多读者并发无阻塞）
    pub fn get_cny_rate(&self) -> Decimal {
        *self.cny_rate.read().unwrap()
    }

    /// 更新缓存的 USD→CNY 汇率（RwLock 写锁，独占），返回值是否发生变化
    pub fn set_cny_rate(&self, rate: Decimal) -> bool {
        let mut lock = self.cny_rate.write().unwrap();
        let changed = *lock != rate;
        *lock = rate;
        changed
    }
}

// ── DevicePayload ──

#[derive(Debug, Clone)]
pub struct DevicePayload {
    pub device_id: String,
    pub platform: String,
}

// ── 中间件 ──

pub async fn device_auth(
    State(state): State<AppState>,
    request: axum::extract::Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let start = std::time::Instant::now();
    let (parts, body) = request.into_parts();
    let headers = parts.headers.clone();
    let method = parts.method.clone();
    let uri = parts.uri.clone();

    // 缓冲 body
    let body_bytes = axum::body::to_bytes(body, 64 * 1024)
        .await
        .map_err(|e| AppError::BadRequest(format!("Cannot read body: {}", e)))?;

    // 提取 headers
    let device_id = headers
        .get("x-device-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("missing x-device-id".into()))?;
    let sig_hex = headers
        .get("x-signature")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("missing x-signature".into()))?;
    let ts_str = headers
        .get("x-timestamp")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("missing x-timestamp".into()))?;

    // 时间窗口校验
    let ts: i64 = ts_str
        .parse()
        .map_err(|_| AppError::Unauthorized("invalid timestamp".into()))?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    if (now - ts).abs() > state.config.timestamp_window_secs {
        return Err(AppError::Unauthorized("request expired".into()));
    }

    // 防重放：对所有请求检查（GET 请求虽幂等，但 /config/all 等返回敏感数据，需防重放）
    if !state.replay_cache.check_and_insert(sig_hex).await {
        return Err(AppError::Unauthorized("duplicate request".into()));
    }

    // 构造签名消息：timestamp + method + path + nonce + bodyHash
    let path = uri.path();
    let normalized = path.strip_prefix("/api/v1").unwrap_or(path);
    let nonce_str = headers
        .get("x-nonce")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let body_hash: String = if body_bytes.is_empty() {
        String::new()
    } else {
        let mut h = Sha256::new();
        h.update(&body_bytes);
        hex::encode(h.finalize())
    };
    let message = format!(
        "{}{}{}{}{}",
        ts,
        method.as_str(),
        normalized,
        nonce_str,
        body_hash
    );

    // Debug: 打印签名验证细节（排查 signature verification failed 问题）
    ::log::debug!(
        "device_auth: uri_path={}, normalized={}, method={}, nonce={}, body_hash_len={}, message_len={}, device_id_len={}",
        path, normalized, method.as_str(), nonce_str, body_hash.len(), message.len(), device_id.len()
    );

    // Ed25519 签名验证
    let pkb = hex::decode(device_id)
        .map_err(|_| AppError::Unauthorized("invalid device id format".into()))?;
    let key: &[u8; 32] = pkb[..32]
        .try_into()
        .map_err(|_| AppError::Unauthorized("invalid pubkey length".into()))?;
    let vk = VerifyingKey::from_bytes(key)
        .map_err(|_| AppError::Unauthorized("invalid pubkey".into()))?;
    let sig = hex::decode(sig_hex)
        .map_err(|_| AppError::Unauthorized("invalid signature format".into()))?;
    let signature = Signature::from_slice(&sig)
        .map_err(|_| AppError::Unauthorized("invalid signature format".into()))?;
    vk.verify(message.as_bytes(), &signature)
        .map_err(|_| AppError::Unauthorized("signature verification failed".into()))?;

    // 设备查询/自动注册 — 先查缓存，命中则跳过 DB；未命中则查 DB + 写缓存
    let platform_from_header = headers
        .get("x-platform")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("ios");
    let (platform, _should_update) = if let Some(cached_platform) =
        state.get_cached_device_platform(device_id).await
    {
        // 缓存命中，无需查 DB
        (cached_platform, false)
    } else {
        let existing: Option<Device> = query_one(
            &state.db,
            "SELECT * FROM devices WHERE id = $1",
            vals![device_id],
        )
        .await
        .map_err(AppError::from)?;
        let (plat, should_upd) = if let Some(ref d) = existing {
            let upd = d
                .last_active_at
                .clone()
                .is_none_or(|la| (now - la.unix_timestamp()).abs() > 300);
            state.cache_device_platform(device_id, &d.platform).await;
            (d.platform.clone(), upd)
        } else {
            let inserted: Option<Device> = query_one(
                &state.db,
                "INSERT INTO devices (id, platform) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING *",
                vals![device_id, platform_from_header],
            )
            .await
            .map_err(AppError::from)?;
            let plat = inserted
                .map(|d| d.platform)
                .unwrap_or_else(|| platform_from_header.to_string());
            state.cache_device_platform(device_id, &plat).await;
            (plat, true)
        };
        (plat, should_upd)
    };
    if let Err(e) = crate::db::query::exec(
        &state.db,
        "UPDATE devices SET last_active_at = NOW() WHERE id = $1",
        vals![device_id],
    )
    .await
    {
        log::warn!(
            "Failed to update last_active_at for device {}: {}",
            device_id,
            e
        );
    }

    // 重建 request
    let mut request =
        axum::extract::Request::from_parts(parts, axum::body::Body::from(body_bytes.clone()));
    request.extensions_mut().insert(DevicePayload {
        device_id: device_id.to_string(),
        platform,
    });

    // 调用 handler
    let response = next.run(request).await;

    // ── 请求日志 ──
    let elapsed = start.elapsed();
    let status = response.status();
    let status_code = status.as_u16();
    let path = uri.path();

    // 构建参数日志：query + body（脱敏 + 截断）
    let query_str = uri.query().map(sanitize_params).unwrap_or_default();
    let body_str = if !body_bytes.is_empty() {
        let raw = String::from_utf8_lossy(&body_bytes);
        truncate_log(&sanitize_params(&raw), MAX_BODY_LOG_LEN).to_string()
    } else {
        String::new()
    };
    let params_log = if !query_str.is_empty() && !body_str.is_empty() {
        format!(" query: {} body: {}", query_str, body_str)
    } else if !query_str.is_empty() {
        format!(" query: {}", query_str)
    } else if !body_str.is_empty() {
        format!(" body: {}", body_str)
    } else {
        String::new()
    };

    // 日志分级：5xx→error, 4xx+扫描→debug, 4xx+业务→warn, 2xx/3xx→info
    if status.is_server_error() {
        log::error!(
            "Request failed: {} {}{} → {} ({:.0}ms)",
            method,
            path,
            params_log,
            status_code,
            elapsed.as_millis()
        );
    } else if status.is_client_error() {
        if is_scan_probe(path) {
            log::debug!(
                "Scan probe: {} {} → {} ({:.0}ms)",
                method,
                path,
                status_code,
                elapsed.as_millis()
            );
        } else {
            log::warn!(
                "Request rejected: {} {}{} → {} ({:.0}ms)",
                method,
                path,
                params_log,
                status_code,
                elapsed.as_millis()
            );
        }
    } else {
        log::info!(
            "Request completed: {} {}{} → {} ({:.0}ms)",
            method,
            path,
            params_log,
            status_code,
            elapsed.as_millis()
        );
    }

    Ok(response)
}
