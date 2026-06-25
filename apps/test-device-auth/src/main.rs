//! IMWallet device auth integration test client
//!
//! Usage:
//!   cargo run -p test-device-auth
//!   API_URL=http://host:port/api/v1 cargo run -p test-device-auth

use anyhow::Result;
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// ─── Config ───

struct Config {
    base_url: String,
}

impl Config {
    fn from_env() -> Self {
        let base_url =
            std::env::var("API_URL").unwrap_or_else(|_| "http://localhost:3000/api/v1".to_string());
        Self { base_url }
    }
}

// ─── Request / Response types ───

#[derive(Serialize)]
struct RegisterDeviceRequest {
    device_id: String,
    platform: String,
    os: String,
    model: String,
    locale: String,
    version: String,
    currency: String,
}

#[derive(Serialize)]
struct CreateWalletRequest {
    alias: String,
}

#[derive(Deserialize, Serialize)]
struct GenericResponse {
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    data: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<String>,
}

// ─── Helper functions ───

fn compute_body_hash(body: &Option<serde_json::Value>) -> String {
    match body {
        Some(val) if !val.is_null() => hex::encode(Sha256::digest(val.to_string().as_bytes())),
        _ => String::new(),
    }
}

fn build_sign_message(timestamp: &str, method: &str, path: &str, body_hash: &str) -> String {
    format!("{}{}{}{}", timestamp, method, path, body_hash)
}

fn generate_nonce() -> String {
    let random_bytes: [u8; 16] = rand::random();
    hex::encode(Sha256::digest(
        format!(
            "{}{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis(),
            hex::encode(random_bytes)
        )
        .as_bytes(),
    ))
    .chars()
    .take(32)
    .collect()
}

fn format_response(data: &GenericResponse) -> String {
    serde_json::to_string_pretty(data)
        .unwrap_or_default()
        .chars()
        .take(500)
        .collect()
}

fn make_timestamp() -> String {
    format!(
        "{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    )
}

// ─── Main ───

fn main() -> Result<()> {
    println!("========================================");
    println!("  imwallet 设备签名认证测试 (Rust)");
    println!("========================================\n");

    let config = Config::from_env();
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .build()
        .into();

    // Step 1: 生成 Ed25519 密钥对
    println!("Step 1: 生成 Ed25519 密钥对...");
    let signing_key = SigningKey::generate(&mut OsRng);
    let public_key_hex = hex::encode(signing_key.verifying_key().to_bytes());
    let private_key_hex = hex::encode(signing_key.to_bytes());
    println!("  公钥 (deviceId): {}", public_key_hex);
    println!("  私钥: {}...", &private_key_hex[..8]);

    // Step 2: 注册设备 (unsigned)
    println!("\nStep 2: 注册设备...");
    let url = format!("{}{}", config.base_url, "/devices");
    println!("\n→ POST /devices (unsigned)");
    let mut resp = agent
        .post(&url)
        .header("Content-Type", "application/json")
        .send_json(&RegisterDeviceRequest {
            device_id: public_key_hex.clone(),
            platform: "web".to_string(),
            os: "Rust test client".to_string(),
            model: "CLI".to_string(),
            locale: "zh-CN".to_string(),
            version: "1.0.0".to_string(),
            currency: "CNY".to_string(),
        })?;
    println!("← {} OK", resp.status());
    let data: GenericResponse = resp.body_mut().read_json()?;
    println!("  Response: {}", format_response(&data));

    // Step 3: 获取设备信息 (GET, no body)
    println!("\nStep 3: 获取设备信息...");
    let path = "/devices/me";
    let url = format!("{}{}", config.base_url, path);
    let timestamp = make_timestamp();
    let nonce = generate_nonce();
    let body_hash = compute_body_hash(&None);
    let message = build_sign_message(&timestamp, "GET", path, &body_hash);
    let signature = signing_key.sign(message.as_bytes());
    println!("\n→ GET {}", path);
    println!(
        "  Headers: x-device-id={}..., x-timestamp={}",
        &public_key_hex[..8],
        timestamp
    );
    let mut resp = agent
        .get(&url)
        .header("Content-Type", "application/json")
        .header("x-device-id", &public_key_hex)
        .header("x-signature", hex::encode(signature.to_bytes()))
        .header("x-timestamp", &timestamp)
        .header("x-nonce", &nonce)
        .call()?;
    println!("← {} OK", resp.status());
    let data: GenericResponse = resp.body_mut().read_json()?;
    println!("  Response: {}", format_response(&data));

    // Step 4: 创建钱包 (POST, with body)
    println!("\nStep 4: 创建钱包...");
    let path = "/wallets";
    let url = format!("{}{}", config.base_url, path);
    let body = serde_json::to_value(CreateWalletRequest {
        alias: "TestWallet".to_string(),
    })?;
    let timestamp = make_timestamp();
    let nonce = generate_nonce();
    let body_hash = compute_body_hash(&Some(body.clone()));
    let message = build_sign_message(&timestamp, "POST", path, &body_hash);
    let signature = signing_key.sign(message.as_bytes());
    println!("\n→ POST {}", path);
    println!(
        "  Headers: x-device-id={}..., x-timestamp={}",
        &public_key_hex[..8],
        timestamp
    );
    let mut resp = agent
        .post(&url)
        .header("Content-Type", "application/json")
        .header("x-device-id", &public_key_hex)
        .header("x-signature", hex::encode(signature.to_bytes()))
        .header("x-timestamp", &timestamp)
        .header("x-nonce", &nonce)
        .send_json(&body)?;
    println!("← {} OK", resp.status());
    let data: GenericResponse = resp.body_mut().read_json()?;
    println!("  Response: {}", format_response(&data));

    // Step 5: 获取设备钱包列表 (GET, no body)
    println!("\nStep 5: 获取设备钱包列表...");
    let path = "/devices/wallets";
    let url = format!("{}{}", config.base_url, path);
    let timestamp = make_timestamp();
    let nonce = generate_nonce();
    let body_hash = compute_body_hash(&None);
    let message = build_sign_message(&timestamp, "GET", path, &body_hash);
    let signature = signing_key.sign(message.as_bytes());
    println!("\n→ GET {}", path);
    println!(
        "  Headers: x-device-id={}..., x-timestamp={}",
        &public_key_hex[..8],
        timestamp
    );
    let mut resp = agent
        .get(&url)
        .header("Content-Type", "application/json")
        .header("x-device-id", &public_key_hex)
        .header("x-signature", hex::encode(signature.to_bytes()))
        .header("x-timestamp", &timestamp)
        .header("x-nonce", &nonce)
        .call()?;
    println!("← {} OK", resp.status());
    let data: GenericResponse = resp.body_mut().read_json()?;
    println!("  Response: {}", format_response(&data));

    // Step 6: 获取钱包列表 (GET, no body)
    println!("\nStep 6: 获取钱包列表...");
    let path = "/wallets";
    let url = format!("{}{}", config.base_url, path);
    let timestamp = make_timestamp();
    let nonce = generate_nonce();
    let body_hash = compute_body_hash(&None);
    let message = build_sign_message(&timestamp, "GET", path, &body_hash);
    let signature = signing_key.sign(message.as_bytes());
    println!("\n→ GET {}", path);
    println!(
        "  Headers: x-device-id={}..., x-timestamp={}",
        &public_key_hex[..8],
        timestamp
    );
    let mut resp = agent
        .get(&url)
        .header("Content-Type", "application/json")
        .header("x-device-id", &public_key_hex)
        .header("x-signature", hex::encode(signature.to_bytes()))
        .header("x-timestamp", &timestamp)
        .header("x-nonce", &nonce)
        .call()?;
    println!("← {} OK", resp.status());
    let data: GenericResponse = resp.body_mut().read_json()?;
    println!("  Response: {}", format_response(&data));

    println!("\n========================================");
    println!("  ✅ 全部测试通过！");
    println!("========================================");

    Ok(())
}
