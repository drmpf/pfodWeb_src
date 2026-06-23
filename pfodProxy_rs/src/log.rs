// log.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// Timestamped log helpers used everywhere in the proxy.  Mirrors the
// Python proxy's `_log()` / `_debug()` so console output across the
// two implementations looks identical and the same eyeball-scanning
// tricks (HH:MM:SS.mmm prefixes, [pfodProxy] / [pfodProxy DEBUG] tags)
// work on both.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use chrono::{Local, Timelike};

/// Global debug-enabled flag — flipped on/off per-request from the
/// `?debug=` query param.  Static rather than per-AppState because
/// every code path that wants to log already has lots of state to
/// thread; bouncing a single AtomicBool through them all is
/// gratuitous ceremony.
pub static DEBUG: AtomicBool = AtomicBool::new(false);

/// HH:MM:SS.mmm timestamp prefix used by both `log()` and `debug()`.
fn ts() -> String {
    let now = Local::now();
    format!(
        "{:02}:{:02}:{:02}.{:03}",
        now.hour(),
        now.minute(),
        now.second(),
        now.nanosecond() / 1_000_000,
    )
}

/// Print one timestamped runtime line.  Always emitted (mirrors the
/// Python `_log()` info path).
pub fn log(msg: &str) {
    println!("{} {}", ts(), msg);
}

/// Conditional verbose-debug line; no-op unless DEBUG is on.  Mirrors
/// Python `_debug()`.
pub fn debug(msg: &str) {
    if DEBUG.load(Ordering::Relaxed) {
        println!("{} [pfodProxy DEBUG] {}", ts(), msg);
    }
}

/// Returns the current epoch millis — used for response-timeout
/// bookkeeping inside the per-request flow.
#[allow(dead_code)]
pub fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
