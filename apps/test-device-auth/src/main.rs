//! IMWallet device auth integration test client
//!
//! Usage:
//!   cargo run -p test-device-auth
//!   cargo run -p test-device-auth -- --url http://localhost:3000/api/v1

use anyhow::{Context, Result};
use ed25519_dalek::{SigningKey, Signer};
use rand::rngs::OsRng;
use reqwest::{Client, Method};
use sha2::{Digest, Sha256};

// ─── CLI args ───

struct Config {
    base_url: String,
}

impl Config {
    fn from_env() -> Self {
        let base_url = std::env::var("API_URL")
            .unwrap_or_else(|_| "http://localhost:3000/api/v1".to_string());
        Self { base_url }
    }
}

// ─── Request types ───

#[derive(serde::Serialize)]
struct RegisterDeviceRequest {
    device_id: String,
    platform: String,
    os: String,
    model: String,
    locale: String,
    version: String,
    currency: String,
}

#[derive(serde::Serialize)]
struct CreateWalletRequest {
    alias: String,
}

// ─── Helper functions ───

fn compute_body_hash(body: &Option<serde_json::Value>) -> String {
    match body {
        Some(val) if !val.is_null() => {
            hex::encode(Sha256::digest(val.to_string().as_bytes()))
        }
        _ => String::new(),
    }
}

fn build_sign_message(timestamp: &str, method: &str, path: &str, body_hash: &str) -> String {
    format!("{}{}{}{}", timestamp, method, path, body_hash)
}

fn generate_nonce() -> String {
    let random_bytes: [u8; 16] = rand::random();
    hex::encode(Sha256::digest(
        format!("{}{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(), hex::encode(random_bytes)).as_bytes(),
    ))
        .chars()
        .take(32)
        .collect()
}

// ─── Signed request ───

async fn signed_request(
    client: &Client,
    config: &Config,
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
    signing_key: &SigningKey,
) -> Result<serde_json::Value> {
    let timestamp = format!(
        "{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs()
    );
    let nonce = generate_nonce();
    let body_hash = compute_body_hash(&body);
    let message = build_sign_message(&timestamp, method, path, &body_hash);
    let signature = signing_key.sign(message.as_bytes());
    let public_key_hex = hex::encode(signing_key.verifying_key().to_bytes());

    let url = format!("{}{}", config.base_url, path);

    let mut req = client
        .request(Method::from_bytes(method.as_bytes())?, &url)
        .header("Content-Type", "application/json")
        .header("x-device-id", &public_key_hex)
        .header("x-signature", hex::encode(signature.to_bytes()))
        .header("x-timestamp", &timestamp)
        .header("x-nonce", &nonce);

    if let Some(ref b) = body {
        req = req.json(&b);
    }

    println!("\n→ {} {}", method, path);
    println!(
        "  Headers: x-device-id={}..., x-timestamp={}",
        &public_key_hex[..8],
        timestamp
    );

    let resp = req.send().await.context("request failed")?;
    let status = resp.status();
    let data: serde_json::Value = resp.json().await.context("parse response failed")?;

    println!("← {} {}", status.as_u16(), status.canonical_reason().unwrap_or(""));
    println!(
        "  Response: {}",
        serde_json::to_string_pretty(&data)?
            .chars()
            .take(500)
            .collect::<String>()
    );

    if !status.is_success() {
        anyhow::bail!(
            "Request failed: {} - {}",
            status,
            serde_json::to_string(&data)?
        );
    }

    Ok(data)
}

// ─── Unsigned request (device registration) ───

async fn unsigned_request(
    client: &Client,
    config: &Config,
    method: &str,
    path: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value> {
    let url = format!("{}{}", config.base_url, path);

    println!("\n→ {} {} (unsigned)", method, path);

    let resp = client
        .request(Method::from_bytes(method.as_bytes())?, &url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .context("request failed")?;

    let status = resp.status();
    let data: serde_json::Value = resp.json().await.context("parse response failed")?;

    println!("← {} {}", status.as_u16(), status.canonical_reason().unwrap_or(""));
    println!(
        "  Response: {}",
        serde_json::to_string_pretty(&data)?
            .chars()
            .take(500)
            .collect::<String>()
    );

    if !status.is_success() {
        anyhow::bail!(
            "Request failed: {} - {}",
            status,
            serde_json::to_string(&data)?
        );
    }

    Ok(data)
}

// ─── Main ───

#[tokio::main]
async fn main() -> Result<()> {
    println!("========================================");
    println!("  imwallet 设备签名认证测试 (Rust)");
    println!("========================================\n");

    let config = Config::from_env();
    let client = Client::new();

    // Step 1: 生成 Ed25519 密钥对
    println!("Step 1: 生成 Ed25519 密钥对...");
    let signing_key = SigningKey::generate(&mut OsRng);
    let public_key_hex = hex::encode(signing_key.verifying_key().to_bytes());
    let private_key_hex = hex::encode(signing_key.to_bytes());
    println!("  公钥 (deviceId): {}", public_key_hex);
    println!("  私钥: {}...", &private_key_hex[..8]);

    // Step 2: 注册设备
    println!("\nStep 2: 注册设备...");
    unsigned_request(
        &client,
        &config,
        "POST",
        "/devices",
        serde_json::to_value(RegisterDeviceRequest {
            device_id: public_key_hex.clone(),
            platform: "web".to_string(),
            os: "Rust test client".to_string(),
            model: "CLI".to_string(),
            locale: "zh-CN".to_string(),
            version: "1.0.0".to_string(),
            currency: "CNY".to_string(),
        })?,
    )
    .await?;

    // Step 3: 获取设备信息
    println!("\nStep 3: 获取设备信息...");
    signed_request(&client, &config, "GET", "/devices/me", None, &signing_key).await?;

    // Step 4: 创建钱包
    println!("\nStep 4: 创建钱包...");
    signed_request(
        &client,
        &config,
        "POST",
        "/wallets",
        Some(serde_json::to_value(CreateWalletRequest {
            alias: "TestWallet".to_string(),
        })?),
        &signing_key,
    )
    .await?;

    // Step 5: 获取设备钱包列表
    println!("\nStep 5: 获取设备钱包列表...");
    signed_request(&client, &config, "GET", "/devices/wallets", None, &signing_key).await?;

    // Step 6: 获取钱包列表
    println!("\nStep 6: 获取钱包列表...");
    signed_request(&client, &config, "GET", "/wallets", None, &signing_key).await?;

    println!("\n========================================");
    println!("  ✅ 全部测试通过！");
    println!("========================================");

    Ok(())
}
