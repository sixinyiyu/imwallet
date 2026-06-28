//! 配置模块 — 从 config.toml 加载
//! 迁移自 IMWallet config/

use serde::Deserialize;

/// 应用顶层配置
#[derive(Debug, Clone, Deserialize)]
pub struct ConfigFile {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    #[serde(default)]
    pub fee: FeeConfig,
    #[serde(default)]
    pub service: ServiceConfig,
    #[serde(default)]
    pub logging: LoggingConfig,
    #[serde(default)]
    pub security: SecurityConfig,
    #[serde(default)]
    pub rsa: RsaConfig,
    #[serde(default)]
    pub cors: CorsConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_port")]
    pub port: u16,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FeeConfig {
    #[serde(default = "default_fee_rate")]
    pub rate: f64,
    #[serde(default = "default_fee_mode_str")]
    pub mode: String,
    #[serde(default = "default_tx_restrict")]
    pub tx_restrict_wallet: bool,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ServiceConfig {
    #[serde(default)]
    pub password: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoggingConfig {
    /// 默认日志级别：trace / debug / info / warn / error
    #[serde(default = "default_log_level")]
    pub default_level: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SecurityConfig {
    #[serde(default = "default_timestamp_window")]
    pub timestamp_window_secs: i64,
    #[serde(default = "default_replay_capacity")]
    pub replay_cache_capacity: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RsaConfig {
    #[serde(default = "default_rsa_private_key_path")]
    pub private_key_path: String,
    #[serde(default = "default_rsa_public_key_path")]
    pub public_key_path: String,
}

impl Default for FeeConfig {
    fn default() -> Self {
        Self {
            rate: default_fee_rate(),
            mode: default_fee_mode_str(),
            tx_restrict_wallet: default_tx_restrict(),
        }
    }
}
impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            default_level: default_log_level(),
        }
    }
}
impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            timestamp_window_secs: default_timestamp_window(),
            replay_cache_capacity: default_replay_capacity(),
        }
    }
}
impl Default for RsaConfig {
    fn default() -> Self {
        Self {
            private_key_path: default_rsa_private_key_path(),
            public_key_path: default_rsa_public_key_path(),
        }
    }
}

fn default_port() -> u16 {
    3000
}
fn default_fee_rate() -> f64 {
    0.005
}
fn default_fee_mode_str() -> String {
    "DEDUCTED".into()
}
fn default_tx_restrict() -> bool {
    true
}
fn default_log_level() -> String {
    "info".into()
}
fn default_timestamp_window() -> i64 {
    300
}
fn default_replay_capacity() -> usize {
    100_000
}
fn default_rsa_private_key_path() -> String {
    "keys/rsa_private.pem".into()
}
fn default_rsa_public_key_path() -> String {
    "keys/rsa_public.pem".into()
}

fn default_cors_origins() -> Vec<String> {
    vec![
        "https://imwallet.dpdns.org".into(),
        "http://localhost:8081".into(),
        "http://localhost:19006".into(),
        "http://localhost:3000".into(),
    ]
}

#[derive(Debug, Clone, Deserialize)]
pub struct CorsConfig {
    #[serde(default = "default_cors_origins")]
    pub allowed_origins: Vec<String>,
}

impl Default for CorsConfig {
    fn default() -> Self {
        Self {
            allowed_origins: default_cors_origins(),
        }
    }
}

/// 运行时可用的配置快照（启动配置，全量）
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub port: u16,
    pub database_url: String,
    pub fee_rate: f64,
    pub fee_mode: String,
    pub tx_restrict_wallet: bool,
    pub server_pwd: String,
    pub log_default_level: String,
    pub timestamp_window_secs: i64,
    pub replay_cache_capacity: usize,
    pub rsa_private_key_path: String,
    pub rsa_public_key_path: String,
    pub cors_allowed_origins: Vec<String>,
}

/// 运行时配置（仅含 AppState 需要的字段）
#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    pub fee_rate: f64,
    pub fee_mode: String,
    pub tx_restrict_wallet: bool,
    pub timestamp_window_secs: i64,
}

impl From<AppConfig> for RuntimeConfig {
    fn from(c: AppConfig) -> Self {
        Self {
            fee_rate: c.fee_rate,
            fee_mode: c.fee_mode,
            tx_restrict_wallet: c.tx_restrict_wallet,
            timestamp_window_secs: c.timestamp_window_secs,
        }
    }
}

impl From<ConfigFile> for AppConfig {
    fn from(c: ConfigFile) -> Self {
        Self {
            port: env_override_u16("PORT", c.server.port),
            database_url: env_override("DATABASE_URL", &c.database.url),
            fee_rate: c.fee.rate,
            fee_mode: c.fee.mode,
            tx_restrict_wallet: c.fee.tx_restrict_wallet,
            server_pwd: env_override("SERVER_PWD", &c.service.password),
            log_default_level: c.logging.default_level,
            timestamp_window_secs: c.security.timestamp_window_secs,
            replay_cache_capacity: c.security.replay_cache_capacity,
            rsa_private_key_path: env_override("RSA_PRIVATE_KEY_PATH", &c.rsa.private_key_path),
            rsa_public_key_path: env_override("RSA_PUBLIC_KEY_PATH", &c.rsa.public_key_path),
            cors_allowed_origins: c.cors.allowed_origins,
        }
    }
}

fn env_override(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}
fn env_override_u16(key: &str, default: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

pub fn init_config() -> anyhow::Result<AppConfig> {
    let _ = dotenvy::dotenv();

    let content = std::fs::read_to_string("config.toml")
        .or_else(|_| std::fs::read_to_string(format!("{}/config.toml", env!("CARGO_MANIFEST_DIR"))))
        .unwrap_or_else(|_| {
            log::warn!("config.toml not found, using defaults");
            String::new()
        });

    let file_cfg: ConfigFile = if content.trim().is_empty() {
        ConfigFile {
            server: ServerConfig { port: 3000 },
            database: DatabaseConfig { url: String::new() },
            fee: FeeConfig::default(),
            service: ServiceConfig::default(),
            logging: LoggingConfig::default(),
            security: SecurityConfig::default(),
            rsa: RsaConfig::default(),
            cors: CorsConfig::default(),
        }
    } else {
        toml::from_str(&content)
            .map_err(|e| anyhow::anyhow!("Failed to parse config.toml: {}", e))?
    };

    let app_cfg = AppConfig::from(file_cfg);

    // C6: 数据库 URL 不能为空
    if app_cfg.database_url.is_empty() {
        return Err(anyhow::anyhow!(
            "DATABASE_URL 未配置，请设置环境变量 DATABASE_URL 或修改 config.toml [database].url"
        ));
    }

    Ok(app_cfg)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeeMode {
    Deducted,
    Extra,
}

impl FeeMode {
    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "EXTRA" => FeeMode::Extra,
            _ => FeeMode::Deducted,
        }
    }
}
