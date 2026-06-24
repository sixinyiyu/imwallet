//! 请求日志中间件
//! 迁移自 IMWallet middleware/requestLogger.ts
//! 合并原 error_handler 功能：5xx 时额外打 error 级别日志

use axum::{body::Body, extract::Request, middleware::Next, response::Response};
use log::{error, info};
use std::time::Instant;

pub async fn request_logger(req: Request<Body>, next: Next) -> Response {
    let start = Instant::now();
    let method = req.method().clone();
    let path = req.uri().path().to_string();

    let response = next.run(req).await;

    let elapsed = start.elapsed();
    let status = response.status();

    if status.is_server_error() {
        error!(
            "Request failed: {} {} → {} ({:.0}ms)",
            method,
            path,
            status.as_u16(),
            elapsed.as_millis()
        );
    } else {
        info!(
            "Request completed: {} {} → {} ({:.0}ms)",
            method,
            path,
            status.as_u16(),
            elapsed.as_millis()
        );
    }

    response
}
