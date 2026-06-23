// tcp.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// TCP transport handler — all-SSE shape.  Mirrors serial.rs.  TCP
// has no discovery step (no scan / enumeration — the user knows
// the IP:port).  Two endpoints:
//
//   GET /pfodWeb?ip=<addr>&port=<n>           connection SSE
//   GET /pfodWeb?ip=<addr>&port=<n>&cmd=…     fire-and-forget cmd write
//
// Each distinct (ip, port) target gets its own independent session
// (see state.rs) — connecting to one target never disturbs another.

use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{
        sse::{Event as SseEvent, KeepAlive, Sse},
        IntoResponse,
    },
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::broadcast;

use crate::log;
use crate::state::{AppState, TcpSession, BYTES_CHANNEL_CAP};

const CONNECT_TIMEOUT_SEC: f64 = 5.0;

pub async fn handle(
    app: Arc<AppState>,
    params: HashMap<String, String>,
) -> axum::response::Response {
    let req_ip   = params.get("ip").cloned();
    let req_port = params.get("port").and_then(|s| s.parse::<u16>().ok());
    let cmd      = params.get("cmd").cloned();

    log::debug(&format!(
        "_handle_tcp: ip={:?} port={:?} cmd={:?}", req_ip, req_port, cmd
    ));

    if let Some(cmd) = cmd {
        handle_cmd(app, req_ip, req_port, cmd).await
    } else if let (Some(ip), Some(port)) = (req_ip.as_deref().filter(|s| !s.is_empty()), req_port) {
        handle_connection_stream(app, ip.to_string(), port).await
    } else {
        bad_request("TCP needs ?ip=<addr>&port=<n>")
    }
}

// ── Connection SSE ───────────────────────────────────────────────────

async fn handle_connection_stream(
    app: Arc<AppState>,
    ip: String,
    port: u16,
) -> axum::response::Response {
    let session = app.get_or_create_tcp(&ip, port).await;

    if let Err(e) = ensure_open(&session, &ip, port).await {
        log::log(&format!("[pfodProxy] TCP connection SSE open failed: {e}"));
        return sse_error(format!("open failed: {e}"));
    }

    // First attacher claims `initial_rx` (subscribed in `open_tcp`
    // before the reader task started — see serial.rs for rationale).
    let (rx, claimed_initial) = {
        let mut t = session.state.lock().await;
        if let Some(rx) = t.initial_rx.take() {
            (rx, true)
        } else {
            match t.bytes_tx.as_ref() {
                Some(tx) => {
                    if tx.receiver_count() > 0 {
                        return sse_error("Connection Refused.\nAnother instance of pfodWeb.html already connected");
                    }
                    (tx.subscribe(), false)
                },
                None => return sse_error("no session"),
            }
        }
    };

    let label = format!("{ip}:{port}");
    log::log(&format!(
        "[pfodProxy] TCP SSE subscriber attached for {label} ({})",
        if claimed_initial { "claimed initial_rx — race-safe" } else { "fresh subscribe — late attacher" }
    ));

    let label_for_stream = label.clone();
    let stream = async_stream::stream! {
        // `event: progress` / `data: ready` — flushes Firefox's onopen
        // AND signals the JS to settle connect().  See serial.rs for the
        // full rationale.
        yield Ok::<_, Infallible>(SseEvent::default().event("progress").data("ready"));
        let mut rx = rx;
        loop {
            match rx.recv().await {
                Ok(bytes) => {
                    let hex = hex::encode(&bytes);
                    yield Ok::<_, Infallible>(SseEvent::default().data(hex));
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    log::log(&format!(
                        "[pfodProxy] TCP SSE {label_for_stream}: subscriber lagged, skipped {n} chunks"
                    ));
                    yield Ok::<_, Infallible>(SseEvent::default().event("lagged").data(n.to_string()));
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
        log::log(&format!("[pfodProxy] TCP SSE subscriber detached for {label_for_stream}"));
    };

    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}

// ── Cmd write ────────────────────────────────────────────────────────

async fn handle_cmd(
    app: Arc<AppState>,
    req_ip: Option<String>,
    req_port: Option<u16>,
    cmd: String,
) -> axum::response::Response {
    let (ip, port) = match (req_ip.as_deref().filter(|s| !s.is_empty()), req_port) {
        (Some(ip), Some(p)) => (ip.to_string(), p),
        // No explicit target — fall back to "the" connected TCP session,
        // but only if there's exactly one.  In normal operation the
        // client always includes the full target on every request (see
        // ConnectionManager._cmdURL), so this path is a defensive
        // fallback, not the common case.
        _ => match single_connected_target(&app).await {
            Some(t) => t,
            None => return bad_request("cmd write needs ?ip=<addr>&port=<n>"),
        },
    };

    let session = app.get_or_create_tcp(&ip, port).await;

    // `{!}` short-circuit on a disconnected session.  See serial.rs
    // for the rationale (pfodWeb fires {!} from up to three paths
    // on exit; we want one close, not three reopen-close cycles).
    if cmd.contains("{!}") && !session.state.lock().await.connected {
        log::log("[pfodProxy] {!} on disconnected TCP session — ignoring");
        return reply_ok_empty();
    }

    if let Err(e) = ensure_open(&session, &ip, port).await {
        log::log(&format!("[pfodProxy] cmd write TCP open failed: {e}"));
        return (StatusCode::SERVICE_UNAVAILABLE, format!("open failed: {e}")).into_response();
    }

    // `>> sent` is debug-only — non-debug log shows session
    // lifecycle (open/close), not per-cmd wire traffic.
    let writer = session.state.lock().await.writer.clone();
    if let Some(writer) = writer {
        let mut guard = writer.lock().await;
        match guard.write_all(cmd.as_bytes()).await {
            Ok(_) => log::debug(&format!(
                ">> tcp {ip}:{port} sent {}b {:?}", cmd.len(), cmd
            )),
            Err(e) => log::log(&format!("[pfodProxy] TCP write error: {e}")),
        }
    }

    if cmd.contains("{!}") {
        log::log("[pfodProxy] {!} seen — closing TCP socket");
        let mut t = session.state.lock().await;
        drop_tcp(&mut t);
        t.ip   = None;
        t.port = None;
    }

    reply_ok_empty()
}

/// If exactly one TCP target currently has a connected session, return
/// it; otherwise `None` (no sessions, or more than one — ambiguous).
async fn single_connected_target(app: &Arc<AppState>) -> Option<(String, u16)> {
    let map = app.tcp.lock().await;
    let mut found = None;
    for (key, session) in map.iter() {
        if session.state.lock().await.connected {
            if found.is_some() {
                return None; // more than one — ambiguous
            }
            found = Some(key.clone());
        }
    }
    found
}

// ── Session lifecycle ────────────────────────────────────────────────

/// Ensure a TCP session is open to (ip, port).  Spawns the reader task
/// on first open.  Idempotent — calling twice for the same target is a
/// no-op after the first.
///
/// `session.open_lock` serialises concurrent callers for this one
/// target (connection-SSE and cmd-write arrive simultaneously on first
/// connect).  Without it both see `connected=false`, both call
/// `open_tcp`, and both try to establish a TCP connection to the same
/// endpoint.  The second caller waits until the first open returns; by
/// then `connected=true` and the fast-path returns immediately without
/// re-opening.
async fn ensure_open(session: &Arc<TcpSession>, ip: &str, port: u16) -> Result<(), String> {
    let _gate = session.open_lock.lock().await;

    if session.state.lock().await.connected {
        return Ok(());
    }

    {
        let mut t = session.state.lock().await;
        t.ip   = Some(ip.to_string());
        t.port = Some(port);
    }

    open_tcp(session, ip, port).await
}

/// Map a raw OS TCP-connect error to an actionable message.
/// Checks the Display string so it works on both macOS and Linux
/// without needing platform-specific error-code constants.
fn friendly_tcp_error(e: &std::io::Error, ip: &str, port: u16) -> String {
    let raw = format!("{e}");
    // macOS EHOSTUNREACH (os error 65) / Linux EHOSTUNREACH (os error 113)
    if raw.contains("No route to host")
        || raw.contains("os error 65")
        || raw.contains("os error 113")
    {
        return format!(
            "Cannot reach {ip}:{port} — No route to host.\n\
             Check:\n\
             \u{2022} Device is powered up and online at {ip}\n\
             \u{2022} Device is on the same WiFi/network as this computer"
        );
    }
    // macOS ENETUNREACH (os error 51) / Linux ENETUNREACH (os error 101)
    if raw.contains("Network is unreachable")
        || raw.contains("os error 51")
        || raw.contains("os error 101")
    {
        return format!(
            "Network unreachable for {ip}:{port}.\n\
             No network interface on this computer covers that address.\n\
             Check WiFi/Ethernet is connected and the IP {ip} is on the same subnet."
        );
    }
    // ECONNREFUSED — host is up but nothing listening on the port
    if raw.contains("Connection refused") {
        return format!(
            "Connection refused at {ip}:{port}.\n\
             The device is reachable but port {port} is closed or the device firmware \
             is not listening yet."
        );
    }
    raw
}

/// macOS only: a plain unicast TCP connect to a LAN address never triggers
/// the system's "Local Network" permission prompt for an LSUIElement
/// (no Dock icon / no window) app — the request is silently denied forever
/// by NECP (kernel drops the SYN, surfaced to us as a fake EHOSTUNREACH),
/// with no prompt, no TCC database entry, and no System Settings entry.
/// Sending one mDNS probe to the well-known Bonjour multicast group is
/// Apple's documented way to force that permission prompt to actually
/// fire even for backgrounded apps; once granted, ordinary TCP connects
/// from this process are no longer blocked.  Fired here (right before the
/// first real TCP connect attempt) rather than at process startup, so it
/// only ever runs if the user actually tries a TCP/IP connection — serial-
/// and BLE-only users never trigger it.
#[cfg(target_os = "macos")]
async fn probe_before_connect(_ip: &str) {
    use std::net::UdpSocket;
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        // Minimal valid mDNS query: 12-byte DNS header, zero questions.
        let _ = socket.send_to(&[0u8; 12], "224.0.0.251:5353");
    }
}

async fn open_tcp(session: &Arc<TcpSession>, ip: &str, port: u16) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    probe_before_connect(ip).await;

    log::log(&format!("[pfodProxy] Connecting to TCP {ip}:{port} ..."));
    let stream = tokio::time::timeout(
        Duration::from_secs_f64(CONNECT_TIMEOUT_SEC),
        TcpStream::connect((ip, port)),
    )
    .await
    .map_err(|_| "connect timed out".to_string())?
    .map_err(|e| friendly_tcp_error(&e, ip, port))?;

    let _ = stream.set_nodelay(true);

    let (read_half, write_half) = stream.into_split();
    let writer_arc = Arc::new(tokio::sync::Mutex::new(write_half));
    let (bytes_tx, _) = broadcast::channel::<Vec<u8>>(BYTES_CHANNEL_CAP);
    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();

    // See serial.rs:open_serial — subscribe before spawning the reader
    // so the broadcast channel always has a subscriber from byte zero.
    let initial_rx = bytes_tx.subscribe();
    log::log(&format!("[pfodProxy] TCP {ip}:{port}: initial_rx pre-subscribed (race-safe)"));

    {
        let mut t = session.state.lock().await;
        t.writer     = Some(writer_arc);
        t.bytes_tx   = Some(bytes_tx.clone());
        t.connected  = true;
        t.cancel_tx  = Some(cancel_tx);
        t.initial_rx = Some(initial_rx);
    }

    log::log(&format!("[pfodProxy] Connected to TCP {ip}:{port}"));

    let session_for_reader = session.clone();
    let label = format!("{ip}:{port}");
    tokio::spawn(async move {
        let mut read_half = read_half;
        let mut cancel_rx = cancel_rx;
        let mut chunk = [0u8; 4096];
        let mut log_scan = crate::logscan::LogScanner::new("tcp", label.clone());
        // See serial.rs for rationale — only warn if no subscriber
        // ever attached (real race-window bug); silent thereafter
        // (idle-session after browser EventSource close is benign).
        let mut ever_subscribed = false;
        loop {
            tokio::select! {
                biased;
                _ = &mut cancel_rx => break,
                res = read_half.read(&mut chunk) => {
                    match res {
                        Ok(0)  => break,
                        Ok(n)  => {
                            log_scan.feed(&chunk[..n]);
                            if bytes_tx.receiver_count() > 0 {
                                ever_subscribed = true;
                            }
                            if bytes_tx.send(chunk[..n].to_vec()).is_err() && !ever_subscribed {
                                log::log(&format!(
                                    "[pfodProxy] *** TCP {label}: no subscriber attached before first device byte, {n} bytes LOST (race-fix may have regressed) ***"
                                ));
                            }
                        }
                        Err(_) => break,
                    }
                }
            }
        }
        drop(read_half);
        let mut t = session_for_reader.state.lock().await;
        t.connected  = false;
        t.writer     = None;
        t.bytes_tx   = None;
        t.initial_rx = None;
        log::log(&format!("[pfodProxy] TCP connection to {label} closed"));
    });

    Ok(())
}

fn drop_tcp(t: &mut crate::state::TcpState) {
    if let Some(tx) = t.cancel_tx.take() {
        let _ = tx.send(());
    }
    t.connected  = false;
    t.writer     = None;
    t.bytes_tx   = None;
    t.initial_rx = None;
}

// ── Response helpers ─────────────────────────────────────────────────

fn reply_ok_empty() -> axum::response::Response {
    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("text/plain; charset=utf-8"));
    headers.insert("Cache-Control", HeaderValue::from_static("no-cache"));
    (StatusCode::OK, headers, Vec::<u8>::new()).into_response()
}

fn bad_request(msg: &str) -> axum::response::Response {
    (StatusCode::BAD_REQUEST, msg.to_string()).into_response()
}

fn sse_error(msg: impl Into<String>) -> axum::response::Response {
    let msg = msg.into();
    let stream = async_stream::stream! {
        yield Ok::<_, Infallible>(SseEvent::default().event("error").data(msg));
    };
    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}
