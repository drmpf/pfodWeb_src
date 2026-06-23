// main.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// pfodProxy entry point.  See the crate-level README for the
// protocol.  Owns:
//   * CLI args parsing
//   * single-instance check
//   * axum HTTP server + CORS layer
//   * per-request dispatch by transport
//
// Dispatch is minimal in the all-SSE model:
//   - `?cmd=…` present → fire-and-forget cmd write
//   - otherwise → SSE (discovery if target value empty, connection
//     if target value carries a real port/address/ip)
// Each transport handler (`serial::handle`, `tcp::handle`, `ble::handle`)
// does its own SSE-vs-cmd split internally based on `cmd` presence.

mod log;
mod logscan;
mod state;
mod serial;
mod tcp;
mod ble;
mod ble_names;

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use axum::{
    extract::{RawQuery, Request, State},
    http::{header, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::IntoResponse,
    routing::get,
    Router,
};
use bytes::Bytes;
use tokio::net::TcpListener;

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    // --no-browser suppresses the automatic browser open on startup and on
    // single-instance re-launch.  Pass it when a wrapper script (e.g.
    // run-pfodWeb-firefox.bat) handles browser opening itself.
    let no_browser = args.iter().any(|a| a == "--no-browser");

    let http_port: u16 = args.iter()
        .skip(1)
        .find(|s| !s.starts_with("--"))
        .map(|s| s.parse().unwrap_or_else(|_| {
            eprintln!("pfodProxy: invalid port {:?} — must be a number (e.g. pfodProxy 5000)", s);
            std::process::exit(1);
        }))
        .unwrap_or(4989);

    print_banner(http_port);

    // Single-instance check — refuse to start if another process is
    // already bound to our HTTP port.  Pre-flight bind beats a real
    // failed serve_forever for readable diagnostics.
    if connect_probe(http_port).await {
        // pfodProxy is already running on this port — re-open the browser
        // to the existing instance instead of showing an error.  This is
        // the normal path when the user closes the browser tab and then
        // re-launches pfodWeb.app / pfodProxy.exe.
        if no_browser {
            log::log(&format!(
                "[pfodProxy] Already running on port {} — --no-browser set, skipping browser open.",
                http_port
            ));
        } else {
            log::log(&format!(
                "[pfodProxy] Already running on port {} — opening pfodWeb in browser.",
                http_port
            ));
            open_pfodweb(http_port);
        }
        std::process::exit(0);
    }

    let app_state = Arc::new(state::AppState::new());

    spawn_idle_logger(app_state.clone());

    // Touches AppState.last_request (and has_seen_request) on every
    // request that reaches it (i.e. after host_filter / cors below have
    // already let it through). spawn_idle_logger() (above) reads these to
    // log when nothing appears to be open any more — see its doc comment,
    // and the fields' doc comments in state.rs.
    let last_request_state = app_state.clone();
    let touch_last_request = middleware::from_fn(move |req: Request, next: Next| {
        let last_request_state = last_request_state.clone();
        async move {
            *last_request_state.last_request.lock().await = Instant::now();
            last_request_state.has_seen_request.store(true, Ordering::Relaxed);
            next.run(req).await
        }
    });

    // CORS — unconditionally add Access-Control-Allow-Origin: * so that
    // file:// pages reach the SSE endpoint.  Browsers use the opaque
    // origin "null" for file:// requests; some browsers omit the Origin
    // header entirely, so a conditional CorsLayer that only fires when
    // Origin is present is unreliable.  DNS-rebinding attacks are already
    // blocked by host_filter (only 127.0.0.1:PORT / localhost:PORT pass),
    // so * is safe here.
    let cors = middleware::from_fn(|req: Request, next: Next| async move {
        // OPTIONS preflight — browsers send this before cross-origin fetch() when
        // the request has non-simple headers.  Return 200 with the required
        // Access-Control-Allow-* headers so the actual GET proceeds.
        if req.method().as_str() == "OPTIONS" {
            return axum::response::Response::builder()
                .status(StatusCode::OK)
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN,  "*")
                .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, OPTIONS")
                .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "*")
                .header(header::ACCESS_CONTROL_MAX_AGE,       "86400")
                .body(axum::body::Body::empty())
                .unwrap();
        }
        let mut response = next.run(req).await;
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_ORIGIN,
            HeaderValue::from_static("*"),
        );
        response
    });

    // Host header filter — reject any request whose Host is not
    // localhost:PORT or 127.0.0.1:PORT.  This is the primary DNS-rebinding
    // defence: a rebinding attack uses the attacker's domain as the Host
    // value, which this check rejects before any handler runs.
    let http_port = http_port;
    let host_filter = middleware::from_fn(move |req: Request, next: Next| async move {
        let host = req
            .headers()
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if host == format!("localhost:{http_port}")
            || host == format!("127.0.0.1:{http_port}")
        {
            next.run(req).await
        } else {
            log::log(&format!("[pfodProxy] host_filter: REJECTED Host={host:?}"));
            (StatusCode::FORBIDDEN, "forbidden").into_response()
        }
    });

    // Load pfodWeb.html from next to the binary so it can be served at GET /.
    // Opening http://127.0.0.1:{port}/ reliably launches the default browser
    // even when Edge/Chrome is running as a background startup-boost process —
    // http:// is a registered Windows protocol handler, file:// is not.
    let pfodweb_html: Option<Bytes> = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("pfodWeb.html")))
        .and_then(|p| std::fs::read(&p).ok().map(Bytes::from));

    let root_html: Bytes = match pfodweb_html {
        Some(html) => html,
        None => {
            log::log(&format!(
                "[pfodProxy] WARNING: pfodWeb.html not found next to binary — \
                 open http://127.0.0.1:{}/ manually",
                http_port
            ));
            Bytes::from(
                r#"<!DOCTYPE html><html><head><meta charset="utf-8">
<title>pfodWeb not found</title>
<style>body{font-family:sans-serif;padding:2em;max-width:600px;margin:auto}</style>
</head><body>
<h2>pfodWeb.html not found</h2>
<p><strong>pfodWeb.html</strong> was not found in the same directory as pfodProxy.</p>
<p>Place <code>pfodWeb.html</code> next to the <code>pfodProxy</code> executable
and restart pfodProxy, or open <code>pfodWeb.html</code> manually in your browser.</p>
</body></html>"#,
            )
        }
    };

    let mut router = Router::new()
        .route("/pfodWeb", get(handle_get))
        .route("/ping", get(handle_ping))
        .route("/shutdown", get(handle_shutdown));

    router = router.route("/", get(move || {
        let html = root_html.clone();
        async move {
            axum::response::Response::builder()
                .header("content-type", "text/html; charset=utf-8")
                .body(axum::body::Body::from(html))
                .unwrap()
        }
    }));

    // Generic static-file route — serves any other file found next to the
    // binary (e.g. extraFonts/pfodweb-extra-fonts.css and the woff2 files it
    // references), mirroring how pfodWebServer.js serves arbitrary files by
    // path. A missing file here returns a plain 404 — the friendly
    // "pfodWeb.html not found" page above stays exclusive to `/`.
    router = router.fallback(serve_static);

    let app = router
        .with_state(app_state)
        .layer(touch_last_request)
        .layer(cors)
        .layer(host_filter); // outermost — checked first on every request

    let addr = format!("127.0.0.1:{}", http_port);
    let listener = TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("[pfodProxy] bind {addr} failed: {e}"));
    log::log(&format!("[pfodProxy] Listening on http://{addr}"));

    if !no_browser {
        open_pfodweb(http_port);
    }

    axum::serve(listener, app)
        .await
        .expect("[pfodProxy] server crashed");
}

/// Serves any file found next to the pfodProxy binary, by request path
/// (e.g. GET /extraFonts/pfodweb-extra-fonts.css). Used for optional
/// resources — like the extraFonts subdirectory — that pfodWeb.html
/// references but that aren't baked into the binary. Returns a plain 404
/// when the file doesn't exist; this is deliberately NOT the friendly
/// "pfodWeb.html not found" HTML page, which is specific to the `/` route.
async fn serve_static(req: Request) -> impl IntoResponse {
    let path = req.uri().path();

    // Reject ".." path segments so requests can't escape the binary's
    // directory (e.g. /../../secrets.txt).
    if path.split('/').any(|seg| seg == "..") {
        return (StatusCode::FORBIDDEN, "forbidden").into_response();
    }

    let exe_dir = match std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())) {
        Some(d) => d,
        None => return (StatusCode::NOT_FOUND, "not found").into_response(),
    };

    let file_path = exe_dir.join(path.trim_start_matches('/'));

    match tokio::fs::read(&file_path).await {
        Ok(bytes) => axum::response::Response::builder()
            .header(header::CONTENT_TYPE, guess_content_type(&file_path))
            .body(axum::body::Body::from(bytes))
            .unwrap(),
        Err(_) => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

/// Minimal extension-to-MIME map covering the file types pfodWeb ships
/// (fonts, stylesheets, scripts) plus common static-asset types.
fn guess_content_type(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("woff2") => "font/woff2",
        Some("html") => "text/html; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("ico") => "image/x-icon",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// Trivial liveness check — pfodCommon.html's checkProxyAvailability()
/// (the initial check, the 5s heartbeat poll, and the pre-reload check in
/// _exitToConnectionScreen()/the connection-error alert) hits this instead
/// of /pfodWeb with no target params, which handle_get correctly treats as
/// a bad request (400) since pfodWeb itself never omits the target —
/// that 400 is harmless but shows up as a logged network error in the
/// browser console on every single ping. No state, no params, just 200.
async fn handle_ping() -> impl IntoResponse {
    log::debug("[pfodProxy] /ping received");
    (StatusCode::OK, "pong")
}

/// Shutdown handler — called only by the "Close pfodProxy" button in
/// pfodWeb's connection-setup screen (closePfodProxy() in pfodCommon.html),
/// a deliberate in-page click, not an inferred/automatic signal. Exits
/// unconditionally — no other-session check — since the user explicitly
/// asked this specific pfodProxy to stop; unlike the dropped idle-shutdown
/// design, there's no ambiguity to resolve here. Responds first, then
/// exits after a short delay so the response can actually be flushed
/// before the process terminates.
async fn handle_shutdown() -> impl IntoResponse {
    log::log("[pfodProxy] Shutdown requested via /shutdown — exiting.");
    tokio::spawn(async {
        tokio::time::sleep(Duration::from_millis(200)).await;
        std::process::exit(0);
    });
    (StatusCode::OK, "pfodProxy shutting down")
}

/// How often the idle-activity logger (below) re-checks.
const IDLE_CHECK_INTERVAL: Duration = Duration::from_secs(1);

/// How long pfodProxy can go with no request of any kind — a page load, a
/// device cmd, or the 5s heartbeat poll every open pfodWeb window sends
/// regardless of protocol (checkProxyAvailability() in pfodCommon.html) —
/// before it's logged as idle. Purely informational — see
/// spawn_idle_logger()'s doc comment for why pfodProxy no longer acts on
/// this at all.
const IDLE_LOG_TIMEOUT: Duration = Duration::from_secs(10);

/// Spawned once at startup. Logs once — at top level, not debug-gated —
/// when pfodProxy goes idle (no request of any kind for IDLE_LOG_TIMEOUT)
/// and again when activity resumes, so the console gives a clear,
/// low-noise picture of whether anything is using pfodProxy, without
/// repeating the same line every check tick. Doesn't start timing
/// idleness until AppState.has_seen_request is true (see its doc comment
/// in state.rs) — otherwise a slow browser launch could log "idle" before
/// anyone's even opened pfodWeb.
///
/// Purely a log — does not exit or touch any session. pfodProxy used to
/// shut itself down once idle (closing/resetting any open device session
/// first), but that relied on heartbeat absence as a proxy for "every
/// window is closed," which a merely backgrounded-and-frozen (not
/// actually closed) tab can also trigger — see browser tab freezing/
/// discarding. A false-positive there used to mean an unwanted shutdown
/// (and disconnecting a device that was still genuinely in use); now it's
/// just a log line that self-corrects the moment a heartbeat reappears.
/// pfodProxy must be stopped manually (Ctrl+C, or closing its console
/// window) when the user is actually done with it.
fn spawn_idle_logger(app: Arc<state::AppState>) {
    tokio::spawn(async move {
        let mut logged_idle = false;
        loop {
            tokio::time::sleep(IDLE_CHECK_INTERVAL).await;
            if !app.has_seen_request.load(Ordering::Relaxed) {
                continue;
            }
            let idle_for = Instant::now().duration_since(*app.last_request.lock().await);
            let is_idle = idle_for >= IDLE_LOG_TIMEOUT;
            if is_idle && !logged_idle {
                log::log("[pfodProxy] idle -- No pfodWeb appears to be active.");
                logged_idle = true;
            } else if !is_idle && logged_idle {
                log::log("[pfodProxy] pfodWeb active.");
                logged_idle = false;
            }
        }
    });
}

/// Single GET handler.  No serializing lock — SSEs are long-lived
/// and run concurrently; cmd writes are short and need exclusive
/// access only to the per-transport writer's Mutex (which is
/// enforced inside the transport handlers).
async fn handle_get(
    State(app): State<Arc<state::AppState>>,
    RawQuery(raw): RawQuery,
) -> impl IntoResponse {
    let params = parse_query(raw.as_deref().unwrap_or(""));

    // ?debug toggle — absence means OFF (a fresh session that
    // doesn't opt in turns off the previous session's verbose state).
    let new_debug = match params.get("debug").map(|s| s.as_str()) {
        Some(v) => !matches!(v.trim().to_ascii_lowercase().as_str(),
                             "0" | "false" | "no" | "off"),
        None => false,
    };
    let old_debug = log::DEBUG.load(Ordering::Relaxed);
    if new_debug != old_debug {
        log::DEBUG.store(new_debug, Ordering::Relaxed);
        log::log(&format!(
            "[pfodProxy] verbose debug logging {}",
            if new_debug { "ENABLED" } else { "disabled" }
        ));
    }

    log::debug(&format!("do_GET ?{}", raw.as_deref().unwrap_or("")));

    // Dispatch by which target param is present.  Each transport
    // handler internally splits on `cmd` presence.
    if params.contains_key("ip") {
        tcp::handle(app, params).await
    } else if params.contains_key("serial") {
        serial::handle(app, params).await
    } else if params.contains_key("ble") {
        ble::handle(app, params).await
    } else {
        // Bare `?cmd=` without a target — pfodWeb always includes the
        // full target on every request (see ConnectionManager._cmdURL),
        // so this is only reachable from manual/bare testing (e.g. a
        // hand-built curl request), not normal app usage.  With
        // multiple devices now able to be connected at once (see
        // state.rs) there's no sound way to guess which one a
        // target-less cmd meant, so spell out exactly what's missing —
        // this text is shown directly to whoever made the request (see
        // ConnectionManager's cmd-write error handling, which surfaces
        // the response body verbatim).
        (StatusCode::BAD_REQUEST,
         "No device target in request — cmd write needs one of:\n\
          ?serial=<path>&baud=<rate>&cmd=…\n\
          ?ip=<addr>&port=<n>&cmd=…\n\
          ?ble=<address>&cmd=…")
            .into_response()
    }
}

/// Parse a URL-encoded `k=v&k=v&…` query string into a flat HashMap.
/// First occurrence wins; empty values preserved so `?serial=` is
/// distinguishable from `?serial` being absent.
pub fn parse_query(raw: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for kv in raw.split('&').filter(|s| !s.is_empty()) {
        let (k, v) = match kv.split_once('=') {
            Some((k, v)) => (k, v),
            None => (kv, ""),
        };
        let key = urlencoding::decode(k).map(|c| c.into_owned()).unwrap_or_else(|_| k.to_owned());
        let val = urlencoding::decode(v).map(|c| c.into_owned()).unwrap_or_else(|_| v.to_owned());
        out.entry(key).or_insert(val);
    }
    out
}

async fn connect_probe(port: u16) -> bool {
    tokio::time::timeout(
        Duration::from_millis(500),
        TcpListener::bind(format!("127.0.0.1:{port}")),
    )
    .await
    .map(|res| res.is_err())
    .unwrap_or(true)
}

fn print_banner(http_port: u16) {
    println!();
    println!("=== pfodProxy {} ===", env!("CARGO_PKG_VERSION"));
    println!("Listening on      : http://127.0.0.1:{http_port}");
    println!();
    println!("To listen on a different port, restart with the port number:");
    println!("  pfodProxy <port>        e.g.  pfodProxy 5000");
    println!("(default port is 4989)");
    println!();
    println!("Connection SSE (long-lived per session):");
    println!("  http://127.0.0.1:{http_port}/pfodWeb?serial=<path>&baud=<rate>");
    println!("  http://127.0.0.1:{http_port}/pfodWeb?ip=<device_ip>&port=<device_tcp_port>");
    println!("  http://127.0.0.1:{http_port}/pfodWeb?ble=<address>");
    println!();
    println!("Discovery SSE (picker only):");
    println!("  http://127.0.0.1:{http_port}/pfodWeb?serial=");
    println!("  http://127.0.0.1:{http_port}/pfodWeb?ble=");
    println!();
    println!("Cmd write (fire-and-forget, 200 + empty body):");
    println!("  http://127.0.0.1:{http_port}/pfodWeb?<target>&cmd=<pfod_command>");
    println!();
    println!("Stop with Ctrl+C");
    println!();
}

/// Open http://127.0.0.1:{port}/ in the default browser.
/// Using an http:// URL (rather than a file:// path) means Windows routes it
/// through the registered http protocol handler, which reliably opens a new
/// browser window even when Edge/Chrome is running as a background process.
fn open_pfodweb(port: u16) {
    let url = format!("http://127.0.0.1:{port}/");

    #[cfg(windows)]
    let result = std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn()
        .map(|_| ());

    #[cfg(not(windows))]
    let result = open::that(&url);

    match result {
        Ok(_) => log::log(&format!("[pfodProxy] Opening pfodWeb at {url}")),
        Err(e) => log::log(&format!(
            "[pfodProxy] WARNING: could not open browser ({e}) — open manually: {url}"
        )),
    }
}
