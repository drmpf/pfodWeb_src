// version.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// pfodProxy's own version string. Edit this directly to release a new
// version — pfodProxy now versions independently of pfodWeb.html, so
// this is no longer synced from pfodWeb_src/version.js at build time,
// and main.rs no longer reads it from Cargo.toml's [package] version
// (env!("CARGO_PKG_VERSION")) either. This is the single place to bump it.

pub const VERSION: &str = "4.1.2";
// V4.1.2 revised ble connections

