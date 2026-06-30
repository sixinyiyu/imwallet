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
    pub admin: AdminConfig,
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
    #[serde(default = "default_db_type")]
    pub type_: String,
    #[serde(default = "default_db_user")]
    pub user_name: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub url: String,
}

fn default_db_type() -> String {
    "postgresql".into()
}
fn default_db_user() -> String {
    "postgres".into()
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

fn default_route_prefix() -> String {
    "vault".into()
}

#[derive(Debug, Clone, Deserialize)]
pub struct AdminConfig {
    #[serde(default = "default_route_prefix")]
    pub route_prefix: String,
}

impl Default for AdminConfig {
    fn default() -> Self {
        Self {
            route_prefix: default_route_prefix(),
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

fn default_cors_permissive() -> bool {
    false
}

#[derive(Debug, Clone, Deserialize)]
pub struct CorsConfig {
    #[serde(default = "default_cors_permissive")]
    pub permissive: bool,
    #[serde(default = "default_cors_origins")]
    pub allowed_origins: Vec<String>,
}

impl Default for CorsConfig {
    fn default() -> Self {
        Self {
            permissive: default_cors_permissive(),
            allowed_origins: default_cors_origins(),
        }
    }
}

// ── 运行时配置 ──

/// 运行时可用的配置快照（启动配置，全量）
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub port: u16,
    pub database_type: String,
    pub database_user_name: String,
    pub database_password: String,
    pub database_url: String, // host:port/dbname?params
    pub fee_rate: f64,
    pub fee_mode: String,
    pub tx_restrict_wallet: bool,
    pub server_pwd: String,
    pub log_default_level: String,
    pub timestamp_window_secs: i64,
    pub replay_cache_capacity: usize,
    pub rsa_private_key_path: String,
    pub rsa_public_key_path: String,
    pub admin_route_prefix: String,
    pub cors_allowed_origins: Vec<String>,
    pub cors_permissive: bool,
}

impl AppConfig {
    /// 拼接完整数据库连接 URL：type://user:password@url
    pub fn database_full_url(&self) -> String {
        format!(
            "{}://{}:{}@{}",
            self.database_type, self.database_user_name, self.database_password, self.database_url
        )
    }

    /// 脱敏后的数据库连接地址（密码用 ******* 代替）
    pub fn database_masked_url(&self) -> String {
        format!(
            "{}://{}:*******@{}",
            self.database_type, self.database_user_name, self.database_url
        )
    }
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
        // DATABASE_URL 环境变量可覆盖完整连接 URL（优先级最高）
        // 格式: postgresql://user:password@host:port/dbname?sslmode=require
        // 如果设置了 DATABASE_URL，则忽略 config.toml 中的拆分字段
        let (db_type, db_user, db_pwd, db_url) = if let Ok(full_url) = std::env::var("DATABASE_URL")
        {
            // 从完整 URL 中解析各字段
            parse_database_url(&full_url)
        } else {
            // 从 config.toml 拆分字段构建，密码支持 DATABASE_PASSWORD 环境变量覆盖
            let db_pwd = env_override("DATABASE_PASSWORD", &c.database.password);
            (
                c.database.type_,
                c.database.user_name,
                db_pwd,
                c.database.url,
            )
        };
        Self {
            port: env_override_u16("PORT", c.server.port),
            database_type: db_type,
            database_user_name: db_user,
            database_password: db_pwd,
            database_url: db_url,
            fee_rate: c.fee.rate,
            fee_mode: c.fee.mode,
            tx_restrict_wallet: c.fee.tx_restrict_wallet,
            server_pwd: env_override("SERVER_PWD", &c.service.password),
            log_default_level: c.logging.default_level,
            timestamp_window_secs: c.security.timestamp_window_secs,
            replay_cache_capacity: c.security.replay_cache_capacity,
            rsa_private_key_path: env_override("RSA_PRIVATE_KEY_PATH", &c.rsa.private_key_path),
            rsa_public_key_path: env_override("RSA_PUBLIC_KEY_PATH", &c.rsa.public_key_path),
            admin_route_prefix: env_override("ADMIN_ROUTE_PREFIX", &c.admin.route_prefix),
            cors_allowed_origins: c.cors.allowed_origins,
            cors_permissive: c.cors.permissive,
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

/// 从完整数据库 URL 中解析各字段
/// postgresql://user:password@host:port/dbname?params → (postgresql, user, password, host:port/dbname?params)
fn parse_database_url(full_url: &str) -> (String, String, String, String) {
    // 格式: type://user:password@host:port/dbname?params
    let scheme_end = full_url.find("://").unwrap_or(0);
    let db_type = full_url[..scheme_end].to_string();
    let rest = &full_url[scheme_end + 3..]; // user:password@host:port/dbname?params

    let at_pos = rest.find('@').unwrap_or(rest.len());
    let user_pwd = &rest[..at_pos]; // user:password
    let host_params = &rest[at_pos + 1..]; // host:port/dbname?params

    let (user, pwd) = if let Some(colon_pos) = user_pwd.find(':') {
        (
            user_pwd[..colon_pos].to_string(),
            user_pwd[colon_pos + 1..].to_string(),
        )
    } else {
        (user_pwd.to_string(), String::new())
    };

    (db_type, user, pwd, host_params.to_string())
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
            database: DatabaseConfig {
                type_: default_db_type(),
                user_name: default_db_user(),
                password: String::new(),
                url: String::new(),
            },
            fee: FeeConfig::default(),
            service: ServiceConfig::default(),
            logging: LoggingConfig::default(),
            security: SecurityConfig::default(),
            admin: AdminConfig::default(),
            rsa: RsaConfig::default(),
            cors: CorsConfig::default(),
        }
    } else {
        toml::from_str(&content)
            .map_err(|e| anyhow::anyhow!("Failed to parse config.toml: {}", e))?
    };

    let app_cfg = AppConfig::from(file_cfg);

    // 数据库配置不能为空
    if app_cfg.database_url.is_empty() || app_cfg.database_password.is_empty() {
        return Err(anyhow::anyhow!(
            "数据库配置不完整，请设置环境变量 DATABASE_URL/DATABASE_PASSWORD 或修改 config.toml [database]"
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
