/*
 * designer/menus/editConnection.js
 *
 * Handlers for the Connection picker reached from editMenu's
 * "Connection" row.  One active pfod cmd byte:
 *
 *   'z'              — Connection picker entry / submit
 *       {z}          → render the connection picker (only reached when
 *                      the board has more than one transport — single-
 *                      transport boards show the row as a label so {z}
 *                      is never sent).
 *       {zs`<idx>}   → connection picker submit.  Updates state.connection;
 *                      for BLE/TCP/HTTP the auto back-nav lands the user
 *                      back on editMenu with the new transport label.
 *                      Serial is always 115200 — no baud picker is shown.
 *
 *   'y'              — Baud picker (no longer used — Serial is always 115200)
 *                      Code left in place but not registered with the dispatcher.
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

  // Baud picker — no longer used; Serial is always 115200.  Left in place
  // in case per-board baud selection is reinstated in future.
  // function _renderBaudPicker(state) {
  //   const bauds   = state.board.connections.serial.supportedBauds;
  //   const currIdx = Math.max(0, bauds.indexOf(state.baud));
  //   let out = '{?ys`' + currIdx + '~' + DESIGNER_PROMPT_FMT +
  //             'Select Baud Rate';
  //   for (const b of bauds) {
  //     out += '|' + b;
  //   }
  //   out += '}';
  //   return out;
  // }

  /// Parse the trailing `<idx>}` portion of a picker submit.  Returns
  /// the integer or null when no valid digits are found.  argStart
  /// must point at the backtick byte (rawCmd[argStart] === '`').
  function _parseSubmitIdx(rawCmd, argStart) {
    if (rawCmd[argStart] !== '`') return null;
    const idx = parseInt(rawCmd.substring(argStart + 1, rawCmd.length - 1), 10);
    return isNaN(idx) ? null : idx;
  }

  /// Dispatch handler for 'z' (Connection picker entry/submit).
  ///   bare {z}      → render connection picker (only reached for multi-transport boards)
  ///   {zs`<idx>}    → apply connection pick; Serial is always 115200, no baud picker
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
      // Serial is always 115200 — baud picker no longer shown after picking serial.
      // if (picked === 'serial') {
      //   return { pfod: _renderBaudPicker(state), skipSave: true };
      // }
      return PFOD_EMPTY;
    }
    // Single-connection boards render the row as a label so {z} is never
    // sent from them — always render the connection picker here.
    // if (supported.length === 1) {
    //   return { pfod: _renderBaudPicker(state), skipSave: true };
    // }
    return { pfod: _renderConnectionPicker(state), skipSave: true };
  }

  // Baud picker handler — no longer used; Serial is always 115200.
  // Left in place in case per-board baud selection is reinstated.
  // function sendBaud(rawCmd, state, depth) {
  //   if (rawCmd[depth + 1] === 's') {
  //     const idx = _parseSubmitIdx(rawCmd, depth + 2);
  //     console.error('[CONN_DBG] sendBaud submit rawCmd=', rawCmd, 'idx=', idx);
  //     if (idx === null) return PFOD_EMPTY;
  //     const bauds  = state.board.connections.serial.supportedBauds;
  //     const picked = bauds[idx];
  //     if (picked === undefined) {
  //       console.error('[CONN_DBG] no baud at idx', idx, 'bauds=', bauds);
  //       return PFOD_EMPTY;
  //     }
  //     console.error('[CONN_DBG] state.baud', state.baud, '→', picked);
  //     state.baud = picked;
  //     state.save();
  //     return PFOD_EMPTY;
  //   }
  //   return { pfod: _renderBaudPicker(state), skipSave: true };
  // }

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
    // sendBaud no longer registered — Serial is always 115200
    supportedConnections: _supportedConnections,
    connectionLabels:     CONNECTION_LABELS,
    summaryForEditMenu,
  });
})();

// Self-register the connection picker cmd byte.
DesignerDispatch.add('z', DesignerEditConnection.sendConnection);
// Baud picker no longer used — Serial is always 115200.
// DesignerDispatch.add('y', DesignerEditConnection.sendBaud);
