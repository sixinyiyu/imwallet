//! 通用工具函数

/// 地址截断显示：前 8 后 4，用于日志脱敏
pub fn short_addr(addr: &str) -> String {
    if addr.len() <= 12 {
        addr.to_string()
    } else {
        format!("{}...{}", &addr[..8], &addr[addr.len() - 4..])
    }
}
