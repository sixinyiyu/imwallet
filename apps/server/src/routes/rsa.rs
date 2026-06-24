//! RSA 路由 — /api/v1/rsa
//! 公开接口，无需签名

use crate::errors::AppError;
use crate::middleware::AppState;
use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;

pub fn router() -> Router<AppState> {
    Router::new().route("/rsa/public-key", get(get_public_key))
}

#[derive(Debug, Serialize)]
struct PublicKeyResponse {
    public_key: String,
}

/// GET /rsa/public-key — 获取 RSA 公钥
async fn get_public_key(
    State(state): State<AppState>,
) -> Result<Json<PublicKeyResponse>, AppError> {
    Ok(Json(PublicKeyResponse {
        public_key: state.rsa_keys.public_key_pem().to_string(),
    }))
}
