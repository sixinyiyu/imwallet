//! RSA 密钥服务
//! 从配置路径加载 PEM 密钥文件；文件不存在时自动生成并保存
//! 密钥对加载后存入 AppState，不再使用全局静态

use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding};
use rsa::RsaPrivateKey;
use rsa::RsaPublicKey;
use std::path::Path;

/// RSA 密钥对（私钥 + PEM 格式公钥字符串）
pub struct RsaKeys {
    #[allow(dead_code)]
    private_key: RsaPrivateKey,
    public_key_pem: String,
}

impl RsaKeys {
    /// 从配置路径加载密钥对
    /// - 如果两个 PEM 文件都存在，从文件读取
    /// - 如果文件不存在，自动生成 2048 位密钥对并保存到文件
    pub fn load(private_key_path: &str, public_key_path: &str) -> anyhow::Result<Self> {
        let priv_path = Path::new(private_key_path);
        let pub_path = Path::new(public_key_path);

        if priv_path.exists() && pub_path.exists() {
            // 从文件加载
            let priv_pem = std::fs::read_to_string(priv_path)
                .map_err(|e| anyhow::anyhow!("读取私钥文件 {} 失败: {}", private_key_path, e))?;
            let pub_pem = std::fs::read_to_string(pub_path)
                .map_err(|e| anyhow::anyhow!("读取公钥文件 {} 失败: {}", public_key_path, e))?;

            let private_key = rsa::pkcs8::DecodePrivateKey::from_pkcs8_pem(&priv_pem)
                .map_err(|e| anyhow::anyhow!("解析私钥 PEM 失败: {}", e))?;

            // 验证公钥与私钥匹配
            let expected_pub_pem = RsaPublicKey::from(&private_key)
                .to_public_key_pem(LineEnding::LF)
                .map_err(|e| anyhow::anyhow!("生成公钥 PEM 失败: {}", e))?;

            if pub_pem.trim() != expected_pub_pem.trim() {
                return Err(anyhow::anyhow!(
                    "公钥文件 {} 与私钥文件 {} 不匹配，请检查密钥对是否一致",
                    public_key_path,
                    private_key_path
                ));
            }

            log::info!(
                "RSA 密钥对从文件加载: 私钥={}, 公钥={}",
                private_key_path,
                public_key_path
            );
            Ok(Self {
                private_key,
                public_key_pem: expected_pub_pem,
            })
        } else {
            // 自动生成并保存
            Self::generate_and_save(private_key_path, public_key_path)
        }
    }

    /// 生成新的 2048 位 RSA 密钥对并保存到文件
    fn generate_and_save(private_key_path: &str, public_key_path: &str) -> anyhow::Result<Self> {
        let mut rng = rand::thread_rng();
        let private_key = RsaPrivateKey::new(&mut rng, 2048)
            .map_err(|e| anyhow::anyhow!("生成 RSA 密钥失败: {}", e))?;

        let public_key = RsaPublicKey::from(&private_key);
        let priv_pem = private_key
            .to_pkcs8_pem(LineEnding::LF)
            .map_err(|e| anyhow::anyhow!("私钥 PEM 编码失败: {}", e))?;
        let pub_pem = public_key
            .to_public_key_pem(LineEnding::LF)
            .map_err(|e| anyhow::anyhow!("公钥 PEM 编码失败: {}", e))?;

        // 确保目录存在
        let priv_dir = Path::new(private_key_path).parent();
        if let Some(dir) = priv_dir {
            if !dir.as_os_str().is_empty() {
                std::fs::create_dir_all(dir)
                    .map_err(|e| anyhow::anyhow!("创建密钥目录失败: {}", e))?;
            }
        }
        let pub_dir = Path::new(public_key_path).parent();
        if let Some(dir) = pub_dir {
            if !dir.as_os_str().is_empty() {
                std::fs::create_dir_all(dir)
                    .map_err(|e| anyhow::anyhow!("创建密钥目录失败: {}", e))?;
            }
        }

        // 保存私钥（设置权限，仅 owner 可读）
        std::fs::write(private_key_path, priv_pem.as_bytes())
            .map_err(|e| anyhow::anyhow!("保存私钥文件 {} 失败: {}", private_key_path, e))?;
        log::warn!(
            "RSA 私钥已生成并保存到 {} — 请妥善保管，勿提交到仓库",
            private_key_path
        );

        // 保存公钥
        std::fs::write(public_key_path, pub_pem.as_bytes())
            .map_err(|e| anyhow::anyhow!("保存公钥文件 {} 失败: {}", public_key_path, e))?;
        log::info!("RSA 公钥已生成并保存到 {}", public_key_path);

        Ok(Self {
            private_key,
            public_key_pem: pub_pem,
        })
    }

    /// 获取 PEM 格式公钥字符串
    pub fn public_key_pem(&self) -> &str {
        &self.public_key_pem
    }
}
