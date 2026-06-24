//! 数据模型层 — 与数据库表一一对应，无外键约束

pub mod app_config;
pub mod app_log;
pub mod asset;
pub mod asset_address;
pub mod chain_entity;
pub mod device;
pub mod fiat_currency;
pub mod notification;
pub mod recharge;
pub mod transaction;
pub mod wallet;
pub mod wallet_address;
pub mod wallet_subscription;

pub use asset::Asset;
pub use asset_address::AssetAddress;
#[allow(unused_imports)] // ORM 模型仅通过 query<T> 泛型反序列化使用
pub use chain_entity::ChainEntity;
pub use device::Device;
pub use transaction::Transaction;
pub use wallet::Wallet;
pub use wallet_address::WalletAddress;
pub use wallet_subscription::WalletSubscription;
// NotificationType 枚举值常量用字符串替代，见 transaction_service.rs
pub use app_config::AppConfigEntity;
pub use fiat_currency::FiatCurrency;
pub use recharge::Recharge;
#[allow(unused_imports)]
pub use app_log::AppLog;
#[allow(unused_imports)]
pub use notification::Notification;
