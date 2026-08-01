// ble_win.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// BLE transport handler — WINDOWS ONLY.  Built on `bluest`.
//
// macOS and Linux keep the btleplug implementation in ble.rs; neither file
// is compiled on the other's platform (see the `mod ble` declarations in
// main.rs), so the two share nothing but the entry point `handle()` and the
// HTTP shape it implements:
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
// state.rs) — connecting to one device never disturbs another.  The
// adapter itself (`get_adapter`) is a shared OS resource, not part of any
// one session — see `AppState::ble_central`.
//
// Nordic UART Service GATT layout (used by every pfod-over-BLE device):
//   Service UUID  6E400001-B5A3-F393-E0A9-E50E24DCCA9E
//   RX char       6E400002-B5A3-F393-E0A9-E50E24DCCA9E  (we WRITE)
//   TX char       6E400003-B5A3-F393-E0A9-E50E24DCCA9E  (NOTIFY)
//
// ── Why bluest here, and why the scan filter is empty ────────────────
//
// This file replaces both the Windows half of the btleplug implementation
// and the hand-rolled `BluetoothLEAdvertisementWatcher` that used to live
// in ble_names.rs.  Both existed to work around one defect, measured
// repeatedly against real hardware and recorded in ble.rs's comments:
//
//   btleplug's Windows watcher attaches an `AdvertisementFilter` carrying
//   the scan's service UUIDs.  A SCAN_RSP packet contains no service-UUID
//   list — a pfod device's scan response is AD types 0x09/0x0A/0x12 — so
//   Windows discards every scan response before btleplug ever sees it.
//   That threw away the Complete Local Name (AD 0x09) and nearly every
//   genuine RSSI reading: 66 scan events with `local_name = None` and one
//   real RSSI, against 9 real readings the unfiltered watcher saw over the
//   same scan.
//
// bluest exposes the lever that fixes this directly: `Adapter::scan(&[])`
// with an EMPTY service list builds a single *unfiltered* watcher, which
// is the shape that does receive scan responses.  So discovery here scans
// unfiltered and does its own NUS filtering on `adv_data.services` — do
// not "optimise" that back into `scan(&[NUS_SERVICE])`, it is the whole
// reason names and signal strengths work.
//
// The connection path (`scan_for_device`) is the opposite case and does
// pass the filter: it only needs to see a device advertising NUS in its
// ADV_IND, wants nothing from the scan response, and benefits from the
// quieter stream.
//
// Only one watcher is ever on the air at a time.  Running two — which is
// what the old btleplug-scan-plus-name-watcher arrangement did — had them
// competing for one radio, with the driver issuing SCAN_REQ during only
// some of the resulting slots (measured: 3 scan responses in 129 packets
// in one run, none at all in the two after it).

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
use bluest::{Adapter, Characteristic, Device, Uuid};
use futures::stream::StreamExt;
use tokio::sync::broadcast;

use crate::log;
use crate::state::{AppState, BleSession, BYTES_CHANNEL_CAP};

const NUS_SERVICE: Uuid = Uuid::from_u128(0x6E400001_B5A3_F393_E0A9_E50E24DCCA9E);
const NUS_RX_CHAR: Uuid = Uuid::from_u128(0x6E400002_B5A3_F393_E0A9_E50E24DCCA9E);
const NUS_TX_CHAR: Uuid = Uuid::from_u128(0x6E400003_B5A3_F393_E0A9_E50E24DCCA9E);

/// Service filter for the connection-path scan.  A `static` rather than a
/// temporary because `Adapter::scan` ties the returned stream's lifetime to
/// the slice as well as to the adapter, and a `'static` slice keeps that
/// out of the way entirely.
static NUS_FILTER: [Uuid; 1] = [NUS_SERVICE];

/// Empty filter for the discovery scan — see the header: this is what makes
/// Windows deliver scan responses.
static NO_FILTER: [Uuid; 0] = [];

/// How long to wait for the Bluetooth radio to report itself available
/// before giving up.  `Adapter::wait_available()` has no upper bound of its
/// own: with Bluetooth switched off it simply waits for someone to switch it
/// on, which would leave the discovery SSE open and silent, the picker empty,
/// and no error anywhere.  Time it out and say so instead.
const ADAPTER_READY_TIMEOUT: Duration = Duration::from_secs(5);

/// How long the connection path scans for a specific address before
/// reporting it unreachable.  Matches ble.rs's window.
const CONNECT_SCAN_TIMEOUT: Duration = Duration::from_secs(5);

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

// ── Address handling ─────────────────────────────────────────────────

/// Recover the peer MAC from a `bluest::DeviceId`.
///
/// bluest hides the Bluetooth address on Windows: `AdvertisingDevice`
/// carries only a `Device`, and `DeviceId`'s inner field is private, so
/// there is no address getter and no way to rebuild a `DeviceId` from a
/// string either.  What `DeviceId` does expose is its `Display`, which on
/// Windows is the WinRT `BluetoothLEDevice.DeviceId` property:
///
///     BluetoothLE#BluetoothLE<host-mac>-<peer-mac>
///
/// with both addresses lower-case colon-separated hex.  The trailing field
/// is the address we want.
///
/// The MAC is what the whole rest of pfodWeb keys a BLE device by: it is
/// the `?ble=<address>` argument, the picker's row identity, and the
/// `ble_<address>` connection id the browser stores per-device UI state
/// under.  Handing out the raw `DeviceId` string instead would be both
/// unreadable in the UI and a silent break of every saved device.
///
/// Upper-cased on the way out to match the format ble.rs produces on the
/// other platforms (and the one the picker has always displayed).
///
/// Falls back to the whole id string if it does not have the expected
/// shape.  That degrades to "the address looks odd" rather than "the
/// device cannot be selected at all", and stays self-consistent — the same
/// device yields the same string on every advertisement, so discovery,
/// connect and cmd all still agree on it.
fn mac_from_device_id(id: &str) -> String {
    let tail = id.rsplit('-').next().unwrap_or(id);
    let looks_like_mac = tail.len() == 17
        && tail.split(':').count() == 6
        && tail.split(':').all(|b| b.len() == 2 && b.chars().all(|c| c.is_ascii_hexdigit()));
    if looks_like_mac {
        tail.to_ascii_uppercase()
    } else {
        log::debug(&format!("BLE: no MAC in DeviceId {id:?} — using it verbatim"));
        id.to_string()
    }
}

/// Address of the device that sent an advertisement.
fn adv_address(device: &Device) -> String {
    mac_from_device_id(&device.id().to_string())
}

// ── Discovery SSE ────────────────────────────────────────────────────

/// Live BLE scan, unfiltered, with NUS filtering applied here — see the
/// file header for why the filter must not be pushed down into `scan()`.
/// The scan stops when the SSE stream is dropped (browser closes
/// EventSource), because dropping the stream drops bluest's watcher guard.
async fn handle_discovery_stream(app: Arc<AppState>) -> axum::response::Response {
    let stream = async_stream::stream! {
        // Initial SSE comment — flushes a body byte before the
        // potentially-slow BLE adapter init/scan start so Firefox's
        // EventSource fires `onopen` immediately and doesn't time out
        // at the network layer (manifests as a misleading CORS error
        // with "Status code: (null)").  See serial.rs:handle_connection_stream
        // for the full rationale.
        yield Ok::<_, Infallible>(SseEvent::default().comment("ready"));

        let adapter = match get_adapter(&app).await {
            Ok(a) => a,
            Err(e) => {
                yield Ok(SseEvent::default().event("error").data(format!("adapter: {e}")));
                return;
            }
        };

        // `scan` borrows `adapter`, which lives in this generator for as
        // long as the stream does; dropping the generator drops both, and
        // bluest stops the watcher from its own drop guard.
        let mut scan = match adapter.scan(&NO_FILTER).await {
            Ok(s) => s,
            Err(e) => {
                yield Ok(SseEvent::default().event("error").data(format!("start_scan: {e}")));
                return;
            }
        };
        log::log("[pfodProxy] BLE discovery scan started (unfiltered — scan responses included)");

        // Cache of known names per address, filled from any advertisement
        // that carried a Local Name — including scan responses, which is
        // where most devices put it.  Used so a later advertisement without
        // one doesn't *overwrite* a name already showing in the picker.
        let mut name_cache: HashMap<String, String> = HashMap::new();

        // Addresses seen advertising the Nordic UART Service, i.e. the pfod
        // devices.  The unfiltered scan reports every nearby BLE device
        // (TVs, weather sensors, fitness trackers...); only these reach the
        // picker.  An address stays in the set once added, so a scan
        // response — which carries no service UUIDs at all — still counts as
        // an update for a device already classified from its ADV_IND.
        let mut nus_addrs: HashSet<String> = HashSet::new();

        // Last genuine RSSI seen per address.  The Windows stack only reports
        // a real signal strength on some packets; the rest come back with the
        // +27 placeholder that normalise_rssi discards.  Without this the
        // picker would flash a signal strength and then blank it on the very
        // next advertisement, so hold the last real reading.  It goes
        // slightly stale between readings, which is harmless for a "how close
        // is this device" indicator.
        let mut rssi_cache: HashMap<String, i16> = HashMap::new();

        // Addresses already asked about via `os_cached_name`.  Worth doing
        // at most once per address per scan: the answer comes from a cache
        // that will not change while we scan, and advertisements arrive
        // several times a second per device.
        let mut name_lookup_tried: HashSet<String> = HashSet::new();

        log::log("[pfodProxy] BLE discovery: entering event loop");
        while let Some(adv) = scan.next().await {
            let address = adv_address(&adv.device);
            let rssi    = normalise_rssi(adv.rssi);
            let has_nus = adv.adv_data.services.contains(&NUS_SERVICE);
            // A device that advertises an empty name is the same as one that
            // advertises none — don't let it displace a real cached name.
            let adv_name = adv.adv_data.local_name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);

            log::debug(&format!(
                "BLE adv {address}: local_name={:?} rssi={:?} services={} nus={}",
                adv_name, rssi, adv.adv_data.services.len(), has_nus,
            ));

            // A scan response carrying a Local Name, for an address already
            // known to advertise the Nordic UART Service.
            //
            // Reported at normal log level rather than debug because it is the
            // only path that recovers the name the device chose for itself —
            // ArduinoBLE's `setLocalName()` — as against the OS device-cache
            // name, which can be the firmware default ("Arduino").  It is also
            // rare and easy to miss: measured at 5 sightings in 70 s for a
            // device advertising ~3 times a second, and 1 in 90 s for one
            // advertising at 0.25 Hz.  Being able to see it arrive without
            // turning debug on is worth the line.
            //
            // Identified by shape, not by `AdvertisementType`: this Bluetooth
            // stack types scan responses NonConnectableUndirected and mislabels
            // the field generally (see the file header).  A scan response
            // carries no service-UUID list, so a packet with a name and no
            // services is one — while the pfod device's ADV_IND carries the NUS
            // UUID and no name, the two never arriving together.
            //
            // `nus_addrs` gates it so nearby non-pfod devices that do put a name
            // in their ADV_IND — weather sensors, a TV — stay out of the log.
            // A scan response arriving before any ADV_IND has classified the
            // address goes unlogged; the next one will not.
            if let Some(n) = &adv_name {
                if adv.adv_data.services.is_empty() && nus_addrs.contains(&address) {
                    log::log(&format!(
                        "[pfodProxy] BLE scan response for {address}: local name {n:?}"
                    ));
                }
            }

            // Gate every emission on something the picker displays having
            // actually changed, rather than emitting once per advertisement.
            // Most packets repeat what we already know, so this stays quiet.
            let mut changed = false;

            if has_nus {
                if nus_addrs.insert(address.clone()) {
                    changed = true;
                }
                // Keep the freshest handle for this device: it is the only
                // route back to it when the browser picks it, since a
                // `bluest::DeviceId` cannot be rebuilt from a string.
                app.ble_devices.lock().await.insert(address.clone(), adv.device.clone());
            }

            if let Some(v) = rssi {
                if rssi_cache.insert(address.clone(), v) != Some(v) {
                    changed = true;
                }
            }

            if let Some(n) = adv_name {
                if name_cache.get(&address) != Some(&n) {
                    // Cache for any device, log only for pfod ones.  The
                    // unfiltered scan sees every named device in range — TVs,
                    // weather sensors, fitness trackers — and none of them
                    // belong in the log, but any of them might turn out to be
                    // NUS on a later advertisement, at which point a name
                    // recorded now is what fills the picker row immediately.
                    // Same gap as the scan-response line above: a name learned
                    // before the NUS classification arrives is kept silently.
                    if nus_addrs.contains(&address) {
                        log::log(&format!(
                            "[pfodProxy] BLE advertised name for {address}: {n:?}"
                        ));
                    }
                    name_cache.insert(address.clone(), n);
                    changed = true;
                }
            }

            // Everything above is recorded for any device — a name or RSSI
            // learned before the NUS classification arrives is still worth
            // keeping — but only pfod devices are offered to the picker.
            if !nus_addrs.contains(&address) {
                continue;
            }

            // Last resort: ask Windows for the name it already holds.  Some
            // devices never put AD 0x08/0x09 on the air at all, and a weak or
            // sparse advertiser can lose the SCAN_REQ/SCAN_RSP exchange that
            // would have carried it (the failing device measured -87 dBm
            // against -36 for one that worked), so no amount of scanning
            // produces a name.  See `os_cached_name`.
            if !name_cache.contains_key(&address) && name_lookup_tried.insert(address.clone()) {
                if let Some(n) = os_cached_name(&adv.device, &address) {
                    name_cache.insert(address.clone(), n);
                    changed = true;
                }
            }

            if changed {
                let info = BleDeviceInfo {
                    address: address.clone(),
                    name:    name_cache.get(&address).cloned(),
                    rssi:    rssi_cache.get(&address).copied(),
                    in_use:  addr_in_use(&app, &address).await,
                };
                yield Ok::<_, Infallible>(SseEvent::default().data(info.to_json()));
            }
        }
        log::log("[pfodProxy] BLE discovery scan stopped");
    };
    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}

/// The name Windows already holds for this device, if it is worth showing.
///
/// `bluest::Device::name()` reads the WinRT `BluetoothLEDevice.Name`
/// property, which resolves against the system's per-address device cache —
/// filled from advertisements Windows has seen (including in earlier
/// sessions, before pfodProxy was running) and from pairing.  It does not
/// open a connection, so it is safe to call in the middle of a running scan,
/// costs nothing on the radio, and cannot disturb a device another app is
/// talking to.
///
/// That is the whole reason to prefer it over reading GATT 0x2A00, which
/// needs a real connection and was removed from the btleplug implementation
/// for returning the firmware default name — see the long note at the top of
/// ble.rs, which records the measurements: 0x2A00 read back "Arduino" and the
/// probe took 5.5 s, during which the discovery stream logged no scan
/// activity at all.
///
/// Windows returns an empty string, not an error, for a device it has no
/// name for.
fn os_cached_name(device: &Device, address: &str) -> Option<String> {
    let name = device.name().ok()?;
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    if is_default_firmware_name(name) {
        log::log(&format!(
            "[pfodProxy] BLE name for {address} from OS device cache ignored: {name:?} is a \
             firmware default, not a device name"
        ));
        return None;
    }
    log::log(&format!(
        "[pfodProxy] BLE name for {address} from OS device cache: {name:?} \
         (no Local Name in any advertisement)"
    ));
    Some(name.to_string())
}

/// True for names that are a firmware default rather than anything anyone
/// chose for this device.
///
/// **Currently disabled — the list is empty, so this always returns false.**
/// See "Why it is disabled" below; the machinery is left in place because
/// re-enabling it is a one-line change.
///
/// # Why it existed
///
/// The OS device cache can hand back the GATT 0x2A00 device-name, which on an
/// unconfigured board is just the library default — "Arduino" for ArduinoBLE,
/// which fills 0x2A00 from `setDeviceName()` while the name users actually
/// choose goes to the advertisement via `setLocalName()`.  In a picker that is
/// worse than no name at all: it is identical across every such board so it
/// cannot tell two of them apart, and it disguises the fact that the device
/// never advertised a name.  It was not hypothetical — the Rain Gauge
/// (C6:8B:99:72:5B:80) was reported as "Arduino" and suppressed by this rule.
///
/// # What changed
///
/// The premise was that an OS-cache name is firmware-derived and therefore
/// suspect, while an advertised name is a deliberate choice.  On Windows that
/// turns out to be only half right.  `BluetoothLEDevice.Name` resolves, in
/// order:
///
///   1. the PnP node's `FriendlyName`
///      (`HKLM\SYSTEM\CurrentControlSet\Enum\BTHLE\Dev_<mac>\<inst>`), which is
///      **user-assignable** — it is what Settings' "Rename" writes;
///   2. failing that, `Name` / `LEName` under
///      `HKLM\SYSTEM\CurrentControlSet\Services\BTHPORT\Parameters\Devices\<mac>`,
///      which is the firmware/pairing name.
///
/// Measured on the two devices here:
///
/// | device                       | BTHPORT `Name`  | PnP `FriendlyName` | returned       |
/// |------------------------------|-----------------|--------------------|----------------|
/// | C6:8B:99:72:5B:80 Rain Gauge | `Arduino`       | `Rain Gauge`       | `Rain Gauge`   |
/// | 08:A6:F7:31:15:FA LedOnOff   | `pfod_LedOnOff` | *(no BTHLE node)*  | `pfod_LedOnOff`|
///
/// So a name from this source may be one the user typed, and rejecting
/// "Arduino" would discard a deliberate choice from anyone who renamed a
/// device that way in Settings.
///
/// # Why it is disabled rather than deleted
///
/// The suppression is also less valuable than it looks: it is not what gets the
/// right name shown, only what avoids a wrong one in the meantime.  Nothing is
/// permanently blocked either way — the scan-response name overwrites whatever
/// is cached when it arrives, since the caller only compares for inequality.
/// For the Rain Gauge that interval was measured at roughly 90 s.
///
/// Re-enable by restoring the entry below if unconfigured boards start showing
/// as "Arduino" in the picker.  Keep it to defaults actually observed in the
/// field; speculative entries risk suppressing a name someone genuinely chose.
///
/// Applied ONLY to names from the OS cache, never to a Local Name parsed from
/// an advertisement: what a device puts on the air is a deliberate choice by
/// whoever flashed it, and matching what Chrome and nRF Connect display matters
/// more than second-guessing it.
fn is_default_firmware_name(name: &str) -> bool {
    // Disabled 2026-07-31 — see the doc comment.  Restore as:
    //     const DEFAULTS: [&str; 1] = ["arduino"];
    const DEFAULTS: [&str; 0] = [];
    let n = name.trim().to_ascii_lowercase();
    DEFAULTS.contains(&n.as_str())
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
fn normalise_rssi(rssi: Option<i16>) -> Option<i16> {
    match rssi {
        Some(v) if v > 0 => None,
        other => other,
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
    let rx_char = session.state.lock().await.rx_char.clone();
    match rx_char {
        Some(rx) => match rx.write_without_response(cmd.as_bytes()).await {
            Ok(()) => log::debug(&format!(
                ">> ble {addr} sent {}b {:?}", cmd.len(), cmd
            )),
            Err(e) => log::log(&format!("[pfodProxy] BLE write error: {e}")),
        },
        None => log::log("[pfodProxy] BLE RX characteristic not found"),
    }

    if cmd.contains("{!}") {
        log::log("[pfodProxy] {!} seen — closing BLE");
        let mut b = session.state.lock().await;
        drop_ble(&mut b);
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
/// match.  A live advertisement match is itself proof the device is
/// currently advertising the Nordic UART Service — i.e. genuinely
/// reachable right now, not just an address `AppState::ble_devices`
/// happens to remember (which proves neither liveness nor NUS support).
/// Deliberately does NOT fall back to that cache on a timeout — every
/// caller specifically needs a fresh, live-scan-sourced `Device`.
///
/// Uses the service filter, unlike discovery: this only has to spot a
/// device whose ADV_IND lists NUS, wants nothing out of the scan response,
/// and a filtered watcher makes for a far quieter stream.
async fn scan_for_device(
    adapter: &Adapter,
    addr: &str,
    progress_tx: &ProgressTx,
) -> Result<Device, String> {
    progress(progress_tx, "scanning");
    log::log(&format!("[pfodProxy] BLE: scanning for {addr} ..."));
    let mut scan = adapter.scan(&NUS_FILTER).await.map_err(|e| e.to_string())?;
    let found = tokio::time::timeout(CONNECT_SCAN_TIMEOUT, async {
        while let Some(adv) = scan.next().await {
            if adv_address(&adv.device).eq_ignore_ascii_case(addr) {
                return Some(adv.device);
            }
        }
        None
    }).await;
    match found {
        Ok(Some(device)) => Ok(device),
        // Stream ended early (adapter went away) or the window elapsed —
        // either way the device is not reachable right now.
        Ok(None) | Err(_) => Err(format!("device {addr} not found")),
    }
}

/// The `Device` handle last seen advertising at this address, if any.
async fn cached_device(app: &Arc<AppState>, addr: &str) -> Option<Device> {
    app.ble_devices.lock().await
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(addr))
        .map(|(_, v)| v.clone())
}

async fn open_ble(
    app: &Arc<AppState>,
    session: &Arc<BleSession>,
    addr: &str,
    progress_tx: ProgressTx,
) -> Result<(), String> {
    let adapter = get_adapter(app).await?;

    // Resolve the device: cached handle first, then fresh scan.  A cache
    // hit skips the round-trip but risks handing back a stale handle —
    // see the failure handling below.
    let (mut device, was_cached) = match cached_device(app, addr).await {
        Some(d) => {
            log::log(&format!("[pfodProxy] BLE: {addr} already known, skipping scan"));
            (d, true)
        }
        None => (scan_for_device(&adapter, addr, &progress_tx).await?, false),
    };

    let (rx_char, tx_char) = match connect_gatt(&adapter, &device, addr, &progress_tx).await {
        Ok(chars) => chars,
        Err(e) => {
            if !was_cached {
                // Already came from a genuine live scan — propagate as-is.
                return Err(e);
            }
            // Cached handle failed — rescan once, requiring a genuine live
            // advertisement (see scan_for_device) rather than trusting the
            // same stale handle again.  Deliberately does NOT reset or
            // recreate the shared Adapter here — the equivalent was tried
            // with btleplug and found capable of hanging the whole proxy
            // process when a client retries rapidly. ensure_open's
            // BLE_RETRY_BACKOFF is what actually protects against a retry
            // storm; this rescan is just a one-shot "maybe it's back" check
            // within the same request.
            log::log(&format!(
                "[pfodProxy] BLE: cached device for {addr} failed to connect ({e}), rescanning"
            ));
            device = scan_for_device(&adapter, addr, &progress_tx).await?;
            connect_gatt(&adapter, &device, addr, &progress_tx).await?
        }
    };

    // Only cache a handle that actually connected.  Keyed by the device's
    // own canonical address rather than by `addr` as the caller spelled it,
    // so this lands on the same entry discovery writes.
    app.ble_devices.lock().await.insert(adv_address(&device), device.clone());

    finish_ble_connect(session, addr, device, rx_char, tx_char, &progress_tx).await
}

/// Establish the GATT link and resolve the two NUS characteristics.
///
/// On Windows `connect_device` is documented as a no-op — WinRT manages the
/// link itself and opens it lazily on the first operation that needs one,
/// which here is the uncached service discovery on the next line.  So a
/// device that is out of range or already held by another central fails at
/// `discover_services_with_uuid`, not at `connect_device`; the "connecting"
/// progress step is reported around the pair of them rather than around the
/// call that carries the name.
async fn connect_gatt(
    adapter: &Adapter,
    device: &Device,
    addr: &str,
    progress_tx: &ProgressTx,
) -> Result<(Characteristic, Characteristic), String> {
    progress(progress_tx, "connecting");
    adapter.connect_device(device).await.map_err(|e| e.to_string())?;

    progress(progress_tx, "discovering");
    let t_discover = Instant::now();
    let services = device
        .discover_services_with_uuid(NUS_SERVICE)
        .await
        .map_err(|e| e.to_string())?;
    let service = services
        .into_iter()
        .next()
        .ok_or_else(|| "Nordic UART Service not found".to_string())?;
    let chars = service
        .discover_characteristics()
        .await
        .map_err(|e| e.to_string())?;
    log::log(&format!(
        "[pfodProxy] BLE {addr}: service + characteristic discovery took {} ms",
        t_discover.elapsed().as_millis()
    ));

    let mut rx_char = None;
    let mut tx_char = None;
    for c in chars {
        let uuid = c.uuid();
        if uuid == NUS_RX_CHAR {
            rx_char = Some(c);
        } else if uuid == NUS_TX_CHAR {
            tx_char = Some(c);
        }
    }
    Ok((
        rx_char.ok_or_else(|| "NUS RX characteristic not found".to_string())?,
        tx_char.ok_or_else(|| "NUS TX characteristic not found".to_string())?,
    ))
}

/// Complete a BLE connection once the GATT characteristics are in hand:
/// subscribe to NUS TX notifications and spawn the notify-pump task.
///
/// Subscribing is done *inside* the pump task rather than here because
/// `Characteristic::notify()` returns a stream borrowing the characteristic,
/// so the two have to live together; an async block owning the characteristic
/// as a local and holding the borrow across its awaits is what makes that
/// work.  The task reports the outcome back over `ready_rx` so a failed
/// subscribe still surfaces as an open error, exactly as it did when
/// btleplug's `subscribe()` was called inline.
async fn finish_ble_connect(
    session: &Arc<BleSession>,
    addr: &str,
    device: Device,
    rx_char: Characteristic,
    tx_char: Characteristic,
    progress_tx: &ProgressTx,
) -> Result<(), String> {
    let (bytes_tx, _) = broadcast::channel::<Vec<u8>>(BYTES_CHANNEL_CAP);
    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    // See serial.rs:open_serial — subscribe before the notify-pump task can
    // deliver anything, so the broadcast channel always has a receiver from
    // the first NUS notification.
    let initial_rx = bytes_tx.subscribe();
    log::log(&format!("[pfodProxy] BLE {addr}: initial_rx pre-subscribed (race-safe)"));

    let session_for_notify = session.clone();
    let label = addr.to_string();
    let pump_bytes_tx = bytes_tx.clone();
    // The pump task and the session each hold a `Device`; both have to,
    // since either one outliving the other alone must still keep the WinRT
    // link open (the SSE closing drops the session's copy, `{!}` drops both).
    let device_for_notify = device.clone();

    // Publish the session BEFORE spawning the pump, so the pump's cleanup is
    // guaranteed to be the last writer to this state.  Doing it the other way
    // round leaves a window where a device that drops the link immediately
    // after subscribing has its cleanup run first and then be overwritten by
    // this block — resurrecting a session that is already dead.  ble.rs
    // orders it the same way for the same reason.
    //
    // Nothing can observe the premature `connected = true`: every reader
    // reaches it through `ensure_open`, which holds `open_lock` until this
    // whole function returns.  The subscribe failure path below rolls it
    // back.
    {
        let mut b = session.state.lock().await;
        b.device       = Some(device);
        b.rx_char      = Some(rx_char);
        b.bytes_tx     = Some(bytes_tx);
        b.connected    = true;
        b.cancel_tx    = Some(cancel_tx);
        b.initial_rx   = Some(initial_rx);
        b.last_failure = None;
    }

    tokio::spawn(async move {
        // These two locals are what hold the connection open: WinRT closes
        // the GATT link once the BluetoothLEDevice and every object below it
        // are dropped, so the task ending IS the disconnect.
        let tx_char = tx_char;
        let device  = device_for_notify;
        let mut cancel_rx = cancel_rx;

        let mut stream = match tx_char.notify().await {
            Ok(s) => {
                let _ = ready_tx.send(Ok(()));
                s
            }
            Err(e) => {
                // Return WITHOUT running the cleanup below.  The opener owns
                // this path: it rolls the session back itself and fails the
                // open, and it can only do that safely because nothing here
                // has touched the state it published.
                let _ = ready_tx.send(Err(format!("subscribe: {e}")));
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
                        Some(Err(e)) => {
                            log::log(&format!("[pfodProxy] BLE {label}: notify stream error: {e}"));
                            break;
                        }
                        // No UUID check needed here, unlike btleplug's
                        // peripheral-wide notification stream: bluest's
                        // stream carries only this one characteristic's
                        // values.
                        Some(Ok(value)) => {
                            log_scan.feed(&value);
                            let n = value.len();
                            if pump_bytes_tx.receiver_count() > 0 {
                                ever_subscribed = true;
                            }
                            if pump_bytes_tx.send(value).is_err() && !ever_subscribed {
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
        drop(tx_char);
        drop(device);
        let mut b = session_for_notify.state.lock().await;
        b.connected = false;
        b.device    = None;
        b.rx_char   = None;
        b.bytes_tx  = None;
        b.initial_rx = None;
        log::log(&format!("[pfodProxy] BLE connection to {label} closed"));
    });

    progress(progress_tx, "subscribing");
    let t_subscribe = Instant::now();
    let subscribed = match ready_rx.await {
        Ok(Ok(()))  => Ok(()),
        Ok(Err(e))  => Err(e),
        // Only reachable if the pump task itself was cancelled or panicked
        // before reporting — it sends on every other path.
        Err(_)      => Err("notify task ended before subscribing".to_string()),
    };
    if let Err(e) = subscribed {
        // The pump returns without touching session state on this path, so
        // undoing the block above is safe and leaves nothing half-open.
        drop_ble(&mut *session.state.lock().await);
        return Err(e);
    }
    log::log(&format!(
        "[pfodProxy] BLE {addr}: subscribe() took {} ms",
        t_subscribe.elapsed().as_millis()
    ));

    log::log(&format!("[pfodProxy] Connected to BLE {addr}"));
    Ok(())
}

// ── Adapter ──────────────────────────────────────────────────────────

/// Return a shared `Adapter` handle, lazily initialised on first call
/// and stashed in `AppState::ble_central` for reuse.  Persisting the
/// adapter across discovery + connection requests (and across every
/// BLE target's session) keeps one radio handle for the process rather
/// than opening a new one per request.
async fn get_adapter(app: &Arc<AppState>) -> Result<Adapter, String> {
    {
        let c = app.ble_central.lock().await;
        if let Some(c) = &*c {
            return Ok(c.clone());
        }
    }
    let adapter = Adapter::default()
        .await
        .ok_or_else(|| "no BLE adapter".to_string())?;
    tokio::time::timeout(ADAPTER_READY_TIMEOUT, adapter.wait_available())
        .await
        .map_err(|_| "BLE adapter not available (is Bluetooth turned on?)".to_string())?
        .map_err(|e| e.to_string())?;
    let mut c = app.ble_central.lock().await;
    // Race: another caller may have initialised in parallel; keep
    // whichever landed first so all callers share one handle.
    if c.is_none() {
        *c = Some(adapter);
    }
    Ok(c.as_ref().unwrap().clone())
}

/// Tear down a BLE session.
///
/// Not async and with no explicit disconnect call, unlike ble.rs: on Windows
/// `bluest::Adapter::disconnect_device` is a documented no-op, because WinRT
/// owns the link and closes it when the last handle to the device goes away.
/// So dropping `device` / `rx_char` here plus signalling `cancel_tx` — which
/// makes the notify task drop its own copies and its subscription — *is* the
/// disconnect.
fn drop_ble(b: &mut crate::state::BleState) {
    if let Some(tx) = b.cancel_tx.take() {
        let _ = tx.send(());
    }
    b.device     = None;
    b.rx_char    = None;
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
