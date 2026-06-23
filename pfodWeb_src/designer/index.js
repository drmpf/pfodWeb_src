/*
 * designer/index.js
 *
 * DesignerVirtualDevice — in-browser pfod virtual device.  Plugged into
 * connectionManager.js's DesignerVirtualAdapter (transport='designer'),
 * processCmd() takes a raw pfod command, routes it through the per-menu
 * Dispatcher tree starting at the byte AFTER any `<version>:` prefix,
 * and returns the device's pfod response.
 *
 * Construction:
 *   new DesignerVirtualDevice(board)
 *     board — a BaseBoard instance (e.g. BoardLoader.load(UnoData)).
 *             REQUIRED — the designer always has a board.
 *   The internal DesignerState is constructed via newDefault(board),
 *   which auto-loads any persisted state under the most-recently-used
 *   design name (or "Menu_1" if none saved yet).
 *
 * Auto-save: processCmd() calls state.save() AFTER a real dispatched
 * response (anything other than PFOD_NO_REPLY '' or PFOD_EMPTY '{}'),
 * unless the handler returned { pfod, skipSave: true } to opt out.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

class DesignerVirtualDevice {
  /// @param {BaseBoard} board — REQUIRED; throws if missing.
  constructor(board) {
    if (!board) throw new Error('[DesignerVirtualDevice] constructor: board is required');
    this.state = DesignerState.newDefault(board);
  }

  /// Route one pfod cmd through the designer.  Handles version-prefix
  /// stripping (via parseVersion), dispatch (via DesignerDispatch),
  /// and auto-save.
  ///
  /// @param {string} rawCmd — full pfod command sent by pfodWeb
  /// @returns {string} pfod response.  PFOD_NO_REPLY ('') on malformed
  ///                   input or bad handler return; PFOD_EMPTY ('{}') on
  ///                   no-route / terminator; otherwise the handler's
  ///                   full pfod message.
  /// Always returns Promise<string>.  Promise.resolve() transparently
  /// handles both synchronous handler results (string / {pfod,skipSave})
  /// and asynchronous ones (Promise from loadFromFile) with no branching.
  processCmd(rawCmd) {
    if (typeof rawCmd !== 'string') {
      console.error('[DesignerVirtualDevice] processCmd: rawCmd must be a string, got:',
                    typeof rawCmd);
      return Promise.resolve(PFOD_NO_REPLY);
    }
    const parsed = parseVersion(rawCmd);
    return Promise.resolve(DesignerDispatch.dispatch(rawCmd, this.state, parsed.cmdStart))
      .then(result => this._normalizeResult(result));
  }

  /// Normalise handler return: plain string OR {pfod, skipSave}.
  /// Applies auto-save and returns the pfod string.
  _normalizeResult(result) {
    let pfod;
    let skipSave = false;
    if (typeof result === 'string') {
      pfod = result;
    } else if (result && typeof result.pfod === 'string') {
      pfod     = result.pfod;
      skipSave = !!result.skipSave;
    } else {
      console.warn('[DesignerVirtualDevice] bad dispatch result shape:', result);
      return PFOD_NO_REPLY;
    }
    if (pfod !== PFOD_NO_REPLY && pfod !== PFOD_EMPTY && !skipSave) {
      this.state.save();
    }
    return pfod;
  }
}
