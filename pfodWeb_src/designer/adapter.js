/*
 * designer/adapter.js
 *
 * DesignerVirtualAdapter — ConnectionManager-facing transport adapter
 * for the in-browser virtual pfod device.  Bypasses the wire entirely:
 * pfod cmds go straight into a DesignerVirtualDevice (see
 * designer/index.js) which routes them through DesignerDispatch and
 * returns a pfod response string.  No connect() / disconnect() phase;
 * the device is constructed fully-formed by the adapter.
 *
 * Board is chosen via the Target picker on the connection panel.  The
 * id is stored by boardSelector.js (getCurrentTargetId()) and persisted
 * in the URL as ?designer=<id>; here we look the data up via
 * BOARD_DATA_BY_ID.  Falls back to UnoData when no current target /
 * registry is present (defensive — keeps the MVP behaviour for any
 * code path that constructs the adapter before the picker is wired).
 *
 * Globals consumed at construction time (must all be present in the
 * bundle by the time `new DesignerVirtualAdapter(...)` runs):
 *   PfodConnectionBase     (connectionManager.js)
 *   BoardLoader            (designer/boards/shared/BoardLoader.js)
 *   BOARD_DATA_BY_ID       (auto-generated registry, build-bundle.js)
 *   getCurrentTargetId()   (designer/boardSelector.js)
 *   UnoData                (designer/boards/Uno/Uno.json, JSON-wrapped by build)
 *   DesignerVirtualDevice  (designer/index.js)
 *
 * Lives under designer/ so the entire designer subsystem stays
 * self-contained — connectionManager.js just dispatches via the
 * 'designer' protocol case to `new DesignerVirtualAdapter(...)`.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

class DesignerVirtualAdapter extends PfodConnectionBase {
  /// @param {object}            config  — connection config (unused for now;
  ///                                       will carry board choice later)
  /// @param {ConnectionManager} manager — parent for cross-adapter callbacks
  constructor(config, manager) {
    super();
    this.protocol = 'designer';
    this.manager  = manager;
    // Shared parser state — same fields Serial / HTTP adapters expose,
    // so the inherited processIncoming() / processReadBuffer() pipeline
    // behaves identically (CSV + rawData collectors + pfod parser).
    this.readBuffer      = '';
    this.responseResolve = null;
    this.responseReject  = null;
    this._respCallbacks  = null;
    // Resolve the current target id via boardSelector.js → look its
    // pre-inlined data up in BOARD_DATA_BY_ID → hand it to BoardLoader.
    // Falls back to avr_unoData when either the picker isn't loaded yet or
    // the id has been removed from the bundle (stale URL ?designer=…
    // pointing at a deleted board).  Logging the chosen id makes
    // mismatches between the panel label and the runtime board easy to
    // spot when debugging.
    const targetId  = (typeof getCurrentTargetId === 'function') ? getCurrentTargetId() : null;
    const boardData =
      (targetId && typeof BOARD_DATA_BY_ID !== 'undefined' && BOARD_DATA_BY_ID[targetId])
        ? BOARD_DATA_BY_ID[targetId]
        : avr_unoData;
    console.log('[DesignerVirtualAdapter] target id:', targetId, '→ board:', boardData.name);
    const board = BoardLoader.load(boardData);
    this.device = new DesignerVirtualDevice(board);
  }

  /// Send one pfod cmd.  The designer device emits a raw pfod text
  /// response synchronously, which we feed through the inherited
  /// processIncoming() pipeline — same as Serial/BLE byte streams.
  /// That pipeline routes any inter-message raw data to the CSV /
  /// rawData collectors and resolves the promise with the JSON-wrapped
  /// pfod when a complete `{…}` is found.  No connect phase, no async
  /// reader loop — the response is fully available immediately after
  /// the device call.
  /// processCmd() always returns Promise<string>; we simply await it.
  /// _handleResponse() contains the post-response pipeline shared by
  /// both the normal and the async (file-picker) path.
  send(cmd) {
    return new Promise((resolve, reject) => {
      this.responseResolve = resolve;
      this.responseReject  = reject;
      if (ConnectionManager.messageCollector) {
        ConnectionManager.messageCollector.addMessage('sent', cmd, 'designer');
      }
      this.device.processCmd(cmd)
        .then(pfodResponse => this._handleResponse(pfodResponse))
        .catch(err => {
          if (this.responseReject) {
            const r = this.responseReject;
            this.responseResolve = null;
            this.responseReject  = null;
            r(err);
          }
        });
    });
  }

  /// Feed pfodResponse through the inherited pipeline and settle the
  /// outer Promise created in send().
  _handleResponse(pfodResponse) {
    // processIncoming runs the CSV / raw-data collectors AND the
    // pfod parser; when the parser finds a complete `{…}` it calls
    // this.responseResolve(jsonString) and the promise settles.
    this.processIncoming(pfodResponse);

    if (!this.responseResolve) return;  // already resolved by processReadBuffer

    if (this.readBuffer.length > 0) {
      // Partial message — the designer is in-browser so a missing `}`
      // always means a handler bug, not a network issue.  Reject
      // immediately rather than leaving the queue blocked.
      const r = this.responseReject;
      if (this.readBuffer.length > 0 && ConnectionManager.messageCollector) {
        ConnectionManager.messageCollector.addMessage('timeout', this.readBuffer, this.protocol);
      }
      this.readBuffer      = '';
      this.responseResolve = null;
      this.responseReject  = null;
      r(new Error('designer response missing closing } — handler bug'));
    } else {
      // PFOD_NO_REPLY — device returned nothing.  Resolve immediately
      // with '' so the queue moves on.
      const r = this.responseResolve;
      this.responseResolve = null;
      this.responseReject  = null;
      r('');
    }
  }

  /// No connect phase — the device is always available.  Kept as a
  /// no-op for adapter-interface uniformity.
  async connect() { /* no-op */ }

  /// No disconnect phase — the device has no resources to release.
  async disconnect() { /* no-op */ }
}

// Expose globally so connectionManager.js's `case 'designer'` branch
// in initializeAdapter() can resolve the reference at runtime.
window.DesignerVirtualAdapter = DesignerVirtualAdapter;
