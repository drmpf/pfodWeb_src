// ble.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// BLE transport handler — all-SSE shape, clean-room implementation.
//
//   GET /pfodWeb?ble=                          discovery SSE
//                                              streams NUS-advertising
//                                              peripherals as they appear
//                                              in the scan.
//
//   GET /pfodWeb?ble=<address>                 connection SSE
//                                              opens the peripheral (if
//                                              not already open) and
//                                              streams every NUS TX
//                                              notification byte,
//                                              hex-encoded.
//
//   GET /pfodWeb?ble=<address>&cmd=…           fire-and-forget cmd write
//                                              writes to NUS RX
//                                              characteristic, returns
//                                              200 + empty body.
//
// Each distinct BLE address gets its own independent session (see
// state.rs) — connecting to one device never disturbs another. The
// adapter itself (`get_central`) is a shared OS resource, not part of
// any one session — see `AppState::ble_central`.
//
// Nordic UART Service GATT layout (used by every pfod-over-BLE device):
//   Service UUID  6E400001-B5A3-F393-E0A9-E50E24DCCA9E
//   RX char       6E400002-B5A3-F393-E0A9-E50E24DCCA9E  (we WRITE)
//   TX char       6E400003-B5A3-F393-E0A9-E50E24DCCA9E  (NOTIFY)

use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{
        sse::{Event as SseEvent, KeepAlive, Sse},
        IntoResponse,
    },
};
use btleplug::api::{
    Central, CentralEvent, Manager as _, Peripheral as _, ScanFilter, WriteType,
};
use btleplug::platform::Manager;
use futures::stream::StreamExt;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::log;
use crate::state::{AppState, BleSession, BYTES_CHANNEL_CAP};

const NUS_SERVICE: Uuid = Uuid::from_u128(0x6E400001_B5A3_F393_E0A9_E50E24DCCA9E);
const NUS_RX_CHAR: Uuid = Uuid::from_u128(0x6E400002_B5A3_F393_E0A9_E50E24DCCA9E);
const NUS_TX_CHAR: Uuid = Uuid::from_u128(0x6E400003_B5A3_F393_E0A9_E50E24DCCA9E);

#[derive(Clone)]
struct BleDeviceInfo {
    address: String,
    name:    Option<String>,
    rssi:    Option<i16>,
    in_use:  bool,
}

impl BleDeviceInfo {
    /// Serialize to the JSON shape the browser BLE picker expects.
    fn to_json(&self) -> String {
        let name = match &self.name {
            Some(n) => crate::serial::json_str(n),
            None    => "null".into(),
        };
        let rssi = self.rssi.map(|v| format!("{v}")).unwrap_or_else(|| "null".into());
        format!(r#"{{"address":{},"name":{},"rssi":{},"inUse":{}}}"#,
            crate::serial::json_str(&self.address), name, rssi, self.in_use)
    }
}

/// True if `addr` currently has a live, claimed session — see
/// `serial::path_in_use` for the rationale (same signal the
/// connection-SSE rejection check uses).  Keyed lower-case to match
/// `AppState::get_or_create_ble`.
async fn addr_in_use(app: &Arc<AppState>, addr: &str) -> bool {
    let map = app.ble.lock().await;
    match map.get(&addr.to_ascii_lowercase()) {
        Some(session) => {
            let b = session.state.lock().await;
            b.connected && b.bytes_tx.as_ref().map_or(false, |tx| tx.receiver_count() > 0)
        }
        None => false,
    }
}

// (GAP_DEVICE_NAME_CHAR removed — GATT 0x2A00 returns the firmware
// default name "Arduino" rather than the user-visible Local Name
// transmitted in scan responses.  The scan-response watcher in
// `ble_names.rs` recovers the actual name instead.)

pub async fn handle(
    app: Arc<AppState>,
    params: HashMap<String, String>,
) -> axum::response::Response {
    let ble_arg = params.get("ble").cloned();
    let cmd     = params.get("cmd").cloned();

    log::debug(&format!("_handle_ble: ble={:?} cmd={:?}", ble_arg, cmd));

    if let Some(cmd) = cmd {
        handle_cmd(app, ble_arg, cmd).await
    } else if matches!(ble_arg.as_deref(), Some("")) {
        handle_discovery_stream(app).await
    } else if let Some(addr) = ble_arg.as_deref().filter(|s| !s.is_empty()) {
        let name = params.get("name").cloned();
        handle_connection_stream(app, addr.to_string(), name).await
    } else {
        bad_request("expected ?ble= (discovery) or ?ble=<address> (connection or cmd)")
    }
}

// ── Discovery SSE ────────────────────────────────────────────────────

/// Live BLE scan filtered to NUS-advertising peripherals.  ScanGuard
/// stops the scan when the SSE stream is dropped (browser closes
/// EventSource).
async fn handle_discovery_stream(app: Arc<AppState>) -> axum::response::Response {
    let stream = async_stream::stream! {
        // Initial SSE comment — flushes a body byte before the
        // potentially-slow BLE adapter init/start_scan so Firefox's
        // EventSource fires `onopen` immediately and doesn't time out
        // at the network layer (manifests as a misleading CORS error
        // with "Status code: (null)").  See serial.rs:handle_connection_stream
        // for the full rationale.
        yield Ok::<_, Infallible>(SseEvent::default().comment("ready"));
        let central = match get_central(&app).await {
            Ok(c) => c,
            Err(e) => {
                yield Ok(SseEvent::default().event("error").data(format!("adapter: {e}")));
                return;
            }
        };
        if let Err(e) = central.start_scan(ScanFilter { services: vec![NUS_SERVICE] }).await {
            yield Ok(SseEvent::default().event("error").data(format!("start_scan: {e}")));
            return;
        }

        let _guard = ScanGuard { central: Some(central.clone()) };
        log::log("[pfodProxy] BLE discovery scan started");

        let mut events = match central.events().await {
            Ok(e) => e,
            Err(e) => {
                yield Ok(SseEvent::default().event("error").data(format!("events: {e}")));
                return;
            }
        };

        // Parallel WinRT advertisement watcher — pulls Local Name
        // (AD type 0x08/0x09) from scan-response data sections that
        // btleplug's `properties.local_name` fails to surface on the
        // Windows BLE stack for some devices.  See `ble_names.rs` for
        // why this exists.  The (mac, name) pairs come back over the
        // channel and are merged into the picker via the select! loop.
        // On non-Windows, this is a no-op stub.
        let (scan_name_tx, mut scan_name_rx) =
            tokio::sync::mpsc::unbounded_channel::<crate::ble_names::NameUpdate>();
        let _name_watcher = match crate::ble_names::NameWatcher::start(scan_name_tx) {
            Ok(w) => {
                log::log("[pfodProxy] BLE scan-response name watcher started");
                Some(w)
            }
            Err(e) => {
                log::log(&format!(
                    "[pfodProxy] BLE scan-response name watcher failed to start: {e:?} — names from scan-response data sections will be unavailable"
                ));
                None
            }
        };

        // Cache of known names per address.  Filled in from each
        // advertisement that carried a `local_name` *and* from the
        // scan-response watcher above.  Used to fill in the name on
        // subsequent emissions so a later `DeviceUpdated` with no
        // advertised name doesn't *overwrite* a previously known name
        // in the picker.  Keys are always upper-case MAC (matches
        // btleplug's `address().to_string()` format).
        let mut name_cache: HashMap<String, String> = HashMap::new();

        // Addresses we've already classified as NUS-advertising via
        // btleplug's device_info filter.  The WinRT scan-response
        // watcher picks up Local Names from *every* nearby BLE device
        // (TVs, weather sensors, fitness trackers...); we only emit
        // those to the picker if the address is in this set.
        let mut nus_addrs: HashSet<String> = HashSet::new();

        // Flush already-known peripherals (snappy first render),
        // then enter the event loop.
        let mut initial = match central.peripherals().await {
            Ok(v) => v,
            Err(_) => Vec::new(),
        }.into_iter();

        log::log("[pfodProxy] BLE discovery: entering event loop");
        loop {
            // Drain the initial-known set first (synchronous to the
            // select loop — we just step through them).
            if let Some(p) = initial.next() {
                if let Some(mut info) = device_info(&p).await {
                    nus_addrs.insert(info.address.clone());
                    if let Some(n) = info.name.clone() {
                        name_cache.insert(info.address.clone(), n);
                    } else if let Some(cached) = name_cache.get(&info.address) {
                        info.name = Some(cached.clone());
                    }
                    info.in_use = addr_in_use(&app, &info.address).await;
                    yield Ok::<_, Infallible>(SseEvent::default().data(info.to_json()));
                }
                continue;
            }

            tokio::select! {
                ev = events.next() => {
                    match ev {
                        None => break,
                        Some(CentralEvent::DeviceDiscovered(id))
                        | Some(CentralEvent::DeviceUpdated(id)) => {
                            if let Ok(p) = central.peripheral(&id).await {
                                if let Some(mut info) = device_info(&p).await {
                                    nus_addrs.insert(info.address.clone());
                                    if let Some(n) = info.name.clone() {
                                        name_cache.insert(info.address.clone(), n);
                                    } else if let Some(cached) = name_cache.get(&info.address) {
                                        info.name = Some(cached.clone());
                                    }
                                    info.in_use = addr_in_use(&app, &info.address).await;
                                    yield Ok::<_, Infallible>(SseEvent::default().data(info.to_json()));
                                }
                            }
                        }
                        Some(_) => {}
                    }
                }
                Some((addr, name)) = scan_name_rx.recv() => {
                    // The watcher's `addr` is upper-case (format_mac
                    // uses :02X) and matches btleplug's
                    // `address().to_string()` format — no
                    // case-normalisation needed.  Always update the
                    // cache (cheap; useful if the device later
                    // identifies as NUS via btleplug), but only push
                    // an SSE event to the picker when btleplug has
                    // already classified this address as NUS.
                    // Otherwise we'd be surfacing nearby BLE devices
                    // (TVs, weather stations, fitness trackers...)
                    // that the picker is supposed to filter out.
                    let already = name_cache.get(&addr).map(|s| s == &name).unwrap_or(false);
                    if !already {
                        let is_nus = nus_addrs.contains(&addr);
                        log::log(&format!(
                            "[pfodProxy] BLE scan-response name for {addr}: {name:?} (nus={is_nus})"
                        ));
                        name_cache.insert(addr.clone(), name.clone());
                        if is_nus {
                            // Push an immediate update event for the
                            // picker so the row updates without
                            // waiting for the next DeviceUpdated.
                            // RSSI unknown here; next ad packet refreshes it.
                            let in_use = addr_in_use(&app, &addr).await;
                            let info = BleDeviceInfo {
                                address: addr,
                                name:    Some(name),
                                rssi:    None,
                                in_use,
                            };
                            yield Ok::<_, Infallible>(SseEvent::default().data(info.to_json()));
                        }
                    }
                }
            }
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}

async fn device_info(p: &btleplug::platform::Peripheral) -> Option<BleDeviceInfo> {
    let addr = p.id().to_string();
    let props = match p.properties().await {
        Ok(Some(props)) => props,
        Ok(None) => {
            log::debug(&format!("BLE scan {addr}: properties()=None — skipping"));
            return None;
        }
        Err(e) => {
            log::debug(&format!("BLE scan {addr}: properties() error: {e}"));
            return None;
        }
    };
    let is_nus = props.services.contains(&NUS_SERVICE);
    log::log(&format!(
        "[pfodProxy] BLE scan {addr}: local_name={:?} rssi={:?} services={} nus={}",
        props.local_name,
        props.rssi,
        props.services.len(),
        is_nus,
    ));
    if !is_nus {
        return None;
    }
    // On macOS, CoreBluetooth populates local_name with the cached GATT
    // 0x2A00 device-name for previously-connected peripherals instead of
    // the scan-response AD type 0x09.  Suppress it here so the
    // ble_names.rs watcher (which reads CBAdvertisementDataLocalNameKey
    // directly from the advertisement packet) is the sole name source.
    #[cfg(target_os = "macos")]
    let local_name: Option<String> = None;
    #[cfg(not(target_os = "macos"))]
    let local_name = props.local_name;
    Some(BleDeviceInfo {
        address: addr,
        name:    local_name,
        rssi:    props.rssi,
        // Set by the caller (which has `app` in scope) right before
        // each yield — see the two `device_info` call sites above.
        in_use:  false,
    })
}

// read_gatt_name was here — removed because GATT 0x2A00 returned the
// firmware default name ("Arduino") rather than the user-visible
// Local Name carried in scan responses.  The WinRT scan-response
// watcher in ble_names.rs now extracts AD type 0x09/0x08 directly
// from advertisement DataSections.

struct ScanGuard {
    central: Option<btleplug::platform::Adapter>,
}

impl Drop for ScanGuard {
    fn drop(&mut self) {
        if let Some(c) = self.central.take() {
            tokio::spawn(async move {
                let _ = c.stop_scan().await;
                log::log("[pfodProxy] BLE discovery scan stopped");
            });
        }
    }
}

// ── Connection SSE ───────────────────────────────────────────────────

async fn handle_connection_stream(
    app: Arc<AppState>,
    addr: String,
    name: Option<String>,
) -> axum::response::Response {
    let session = app.get_or_create_ble(&addr).await;

    // Run `ensure_open` concurrently with the SSE stream so we can
    // surface per-step progress events ("scanning", "connecting",
    // "discovering", "subscribing", "ready") while the BLE GATT
    // setup is in flight — otherwise the browser sees a long
    // unexplained pause.
    let (progress_tx, mut progress_rx) =
        tokio::sync::mpsc::unbounded_channel::<&'static str>();
    let label = match &name {
        Some(n) => format!("{n} ({addr})"),
        None    => addr.clone(),
    };
    log::log(&format!("[pfodProxy] BLE connection request for {label}"));
    let app_for_open = app.clone();
    let session_for_open = session.clone();
    let addr_for_open = addr.clone();
    let open_handle = tokio::spawn(async move {
        ensure_open(&app_for_open, &session_for_open, &addr_for_open, Some(progress_tx)).await
    });

    let stream = async_stream::stream! {
        // Initial SSE comment — flushes a body byte so Firefox's
        // EventSource fires `onopen` immediately.  See serial.rs for
        // the full rationale.
        yield Ok::<_, Infallible>(SseEvent::default().comment("ready"));

        // If the caller supplied a device name, echo it back so the
        // JS connecting dialog can show it immediately.
        if let Some(ref n) = name {
            yield Ok::<_, Infallible>(
                SseEvent::default().event("device_name").data(n.clone())
            );
        }

        // Phase 1: relay progress events from the open task until it
        // resolves with success or error.
        let mut open_handle = open_handle;
        loop {
            tokio::select! {
                Some(step) = progress_rx.recv() => {
                    yield Ok::<_, Infallible>(
                        SseEvent::default().event("progress").data(step)
                    );
                }
                res = &mut open_handle => {
                    match res {
                        Ok(Ok(())) => {
                            yield Ok::<_, Infallible>(
                                SseEvent::default().event("progress").data("ready")
                            );
                            break;
                        }
                        Ok(Err(e)) => {
                            log::log(&format!(
                                "[pfodProxy] BLE connection SSE open failed: {e}"
                            ));
                            yield Ok::<_, Infallible>(
                                SseEvent::default().event("error").data(format!("open failed: {e}"))
                            );
                            return;
                        }
                        Err(e) => {
                            log::log(&format!(
                                "[pfodProxy] BLE open task panic: {e}"
                            ));
                            yield Ok::<_, Infallible>(
                                SseEvent::default().event("error").data("open task panicked")
                            );
                            return;
                        }
                    }
                }
            }
        }

        // Phase 2: open complete — claim initial_rx (race-safe) and
        // stream device bytes for the lifetime of the SSE connection.
        let (rx, claimed_initial) = {
            let mut b = session.state.lock().await;
            if let Some(rx) = b.initial_rx.take() {
                (rx, true)
            } else {
                match b.bytes_tx.as_ref() {
                    Some(tx) => {
                        if tx.receiver_count() > 0 {
                            yield Ok::<_, Infallible>(
                                SseEvent::default().event("error").data(
                                    "Connection Refused.\nAnother instance of pfodWeb.html already connected"
                                )
                            );
                            return;
                        }
                        (tx.subscribe(), false)
                    },
                    None => {
                        yield Ok::<_, Infallible>(
                            SseEvent::default().event("error").data("no session")
                        );
                        return;
                    }
                }
            }
        };
        log::log(&format!(
            "[pfodProxy] BLE SSE subscriber attached for {label} ({})",
            if claimed_initial { "claimed initial_rx — race-safe" } else { "fresh subscribe — late attacher" }
        ));

        let mut rx = rx;
        loop {
            match rx.recv().await {
                Ok(bytes) => {
                    let hex = hex::encode(&bytes);
                    yield Ok::<_, Infallible>(SseEvent::default().data(hex));
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    log::log(&format!(
                        "[pfodProxy] BLE SSE {label}: subscriber lagged, skipped {n} chunks"
                    ));
                    yield Ok::<_, Infallible>(SseEvent::default().event("lagged").data(n.to_string()));
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
        log::log(&format!("[pfodProxy] BLE SSE subscriber detached for {label}"));
    };

    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}

// ── Cmd write ────────────────────────────────────────────────────────

async fn handle_cmd(
    app: Arc<AppState>,
    ble_arg: Option<String>,
    cmd: String,
) -> axum::response::Response {
    // Determine target.  If the caller supplied an address, use it;
    // otherwise fall back to "the" connected BLE session, but only if
    // there's exactly one.  In normal operation the client always
    // includes the full target on every request (see
    // ConnectionManager._cmdURL), so this path is a defensive
    // fallback, not the common case.
    let addr = match ble_arg.as_deref().filter(|s| !s.is_empty()) {
        Some(a) => a.to_string(),
        None => match single_connected_target(&app).await {
            Some(a) => a,
            None => return bad_request("cmd write needs ?ble=<address>"),
        },
    };

    let session = app.get_or_create_ble(&addr).await;

    // `{!}` short-circuit on a disconnected session.  See serial.rs
    // for the rationale.
    if cmd.contains("{!}") && !session.state.lock().await.connected {
        log::log("[pfodProxy] {!} on disconnected BLE session — ignoring");
        return reply_ok_empty();
    }

    if let Err(e) = ensure_open(&app, &session, &addr, None).await {
        log::log(&format!("[pfodProxy] cmd write BLE open failed: {e}"));
        return (StatusCode::SERVICE_UNAVAILABLE, format!("open failed: {e}")).into_response();
    }

    // `>> sent` is debug-only — non-debug log shows session
    // lifecycle (open/close), not per-cmd wire traffic.
    let peripheral = session.state.lock().await.peripheral.clone();
    if let Some(p) = peripheral {
        let chars = p.characteristics();
        match chars.iter().find(|c| c.uuid == NUS_RX_CHAR) {
            Some(rx) => match p.write(rx, cmd.as_bytes(), WriteType::WithoutResponse).await {
                Ok(_) => log::debug(&format!(
                    ">> ble {addr} sent {}b {:?}", cmd.len(), cmd
                )),
                Err(e) => log::log(&format!("[pfodProxy] BLE write error: {e}")),
            },
            None => log::log("[pfodProxy] BLE RX characteristic not found"),
        }
    }

    if cmd.contains("{!}") {
        log::log("[pfodProxy] {!} seen — closing BLE");
        let mut b = session.state.lock().await;
        drop_ble(&mut b).await;
        b.addr = None;
    }

    reply_ok_empty()
}

/// If exactly one BLE address currently has a connected session,
/// return it; otherwise `None` (no sessions, or more than one —
/// ambiguous).
async fn single_connected_target(app: &Arc<AppState>) -> Option<String> {
    let map = app.ble.lock().await;
    let mut found = None;
    for session in map.values() {
        let b = session.state.lock().await;
        if b.connected {
            if found.is_some() {
                return None; // more than one — ambiguous
            }
            found = b.addr.clone();
        }
    }
    found
}

// ── Session lifecycle ────────────────────────────────────────────────

/// Progress callback — optional channel that receives a step name
/// ("scanning", "connecting", "discovering", "subscribing") as the
/// open phases run, so the connection SSE handler can stream those
/// to the browser for a "Connecting to <device>..." progress dialog.
/// `None` skips reporting.  Errors on send are ignored — the open
/// continues regardless of whether anyone's listening.
pub(crate) type ProgressTx = Option<tokio::sync::mpsc::UnboundedSender<&'static str>>;

fn progress(tx: &ProgressTx, step: &'static str) {
    if let Some(tx) = tx {
        let _ = tx.send(step);
    }
}

async fn ensure_open(
    app: &Arc<AppState>,
    session: &Arc<BleSession>,
    addr: &str,
    progress_tx: ProgressTx,
) -> Result<(), String> {
    // Serialise BLE opens for this one target — see `BleSession::open_lock`.
    // Without this, the connection-SSE handler's spawned `ensure_open`
    // task and the cmd handler's inline `ensure_open` can both run
    // `open_ble` concurrently against the same peripheral; the second
    // one's GATT setup races with and tears down the first.
    let _open_guard = session.open_lock.lock().await;

    if session.state.lock().await.connected {
        return Ok(());
    }

    session.state.lock().await.addr = Some(addr.to_string());

    open_ble(app, session, addr, progress_tx).await
}

async fn open_ble(app: &Arc<AppState>, session: &Arc<BleSession>, addr: &str, progress_tx: ProgressTx) -> Result<(), String> {
    let central = get_central(app).await?;

    // Resolve peripheral: cached lookup first, then fresh scan.
    let peripheral = match find_peripheral(&central, addr).await {
        Some(p) => {
            log::log(&format!("[pfodProxy] BLE: {addr} already known, skipping scan"));
            p
        }
        None => {
            progress(&progress_tx, "scanning");
            log::log(&format!("[pfodProxy] BLE: scanning for {addr} ..."));
            central.start_scan(ScanFilter { services: vec![NUS_SERVICE] })
                .await.map_err(|e| e.to_string())?;
            let deadline = Instant::now() + Duration::from_secs(5);
            let mut events = central.events().await.map_err(|e| e.to_string())?;
            let mut target: Option<btleplug::platform::Peripheral> = None;
            while Instant::now() < deadline {
                match tokio::time::timeout(Duration::from_millis(250), events.next()).await {
                    Ok(Some(CentralEvent::DeviceDiscovered(id))) |
                    Ok(Some(CentralEvent::DeviceUpdated(id))) => {
                        if let Ok(p) = central.peripheral(&id).await {
                            if p.id().to_string().eq_ignore_ascii_case(addr) {
                                target = Some(p);
                                break;
                            }
                        }
                    }
                    _ => {
                        if let Some(p) = find_peripheral(&central, addr).await {
                            target = Some(p);
                            break;
                        }
                    }
                }
            }
            let _ = central.stop_scan().await;
            target.ok_or_else(|| format!("device {addr} not found"))?
        }
    };

    progress(&progress_tx, "connecting");
    let t_connect = Instant::now();
    peripheral.connect().await.map_err(|e| e.to_string())?;
    log::log(&format!(
        "[pfodProxy] BLE {addr}: connect() took {} ms",
        t_connect.elapsed().as_millis()
    ));

    progress(&progress_tx, "discovering");
    let t_discover = Instant::now();
    peripheral.discover_services().await.map_err(|e| e.to_string())?;
    log::log(&format!(
        "[pfodProxy] BLE {addr}: discover_services() took {} ms",
        t_discover.elapsed().as_millis()
    ));

    let chars = peripheral.characteristics();
    let tx = chars
        .iter()
        .find(|c| c.uuid == NUS_TX_CHAR)
        .ok_or_else(|| "NUS TX characteristic not found".to_string())?
        .clone();

    progress(&progress_tx, "subscribing");
    let t_subscribe = Instant::now();
    peripheral.subscribe(&tx).await.map_err(|e| e.to_string())?;
    log::log(&format!(
        "[pfodProxy] BLE {addr}: subscribe() took {} ms",
        t_subscribe.elapsed().as_millis()
    ));

    let (bytes_tx, _) = broadcast::channel::<Vec<u8>>(BYTES_CHANNEL_CAP);
    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();

    // See serial.rs:open_serial — subscribe before spawning the
    // notify-pump task so the broadcast channel always has a receiver
    // from the first NUS notification.
    let initial_rx = bytes_tx.subscribe();
    log::log(&format!("[pfodProxy] BLE {addr}: initial_rx pre-subscribed (race-safe)"));

    {
        let mut b = session.state.lock().await;
        b.peripheral = Some(peripheral.clone());
        b.bytes_tx   = Some(bytes_tx.clone());
        b.connected  = true;
        b.cancel_tx  = Some(cancel_tx);
        b.initial_rx = Some(initial_rx);
    }

    log::log(&format!("[pfodProxy] Connected to BLE {addr}"));

    let session_for_notify = session.clone();
    let label = addr.to_string();
    tokio::spawn(async move {
        let mut cancel_rx = cancel_rx;
        let mut stream = match peripheral.notifications().await {
            Ok(s) => s,
            Err(e) => {
                log::log(&format!("[pfodProxy] notify stream failed: {e}"));
                let mut b = session_for_notify.state.lock().await;
                b.connected = false;
                return;
            }
        };
        let mut log_scan = crate::logscan::LogScanner::new("ble", label.clone());
        // See serial.rs for rationale — only warn if no subscriber
        // ever attached (real race-window bug); silent thereafter
        // (idle-session after browser EventSource close is benign).
        let mut ever_subscribed = false;
        loop {
            tokio::select! {
                biased;
                _ = &mut cancel_rx => break,
                next = stream.next() => {
                    match next {
                        None => break,
                        Some(notif) => {
                            if notif.uuid != NUS_TX_CHAR { continue; }
                            log_scan.feed(&notif.value);
                            let n = notif.value.len();
                            if bytes_tx.receiver_count() > 0 {
                                ever_subscribed = true;
                            }
                            if bytes_tx.send(notif.value).is_err() && !ever_subscribed {
                                log::log(&format!(
                                    "[pfodProxy] *** BLE {label}: no subscriber attached before first device byte, {n} bytes LOST (race-fix may have regressed) ***"
                                ));
                            }
                        }
                    }
                }
            }
        }
        drop(stream);
        drop(peripheral);
        let mut b = session_for_notify.state.lock().await;
        b.connected  = false;
        b.peripheral = None;
        b.bytes_tx   = None;
        b.initial_rx = None;
        log::log(&format!("[pfodProxy] BLE connection to {label} closed"));
    });

    Ok(())
}

async fn find_peripheral(
    central: &btleplug::platform::Adapter,
    addr: &str,
) -> Option<btleplug::platform::Peripheral> {
    let known = central.peripherals().await.ok()?;
    for p in known {
        if p.id().to_string().eq_ignore_ascii_case(addr) {
            return Some(p);
        }
    }
    None
}

/// Return a shared `Adapter` handle, lazily initialised on first call
/// and stashed in `AppState::ble_central` for reuse.  Persisting the
/// adapter across discovery + connection requests (and across every
/// BLE target's session) keeps its peripheral cache populated —
/// without this, every `open_ble` starts with an empty cache and must
/// rescan from scratch (which fails for sparsely advertising devices
/// that don't fall inside the 5-second scan window).
async fn get_central(app: &Arc<AppState>) -> Result<btleplug::platform::Adapter, String> {
    {
        let c = app.ble_central.lock().await;
        if let Some(c) = &*c {
            return Ok(c.clone());
        }
    }
    let manager = Manager::new().await.map_err(|e| e.to_string())?;
    let central = manager
        .adapters().await.map_err(|e| e.to_string())?
        .into_iter().next()
        .ok_or_else(|| "no BLE adapter".to_string())?;
    let mut c = app.ble_central.lock().await;
    // Race: another caller may have initialised in parallel; keep
    // whichever landed first so all callers share one cache.
    if c.is_none() {
        *c = Some(central.clone());
    }
    Ok(c.as_ref().unwrap().clone())
}

async fn drop_ble(b: &mut crate::state::BleState) {
    if let Some(tx) = b.cancel_tx.take() {
        let _ = tx.send(());
    }
    if let Some(p) = b.peripheral.take() {
        let _ = p.disconnect().await;
    }
    b.connected  = false;
    b.bytes_tx   = None;
    b.initial_rx = None;
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

#[allow(dead_code)]
fn sse_error(msg: impl Into<String>) -> axum::response::Response {
    let msg = msg.into();
    let stream = async_stream::stream! {
        yield Ok::<_, Infallible>(SseEvent::default().event("error").data(msg));
    };
    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}
