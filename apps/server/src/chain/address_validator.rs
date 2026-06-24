//! 链地址格式校验
//! 迁移自 IMWallet 客户端 address.ts 和链交互逻辑
//!
//! 支持 Tron / EVM (Ethereum 等) / Bitcoin 地址格式校验

/// 地址校验结果
pub struct AddressValidation {
    pub is_valid: bool,
    pub chain: Option<String>,
    pub error: Option<String>,
}

/// 校验地址格式并识别链类型
pub fn validate_address(address: &str) -> AddressValidation {
    if address.is_empty() {
        return AddressValidation {
            is_valid: false,
            chain: None,
            error: Some("地址不能为空".into()),
        };
    }

    // Tron 地址：以 'T' 开头，34 个字符
    if address.starts_with('T') && address.len() == 34 {
        return AddressValidation {
            is_valid: true,
            chain: Some("Tron".into()),
            error: None,
        };
    }

    // EVM 地址（Ethereum 等）：0x 前缀 + 40 hex 字符
    if address.starts_with("0x") && address.len() == 42 {
        let hex_part = &address[2..];
        if hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
            return AddressValidation {
                is_valid: true,
                chain: Some("EVM".into()),
                error: None,
            };
        }
    }

    // Bitcoin 地址：以 1, 3 开头
    if (address.starts_with('1') || address.starts_with('3'))
        && address.len() >= 26
        && address.len() <= 35
    {
        return AddressValidation {
            is_valid: true,
            chain: Some("Bitcoin".into()),
            error: None,
        };
    }
    // Bech32 Bitcoin 地址
    if address.starts_with("bc1") && address.len() >= 42 && address.len() <= 62 {
        return AddressValidation {
            is_valid: true,
            chain: Some("Bitcoin".into()),
            error: None,
        };
    }

    AddressValidation {
        is_valid: false,
        chain: None,
        error: Some("不支持的地址格式".into()),
    }
}

/// 按链类型校验地址格式是否匹配
/// chain_name 为数据库 chains 表中的 name 字段（如 "Tron", "Ethereum", "Bitcoin"）
/// EVM 链（Ethereum、BSC、Polygon 等）统一使用 0x 格式
pub fn validate_address_for_chain(address: &str, chain_name: &str) -> AddressValidation {
    let result = validate_address(address);
    if !result.is_valid {
        return result;
    }

    let detected = result.chain.clone().unwrap();
    let expected = normalize_chain(chain_name);

    if detected != expected {
        return AddressValidation {
            is_valid: false,
            chain: Some(detected.clone()),
            error: Some(format!(
                "地址格式与链类型不匹配：地址为 {} 格式，但期望 {} 格式",
                detected, expected
            )),
        };
    }

    result
}

/// 将数据库中的链名统一映射为校验用的链类型
/// EVM 链（Ethereum、BSC、Polygon 等）统一归为 "EVM"
fn normalize_chain(chain_name: &str) -> String {
    match chain_name {
        "Tron" => "Tron".into(),
        "Bitcoin" => "Bitcoin".into(),
        // 所有 EVM 兼容链统一为 EVM 地址格式
        _ => "EVM".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tron_address_valid() {
        let result = validate_address("TLa2f6VPJqGBdC2FFCpMaHeMqEwN5xBNbK");
        assert!(result.is_valid);
        assert_eq!(result.chain, Some("Tron".into()));
    }

    #[test]
    fn test_tron_address_for_chain() {
        let result = validate_address_for_chain("TLa2f6VPJqGBdC2FFCpMaHeMqEwN5xBNbK", "Tron");
        assert!(result.is_valid);
    }

    #[test]
    fn test_tron_address_wrong_chain() {
        let result = validate_address_for_chain("TLa2f6VPJqGBdC2FFCpMaHeMqEwN5xBNbK", "Ethereum");
        assert!(!result.is_valid);
        assert!(result.error.unwrap().contains("不匹配"));
    }

    #[test]
    fn test_evm_address_valid() {
        let result = validate_address("0x742d35Cc6634C0532925a3b844Bc9e0e1f7010B7");
        assert!(result.is_valid);
        assert_eq!(result.chain, Some("EVM".into()));
    }

    #[test]
    fn test_evm_address_for_ethereum_chain() {
        let result =
            validate_address_for_chain("0x742d35Cc6634C0532925a3b844Bc9e0e1f7010B7", "Ethereum");
        assert!(result.is_valid);
    }

    #[test]
    fn test_evm_address_for_bsc_chain() {
        // BSC 也是 EVM 链，0x 地址格式兼容
        let result =
            validate_address_for_chain("0x742d35Cc6634C0532925a3b844Bc9e0e1f7010B7", "BSC");
        assert!(result.is_valid);
    }

    #[test]
    fn test_evm_address_wrong_chain() {
        let result =
            validate_address_for_chain("0x742d35Cc6634C0532925a3b844Bc9e0e1f7010B7", "Tron");
        assert!(!result.is_valid);
    }

    #[test]
    fn test_btc_address_valid() {
        let result = validate_address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
        assert!(result.is_valid);
        assert_eq!(result.chain, Some("Bitcoin".into()));
    }

    #[test]
    fn test_btc_address_for_chain() {
        let result = validate_address_for_chain("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "Bitcoin");
        assert!(result.is_valid);
    }

    #[test]
    fn test_invalid_address() {
        let result = validate_address("not-an-address");
        assert!(!result.is_valid);
    }

    #[test]
    fn test_empty_address() {
        let result = validate_address("");
        assert!(!result.is_valid);
        assert_eq!(result.error, Some("地址不能为空".into()));
    }
}
