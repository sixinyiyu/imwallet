//! 请求日志中间件
//! 迁移自 IMWallet middleware/requestLogger.ts
//! 合并原 error_handler 功能：5xx 时额外打 error 级别日志
//!
//! 优化：404 扫描探测请求降级为 debug 级别，避免污染 info 日志

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

/// 判断路径是否为扫描探测请求
fn is_scan_probe(path: &str) -> bool {
    // 根路径 / 的 GET 请求（非业务路径）
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

pub async fn request_logger(req: Request<Body>, next: Next) -> Response {
    let start = Instant::now();
    let method = req.method().clone();
    let path = req.uri().path().to_string();

    let response = next.run(req).await;

    let elapsed = start.elapsed();
    let status = response.status();
    let status_code = status.as_u16();

    // 日志分级策略：
    // - 5xx → error（服务端故障，必须关注）
    // - 4xx + 扫描探测路径 → debug（噪音，不污染正常日志）
    // - 4xx + 业务路径 → warn（业务异常，值得关注）
    // - 2xx/3xx → info（正常业务请求）
    if status.is_server_error() {
        error!(
            "Request failed: {} {} → {} ({:.0}ms)",
            method,
            path,
            status_code,
            elapsed.as_millis()
        );
    } else if status.is_client_error() {
        if is_scan_probe(&path) {
            // 扫描探测请求降级为 debug，生产环境默认 info 级别不会输出
            debug!(
                "Scan probe: {} {} → {} ({:.0}ms)",
                method,
                path,
                status_code,
                elapsed.as_millis()
            );
        } else {
            warn!(
                "Request rejected: {} {} → {} ({:.0}ms)",
                method,
                path,
                status_code,
                elapsed.as_millis()
            );
        }
    } else {
        info!(
            "Request completed: {} {} → {} ({:.0}ms)",
            method,
            path,
            status_code,
            elapsed.as_millis()
        );
    }

    response
}
