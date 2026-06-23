// state.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// Shared application state.  Per-transport state lives behind
// `tokio::sync::Mutex` so the background reader tasks and the
// foreground HTTP handler don't race.
//
// All-SSE architecture (see ../README.md):
//   * Device-output bytes flow from the reader task to every active
//     SSE subscriber via a `broadcast::Sender<Bytes>`.  No shared
//     buffer — bytes are pushed, not pulled.
//   * The handler thread writes cmds via the split `writer` half;
//     responses appear on the SSE stream because the reader pumps
//     every byte (cmd response, streaming data, anything) into the
//     broadcast.
//   * `cancel_tx` signals the reader task to exit cleanly when the
//     session is torn down (`{!}`).
//
// The Python proxy's `pending_responses_by_dedup` cache and non-pfod
// pushback are gone — they only existed to handle the dataRefresh-vs-
// cmd race that the streaming-byte model removes by construction.
//
// Multi-target sessions: each transport holds a map of independent
// sessions keyed by device target (serial path / (ip, port) / BLE addr)
// rather than a single global slot.  This is what lets one window stay
// connected to one serial port while another window connects to a
// different one — opening target B no longer has any reason to touch
// target A's session, since they live in different map entries.  The
// outer map `Mutex` is only ever held for the brief lookup/insert in
// `get_or_create_*`, never nested with anything else, so it can't
// contribute to a deadlock; each session's own `open_lock` / `state`
// stay local to that one target.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{broadcast, Mutex};
use tokio_serial::SerialStream;

/// Channel capacity for the device-byte broadcast.  Subscribers that
/// fall behind by more than this many chunks get a `RecvError::Lagged`,
/// which the SSE handler can either log + skip or surface as an
/// SSE error event.  256 chunks is generous — at typical 4 KB / chunk
/// that's ~1 MB of in-flight buffering.
pub const BYTES_CHANNEL_CAP: usize = 256;

/// Top-level state struct.  Cheap to clone because everything inside
/// is behind `Arc` / `Mutex`.
pub struct AppState {
    /// One session per distinct serial path / (ip, port) / BLE addr
    /// currently known.  Entries are never removed once created (see
    /// `get_or_create_*`) — closed sessions just sit with
    /// `connected = false`, ready to be reopened.
    pub serial: Mutex<HashMap<String, Arc<SerialSession>>>,
    pub tcp:    Mutex<HashMap<(String, u16), Arc<TcpSession>>>,
    pub ble:    Mutex<HashMap<String, Arc<BleSession>>>,

    /// Shared BLE adapter handle, lazily initialised on first use and
    /// kept alive for the proxy's lifetime.  This is an OS-level
    /// resource (the Bluetooth radio), not a per-device session, so it
    /// lives here rather than inside any one `BleSession` — every BLE
    /// target shares the same adapter/scan cache.
    pub ble_central: Mutex<Option<btleplug::platform::Adapter>>,

    /// Timestamp of the most recent incoming request of any kind, touched
    /// by a global middleware in main.rs.  spawn_idle_logger() (main.rs)
    /// watches this and logs when it's been idle too long — every open
    /// pfodWeb window polls `/ping` every 5s as a heartbeat regardless of
    /// protocol (see checkProxyAvailability() in pfodCommon.html), so
    /// sustained silence here means every window is genuinely gone (or at
    /// least frozen/backgrounded long enough not to matter). Purely
    /// informational — pfodProxy doesn't act on this at all, just logs the
    /// idle/active transition; see spawn_idle_logger()'s doc comment for
    /// why an earlier auto-shutdown-on-idle design was dropped.
    pub last_request: Mutex<Instant>,

    /// Set true by the same middleware once the very first request of any
    /// kind arrives. spawn_idle_logger() (main.rs) doesn't start timing
    /// idleness until this is true — without it, `last_request` starting
    /// at process-start time would mean a slow browser launch (cold start,
    /// antivirus scanning the fresh .exe, a slow --no-browser wrapper
    /// script) could log "idle" before anyone ever opened pfodWeb at all.
    pub has_seen_request: std::sync::atomic::AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            serial:           Mutex::new(HashMap::new()),
            tcp:              Mutex::new(HashMap::new()),
            ble:              Mutex::new(HashMap::new()),
            ble_central:      Mutex::new(None),
            last_request:     Mutex::new(Instant::now()),
            has_seen_request: std::sync::atomic::AtomicBool::new(false),
        }
    }

    /// Resolve (path) to its session, creating an empty one on first
    /// sight.  Cloning the `Arc` out of the map and dropping the map
    /// lock immediately means concurrent opens of two *different*
    /// paths never wait on each other.
    pub async fn get_or_create_serial(&self, path: &str) -> Arc<SerialSession> {
        self.serial
            .lock().await
            .entry(path.to_string())
            .or_insert_with(|| Arc::new(SerialSession::default()))
            .clone()
    }

    /// Resolve (ip, port) to its session — see `get_or_create_serial`.
    pub async fn get_or_create_tcp(&self, ip: &str, port: u16) -> Arc<TcpSession> {
        self.tcp
            .lock().await
            .entry((ip.to_string(), port))
            .or_insert_with(|| Arc::new(TcpSession::default()))
            .clone()
    }

    /// Resolve a BLE address to its session — see `get_or_create_serial`.
    /// Keyed lower-case so case differences in how an address is typed
    /// don't create two slots for one physical device.
    pub async fn get_or_create_ble(&self, addr: &str) -> Arc<BleSession> {
        self.ble
            .lock().await
            .entry(addr.to_ascii_lowercase())
            .or_insert_with(|| Arc::new(BleSession::default()))
            .clone()
    }
}

// ── per-target session wrappers ─────────────────────────────────────

/// One serial port's session: its state plus the lock that serialises
/// opens for *this target only*.  Bundling the two together (rather
/// than a separate map of locks) keeps "resolve target" a single
/// lookup that hands back everything `ensure_open` needs.
///
/// The open-lock's job: the connection-SSE and cmd-write requests for
/// a given target arrive simultaneously on first connect; both see
/// `connected=false` and both call `open_serial`, so the second open
/// hits "Access is denied" because the OS port is already held.  This
/// lock makes any second caller wait until the first open returns; by
/// then `connected=true` and the fast-path in `ensure_open` returns
/// immediately without re-opening.
#[derive(Default)]
pub struct SerialSession {
    pub state:     Mutex<SerialState>,
    pub open_lock: Mutex<()>,
}

/// One TCP target's session — see `SerialSession`.  Same race as
/// serial: connection-SSE and cmd-write both call `ensure_open`
/// concurrently; without the gate the second `TcpStream::connect`
/// races the first.  The window is smaller than serial (no DTR-reset
/// delay) but still real.
#[derive(Default)]
pub struct TcpSession {
    pub state:     Mutex<TcpState>,
    pub open_lock: Mutex<()>,
}

/// One BLE target's session — see `SerialSession`.  The connection SSE
/// handler spawns `ensure_open` in a tokio task while the SSE stream is
/// already producing progress events — meaning the cmd handler can
/// race in with its own `ensure_open` call before the SSE's open
/// completes.  Both attempts would try to GATT-connect the same
/// peripheral, and the second one closes the first's handle out from
/// under it ("HRESULT 0x80000013: The object has been closed.").  This
/// lock makes any second caller wait until the first open returns; by
/// then `connected=true` and the check at the top of `ensure_open`
/// short-circuits without re-opening.
#[derive(Default)]
pub struct BleSession {
    pub state:     Mutex<BleState>,
    pub open_lock: Mutex<()>,
}

// ── per-transport state ──────────────────────────────────────────────

/// Serial port session state.
///
/// The underlying SerialStream is split into a read half (owned by
/// the reader task) and a write half (held here, behind a Mutex,
/// for the handler to grab when sending cmds).  The reader broadcasts
/// every chunk it reads to `bytes_tx`; SSE handlers subscribe to
/// receive the device-byte stream.
///
/// `cancel_tx` is the cooperative-shutdown signal — `{!}` fires it,
/// the reader breaks its loop, drops the read half, and the underlying
/// SerialStream's `Drop` closes the OS handle once the writer is also
/// released.
#[derive(Default)]
pub struct SerialState {
    pub path:      Option<String>,
    pub baud:      Option<u32>,
    pub writer:    Option<Arc<Mutex<tokio::io::WriteHalf<SerialStream>>>>,
    pub bytes_tx:  Option<broadcast::Sender<Vec<u8>>>,
    pub connected: bool,
    pub cancel_tx: Option<tokio::sync::oneshot::Sender<()>>,
    /// Subscriber created in `open_serial` BEFORE the reader task is
    /// spawned, so the broadcast channel always has at least one
    /// receiver from the moment the port opens — bytes can't be
    /// dropped on the SendError path while the SSE handler is still
    /// racing to call `tx.subscribe()`.  Claimed by the first
    /// `handle_connection_stream` to attach (taken out of the Option);
    /// later attachers fall back to a fresh `tx.subscribe()`.
    pub initial_rx: Option<broadcast::Receiver<Vec<u8>>>,
    /// Set to true when this target is first opened so `open_serial`
    /// asserts DTR once — mirrors the Arduino IDE serial monitor, which
    /// resets the board on first connect.  Cleared immediately inside
    /// `open_serial` so reconnects after a USB-CDC re-enum do not
    /// trigger a second reset.
    pub needs_dtr_reset: bool,
}

/// TCP session state.  Same shape as serial — split halves + byte
/// broadcast + cancel signal.  TcpStream's owned split gives reader
/// and writer independent kernel-FD references.
#[derive(Default)]
pub struct TcpState {
    pub ip:        Option<String>,
    pub port:      Option<u16>,
    pub writer:    Option<Arc<Mutex<tokio::net::tcp::OwnedWriteHalf>>>,
    pub bytes_tx:  Option<broadcast::Sender<Vec<u8>>>,
    pub connected: bool,
    pub cancel_tx: Option<tokio::sync::oneshot::Sender<()>>,
    /// See `SerialState::initial_rx`.
    pub initial_rx: Option<broadcast::Receiver<Vec<u8>>>,
}

/// BLE session state.  `peripheral` is the platform-specific concrete
/// type from `btleplug::platform::Peripheral`; it's
/// `Clone + Send + Sync` internally so the notification task gets a
/// cheap clone.  NUS TX-characteristic notifications go through
/// `bytes_tx` the same way serial/TCP read chunks do — uniform
/// downstream consumption.
#[derive(Default)]
pub struct BleState {
    pub addr:       Option<String>,
    pub peripheral: Option<btleplug::platform::Peripheral>,
    pub bytes_tx:   Option<broadcast::Sender<Vec<u8>>>,
    pub connected:  bool,
    pub cancel_tx:  Option<tokio::sync::oneshot::Sender<()>>,
    /// See `SerialState::initial_rx`.
    pub initial_rx: Option<broadcast::Receiver<Vec<u8>>>,
}
