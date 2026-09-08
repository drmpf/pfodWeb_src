/*
 * targetPrompt.js
 * (c)2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Exports:    window.DesignerTargetPrompt
// Depends on: DesignerState (targetMismatch), getCurrentTargetId /
//             setCurrentTargetId / updateURLFromForm (boardSelector.js +
//             pfodCommon.html), BOARD_DATA_BY_ID (built board registry)
// Called by:  designer/menus/loadFromFile.js, dwgDesigner/dwgControlsPanelUI.js
//
// The "this design was built for another board" prompt, shown when a menu
// design is loaded whose recorded target is not the one now selected.
//
// WHY A DOM MODAL RATHER THAN A pfod SCREEN
// -----------------------------------------
// Both load paths need it — Load Design (a pfod screen inside the designer)
// and the Dwg Controls Panel's zip load (plain DOM) — and one shared modal is
// the only thing that looks the same on both. It also has to offer an action
// the designer's own menu system cannot: changing the target is done OUTSIDE
// the designer, on the connection screen, so a pfod menu button would be
// promising something the protocol has no way to deliver.
//
// WHY IT IS ASKED BEFORE THE IMPORT
// ---------------------------------
// importFromObject clears every pin the current board does not have. Ask
// afterwards and the choice is already void: the design has been stripped,
// and "switch target and reload" would reload the stripped copy. See
// DesignerState.targetMismatch.
//
// WHY SWITCHING DOES NOT JUST WORK
// --------------------------------
// The designer's board is fixed when connectionManager builds
// DesignerVirtualAdapter (`new DesignerVirtualDevice(board)`), and nothing
// rebuilds it. setCurrentTargetId() updates the stored id and the URL only,
// which is why the board picker lives on the connection screen — before the
// designer starts. So switching here sets the target and tells the user to
// reopen; it cannot re-target a running designer, and pretending otherwise
// would leave the designer on one board while the target said another.

const DesignerTargetPrompt = (() => {

  /// The board registry id for a board's display name, or null.
  /// A design records the NAME ("FireBeetle 2 ESP32-E"); setCurrentTargetId
  /// takes the id. Nothing stores the reverse mapping, so it is a scan —
  /// over a few hundred entries, once, on a load the user is already waiting
  /// on.
  /// @param {string} name
  /// @returns {string|null}
  function _idForBoardName(name) {
    if (typeof BOARD_DATA_BY_ID === 'undefined' || !BOARD_DATA_BY_ID) return null;
    const ids = Object.keys(BOARD_DATA_BY_ID);
    for (let i = 0; i < ids.length; i++) {
      const d = BOARD_DATA_BY_ID[ids[i]];
      if (d && d.name === name) return ids[i];
    }
    return null;
  }

  /// One button, styled like pfodAlert's own Close so the two modals read as
  /// the same app.
  /// @param {string} label
  /// @param {boolean} primary — filled (green) vs outlined
  /// @param {function} onClick
  /// @returns {HTMLButtonElement}
  function _button(label, primary, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText =
      'padding:10px 22px;border-radius:5px;font-size:15px;font-weight:bold;' +
      'cursor:pointer;font-family:Arial, sans-serif;margin:0 6px;' +
      (primary
        ? 'background-color:#4CAF50;color:white;border:none;'
        : 'background-color:white;color:#333;border:1px solid #b9c3d0;');
    b.onclick = onClick;
    return b;
  }

  /// Ask which board to import this design against.
  ///
  /// Resolves 'load' (import against the board now selected) or 'switch'
  /// (target changed; the user has been told to reopen the designer and load
  /// the file again). Never rejects: a prompt the caller cannot resolve
  /// would strand the load.
  ///
  /// @param {{designBoard: string, currentBoard: string}} mismatch
  /// @param {string} fileName — what the user picked, for the heading
  /// @param {function} [onSwitch] — run just before the target changes, to
  ///        save whatever design is currently open. See the caller: the
  ///        open design is about to have its own pins cleared against the
  ///        new target on the next edit, and saving first keeps the stored
  ///        copy intact.
  /// @returns {Promise<'load'|'switch'>}
  function ask(mismatch, fileName, onSwitch) {
    return new Promise((resolve) => {
      const switchId = _idForBoardName(mismatch.designBoard);

      const overlay = document.createElement('div');
      overlay.id = 'designer-target-prompt';
      overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background-color:rgba(0,0,0,0.5);display:flex;align-items:flex-start;' +
        'justify-content:center;padding-top:120px;z-index:10001;';

      const modal = document.createElement('div');
      modal.style.cssText =
        'background-color:white;border-radius:10px;' +
        'box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:560px;width:90%;' +
        'overflow:hidden;';

      const titleBar = document.createElement('div');
      titleBar.style.cssText =
        'background-color:#4CAF50;color:white;padding:15px 20px;font-size:18px;' +
        'font-weight:bold;font-family:Arial, sans-serif;';
      titleBar.textContent = 'Different target board';

      const body = document.createElement('div');
      body.style.cssText =
        'padding:20px;font-family:Arial, sans-serif;font-size:14px;' +
        'line-height:1.6;color:#333;';
      // textContent per line, not innerHTML: the file name and both board
      // names are free text out of a loaded file.
      const line = (text, bold) => {
        const p = document.createElement('p');
        p.style.cssText = 'margin:0 0 10px 0;' + (bold ? 'font-weight:bold;' : '');
        p.textContent = text;
        return p;
      };
      body.appendChild(line('"' + fileName + '" was built for ' + mismatch.designBoard +
                            '. The designer is set to ' + mismatch.currentBoard + '.', true));
      body.appendChild(line('Load on ' + mismatch.currentBoard +
        ' — any pin this board does not have is cleared, and ADC ranges are ' +
        're-derived for it. The design opens, but its pin assignments do not survive.'));
      if (switchId) {
        body.appendChild(line('Switch to ' + mismatch.designBoard +
          ' — the target is changed and the design currently open is saved first. ' +
          'The designer has to be reopened for the new target to take effect, so ' +
          'close it, start again, and load this file once more.'));
      } else {
        // The design names a board this build does not carry. Say so rather
        // than offering a switch that would silently do nothing.
        body.appendChild(line(mismatch.designBoard + ' is not a board this copy of ' +
          'pfodWeb knows, so it cannot be selected. Loading on ' +
          mismatch.currentBoard + ' is the only option here.'));
      }
      // Where the old-target version went. Only the restore path takes this
      // copy up front — the file paths have not touched the open design yet,
      // and take theirs only if the target actually changes. A copy the user
      // is not told about is not much of a backup.
      if (mismatch.savedAs) {
        body.appendChild(line('The ' + mismatch.designBoard + ' version has been saved to your downloads as "' +
          mismatch.savedAs + '" — load it back once the right target is selected.'));
      }

      const buttons = document.createElement('div');
      buttons.style.cssText = 'padding:0 20px 20px 20px;text-align:center;';

      const finish = (answer) => {
        if (overlay.parentNode) document.body.removeChild(overlay);
        resolve(answer);
      };

      buttons.appendChild(_button('Load on ' + mismatch.currentBoard, true,
        () => finish('load')));
      if (switchId) {
        buttons.appendChild(_button('Switch to ' + mismatch.designBoard, false, () => {
          // Save BEFORE the target moves. The open design keeps its pins in
          // storage even though the running designer will clear them against
          // the new board on the next edit (designer/index.js saves after
          // every dispatch that is not {} or no-reply).
          try { if (typeof onSwitch === 'function') onSwitch(); }
          catch (e) { console.warn('[TARGET_PROMPT] could not save the open design:', e); }
          setCurrentTargetId(switchId);
          if (typeof updateURLFromForm === 'function') updateURLFromForm();
          console.log('[TARGET_PROMPT] target switched to "' + mismatch.designBoard +
                      '" (' + switchId + ') — designer must be reopened');
          finish('switch');
        }));
      }

      modal.appendChild(titleBar);
      modal.appendChild(body);
      modal.appendChild(buttons);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    });
  }

  /// Record that the user has accepted `board` for everything.
  ///
  /// Called on every "Load on <board>" answer, from all three places the
  /// question is asked. Answering it is a decision about the machine, not
  /// about the one design in front of the user: there is one target, and
  /// every design is for it. Leaving the others on their old board just
  /// means the same question again the next time each of them is opened —
  /// which is what was happening, over and over.
  ///
  /// Every design that is about to move is written to disk FIRST, because
  /// after the move its old pins are gone. Nothing is written twice: a
  /// version already on disk carries a mark saying so.
  ///
  /// @param {object} board — the board object that was accepted
  /// @param {DesignerState} [openState] — the design open in the designer,
  ///        so its unsaved edits are kept rather than rebuilt from storage
  /// @returns {string[]} the designs moved onto it
  function adoptCurrentTarget(board, openState) {
    if (!board || !board.name) return [];
    preserveAllNotOn(board.name);
    let moved = [];
    try { moved = DesignerState.adoptTarget(board, openState); }
    catch (e) { console.warn('[TARGET_PROMPT] could not adopt ' + board.name + ':', e); }
    if (moved.length > 0) {
      console.log('[TARGET_PROMPT] ' + board.name + ' accepted — retargeted ' +
                  moved.length + ' design(s): ' + moved.join(', '));
    }
    return moved;
  }

  /// Leave the designer, so the new target can take effect.
  ///
  /// A target change is inert until the designer's adapter is rebuilt, and
  /// the place a target is chosen is the connection screen — which is where
  /// {!} lands the user. So switching does not merely advise reopening, it
  /// takes them out. Staying put would leave a designer running on the board
  /// the user just said was the wrong one.
  ///
  /// Fire-and-forget: {!} is handled by connectionManager without waiting on
  /// a device response, and the caller is on its way out anyway.
  function exitDesigner() {
    try {
      window.drawingViewer.addToRequestQueue('{!}', null, null, 'exitAbort');
    } catch (e) {
      console.warn('[TARGET_PROMPT] could not exit the designer:', e);
    }
  }

  /// Raise the prompt for a design RESTORED under a different target, if
  /// one is pending, and act on the answer.
  ///
  /// The file-load paths ask before importing. This covers the other two
  /// ways a design meets a foreign target, which between them are the
  /// commoner case: opening one from the design list, and the designer
  /// restoring the last-used design at startup after the target changed.
  /// Both go through DesignerState._tryLoad, which cannot ask —
  /// it runs in the constructor — so it records the mismatch and this
  /// answers it on the next cmd, before anything is dispatched or saved.
  ///
  /// The old-target version is written to disk BEFORE the prompt, not after
  /// it, and regardless of the answer — both answers destroy it. _tryLoad
  /// captured the bytes at the last instant they were known good (before it
  /// cleared a pin); this turns them into a file the moment the designer
  /// has a chance to.
  ///
  /// @param {DesignerState} state
  /// @returns {Promise<boolean>} true when the caller should stop — the
  ///          target changed and the designer is leaving
  async function resolvePending(state) {
    const mismatch = state && state.pendingTargetMismatch;
    if (!mismatch) return false;
    // Cleared first: the prompt is shown once per restore, whatever the
    // answer, and leaving it set would re-ask on every cmd.
    state.pendingTargetMismatch = null;
    if (mismatch.storedPayload) {
      // Usually the picker has just written this exact version — the target
      // was changed and the designer reopened, which is one change noticed
      // twice. Reuse that file rather than downloading a second copy of the
      // same bytes; the user is still told where it is.
      mismatch.savedAs =
        DesignerState.preservedFile(state.name, mismatch.designBoard) ||
        saveOldTargetVersion(state.name, mismatch.storedPayload);
    }
    const answer = await ask(mismatch, state.name, null);
    if (answer !== 'switch') {
      // The board was accepted, so it is accepted for every design — and
      // written down now rather than left to whatever the next dispatch
      // happens to save. Relying on that save is what made this question
      // come back on the very next open: nothing had recorded the answer.
      adoptCurrentTarget(state.board, state);
      return false;
    }
    exitDesigner();
    return true;
  }

  /// Every drawing a design's Drawing menu items reach, including each
  /// one's own insertDwg children, to any depth.
  ///
  /// The same walk Save Design does, and deliberately the same code: a
  /// second implementation here would be a second answer to "what does this
  /// design carry". It is fed the rootMenu out of the STORED payload rather
  /// than live state, because the design being written out is the one that
  /// was just restored under the wrong target, not necessarily one that is
  /// open.
  /// @param {object} rootMenu
  /// @returns {string[]}
  function _linkedDwgNames(rootMenu) {
    const collected = new Set();
    if (rootMenu && Array.isArray(rootMenu.items)) {
      // `missing` is discarded: a drawing the library has not got cannot be
      // carried, and buildBundleFrom drops it anyway. Nothing here can fix
      // that, and the design itself is still worth writing.
      DesignerSaveToFile.collectMenuDwgs(rootMenu, collected, []);
    }
    return Array.from(collected);
  }

  /// Write the old-target version of a design to DISK.
  ///
  /// To disk, not to another localStorage entry: the point is to survive the
  /// target change, and a second entry sits in the same store the original
  /// is about to be overwritten in — one clear of site data takes both. A
  /// downloaded file is outside the browser and loads straight back through
  /// Load Design once the right target is selected.
  ///
  /// It is written in whichever of Save Design's two shapes fits — a bare
  /// `.pfodMenu_json` when the design links no drawings, a
  /// `<name>_menuJson.zip` carrying them when it does. A lone menu json for
  /// a design with drawings would reload as a menu whose Drawing items point
  /// at nothing, which is not a version of anything.
  ///
  /// The download itself is a Blob and an anchor rather than
  /// DesignerZipBuilder.triggerDownload, which hardcodes application/zip —
  /// wrong for the json case, and the reason Windows raises its "Unblock"
  /// overlay on a plain text file.
  ///
  /// @param {string} name — the design's name
  /// @param {string} [rawPayload] — its stored bytes, captured before any pin
  ///        pass ran (DesignerState._tryLoad). Omitted by the file-load
  ///        paths, which have not touched the open design, so its stored
  ///        copy is still the good one and can be read here.
  /// @returns {string|null} the file name written, for the caller to report
  function saveOldTargetVersion(name, rawPayload) {
    let file = null;
    try {
      const bytes = rawPayload || DesignerState.readStoredPayload(name);
      file = DesignerState.designFileFromPayload(name, bytes);
      if (!file) return null;

      // buildBundleFrom picks the shape, and carries the drawings when there
      // are any. The drawings themselves are unaffected by the target change
      // — a .pfodDwg_json records no board and holds no pins — so the
      // library copies are the right ones to bundle.
      const bundle = DesignerSaveToFile.buildBundleFrom(
        file.baseName, file.text, _linkedDwgNames(file.rootMenu));
      const url = URL.createObjectURL(new Blob([bundle.bytes],
        { type: bundle.isZip ? 'application/zip' : 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = bundle.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Deferred: revoking immediately can cancel the download in some
      // browsers before it has read the blob.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      // Mark the bytes as on disk, so the other place that notices this same
      // target change does not download a second copy of them. Cleared by
      // the next save(), which makes what is stored differ from what was
      // written. `file.text` carries the design's ORIGINAL board.
      DesignerState.markPreserved(name, JSON.parse(file.text).boardName, bundle.name);
      console.log('[TARGET_PROMPT] wrote "' + bundle.name + '" before the target change');
      return bundle.name;
    } catch (e) {
      console.warn('[TARGET_PROMPT] could not write the old-target version:', e);
      return null;
    }
  }

  /// Write EVERY stored design that is not on `boardName` out to disk.
  ///
  /// Every design, not the one that happens to be open: a target change
  /// retargets the whole machine, and there may be no design open at all —
  /// the target is picked on the connection screen, with the designer shut.
  /// A design left unwritten loses its pins the first time it is opened
  /// against the new board.
  ///
  /// Each file is a complete, loadable bundle of its own (a
  /// `<name>_<board>_menuJson.zip` when the design links drawings, so the
  /// drawings travel with it), because one archive of several designs is not
  /// something any loader here reads. That does mean several downloads at
  /// once, and a browser may ask to allow them.
  ///
  /// Nothing is written twice: markPreserved records what is already on
  /// disk, and only a save — which changes the bytes — clears that.
  ///
  /// @param {string} boardName — the board being moved TO
  /// @returns {string[]} the files written this time
  function preserveAllNotOn(boardName) {
    const written = [];
    if (typeof boardName !== 'string' || !boardName) return written;
    let names = [];
    try { names = DesignerState.listNames(); } catch (_) { return written; }
    names.forEach((name) => {
      try {
        const raw = DesignerState.readStoredPayload(name);
        if (!raw) return;
        let designBoard = null;
        try { designBoard = JSON.parse(raw).boardName || null; } catch (_) { return; }
        // A design already on this board is not moving, and one that records
        // no board (schema 11) is not claiming a target to be moved off.
        if (!designBoard || designBoard === boardName) return;
        const already = DesignerState.preservedFile(name, designBoard);
        if (already) {
          console.log('[TARGET_PROMPT] the ' + designBoard + ' version of "' + name +
                      '" is already on disk as "' + already + '"');
          return;
        }
        console.log('[TARGET_PROMPT] ' + designBoard + ' -> ' + boardName +
                    ': preserving "' + name + '"');
        const file = saveOldTargetVersion(name, raw);
        if (file) written.push(file);
      } catch (e) {
        // One design failing must not stop the rest being written.
        console.warn('[TARGET_PROMPT] could not preserve "' + name + '":', e);
      }
    });
    return written;
  }

  /// Preserve everything the target ABOUT TO BE SELECTED would move.
  ///
  /// Called by the target picker, before the target moves. Until this
  /// existed, the only thing that preserved a design across a target change
  /// was the designer noticing the mismatch when it next opened — so
  /// changing the target and then looking in the downloads folder found
  /// nothing, and a user who changed the target twice before reopening had
  /// the version from the middle of that sequence pass by unwritten.
  ///
  /// The designer's own check stays: it covers the ways a target arrives
  /// without the picker (the ?designer= URL param, and a stored connection
  /// restored at startup).
  ///
  /// @param {string} newTargetId — the board registry id being selected
  /// @returns {string[]} the files written
  function preserveDesignsFor(newTargetId) {
    try {
      const newBoard = (typeof BOARD_DATA_BY_ID !== 'undefined' && BOARD_DATA_BY_ID
                        && BOARD_DATA_BY_ID[newTargetId])
        ? BOARD_DATA_BY_ID[newTargetId].name : null;
      if (!newBoard) {
        console.log('[TARGET_PROMPT] nothing preserved: "' + newTargetId +
                    '" is not a board this build knows');
        return [];
      }
      return preserveAllNotOn(newBoard);
    } catch (e) {
      // Never block the target change over this. The designer's own check is
      // still ahead of every design, and it captures each one's bytes before
      // it clears a pin.
      console.warn('[TARGET_PROMPT] could not preserve the stored designs:', e);
      return [];
    }
  }

  /// What to tell the user after they chose to switch. One sentence, so
  /// both callers say the same thing in their own label — though on the
  /// designer path the screen is already going away.
  /// @param {{designBoard: string}} mismatch
  /// @returns {string}
  function switchedMessage(mismatch) {
    return 'Nothing was loaded. The target is now ' + mismatch.designBoard +
           ' — pick it up from the connection screen, start the designer again, ' +
           'then load this file. The design that was open has been saved.';
  }

  return Object.freeze({ ask, resolvePending, saveOldTargetVersion,
                         preserveDesignsFor, preserveAllNotOn,
                         adoptCurrentTarget, exitDesigner, switchedMessage,
                         idForBoardName: _idForBoardName });
})();

window.DesignerTargetPrompt = DesignerTargetPrompt;
