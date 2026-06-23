// serial.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// Serial transport handler — all-SSE shape.  Two endpoints:
//
//   GET /pfodWeb?serial=                          discovery SSE
//                                                 emits one event per
//                                                 enumerated serial port,
//                                                 then closes.
//
//   GET /pfodWeb?serial=<path>&baud=<rate>        connection SSE
//                                                 opens the port (if not
//                                                 already open) and
//                                                 streams every byte the
//                                                 reader task receives,
//                                                 hex-encoded, one SSE
//                                                 event per chunk.
//
//   GET /pfodWeb?serial=<path>&baud=<rate>&cmd=…  fire-and-forget cmd
//                                                 write.  Opens session
//                                                 lazily if needed, writes
//                                                 the cmd bytes, returns
//                                                 200 + empty body.  Cmd's
//                                                 response will appear on
//                                                 the connection SSE
//                                                 above.
//
// Each distinct serial path gets its own independent session (see
// state.rs) — connecting to one port never disturbs another.

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{
        sse::{Event as SseEvent, KeepAlive, Sse},
        IntoResponse,
    },
};
use serialport::SerialPortType;
use std::convert::Infallible;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::broadcast;
use tokio_serial::SerialPortBuilderExt;

use crate::log;
use crate::state::{AppState, SerialSession, BYTES_CHANNEL_CAP};

/// Escape a string as a JSON string literal (quotes included).
/// Only handles characters that can appear in port paths and names.
pub fn json_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"'  => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => { let _ = std::fmt::write(&mut out, format_args!("\\u{:04x}", c as u32)); }
            c    => out.push(c),
        }
    }
    out.push('"');
    out
}

struct PortInfo {
    path:    String,
    name:    String,
    vid:     Option<u16>,
    pid:     Option<u16>,
    in_use:  bool,
}

impl PortInfo {
    /// Serialize to the JSON shape the browser picker modal expects.
    fn to_json(&self) -> String {
        let vid = self.vid.map(|v| format!("{v}")).unwrap_or_else(|| "null".into());
        let pid = self.pid.map(|v| format!("{v}")).unwrap_or_else(|| "null".into());
        format!(r#"{{"path":{},"name":{},"vid":{},"pid":{},"inUse":{}}}"#,
            json_str(&self.path), json_str(&self.name), vid, pid, self.in_use)
    }
}

/// True if `path` currently has a live, claimed session — i.e. someone
/// is actively connected to it right now (same signal
/// `handle_connection_stream`'s own rejection check uses).  A session
/// that exists but has no live subscriber (e.g. the owning tab closed)
/// is reported as not in use — it's freely claimable, matching the
/// rejection logic it mirrors.
async fn path_in_use(app: &Arc<AppState>, path: &str) -> bool {
    let map = app.serial.lock().await;
    match map.get(path) {
        Some(session) => {
            let s = session.state.lock().await;
            s.connected && s.bytes_tx.as_ref().map_or(false, |tx| tx.receiver_count() > 0)
        }
        None => false,
    }
}

/// Axum dispatch entry point.  The `cmd` param's presence/absence is
/// the discriminator (`main.rs` already split by transport; this fn
/// only needs to split by SSE-vs-cmd-write).
pub async fn handle(
    app: Arc<AppState>,
    params: HashMap<String, String>,
) -> axum::response::Response {
    let serial_arg = params.get("serial").cloned();
    let req_baud   = params.get("baud").and_then(|s| s.parse::<u32>().ok());
    let cmd        = params.get("cmd").cloned();

    log::debug(&format!(
        "_handle_serial: serial={:?} baud={:?} cmd={:?}",
        serial_arg, req_baud, cmd
    ));

    if let Some(cmd) = cmd {
        // Cmd-write path — fire-and-forget.
        handle_cmd(app, serial_arg, req_baud, cmd).await
    } else if matches!(serial_arg.as_deref(), Some("")) {
        // Discovery SSE — empty target value, no cmd.
        handle_discovery_stream(app).await
    } else if let (Some(path), Some(baud)) = (serial_arg.as_deref().filter(|s| !s.is_empty()), req_baud) {
        // Connection SSE — target set, no cmd.
        handle_connection_stream(app, path.to_string(), baud).await
    } else {
        bad_request("expected ?serial= (discovery) or ?serial=<path>&baud=<rate> (connection or cmd)")
    }
}

// ── Discovery SSE ────────────────────────────────────────────────────

/// Enumerate serial ports and stream one SSE event per port, then
/// close.  Serial enumeration is instant on every platform so this is
/// effectively a one-shot in SSE clothing — kept as SSE for shape
/// consistency with the BLE picker, which genuinely needs streaming.
async fn handle_discovery_stream(app: Arc<AppState>) -> axum::response::Response {
    log::log("[pfodProxy] Serial port-list (SSE)");
    let ports = serialport::available_ports().unwrap_or_default();

    let mut infos: Vec<PortInfo> = Vec::new();
    for p in ports {
        // macOS exposes every serial device twice: /dev/cu.X (call-out, the
        // one you want for micros) and /dev/tty.X (call-in, blocks on DCD
        // when used with non-modem devices).  Skip the tty.* twins so the
        // picker only shows the cu.* entries.  Linux uses /dev/ttyUSB0,
        // /dev/ttyS0 etc. (no dot after tty) so this prefix doesn't match.
        if p.port_name.starts_with("/dev/tty.") {
            continue;
        }
        let (vid, pid, name) = match &p.port_type {
            SerialPortType::UsbPort(u) => (
                Some(u.vid),
                Some(u.pid),
                u.product.clone().unwrap_or_else(|| p.port_name.clone()),
            ),
            _ => (None, None, p.port_name.clone()),
        };
        let in_use = path_in_use(&app, &p.port_name).await;
        infos.push(PortInfo { path: p.port_name, name, vid, pid, in_use });
    }

    let stream = async_stream::stream! {
        // Initial SSE comment — flushes a body byte for Firefox's
        // EventSource onopen.  See handle_connection_stream below for
        // rationale.  Cheap and uniform with the BLE discovery and
        // every connection SSE.
        yield Ok::<_, Infallible>(SseEvent::default().comment("ready"));
        for info in infos {
            yield Ok::<_, Infallible>(SseEvent::default().data(info.to_json()));
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}

// ── Connection SSE ───────────────────────────────────────────────────

/// Open the port if needed, then return an SSE response that subscribes
/// to the device-byte broadcast and emits one hex-encoded SSE event per
/// chunk.  When the subscriber drops (browser closes EventSource)
/// the stream ends naturally — the device session stays alive
/// because the broadcast sender is still in the state, ready for
/// either a new subscriber or a cmd write.
async fn handle_connection_stream(
    app: Arc<AppState>,
    path: String,
    baud: u32,
) -> axum::response::Response {
    let session = app.get_or_create_serial(&path).await;

    if let Err(e) = ensure_open(&session, &path, baud).await {
        log::log(&format!("[pfodProxy] connection SSE open failed: {e}"));
        return sse_error(format!("open failed: {e}"));
    }

    // First attacher claims `initial_rx` (subscribed in `open_serial`
    // before the reader task started — guarantees no bytes were lost
    // between port-open and now).  Later attachers subscribe fresh.
    let (rx, claimed_initial) = {
        let mut s = session.state.lock().await;
        if let Some(rx) = s.initial_rx.take() {
            (rx, true)
        } else {
            match s.bytes_tx.as_ref() {
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

    log::log(&format!(
        "[pfodProxy] Serial SSE subscriber attached for {path} ({})",
        if claimed_initial { "claimed initial_rx — race-safe" } else { "fresh subscribe — late attacher" }
    ));

    let label = path.clone();
    let stream = async_stream::stream! {
        // `event: progress` / `data: ready` serves two purposes:
        // 1. Flushes a body byte so Firefox's EventSource fires `onopen`
        //    immediately (Firefox waits for the first body byte; without
        //    this the default 15 s keep-alive is what triggers it).
        // 2. Signals the JS to settle the connect() promise.  Using a
        //    named event (not a comment) means the JS always sees `ready`
        //    BEFORE any device bytes, so a "second connection refused"
        //    error event is never silently swallowed after settle().
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
                        "[pfodProxy] Serial SSE {label}: subscriber lagged, skipped {n} chunks"
                    ));
                    // Keep going — surface a synthetic event so
                    // the browser knows bytes were dropped.
                    yield Ok::<_, Infallible>(SseEvent::default().event("lagged").data(n.to_string()));
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
        log::log(&format!("[pfodProxy] Serial SSE subscriber detached for {label}"));
    };

    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}

// ── Cmd write ────────────────────────────────────────────────────────

/// Fire-and-forget cmd write.  Opens the session lazily if needed.
/// `{!}` triggers a full session teardown (write the bytes first so
/// the device sees the abort, then close).
async fn handle_cmd(
    app: Arc<AppState>,
    serial_arg: Option<String>,
    req_baud: Option<u32>,
    cmd: String,
) -> axum::response::Response {
    // Determine target.  If the caller supplied serial+baud, use
    // them; otherwise fall back to "the" connected serial session,
    // but only if there's exactly one.  In normal operation the
    // client always includes the full target on every request (see
    // ConnectionManager._cmdURL), so this path is a defensive
    // fallback, not the common case.
    let (path, baud) = match (serial_arg.as_deref().filter(|s| !s.is_empty()), req_baud) {
        (Some(p), Some(b)) => (p.to_string(), b),
        _ => match single_connected_target(&app).await {
            Some(t) => t,
            None => return bad_request("cmd write needs ?serial=<path>&baud=<rate>"),
        },
    };

    let session = app.get_or_create_serial(&path).await;

    // `{!}` short-circuit on a disconnected session.  pfodWeb fires
    // `{!}` from up to three paths on exit (exitAbort queue +
    // ConnectionManager.disconnect + window.beforeunload); if the
    // first one closed the session, the others would otherwise
    // trigger pointless reopen-then-close cycles (and on Arduino
    // boards each reopen toggles DTR → resets the board).
    if cmd.contains("{!}") && !session.state.lock().await.connected {
        log::log("[pfodProxy] {!} on disconnected serial session — ignoring");
        return reply_ok_empty();
    }

    if let Err(e) = ensure_open(&session, &path, baud).await {
        log::log(&format!("[pfodProxy] cmd write open failed: {e}"));
        return (StatusCode::SERVICE_UNAVAILABLE, format!("open failed: {e}")).into_response();
    }

    // Write the cmd.  `>> sent` is debug-only — non-debug log shows
    // session lifecycle (open/close), not per-cmd wire traffic.
    let writer = session.state.lock().await.writer.clone();
    if let Some(writer) = writer {
        let mut guard = writer.lock().await;
        match guard.write_all(cmd.as_bytes()).await {
            Ok(_) => log::debug(&format!(
                ">> serial {path} sent {}b {:?}", cmd.len(), cmd
            )),
            Err(e) => log::log(&format!("[pfodProxy] Serial write error: {e}")),
        }
    }

    // `{!}` close — tear down after the write completed so the device
    // sees the bytes.  Mirrors the Python proxy and the previous
    // pre-SSE Rust code.
    if cmd.contains("{!}") {
        log::log("[pfodProxy] {!} seen — closing serial");
        let mut s = session.state.lock().await;
        drop_serial(&mut s);
        s.path = None;
        s.baud = None;
    }

    reply_ok_empty()
}

/// If exactly one serial path currently has a connected session,
/// return it; otherwise `None` (no sessions, or more than one —
/// ambiguous).
async fn single_connected_target(app: &Arc<AppState>) -> Option<(String, u32)> {
    let map = app.serial.lock().await;
    let mut found = None;
    for (path, session) in map.iter() {
        let s = session.state.lock().await;
        if s.connected {
            if found.is_some() {
                return None; // more than one — ambiguous
            }
            found = Some((path.clone(), s.baud.unwrap_or(115200)));
        }
    }
    found
}

// ── Session lifecycle ────────────────────────────────────────────────

/// Ensure a serial session is open to (path, baud).  Spawns the reader
/// task on first open.  Idempotent — calling twice for the same target
/// is a no-op after the first.
///
/// `session.open_lock` serialises concurrent callers for this one
/// target (connection-SSE and cmd-write arrive simultaneously on first
/// connect).  Without it both see `connected=false`, both call
/// `open_serial`, and the second open fails with "Access is denied"
/// because the OS port is already held.  The second caller waits, then
/// re-checks `connected` (now true) and returns immediately without
/// re-opening.
async fn ensure_open(session: &Arc<SerialSession>, path: &str, baud: u32) -> Result<(), String> {
    let _gate = session.open_lock.lock().await;

    if session.state.lock().await.connected {
        return Ok(());
    }

    // Request a DTR reset only when this target's port is genuinely
    // being opened from cold (not already open at a different baud —
    // each session is pinned to one path, but the caller can still
    // request a new baud on a reconnect).
    {
        let mut s = session.state.lock().await;
        if s.baud != Some(baud) {
            s.needs_dtr_reset = true;
        }
        s.path = Some(path.to_string());
        s.baud = Some(baud);
    }

    open_serial(session, path, baud).await
}

/// Map a raw OS serial-open error to an actionable message.  Checks the
/// Display string so it works across platforms without needing
/// platform-specific error-code constants — mirrors tcp.rs's
/// `friendly_tcp_error`.
fn friendly_serial_error(raw: &str, path: &str) -> String {
    if raw.contains("No such file or directory")
        || raw.contains("cannot find the file specified")
        || raw.contains("os error 2")
    {
        return format!(
            "Cannot open serial port {path} — Port not found.\n\
             Check:\n\
             \u{2022} The device is plugged in\n\
             \u{2022} The port path is still {path} — unplugging and replugging the \
             device, or using a different USB port, can change it\n\
             \u{2022} Refresh the port list and pick the device again"
        );
    }
    if raw.contains("Access is denied")
        || raw.contains("Permission denied")
        || raw.contains("Resource busy")
        || raw.contains("os error 16")
    {
        return format!(
            "Cannot open serial port {path} — Port already in use.\n\
             Check:\n\
             \u{2022} No other program (Arduino IDE Serial Monitor, another \
             pfodWeb window, etc.) has this port open\n\
             \u{2022} Wait a moment and try again — the port may still be \
             closing from a previous session"
        );
    }
    raw.to_string()
}

async fn open_serial(session: &Arc<SerialSession>, path: &str, baud: u32) -> Result<(), String> {
    log::log(&format!("[pfodProxy] Opening serial {path} @ {baud} baud ..."));

    // Read and immediately clear the DTR-reset flag so only this first
    // open fires the reset; reconnects after USB-CDC re-enum skip it.
    let do_dtr_reset = {
        let mut s = session.state.lock().await;
        let v = s.needs_dtr_reset;
        s.needs_dtr_reset = false;
        v
    };

    // Open the port and optionally assert DTR — mirrors the Arduino IDE
    // serial monitor, which resets the board on first connect.
    //
    // For CH340/FTDI boards DTR toggles the reset line; the USB stays up
    // so the reader task receives "end setup()" bytes directly.
    //
    // For USB-CDC boards (Leonardo, Nano 33 BLE, etc.) DTR also resets the
    // MCU, which causes the USB endpoint to drop and re-enumerate.  The
    // reader task gets a read error, exits, sets connected=false, and the
    // browser's EventSource reconnect triggers a fresh open_serial — at
    // that point the Arduino is running and the new USB endpoint is up.
    // needs_dtr_reset was already cleared above so the reconnect open does
    // NOT assert DTR again.
    let mut stream = tokio_serial::new(path, baud)
        .timeout(std::time::Duration::from_millis(100))
        .open_native_async()
        .map_err(|e| friendly_serial_error(&format!("{e}"), path))?;

    if do_dtr_reset {
        use tokio_serial::SerialPort;
        let _ = stream.write_data_terminal_ready(true);
        log::log(&format!("[pfodProxy] Serial {path}: DTR asserted — Arduino reset triggered"));
    }

    let (read_half, write_half) = tokio::io::split(stream);
    let writer_arc = Arc::new(tokio::sync::Mutex::new(write_half));
    let (bytes_tx, _) = broadcast::channel::<Vec<u8>>(BYTES_CHANNEL_CAP);
    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();

    // Subscribe BEFORE the reader task starts so the broadcast channel
    // always has a receiver from the very first byte.  Stash it in
    // state for the SSE handler to claim.  Without this, the first
    // cmd's response can be broadcast (by the just-spawned reader) to
    // a channel that has no subscribers yet — `SendError` is silently
    // discarded, and the SSE handler that subscribes a few microseconds
    // later sees nothing.
    let initial_rx = bytes_tx.subscribe();
    log::log(&format!("[pfodProxy] Serial {path}: initial_rx pre-subscribed (race-safe)"));

    {
        let mut s = session.state.lock().await;
        s.writer     = Some(writer_arc);
        s.bytes_tx   = Some(bytes_tx.clone());
        s.connected  = true;
        s.cancel_tx  = Some(cancel_tx);
        s.initial_rx = Some(initial_rx);
    }

    log::log(&format!("[pfodProxy] Connected to serial {path}"));

    // Reader task — selects between the next read and the cancel
    // signal.  Each chunk is broadcast to all SSE subscribers; if
    // there are zero subscribers, `bytes_tx.send()` returns
    // SendError but we ignore it (session stays alive for the
    // next subscriber to attach).
    let session_for_reader = session.clone();
    let path_for_reader = path.to_string();
    tokio::spawn(async move {
        let mut read_half = read_half;
        let mut cancel_rx = cancel_rx;
        let mut chunk = [0u8; 4096];
        // LogScanner emits one debug line per pfod block / CSV line
        // — no chunk-level dumps cluttering the verbose log.
        let mut log_scan = crate::logscan::LogScanner::new("serial", path_for_reader.clone());
        // Once we've seen a subscriber on the channel, subsequent
        // 0-receiver sends are an idle-session condition (browser
        // closed its EventSource and hasn't reconnected) — not a bug.
        // Only warn if no subscriber EVER attached, which is the race
        // the `initial_rx` fix is meant to prevent.
        let mut ever_subscribed = false;
        loop {
            tokio::select! {
                biased;
                _ = &mut cancel_rx => break,
                res = read_half.read(&mut chunk) => {
                    match res {
                        Ok(0)  => break,
                        Ok(n)  => {
                            // Raw per-chunk trace — commented out, too noisy.
                            // log::log(&format!(
                            //     "[pfodProxy] Serial {path_for_reader} raw {} bytes: {:?}",
                            //     n,
                            //     String::from_utf8_lossy(&chunk[..n])
                            // ));
                            log_scan.feed(&chunk[..n]);
                            if bytes_tx.receiver_count() > 0 {
                                ever_subscribed = true;
                            }
                            if bytes_tx.send(chunk[..n].to_vec()).is_err() && !ever_subscribed {
                                log::log(&format!(
                                    "[pfodProxy] *** Serial {path_for_reader}: no subscriber attached before first device byte, {n} bytes LOST (race-fix may have regressed) ***"
                                ));
                            }
                        }
                        Err(e) => {
                            log::log(&format!(
                                "[pfodProxy] Serial {path_for_reader} read error: {e}"
                            ));
                            break;
                        }
                    }
                }
            }
        }
        drop(read_half);
        let mut s = session_for_reader.state.lock().await;
        s.connected  = false;
        s.writer     = None;
        s.bytes_tx   = None;
        s.initial_rx = None;
        log::log(&format!("[pfodProxy] Serial connection to {path_for_reader} closed"));
    });

    Ok(())
}

/// Tear down a serial session.  Fires the cancel signal so the
/// reader breaks its loop and drops the read half; clearing the
/// writer + bytes_tx from state drops their refs.  The reader's
/// finally-block also clears these (idempotent).
fn drop_serial(s: &mut crate::state::SerialState) {
    if let Some(tx) = s.cancel_tx.take() {
        let _ = tx.send(());
    }
    s.connected  = false;
    s.writer     = None;
    s.bytes_tx   = None;
    s.initial_rx = None;
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
