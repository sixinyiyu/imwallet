//! 健康检查路由 — GET /health

use crate::middleware::AppState;
use crate::SERVER_VERSION;
use axum::extract::State;
use axum::Json;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    db: &'static str,
}

pub async fn health_check_handler(State(state): State<AppState>) -> Json<HealthResponse> {
    let db_ok =
        crate::db::query::query_count(&state.db, "SELECT 1 as cnt", crate::db::query::vals![])
            .await
            .is_ok();

    Json(HealthResponse {
        status: if db_ok { "ok" } else { "degraded" },
        service: "rs-wallet",
        version: SERVER_VERSION,
        db: if db_ok { "connected" } else { "unreachable" },
    })
}
