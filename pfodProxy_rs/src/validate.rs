// validate.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// Shared input validation and defensive-response helpers for
// BLE/TCP/serial request handling.

use axum::response::IntoResponse;
use std::time::Duration;

/// How long `hang_silently` sleeps before ever responding — far beyond
/// any realistic client-side timeout, so a rejected request just looks
/// like it went nowhere.
const HANG_SEC: u64 = 120;

/// True if `cmd` is either empty (the no-dedup data-refresh poll — see
/// HTTPProxyConnection.sendDataRefresh() in connectionManager.js) or a
/// `{...}` pfod command optionally preceded by exactly one dedup
/// character (see connectionManager.js: getCurrentDedupChar()/
/// dedupChars — one rotating character prepended per send() call so
/// the device's pfodParser can detect duplicate retries). Rejecting
/// anything else stops pfodProxy being used to write arbitrary
/// non-pfod-shaped payloads to a device/peripheral.
pub fn is_valid_pfod_cmd(cmd: &str) -> bool {
    if cmd.is_empty() {
        return true;
    }
    let body = if cmd.starts_with('{') {
        cmd
    } else {
        let mut chars = cmd.chars();
        chars.next(); // at most one leading dedup char
        chars.as_str()
    };
    body.len() >= 2 && body.starts_with('{') && body.ends_with('}')
}

/// Reject a request that looks like probing or misuse — invalid cmd
/// syntax, a cmd write with no explicit target, a stale/forged `port`
/// param, or any other malformed request to a transport endpoint — the
/// same way: log `reason` server-side, then hang long enough that no
/// response is ever sent within any practical timeframe. Deliberately
/// does not return an informative error: that would both confirm
/// pfodProxy is running and spell out exactly what would make the
/// request valid (the real API shape is already documented for
/// legitimate users — this path is for requests that aren't that).
pub async fn hang_silently(reason: &str) -> axum::response::Response {
    crate::log::log(&format!("[pfodProxy] rejected — {reason}"));
    tokio::time::sleep(Duration::from_secs(HANG_SEC)).await;
    (axum::http::StatusCode::OK, axum::body::Body::empty()).into_response()
}
