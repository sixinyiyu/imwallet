//! 请求日志中间件
//! 迁移自 IMWallet middleware/requestLogger.ts
//! 合并原 error_handler 功能：5xx 时额外打 error 级别日志
//!
//! 优化：
//! - 404 扫描探测请求降级为 debug 级别，避免污染 info 日志
//! - 记录 URL query params 和 body params（敏感字段自动脱敏）

use axum::{body::Body, extract::Request, middleware::Next, response::Response};
use log::{debug, error, info, warn};
use std::time::Instant;

/// 已知的扫描探测路径前缀（这些请求降级为 debug 日志）
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
/// 同时覆盖 snake_case 和 camelCase 两种格式
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

/// body 参数日志最大长度（超过截断）
const MAX_BODY_LOG_LEN: usize = 500;

/// 判断路径是否为扫描探测请求
fn is_scan_probe(path: &str) -> bool {
    if path == "/" {
        return true;
    }
    for prefix in SCAN_PATHS {
        if path.starts_with(prefix) {
            return true;
        }
    }
    false
}

/// 脱敏：将敏感字段的值替换为 ***
/// 简单实现：遍历每个敏感 key，在字符串中查找 key= 或 "key":" 格式并替换值
fn sanitize_params(input: &str) -> String {
    let mut result = input.to_string();
    for key in SENSITIVE_KEYS {
        // JSON 格式: "key":"value" 或 "key": "value"
        let json_prefix = format!("\"{}\"", key);
        if let Some(start) = result.find(&json_prefix) {
            // 找到 key 位置后，找冒号后面的值
            let after_key = &result[start + json_prefix.len()..];
            // 跳过冒号和可能的空格
            let trimmed = after_key.trim_start_matches(':').trim_start_matches(' ');
            if let Some(value_content) = trimmed.strip_prefix(char::from(34)) {
                // 值是字符串，找到结束引号
                if let Some(end_quote) = value_content.find(char::from(34)) {
                    let value_start =
                        start + json_prefix.len() + (after_key.len() - trimmed.len()) + 1;
                    let value_end = value_start + end_quote;
                    result.replace_range(value_start..value_end, "***");
                }
            }
        }

        // URL/query 格式: key=value（值到 & 或末尾）
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

/// 截断过长内容
fn truncate(s: &str, max_len: usize) -> &str {
    if s.len() <= max_len {
        s
    } else {
        &s[..s.floor_char_boundary(max_len)]
    }
}

pub async fn request_logger(req: Request<Body>, next: Next) -> Response {
    let start = Instant::now();
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path().to_string();

    // 提取 query params
    let query_str = uri.query().map(sanitize_params).unwrap_or_default();

    // 提取 body params（仅对有 body 的请求：POST/PUT/PATCH）
    let has_body = method == "POST" || method == "PUT" || method == "PATCH";
    let (parts, body_bytes): (axum::http::request::Parts, axum::body::Bytes) = if has_body {
        let (parts, body) = req.into_parts();
        let bytes = axum::body::to_bytes(body, 64 * 1024)
            .await
            .unwrap_or_default();
        (parts, bytes)
    } else {
        let (parts, _body) = req.into_parts();
        (parts, axum::body::Bytes::new())
    };

    // 解析 body 为可读字符串（JSON 或原始文本）
    let body_str = if !body_bytes.is_empty() {
        let raw = String::from_utf8_lossy(&body_bytes);
        let sanitized = sanitize_params(&raw);
        truncate(&sanitized, MAX_BODY_LOG_LEN).to_string()
    } else {
        String::new()
    };

    // 重建 Request
    let req = Request::from_parts(parts, Body::from(body_bytes));

    let response = next.run(req).await;

    let elapsed = start.elapsed();
    let status = response.status();
    let status_code = status.as_u16();

    // 构建日志参数部分
    let params_log = if !query_str.is_empty() && !body_str.is_empty() {
        format!(" query=[{}] body=[{}]", query_str, body_str)
    } else if !query_str.is_empty() {
        format!(" query=[{}]", query_str)
    } else if !body_str.is_empty() {
        format!(" body=[{}]", body_str)
    } else {
        String::new()
    };

    // 日志分级策略：
    // - 5xx → error（服务端故障，必须关注）
    // - 4xx + 扫描探测路径 → debug（噪音，不污染正常日志）
    // - 4xx + 业务路径 → warn（业务异常，值得关注）
    // - 2xx/3xx → info（正常业务请求）
    if status.is_server_error() {
        error!(
            "Request failed: {} {}{} → {} ({:.0}ms)",
            method,
            path,
            params_log,
            status_code,
            elapsed.as_millis()
        );
    } else if status.is_client_error() {
        if is_scan_probe(&path) {
            debug!(
                "Scan probe: {} {} → {} ({:.0}ms)",
                method,
                path,
                status_code,
                elapsed.as_millis()
            );
        } else {
            warn!(
                "Request rejected: {} {}{} → {} ({:.0}ms)",
                method,
                path,
                params_log,
                status_code,
                elapsed.as_millis()
            );
        }
    } else {
        info!(
            "Request completed: {} {}{} → {} ({:.0}ms)",
            method,
            path,
            params_log,
            status_code,
            elapsed.as_millis()
        );
    }

    response
}
