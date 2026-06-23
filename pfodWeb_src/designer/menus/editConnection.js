/*
 * designer/menus/editConnection.js
 *
 * Handlers for the Connection picker reached from editMenu's
 * "Connection" row.  Two pfod cmd bytes:
 *
 *   'z'              — Connection picker entry / submit
 *       {z}          → render either the connection picker (multi-
 *                      transport boards) or the baud picker (serial-
 *                      only boards) depending on board.connections.
 *       {zs`<idx>}   → connection picker submit.  Updates state.connection;
 *                      if Serial was picked, queues a follow-on `{y}` so
 *                      the user lands on the baud picker after the auto
 *                      back-nav to editMenu.  For BLE/TCP/HTTP the
 *                      auto back-nav lands the user back on editMenu
 *                      with the new transport label.
 *
 *   'y'              — Baud picker entry / submit
 *       {y}          → render the baud picker for the current board.
 *       {ys`<idx>}   → baud picker submit.  Updates state.baud; auto
 *                      back-nav returns to editMenu with the new baud
 *                      label.
 *
 * The button-list order on the connection picker matches the user-
 * stated requirement: Serial, BLE, TCP/IP Socket, HTTP.  Only
 * transports present in board.connections are rendered, so AVR boards
 * (serial-only) skip the connection picker entirely and go straight
 * to the baud picker.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerEditConnection = (() => {

  /// Connection ids in the order the user wants them shown.  Each id
  /// must match a key in board.connections; ids whose key is absent
  /// on the current board are filtered out before the picker renders.
  const CONNECTION_ORDER = Object.freeze(['serial', 'ble', 'tcp', 'http']);

  /// Display labels for each connection id.  Used by both the picker
  /// (button labels) and editMenu (Connection row summary).
  const CONNECTION_LABELS = Object.freeze({
    serial: 'Serial',
    ble:    'BLE',
    tcp:    'TCP/IP Socket',
    http:   'HTTP',
  });

  /// Filter CONNECTION_ORDER down to ids the current board supports.
  /// Always includes 'serial' because BoardLoader requires it.
  function _supportedConnections(board) {
    return CONNECTION_ORDER.filter((id) => board.connections[id] !== undefined);
  }

  /// Render the connection picker.  Initial idx points at the
  /// currently-selected connection so the user can see what's active.
  function _renderConnectionPicker(state) {
    const supported = _supportedConnections(state.board);
    const currIdx   = Math.max(0, supported.indexOf(state.connection));
    let out = '{?zs`' + currIdx + '~' + DESIGNER_PROMPT_FMT +
              'Select Connection';
    for (const id of supported) {
      out += '|' + CONNECTION_LABELS[id];
    }
    out += '}';
    return out;
  }

  /// Render the baud picker.  Initial idx points at the currently-
  /// selected baud so the user can see what's active.
  function _renderBaudPicker(state) {
    const bauds   = state.board.connections.serial.supportedBauds;
    const currIdx = Math.max(0, bauds.indexOf(state.baud));
    let out = '{?ys`' + currIdx + '~' + DESIGNER_PROMPT_FMT +
              'Select Baud Rate';
    for (const b of bauds) {
      out += '|' + b;
    }
    out += '}';
    return out;
  }

  /// Parse the trailing `<idx>}` portion of a picker submit.  Returns
  /// the integer or null when no valid digits are found.  argStart
  /// must point at the backtick byte (rawCmd[argStart] === '`').
  function _parseSubmitIdx(rawCmd, argStart) {
    if (rawCmd[argStart] !== '`') return null;
    const idx = parseInt(rawCmd.substring(argStart + 1, rawCmd.length - 1), 10);
    return isNaN(idx) ? null : idx;
  }

  /// Dispatch handler for 'z' (Connection picker entry/submit).
  ///   bare {z}      → render picker (connection or baud depending on board)
  ///   {zs`<idx>}    → apply connection pick + maybe queue baud picker
  function sendConnection(rawCmd, state, depth) {
    if (rawCmd[depth + 1] === 's') {
      const idx = _parseSubmitIdx(rawCmd, depth + 2);
      console.error('[CONN_DBG] sendConnection submit rawCmd=', rawCmd, 'idx=', idx);
      if (idx === null) return PFOD_EMPTY;
      const supported = _supportedConnections(state.board);
      const picked    = supported[idx];
      if (!picked) {
        console.error('[CONN_DBG] no connection at idx', idx, 'supported=', supported);
        return PFOD_EMPTY;
      }
      console.error('[CONN_DBG] state.connection', state.connection, '→', picked);
      state.connection = picked;
      // Explicit save — auto-save skips PFOD_EMPTY so without this the
      // picked connection would be visible in-session but lost on reload.
      state.save();
      if (picked === 'serial') {
        return { pfod: _renderBaudPicker(state), skipSave: true };
      }
      return PFOD_EMPTY;
    }
    const supported = _supportedConnections(state.board);
    if (supported.length === 1) {
      return { pfod: _renderBaudPicker(state), skipSave: true };
    }
    return { pfod: _renderConnectionPicker(state), skipSave: true };
  }

  /// Dispatch handler for 'y' (Baud picker entry/submit).
  ///   bare {y}      → render baud picker
  ///   {ys`<idx>}    → apply baud pick; auto back-nav returns to editMenu
  function sendBaud(rawCmd, state, depth) {
    if (rawCmd[depth + 1] === 's') {
      const idx = _parseSubmitIdx(rawCmd, depth + 2);
      console.error('[CONN_DBG] sendBaud submit rawCmd=', rawCmd, 'idx=', idx);
      if (idx === null) return PFOD_EMPTY;
      const bauds  = state.board.connections.serial.supportedBauds;
      const picked = bauds[idx];
      if (picked === undefined) {
        console.error('[CONN_DBG] no baud at idx', idx, 'bauds=', bauds);
        return PFOD_EMPTY;
      }
      console.error('[CONN_DBG] state.baud', state.baud, '→', picked);
      state.baud = picked;
      // Explicit save — dispatcher's auto-save skips PFOD_EMPTY responses
      // (designer/index.js:73), so without this the picked baud would
      // be visible in-session but lost on reload.
      state.save();
      return PFOD_EMPTY;
    }
    return { pfod: _renderBaudPicker(state), skipSave: true };
  }

  /// Compute the human-readable summary shown on editMenu's Connection
  /// row.  Serial shows the baud; the other transports just show the
  /// transport name (per-transport config will land later).
  function summaryForEditMenu(state) {
    console.error('[CONN_DBG] summaryForEditMenu connection=', state.connection, 'baud=', state.baud);
    if (state.connection === 'serial') {
      return 'Serial @ ' + state.baud + ' baud';
    }
    return CONNECTION_LABELS[state.connection] || state.connection;
  }

  return Object.freeze({
    sendConnection,
    sendBaud,
    summaryForEditMenu,
  });
})();

// Self-register both cmd bytes into the top-level designer dispatcher.
DesignerDispatch.add('z', DesignerEditConnection.sendConnection);
DesignerDispatch.add('y', DesignerEditConnection.sendBaud);
