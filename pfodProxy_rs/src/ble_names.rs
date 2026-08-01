// ble_names.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// Parallel BLE advertisement watchers that recover device names from
// SCAN RESPONSE packets — names that btleplug's `properties.local_name`
// fails to surface correctly on Windows and macOS for some devices.
//
// *** macOS / Linux ONLY.  This file is no longer compiled on Windows. ***
//
// The Windows module below is dead code, kept for its notes rather than for
// its behaviour: bluest's unfiltered `Adapter::scan(&[])` now supplies the
// same scan-response names (and RSSI, and the NUS classification) directly
// to ble_win.rs, so the hand-rolled watcher has nothing left to add.  It
// would not build as-is either — Cargo.toml's direct `windows` 0.61
// dependency went with it, leaving only the 0.48 copy bluest pins.
//
// Windows: btleplug 0.11 reads `BluetoothLEAdvertisement.LocalName` which
// the WinRT layer is supposed to populate from AD types 0x08/0x09 but in
// practice stays empty for scan-response-only names on some drivers.  We
// subscribe to `BluetoothLEAdvertisementWatcher` and walk `DataSections`
// directly (same as Chrome/nRFConnect).
//
// macOS: btleplug reads `CBAdvertisementDataLocalNameKey` from the
// CoreBluetooth advertisement dictionary.  For previously-connected
// peripherals macOS substitutes the cached GATT 0x2A00 device-name
// (e.g. "Arduino [Office Temp/RH]") instead of the scan-response AD
// type 0x09 (e.g. "Office Temp/RH").  We run a dedicated CBCentralManager
// whose `didDiscoverPeripheral:advertisementData:` callback reads
// `CBAdvertisementDataLocalNameKey` from the live advertisement data;
// this gives the same name as Chrome and nRFConnect report.
//
// Linux: stub — BlueZ/btleplug reliably surfaces scan-response names.

use tokio::sync::mpsc::UnboundedSender;

/// A (address, name) pair the watcher delivers when it sees an
/// advertisement carrying a Local Name.  On Windows the address is a
/// MAC string; on macOS it is the CoreBluetooth peripheral UUID string
/// (lower-case, matching btleplug's PeripheralId::to_string() format).
pub type NameUpdate = (String, String);

/// One advertisement, as the watcher saw it — the full record, not just a
/// name.
///
/// **Windows only in practice.**  The type is declared unconditionally so
/// ble.rs can create its channel on every platform without cfg noise, but
/// only the Windows watcher ever sends one; on macOS and Linux the sender is
/// dropped at startup, the receiver yields None forever, and that select!
/// arm never fires.  Those platforms keep their existing behaviour exactly:
/// btleplug drives discovery and the name watcher only supplements it.
///
/// Windows needs this because btleplug's own watcher is service-UUID
/// filtered (see its winrtble/ble/watcher.rs: it appends the scan filter's
/// UUIDs to `AdvertisementFilter.Advertisement.ServiceUuids`).  A scan
/// response carries no service UUID list — a pfod device's SCAN_RSP is AD
/// types 0x09/0x0A/0x12 — so Windows discards it before btleplug sees it.
/// That is why `properties.local_name` was None on every one of 66 scan
/// events while this watcher read "pfod_LedOnOff" off the air, and why
/// btleplug produced 1 genuine RSSI reading against this watcher's 9 in the
/// same run.
pub struct AdvReport {
    /// Upper-case MAC, same format as btleplug's `address().to_string()`.
    pub address: String,
    /// Raw `RawSignalStrengthInDBm`.  Passed through unfiltered — the
    /// caller applies the plausibility rule, so that policy lives in one
    /// place (ble.rs's normalise_rssi) rather than being split across files.
    pub rssi: Option<i16>,
    /// True when the advertised service UUIDs include the Nordic UART
    /// Service, i.e. this is a pfod device.  Determined here rather than
    /// deferred to btleplug so a device can be discovered from this watcher
    /// alone.
    pub has_nus: bool,
}

// ── Windows ──────────────────────────────────────────────────────────

#[cfg(windows)]
mod imp {
    use super::*;
    use std::sync::Arc;
    use windows::Devices::Bluetooth::Advertisement::{
        BluetoothLEAdvertisementReceivedEventArgs,
        BluetoothLEAdvertisementWatcher,
        BluetoothLEScanningMode,
    };
    use windows::Devices::Bluetooth::BluetoothLEDevice;
    use windows::Foundation::TypedEventHandler;
    use windows::Storage::Streams::DataReader;

    /// Holds the active watcher; stops it on drop so the discovery
    /// stream cleanly releases the radio when the SSE client closes.
    pub struct NameWatcher {
        watcher: BluetoothLEAdvertisementWatcher,
    }

    /// Nordic UART Service, as a WinRT GUID for comparing against the
    /// advertisement's parsed `ServiceUuids`.  Mirrors ble.rs's NUS_SERVICE.
    const NUS_SERVICE_GUID: windows::core::GUID =
        windows::core::GUID::from_u128(0x6E400001_B5A3_F393_E0A9_E50E24DCCA9E);

    impl NameWatcher {
        /// Start the single Windows advertisement watcher.
        ///
        /// Feeds two channels from the same subscription rather than running
        /// two watchers: `name_tx` keeps the original (mac, name) contract
        /// that the discovery loop already consumes, and `adv_tx` carries the
        /// full per-packet record that Windows discovery is now driven from.
        ///
        /// Deliberately created with no `AdvertisementFilter`.  Filtering on
        /// service UUIDs — which is what btleplug does — makes Windows drop
        /// every scan response, since a SCAN_RSP carries no UUID list.  That
        /// filter is precisely why btleplug never surfaces a Local Name here,
        /// so this watcher takes every advertisement and sorts them out
        /// itself (see `has_nus` in the report it builds).
        pub fn start(
            name_tx: UnboundedSender<NameUpdate>,
            adv_tx:  UnboundedSender<AdvReport>,
        ) -> windows::core::Result<Self> {
            let watcher = BluetoothLEAdvertisementWatcher::new()?;
            watcher.SetScanningMode(BluetoothLEScanningMode::Active)?;
            // Bluetooth 5 extended advertising.  btleplug sets this on its own
            // watcher; without it a device advertising on the extended PHYs is
            // invisible here while showing up for btleplug, which would be a
            // confusing split.  Ignored on Windows builds too old to have it,
            // hence the discarded result rather than `?`.
            let _ = watcher.SetAllowExtendedAdvertisements(true);

            let name_tx = Arc::new(name_tx);
            let adv_tx  = Arc::new(adv_tx);
            let handler = TypedEventHandler::new(
                move |_w: windows::core::Ref<BluetoothLEAdvertisementWatcher>,
                      args: windows::core::Ref<BluetoothLEAdvertisementReceivedEventArgs>|
                      -> windows::core::Result<()>
                {
                    let args = match args.as_ref() {
                        Some(a) => a,
                        None => return Ok(()),
                    };
                    // Guarded on the flag rather than left to log::debug's own
                    // check, because the format! argument would otherwise be
                    // built for every advertisement of every nearby device.
                    if crate::log::DEBUG.load(std::sync::atomic::Ordering::Relaxed) {
                        dump_advertisement(args);
                    }
                    if let Ok(Some((mac, name))) = parse_local_name(args) {
                        let _ = name_tx.send((mac, name));
                    }
                    if let Some(report) = build_adv_report(args) {
                        let _ = adv_tx.send(report);
                    }
                    Ok(())
                },
            );
            watcher.Received(&handler)?;
            watcher.Start()?;
            Ok(NameWatcher { watcher })
        }
    }

    /// Assemble the record for one advertisement.
    ///
    /// Carries no name: the caller has already sent any Local Name on the
    /// name channel, and the discovery loop's `scan_name_rx` arm owns caching
    /// and emitting those.  Duplicating it here would just give two paths
    /// updating the same cache entry.
    ///
    /// Service UUIDs come from WinRT's own parsed `ServiceUuids` rather than
    /// from a hand-rolled walk of AD 0x06/0x07: it already handles the
    /// 16/32/128-bit list types and their endianness, and this is exactly the
    /// property btleplug filters on, so matching its interpretation keeps the
    /// two views of "is this a pfod device" consistent.
    ///
    /// Returns None only when the address cannot be read — without one the
    /// report cannot be keyed to a device and is useless.
    fn build_adv_report(
        args: &BluetoothLEAdvertisementReceivedEventArgs,
    ) -> Option<AdvReport> {
        let address = format_mac(args.BluetoothAddress().ok()?);
        let mut has_nus = false;
        if let Ok(ad) = args.Advertisement() {
            if let Ok(uuids) = ad.ServiceUuids() {
                for u in &uuids {
                    if u == NUS_SERVICE_GUID {
                        has_nus = true;
                        break;
                    }
                }
            }
        }
        Some(AdvReport {
            address,
            rssi: args.RawSignalStrengthInDBm().ok(),
            has_nus,
        })
    }

    impl Drop for NameWatcher {
        fn drop(&mut self) {
            let _ = self.watcher.Stop();
        }
    }

    /// Debug-only dump of one raw advertisement exactly as the Windows stack
    /// delivered it.  This is the tool for the two failures seen in the
    /// field — a device whose name never appears, and a bogus RSSI — because
    /// it shows, per packet:
    ///
    ///   type=      which advertisement kind arrived.  ScanResponse appearing
    ///              at all is the proof that active scanning is really in
    ///              effect; if only ConnectableUndirected ever shows up, the
    ///              adapter/driver is not issuing SCAN_REQ and a
    ///              scan-response-only name can never be seen, no matter how
    ///              long the scan runs.
    ///   rssi=      RawSignalStrengthInDBm straight from this event, i.e. the
    ///              same field btleplug reads.  Compare against the value in
    ///              the "BLE scan <mac>" line: if this one is sane while
    ///              btleplug's is not, the fault is in btleplug's caching of
    ///              it and we should take the reading from here instead.
    ///   LocalName= what WinRT itself parsed into the LocalName property.
    ///   ad_types=  every AD data type present.  0x09 is Complete Local Name
    ///              and 0x08 Shortened; if neither is ever listed, the name
    ///              genuinely is not on the air in anything Windows hands us.
    fn dump_advertisement(args: &BluetoothLEAdvertisementReceivedEventArgs) {
        let mac = args.BluetoothAddress().map(format_mac).unwrap_or_else(|_| "?".into());
        let kind = args.AdvertisementType().map(|t| format!("{t:?}")).unwrap_or_else(|_| "?".into());
        let rssi = args.RawSignalStrengthInDBm().map(|v| v.to_string()).unwrap_or_else(|_| "?".into());
        let (local_name, types) = match args.Advertisement() {
            Ok(ad) => {
                let ln = ad.LocalName().map(|s| s.to_string()).unwrap_or_default();
                let mut list: Vec<String> = Vec::new();
                if let Ok(sections) = ad.DataSections() {
                    for s in &sections {
                        if let Ok(dt) = s.DataType() {
                            list.push(format!("0x{dt:02X}"));
                        }
                    }
                }
                (ln, list.join(","))
            }
            Err(_) => (String::new(), String::new()),
        };
        crate::log::debug(&format!(
            "BLE adv {mac}: type={kind} rssi={rssi} LocalName={local_name:?} ad_types=[{types}]"
        ));
    }

    /// Walk the advertisement's DataSections for AD type 0x09
    /// (Complete Local Name) or 0x08 (Shortened Local Name).
    /// Prefer 0x09: some devices put a truncated name in the primary
    /// ADV_IND and the full name in the SCAN_RSP; when WinRT coalesces
    /// both into one DataSections list the shortened entry appears first.
    fn parse_local_name(
        args: &BluetoothLEAdvertisementReceivedEventArgs,
    ) -> windows::core::Result<Option<(String, String)>> {
        let addr_u64 = args.BluetoothAddress()?;
        let advertisement = args.Advertisement()?;
        let sections = advertisement.DataSections()?;
        let mut short_name: Option<String> = None;
        let mut complete_name: Option<String> = None;
        for section in &sections {
            let dt = section.DataType()?;
            if dt != 0x08 && dt != 0x09 {
                continue;
            }
            let buf = section.Data()?;
            let reader = DataReader::FromBuffer(&buf)?;
            let len = reader.UnconsumedBufferLength()? as usize;
            if len == 0 {
                continue;
            }
            let mut bytes = vec![0u8; len];
            reader.ReadBytes(&mut bytes)?;
            // Some firmware nul-pads; trim.
            while bytes.last() == Some(&0) {
                bytes.pop();
            }
            if bytes.is_empty() {
                continue;
            }
            let name = String::from_utf8_lossy(&bytes).to_string();
            if dt == 0x09 {
                complete_name = Some(name);
            } else {
                short_name = Some(name);
            }
        }
        let name = match complete_name.or(short_name) {
            Some(n) => n,
            None => return Ok(None),
        };
        Ok(Some((format_mac(addr_u64), name)))
    }

    fn format_mac(addr_u64: u64) -> String {
        format!(
            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
            (addr_u64 >> 40) & 0xFF,
            (addr_u64 >> 32) & 0xFF,
            (addr_u64 >> 24) & 0xFF,
            (addr_u64 >> 16) & 0xFF,
            (addr_u64 >> 8) & 0xFF,
            addr_u64 & 0xFF,
        )
    }

    /// Inverse of `format_mac` — "C6:8B:99:72:5B:80" -> u64, as WinRT's
    /// address APIs want.  Returns None for anything that isn't six
    /// colon-separated hex bytes.
    fn parse_mac(mac: &str) -> Option<u64> {
        let mut v: u64 = 0;
        let mut n = 0;
        for part in mac.split(':') {
            v = (v << 8) | u8::from_str_radix(part, 16).ok()? as u64;
            n += 1;
        }
        if n == 6 { Some(v) } else { None }
    }

    /// Last-resort name lookup: ask Windows for the name it already holds
    /// for this device, when no advertisement has carried a Local Name.
    ///
    /// Some devices simply never put AD 0x08/0x09 on the air — neither in
    /// the ADV_IND nor in the SCAN_RSP — so the watcher above has nothing to
    /// parse no matter how long it scans.  Windows still usually knows the
    /// name: it keeps a per-address device cache filled from advertisements
    /// it has seen (including in earlier sessions, before pfodProxy was even
    /// running) and from pairing.
    ///
    /// `FromBluetoothAddressAsync` resolves against that cache and does NOT
    /// open a connection — a GATT link is only established when services are
    /// requested with an uncached mode — so this is safe to call in the
    /// middle of a running scan, costs nothing on the radio, and cannot
    /// disturb a device another app is talking to.  That is the whole reason
    /// to prefer it over reading GATT 0x2A00, which needs a real connection
    /// and was removed from ble.rs for returning the firmware default name.
    ///
    /// Every failure path collapses to None — unknown address, empty cached
    /// name, or any WinRT error — because all of them mean the same thing to
    /// the caller: no name available, carry on.
    pub async fn lookup_cached_name(mac: &str) -> Option<String> {
        let addr_u64 = parse_mac(mac)?;
        let dev = BluetoothLEDevice::FromBluetoothAddressAsync(addr_u64)
            .ok()?
            .await
            .ok()?;
        let name = dev.Name().ok()?.to_string();
        // Windows returns an empty string, not an error, for a device it has
        // no name for.
        if name.is_empty() { None } else { Some(name) }
    }
}

// ── macOS ─────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use std::ffi::CString;
    use std::os::raw::{c_char, c_void};
    use std::sync::Arc;

    use objc2::{declare_class, msg_send_id, mutability, rc::Retained, ClassType, DeclaredClass};
    use objc2::runtime::{AnyObject, ProtocolObject};
    use objc2_foundation::{
        NSMutableDictionary, NSNumber, NSObject, NSObjectProtocol, NSString,
    };
    use objc2_core_bluetooth::{
        CBAdvertisementDataLocalNameKey, CBCentralManager, CBCentralManagerDelegate,
        CBCentralManagerScanOptionAllowDuplicatesKey, CBManagerState, CBPeripheral,
    };

    // libdispatch — already linked via btleplug's corebluetooth backend.
    extern "C" {
        fn dispatch_queue_create(
            label: *const c_char,
            attr:  *const c_void,
        ) -> *mut c_void;
    }

    // ── ObjC delegate class ──────────────────────────────────────────

    declare_class!(
        struct NameDelegate;

        unsafe impl ClassType for NameDelegate {
            type Super      = NSObject;
            type Mutability = mutability::InteriorMutable;
            const NAME: &'static str = "PfodProxyBLENameDelegate";
        }

        impl DeclaredClass for NameDelegate {
            // Arc so the ivar is Clone and the sender can be used from the
            // dispatch-queue callback thread without consuming it.
            type Ivars = Arc<UnboundedSender<NameUpdate>>;
        }

        unsafe impl NSObjectProtocol for NameDelegate {}

        unsafe impl CBCentralManagerDelegate for NameDelegate {
            // Required delegate method — start scanning when the adapter is ready.
            #[method(centralManagerDidUpdateState:)]
            fn did_update_state(&self, central: &CBCentralManager) {
                if unsafe { central.state() } != CBManagerState::PoweredOn {
                    return;
                }
                // Allow duplicates so we receive every advertisement packet,
                // not just the first sighting.
                let mut opts = NSMutableDictionary::new();
                opts.insert_id(
                    unsafe { CBCentralManagerScanOptionAllowDuplicatesKey },
                    // NSMutableDictionary<NSString, AnyObject> — NSNumber
                    // must be cast up through its superclass chain.
                    Retained::into_super(Retained::into_super(Retained::into_super(
                        NSNumber::new_bool(true),
                    ))),
                );
                // nil service filter — scan for all BLE devices so we catch
                // the local name even before btleplug has classified a
                // peripheral as NUS-advertising.
                unsafe {
                    central.scanForPeripheralsWithServices_options(None, Some(&*opts));
                }
            }

            #[method(centralManager:didDiscoverPeripheral:advertisementData:RSSI:)]
            fn did_discover(
                &self,
                _central:  &CBCentralManager,
                peripheral: &CBPeripheral,
                adv_data:  &objc2_foundation::NSDictionary<NSString, AnyObject>,
                _rssi:     &NSNumber,
            ) {
                // Read CBAdvertisementDataLocalNameKey directly from the
                // advertisement packet.  This matches what Chrome and
                // nRFConnect report; btleplug may return the cached GATT
                // 0x2A00 name for previously-connected devices instead.
                let name = adv_data
                    .get(unsafe { CBAdvertisementDataLocalNameKey })
                    .map(|v| v as *const AnyObject as *const NSString)
                    .and_then(|p| unsafe { p.as_ref() })
                    .map(|s| s.to_string());

                if let Some(name) = name {
                    // Peripheral identifier on macOS is a UUID string; lower-
                    // case to match btleplug's PeripheralId::to_string() format.
                    let addr = unsafe { peripheral.identifier() }
                        .UUIDString()
                        .to_string()
                        .to_lowercase();
                    let _ = self.ivars().send((addr, name));
                }
            }
        }
    );

    impl NameDelegate {
        fn new(tx: Arc<UnboundedSender<NameUpdate>>) -> Retained<Self> {
            let this = Self::alloc().set_ivars(tx);
            unsafe { msg_send_id![super(this), init] }
        }
    }

    // ── SendWrappers ─────────────────────────────────────────────────
    //
    // Retained<CBCentralManager> and Retained<NameDelegate> are !Send
    // because the ObjC type system carries no thread-affinity guarantee.
    // Both objects are only ever accessed from the dedicated serial
    // dispatch queue created below, so crossing the Send boundary is safe.
    struct SendManager(Retained<CBCentralManager>);
    unsafe impl Send for SendManager {}

    #[allow(dead_code)]
    struct SendDelegate(Retained<NameDelegate>);
    unsafe impl Send for SendDelegate {}

    // ── Public NameWatcher ───────────────────────────────────────────

    pub struct NameWatcher {
        manager:   SendManager,
        _delegate: SendDelegate,
    }

    impl NameWatcher {
        pub fn start(tx: UnboundedSender<NameUpdate>) -> Result<Self, std::io::Error> {
            let delegate = NameDelegate::new(Arc::new(tx));

            // Serial queue — matches btleplug's own "CBqueue" pattern.
            let label = CString::new("pfodProxy.ble.names")
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            let queue = unsafe {
                dispatch_queue_create(label.as_ptr(), std::ptr::null())
            };

            let manager: Retained<CBCentralManager> = unsafe {
                msg_send_id![
                    CBCentralManager::alloc(),
                    initWithDelegate: ProtocolObject::<dyn CBCentralManagerDelegate>::from_ref(&*delegate),
                    queue: queue
                ]
            };

            Ok(NameWatcher {
                manager:   SendManager(manager),
                _delegate: SendDelegate(delegate),
            })
        }
    }

    impl Drop for NameWatcher {
        fn drop(&mut self) {
            unsafe { self.manager.0.stopScan() };
        }
    }

    /// No cached-name fallback on macOS.  CoreBluetooth never exposes a MAC
    /// (peripherals are identified by an opaque per-host UUID), so there is
    /// no address to look a cached name up by — and the cached name is
    /// exactly what we are deliberately avoiding here: macOS substitutes the
    /// GATT 0x2A00 device-name for previously-connected peripherals, which
    /// is the wrong name and the reason this watcher exists at all.
    pub async fn lookup_cached_name(_addr: &str) -> Option<String> {
        None
    }
}

// ── Linux / other ────────────────────────────────────────────────────

#[cfg(not(any(windows, target_os = "macos")))]
mod imp {
    use super::*;
    pub struct NameWatcher;
    impl NameWatcher {
        pub fn start(_tx: UnboundedSender<NameUpdate>) -> Result<Self, std::io::Error> {
            // BlueZ via btleplug reliably surfaces scan-response local names.
            Ok(NameWatcher)
        }
    }

    /// No cached-name fallback needed: BlueZ already exposes the name via
    /// btleplug's `local_name`, so a device with no name here genuinely
    /// never advertised one.
    pub async fn lookup_cached_name(_addr: &str) -> Option<String> {
        None
    }
}

pub use imp::{lookup_cached_name, NameWatcher};
