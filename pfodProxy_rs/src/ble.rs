// ble.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// BLE transport handler — all-SSE shape, clean-room implementation.
//
// *** macOS / Linux ONLY.  Windows uses ble_win.rs (bluest) instead. ***
//
// This file is not compiled on Windows (see the `mod ble` declarations in
// main.rs), so its `#[cfg(windows)]` branches and everything they say about
// the Windows BLE stack are now history rather than live code — kept because
// they record what was measured on real hardware, and because the btleplug
// backend still needs them if it is ever pointed at Windows again.  They
// would not build as-is: the direct `windows`-crate dependency they rely on
// was dropped from Cargo.toml along with ble_names.rs's WinRT watcher, whose
// job bluest now does.  The findings themselves are carried forward in
// ble_win.rs's header.
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

// A connect-and-read of GAP characteristic 0x2A00 (Device Name) was tried
// here and removed — the second time this file has reached that conclusion,
// so the measurements are recorded rather than the advice.
//
// 0x2A00 is the GAP Device Name, NOT the advertised Local Name the picker
// wants.  The advertisement and scan response are broadcast data; a connected
// device has stopped advertising and exposes nothing that republishes them,
// so no connection can return the Local Name.  In ArduinoBLE the two are
// separate setters — `setLocalName()` fills the advertisement, `setDeviceName()`
// fills 0x2A00 — and 0x2A00 defaults to "Arduino" when a sketch sets only the
// former, which is the common case.
//
// Measured against a real device: 0x2A00 read back "Arduino" (the default
// this file already rejects, see is_default_firmware_name) and the probe took
// 5.5 s, during which the discovery SSE — a single task — logged no scan
// activity at all and the picker's device list was frozen.
//
// Both routes that do work are already in fill_name: the Local Name off the
// air via ble_names.rs (confirmed reading "pfod_LedOnOff" from a scan
// response), and the OS device cache.  When neither produces a name the cause
// is a weak or sparse advertiser losing its SCAN_RSP exchange — the failing
// device measured -87 dBm against -36 for the one that worked — and that is
// fixed by moving the device closer or giving it a Local Name in firmware,
// not by connecting.

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
        crate::validate::hang_silently(
            "BLE request matched neither discovery, connection, nor cmd shape"
        ).await
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
        // Parallel WinRT advertisement watcher — pulls Local Name
        // (AD type 0x08/0x09) from scan-response data sections that
        // btleplug's `properties.local_name` fails to surface on the
        // Windows BLE stack for some devices.  See `ble_names.rs` for
        // why this exists.  The (mac, name) pairs come back over the
        // channel and are merged into the picker via the select! loop.
        // On non-Windows, this is a no-op stub.
        //
        // Started BEFORE btleplug's scan because, on Windows, whether that
        // scan runs at all now depends on whether this succeeded.
        let (scan_name_tx, mut scan_name_rx) =
            tokio::sync::mpsc::unbounded_channel::<crate::ble_names::NameUpdate>();

        // Full per-advertisement records.  Windows drives discovery from
        // these (see the `adv_rx` arm in the select! below); every other
        // platform drops the sender immediately, so the receiver yields None
        // forever, that arm never fires, and btleplug's scan stays
        // authoritative exactly as before.  See ble_names::AdvReport for why
        // Windows cannot rely on btleplug here.
        let (adv_tx, mut adv_rx) =
            tokio::sync::mpsc::unbounded_channel::<crate::ble_names::AdvReport>();

        #[cfg(windows)]
        let watcher_started = crate::ble_names::NameWatcher::start(scan_name_tx, adv_tx);
        #[cfg(not(windows))]
        let watcher_started = {
            drop(adv_tx);   // nothing feeds it off Windows
            crate::ble_names::NameWatcher::start(scan_name_tx)
        };

        let watcher_ok = watcher_started.is_ok();
        let _name_watcher = match watcher_started {
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

        // Whether btleplug's own scan also runs.
        //
        // Windows: NO, as long as the watcher above came up.  Two
        // advertisement watchers — btleplug's, which is service-UUID
        // filtered, plus ours — otherwise compete for one radio, and the
        // driver appears to issue SCAN_REQ during only some of the resulting
        // slots: measured 3 scan responses in 129 packets in one run and none
        // at all in the two after it.  Discovery here is now driven entirely
        // from the watcher's reports (it supplies address, has_nus and RSSI),
        // so btleplug's scan contributes nothing to the picker and only costs
        // radio time.  Leaving one watcher on the air is the last lever we
        // have over SCAN_RSP capture; if it does not help, the adapter simply
        // will not do it and the device needs its Local Name in the ADV_IND.
        //
        // Falls back to starting it when the watcher failed, so Windows
        // discovery is never left with no source at all.
        //
        // Everywhere else: YES, unchanged — btleplug's scan is the sole
        // discovery source and the watcher only supplements names.
        //
        // Connecting is unaffected either way: handle_connection_stream
        // starts its own scan.
        #[cfg(windows)]
        let need_btleplug_scan = !watcher_ok;
        #[cfg(not(windows))]
        let need_btleplug_scan = { let _ = watcher_ok; true };

        // ScanGuard stops the scan when this stream is dropped.  Given None
        // when we never started one, so its Drop does nothing.
        let _guard = if need_btleplug_scan {
            if let Err(e) = central.start_scan(ScanFilter { services: vec![NUS_SERVICE] }).await {
                yield Ok(SseEvent::default().event("error").data(format!("start_scan: {e}")));
                return;
            }
            log::log("[pfodProxy] BLE discovery scan started");
            ScanGuard { central: Some(central.clone()) }
        } else {
            log::log(
                "[pfodProxy] BLE discovery: advertisement watcher only — btleplug scan not \
                 started, leaving a single watcher on the radio"
            );
            ScanGuard { central: None }
        };

        let mut events = match central.events().await {
            Ok(e) => e,
            Err(e) => {
                yield Ok(SseEvent::default().event("error").data(format!("events: {e}")));
                return;
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

        // Last genuine RSSI seen per address.  The Windows stack only reports
        // a real signal strength on the packet that also carries the scan
        // response; every other advertisement for the same device comes back
        // with the +27 placeholder that normalise_rssi discards.  Observed in
        // the field: eleven consecutive 27s for one device with a single -31
        // among them, that -31 landing 5 ms before its Local Name.  Without
        // this the picker would flash a signal strength and then blank it on
        // the very next advertisement, so hold the last real reading.  It
        // goes slightly stale between scan responses, which is harmless for a
        // "how close is this device" indicator.
        let mut rssi_cache: HashMap<String, i16> = HashMap::new();

        // Addresses we have already asked the OS about (see fill_name).
        // That lookup is only worth doing once per address per scan: its
        // answer comes from a cache that will not change while we scan, and
        // DeviceUpdated fires for every advertisement, so without this we
        // would re-query several times a second per nameless device.
        let mut name_lookup_tried: HashSet<String> = HashSet::new();

        // Flush already-known peripherals (snappy first render),
        // then enter the event loop.
        //
        // Skipped in watcher-only mode: with no btleplug scan running nothing
        // refreshes that list, so it can only hold devices cached from an
        // earlier picker session in this process — some of which may be long
        // gone, and `properties()` would happily report their stale service
        // list as NUS.  Offering a device that cannot be verified is worse
        // than the ~1 s it takes the watcher to report the live ones.
        let mut initial = if need_btleplug_scan {
            match central.peripherals().await {
                Ok(v) => v,
                Err(_) => Vec::new(),
            }
        } else {
            Vec::new()
        }.into_iter();

        log::log("[pfodProxy] BLE discovery: entering event loop");
        loop {
            // Drain the initial-known set first (synchronous to the
            // select loop — we just step through them).
            if let Some(p) = initial.next() {
                if let Some(mut info) = device_info(&p).await {
                    nus_addrs.insert(info.address.clone());
                    fill_name(&mut info, &mut name_cache, &mut name_lookup_tried).await;
                    fill_rssi(&mut info, &mut rssi_cache);
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
                                    fill_name(&mut info, &mut name_cache, &mut name_lookup_tried).await;
                                    fill_rssi(&mut info, &mut rssi_cache);
                                    info.in_use = addr_in_use(&app, &info.address).await;
                                    yield Ok::<_, Infallible>(SseEvent::default().data(info.to_json()));
                                }
                            }
                        }
                        Some(_) => {}
                    }
                }
                Some(rep) = adv_rx.recv() => {
                    // WINDOWS ONLY — off Windows the sender was dropped at
                    // startup, so this arm never fires and btleplug's scan
                    // stays the sole discovery source, unchanged.
                    //
                    // Here it is the other way round: btleplug's watcher is
                    // service-UUID filtered and therefore blind to scan
                    // responses, so it reports neither Local Names nor most
                    // genuine RSSI readings (measured: 1 real reading in 66
                    // events, against 9 from this watcher over the same
                    // scan).  Discovery is driven from these reports instead.
                    //
                    // Names are deliberately NOT handled here: the same
                    // watcher already sent them on scan_name_rx, whose arm
                    // below owns caching and emitting them.
                    let rssi = normalise_rssi(rep.rssi);
                    let mut changed = false;
                    if let Some(v) = rssi {
                        if rssi_cache.insert(rep.address.clone(), v) != Some(v) {
                            changed = true;
                        }
                    }
                    // insert() returning true means this is the first time
                    // any source has classified the address as a pfod device
                    // — i.e. we discovered it, ahead of btleplug.
                    if rep.has_nus && nus_addrs.insert(rep.address.clone()) {
                        changed = true;
                    }
                    // Gated on `changed` so the picker gets an event when
                    // something it displays actually differs, not once per
                    // advertisement — most packets carry the +27 placeholder
                    // that normalise_rssi drops, so this stays quiet.
                    if rep.has_nus && changed {
                        let mut info = BleDeviceInfo {
                            address: rep.address.clone(),
                            name:    None,
                            rssi:    rssi_cache.get(&rep.address).copied(),
                            in_use:  addr_in_use(&app, &rep.address).await,
                        };
                        fill_name(&mut info, &mut name_cache, &mut name_lookup_tried).await;
                        yield Ok::<_, Infallible>(SseEvent::default().data(info.to_json()));
                    }
                }
                Some((addr, name)) = scan_name_rx.recv() => {
                    // The watcher's `addr` is upper-case (format_mac
                    // uses :02X) and matches btleplug's
                    // `address().to_string()` format — no
                    // case-normalisation needed.  Always update the
                    // cache (cheap; useful if the device later
                    // identifies as NUS via btleplug), but only log and
                    // push an SSE event to the picker when btleplug has
                    // already classified this address as NUS.
                    // Otherwise we'd be surfacing nearby BLE devices
                    // (TVs, weather stations, fitness trackers...)
                    // that the picker is supposed to filter out.
                    //
                    // The log was previously outside this gate and so
                    // named every device in range — "[LG] webOS TV
                    // QNED75SRA (nus=false)" and the like.  Caching an
                    // as-yet-unclassified device's name silently is the
                    // deliberate trade: it fills the picker row the
                    // instant that address does turn out to be NUS.
                    let already = name_cache.get(&addr).map(|s| s == &name).unwrap_or(false);
                    if !already {
                        let is_nus = nus_addrs.contains(&addr);
                        name_cache.insert(addr.clone(), name.clone());
                        if is_nus {
                            log::log(&format!(
                                "[pfodProxy] BLE scan-response name for {addr}: {name:?}"
                            ));
                            // Push an immediate update event for the
                            // picker so the row updates without
                            // waiting for the next DeviceUpdated.
                            // This event carries no RSSI of its own, so
                            // reuse the last genuine reading rather than
                            // sending null — otherwise the arrival of the
                            // name would visibly blank the signal strength
                            // the row was already showing.
                            let in_use = addr_in_use(&app, &addr).await;
                            let rssi = rssi_cache.get(&addr).copied();
                            let info = BleDeviceInfo {
                                address: addr,
                                name:    Some(name),
                                rssi,
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

/// Settle the name for one scan hit, in priority order.
///
/// Extracted because the scan loop reaches this point from two places (the
/// initial flush of already-known peripherals and each DeviceDiscovered /
/// DeviceUpdated event) and both need identical treatment.
///
/// 1. A Local Name on this advertisement wins and is cached for later
///    advertisements that arrive without one.
/// 2. Otherwise reuse a name already cached for this address — either from
///    an earlier advertisement or from the scan-response watcher.
/// 3. Otherwise ask the OS for a name it holds for this address.  A weak or
///    sparse advertiser can fail to complete the SCAN_REQ / SCAN_RSP exchange
///    that carries AD 0x08/0x09, so its name never reaches us over the air no
///    matter how long the scan runs, and the picker was left showing
///    "(no name scanned)" for a device that does have one.  On Windows this
///    reads the system's device cache without connecting; elsewhere it is a
///    stub returning None (see ble_names.rs).
///
/// There is deliberately no fourth step reading GATT 0x2A00 — see the note
/// where that constant used to live, above.
///
/// Step 3 runs at most once per address per scan — `tried` guards it — since
/// DeviceUpdated fires for every advertisement and the answer cannot change
/// mid-scan.
async fn fill_name(
    info:  &mut BleDeviceInfo,
    cache: &mut HashMap<String, String>,
    tried: &mut HashSet<String>,
) {
    if let Some(n) = info.name.clone() {
        cache.insert(info.address.clone(), n);
        return;
    }
    if let Some(cached) = cache.get(&info.address) {
        info.name = Some(cached.clone());
        return;
    }
    if !tried.insert(info.address.clone()) {
        return;   // already asked the OS about this address
    }
    match crate::ble_names::lookup_cached_name(&info.address).await {
        Some(n) if !is_default_firmware_name(&n) => {
            log::log(&format!(
                "[pfodProxy] BLE name for {} from OS device cache: {n:?} \
                 (no Local Name in any advertisement)",
                info.address
            ));
            cache.insert(info.address.clone(), n.clone());
            info.name = Some(n);
            return;
        }
        Some(n) => {
            log::log(&format!(
                "[pfodProxy] BLE name for {} from OS device cache ignored: {n:?} is a \
                 firmware default, not a device name",
                info.address
            ));
        }
        None => {}
    }

}

/// True for names that are a firmware default rather than anything anyone
/// chose for this device.
///
/// The OS device cache can hand back the GATT 0x2A00 device-name, which on an
/// unconfigured board is just the library default — "Arduino" for ArduinoBLE.
/// In a picker that is worse than no name at all: it is identical across every
/// such board so it cannot tell two of them apart, and it disguises the fact
/// that the device never advertised a name.  This file's own history records
/// the same conclusion — the GATT 0x2A00 read was removed precisely because it
/// "returned the firmware default name ("Arduino") rather than the
/// user-visible Local Name".
///
/// Deliberately applied ONLY to names from the OS cache, never to a Local Name
/// parsed from an advertisement: what a device actually puts on the air is a
/// deliberate choice by whoever flashed it, and matching what Chrome and
/// nRF Connect display matters more than second-guessing it.
///
/// Kept to defaults actually observed in the field.  Adding speculative
/// entries would risk suppressing a name someone genuinely chose.
fn is_default_firmware_name(name: &str) -> bool {
    const DEFAULTS: [&str; 1] = ["arduino"];
    let n = name.trim().to_ascii_lowercase();
    DEFAULTS.contains(&n.as_str())
}


/// Carry the last genuine RSSI forward for one address.
///
/// Pairs with `normalise_rssi`, which has already turned the Windows +27
/// placeholder into None by the time we get here: a real reading updates the
/// cache, and a missing one is filled from it.  See the `rssi_cache`
/// declaration in the scan loop for why a real reading is so rare.
fn fill_rssi(info: &mut BleDeviceInfo, cache: &mut HashMap<String, i16>) {
    match info.rssi {
        Some(v) => { cache.insert(info.address.clone(), v); }
        None    => { info.rssi = cache.get(&info.address).copied(); }
    }
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
    let rssi = normalise_rssi(props.rssi);
    // Debug-level: this fires for every advertisement of every device in
    // range, so at normal level it named the neighbourhood's TVs, weather
    // stations and fitness trackers — the same noise the scan-response name
    // log was gated to stop.  Kept rather than gated on `is_nus` because its
    // value is precisely in showing the devices that were rejected and why,
    // which is what the "no name scanned" investigations recorded above rely
    // on; that is a debugging need, not a normal-running one.  Matches the
    // per-advertisement dump in ble_win.rs, which is also debug-only.
    log::debug(&format!(
        "BLE scan {addr}: local_name={:?} rssi={:?} services={} nus={}",
        props.local_name,
        rssi,
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
        rssi,
        // Set by the caller (which has `app` in scope) right before
        // each yield — see the two `device_info` call sites above.
        in_use:  false,
    })
}

/// Discard an RSSI reading that cannot be a real measurement.
///
/// BLE RSSI is a signed dBm figure: roughly -20 to -40 for a device sitting
/// on the desk, down to about -100 at the edge of usable range.  It is never
/// positive — +27 dBm would be half a watt of transmit power, which no BLE
/// radio emits.
///
/// The Windows stack has been observed reporting a fixed +27 for a device
/// whose real signal strength is -41, and again for one at -86 (both
/// confirmed from the same devices on macOS).  So this is NOT a sign-dropped
/// magnitude that could be recovered by negating it — the same 27 comes back
/// regardless of the actual signal.  It is a placeholder, not a measurement.
///
/// Report it as unknown.  `BleDeviceInfo::to_json` emits `"rssi":null` for
/// None and the picker then omits the dBm suffix entirely, which is honest;
/// negating would have shown a confident "-27 dBm" that is pure invention and
/// would have made two devices 45 dB apart look identical.
///
/// Deliberately silent.  This fires for very nearly every advertisement of
/// every nearby device — 116 of 117 packets in one measured run — so logging
/// it drowned the debug output while telling us nothing new: the raw value is
/// already visible in ble_names.rs's per-advertisement dump.
fn normalise_rssi(rssi: Option<i16>) -> Option<i16> {
    match rssi {
        Some(v) if v > 0 => None,
        other => other,
    }
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
    if !crate::validate::is_valid_pfod_cmd(&cmd) {
        return crate::validate::hang_silently(
            &format!("BLE cmd write — not valid pfod syntax: {cmd:?}")
        ).await;
    }

    // Target must always be explicit — no fallback to "whichever
    // session happens to be connected". See main.rs's bare-`?cmd=`
    // case for the analogous target-less rejection.
    let addr = match ble_arg.as_deref().filter(|s| !s.is_empty()) {
        Some(a) => a.to_string(),
        None => return crate::validate::hang_silently("BLE cmd write with no ?ble=<address>").await,
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

/// Minimum time to wait after a failed open before allowing another
/// scan/connect attempt for the same target. A client retrying rapidly
/// (observed: ~40 attempts in under 4s while a different central held
/// the device) gains nothing from retrying sooner — the obstruction is
/// external (device connected elsewhere, not yet re-advertising, or the
/// OS/radio still settling) and doesn't clear any faster for it, while
/// hammering the adapter that fast is exactly what risked destabilising
/// the whole proxy (see project memory / ble.rs history).
const BLE_RETRY_BACKOFF: Duration = Duration::from_secs(2);

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

    if let Some(last_fail) = session.state.lock().await.last_failure {
        let elapsed = last_fail.elapsed();
        if elapsed < BLE_RETRY_BACKOFF {
            let wait = BLE_RETRY_BACKOFF - elapsed;
            log::log(&format!(
                "[pfodProxy] BLE: {addr} backing off, {} ms since last failure",
                elapsed.as_millis()
            ));
            return Err(format!("recent connection failure, retry in {}s", wait.as_secs_f32().ceil() as u64));
        }
    }

    session.state.lock().await.addr = Some(addr.to_string());

    let result = open_ble(app, session, addr, progress_tx).await;
    if result.is_err() {
        session.state.lock().await.last_failure = Some(Instant::now());
    }
    result
}

/// Actively scan for `addr` (NUS-filtered), returning as soon as it's
/// seen live, or an error once the 5-second window elapses with no
/// match.  A live `DeviceDiscovered`/`DeviceUpdated` match is itself
/// proof the device is currently advertising the Nordic UART Service —
/// i.e. genuinely reachable right now, not just an address btleplug
/// happens to remember (see `find_peripheral`'s cache, which proves
/// neither liveness nor NUS support).  Deliberately does NOT fall back
/// to `find_peripheral`'s cache on a timeout tick — every caller of this
/// function specifically needs a fresh, live-event-sourced `Peripheral`.
async fn scan_for_peripheral(
    central: &btleplug::platform::Adapter,
    addr: &str,
    progress_tx: &ProgressTx,
) -> Result<btleplug::platform::Peripheral, String> {
    progress(progress_tx, "scanning");
    log::log(&format!("[pfodProxy] BLE: scanning for {addr} ..."));
    central.start_scan(ScanFilter { services: vec![NUS_SERVICE] })
        .await.map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut events = central.events().await.map_err(|e| e.to_string())?;
    let mut target: Option<btleplug::platform::Peripheral> = None;
    while Instant::now() < deadline {
        if let Ok(Some(CentralEvent::DeviceDiscovered(id))) | Ok(Some(CentralEvent::DeviceUpdated(id))) =
            tokio::time::timeout(Duration::from_millis(250), events.next()).await
        {
            if let Ok(p) = central.peripheral(&id).await {
                if p.id().to_string().eq_ignore_ascii_case(addr) {
                    target = Some(p);
                    break;
                }
            }
        }
    }
    let _ = central.stop_scan().await;
    target.ok_or_else(|| format!("device {addr} not found"))
}

async fn open_ble(app: &Arc<AppState>, session: &Arc<BleSession>, addr: &str, progress_tx: ProgressTx) -> Result<(), String> {
    let central = get_central(app).await?;

    // Resolve peripheral: cached lookup first, then fresh scan.  A cache
    // hit skips the round-trip but risks handing back a stale Peripheral
    // — see the connect() failure handling below.
    let (mut peripheral, was_cached) = match find_peripheral(&central, addr).await {
        Some(p) => {
            log::log(&format!("[pfodProxy] BLE: {addr} already known, skipping scan"));
            (p, true)
        }
        None => (scan_for_peripheral(&central, addr, &progress_tx).await?, false),
    };

    progress(&progress_tx, "connecting");
    let t_connect = Instant::now();
    if let Err(e) = peripheral.connect().await {
        if !was_cached {
            // Already came from a genuine live scan — propagate as-is.
            return Err(e.to_string());
        }
        // Cached peripheral failed — rescan once, requiring a genuine
        // live advertisement (see scan_for_peripheral) rather than
        // trusting the same cached handle again. Deliberately does NOT
        // reset/recreate the shared btleplug Adapter/Manager here — that
        // was tried and found capable of hanging the whole proxy process
        // when a client retries rapidly (repeated Manager::new() calls
        // in a tight loop). ensure_open's BLE_RETRY_BACKOFF is what
        // actually protects against the retry storm; this rescan is just
        // a one-shot "maybe it's back" check within that same request.
        log::log(&format!(
            "[pfodProxy] BLE: cached peripheral for {addr} failed to connect ({e}), rescanning"
        ));
        peripheral = scan_for_peripheral(&central, addr, &progress_tx).await?;
        peripheral.connect().await.map_err(|e| e.to_string())?;
    }
    log::log(&format!(
        "[pfodProxy] BLE {addr}: connect() took {} ms",
        t_connect.elapsed().as_millis()
    ));

    finish_ble_connect(session, addr, peripheral, &progress_tx).await
}

/// Complete a BLE connection after `.connect()` has already succeeded:
/// discover services, find the NUS TX characteristic, subscribe, and
/// spawn the notify-pump task.
async fn finish_ble_connect(
    session: &Arc<BleSession>,
    addr: &str,
    peripheral: btleplug::platform::Peripheral,
    progress_tx: &ProgressTx,
) -> Result<(), String> {
    progress(progress_tx, "discovering");
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

    progress(progress_tx, "subscribing");
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
        b.peripheral    = Some(peripheral.clone());
        b.bytes_tx      = Some(bytes_tx.clone());
        b.connected     = true;
        b.cancel_tx     = Some(cancel_tx);
        b.initial_rx    = Some(initial_rx);
        b.last_failure  = None;
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

#[allow(dead_code)]
fn sse_error(msg: impl Into<String>) -> axum::response::Response {
    let msg = msg.into();
    let stream = async_stream::stream! {
        yield Ok::<_, Infallible>(SseEvent::default().event("error").data(msg));
    };
    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}
