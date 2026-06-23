// ble_names.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// Parallel BLE advertisement watchers that recover device names from
// SCAN RESPONSE packets — names that btleplug's `properties.local_name`
// fails to surface correctly on Windows and macOS for some devices.
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
    use windows::Foundation::TypedEventHandler;
    use windows::Storage::Streams::DataReader;

    /// Holds the active watcher; stops it on drop so the discovery
    /// stream cleanly releases the radio when the SSE client closes.
    pub struct NameWatcher {
        watcher: BluetoothLEAdvertisementWatcher,
    }

    impl NameWatcher {
        pub fn start(tx: UnboundedSender<NameUpdate>) -> windows::core::Result<Self> {
            let watcher = BluetoothLEAdvertisementWatcher::new()?;
            watcher.SetScanningMode(BluetoothLEScanningMode::Active)?;

            let tx = Arc::new(tx);
            let handler = TypedEventHandler::new(
                move |_w: windows::core::Ref<BluetoothLEAdvertisementWatcher>,
                      args: windows::core::Ref<BluetoothLEAdvertisementReceivedEventArgs>|
                      -> windows::core::Result<()>
                {
                    let args = match args.as_ref() {
                        Some(a) => a,
                        None => return Ok(()),
                    };
                    if let Ok(Some((mac, name))) = parse_local_name(args) {
                        let _ = tx.send((mac, name));
                    }
                    Ok(())
                },
            );
            watcher.Received(&handler)?;
            watcher.Start()?;
            Ok(NameWatcher { watcher })
        }
    }

    impl Drop for NameWatcher {
        fn drop(&mut self) {
            let _ = self.watcher.Stop();
        }
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
}

pub use imp::NameWatcher;
