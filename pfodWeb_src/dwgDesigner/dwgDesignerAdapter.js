/*
 * dwgDesigner/dwgDesignerAdapter.js
 *
 * DwgDesignerVirtualAdapter — a second, dedicated in-browser virtual pfod
 * connection used ONLY while the Dwg Controls Panel is open. Mirrors
 * designer/adapter.js's DesignerVirtualAdapter shape exactly (same
 * PfodConnectionBase inheritance, same shared-parser-state fields, same
 * send()/_handleResponse()/no-op connect()/disconnect() pattern — the
 * inherited processIncoming()/processReadBuffer() pipeline is what makes
 * responses resolve correctly), but wraps DwgDesignerVirtualDevice, a
 * REAL (if minimal) wire-protocol device instead of the full menu-tree
 * DesignerVirtualDevice.
 *
 * Why a separate connection at all: the dwg preview (dwgControlsPanelUI.js)
 * drives itself entirely through real pfod requests — {.} for the main
 * menu, {<loadCmd>} for a dwg's data, plus real touchZone-tap acks —
 * through the normal addToRequestQueue -> processRequestQueue ->
 * connectionManager.send pipeline, exactly like talking to a real device.
 * Reusing the live Designer connection would mean all of that gets routed
 * through DesignerDispatch — the menu-tree Designer's own dispatch tree,
 * which has nothing to do with a locally-stored library dwg. Swapping to
 * this dedicated connection instead (dwgControlsPanelUI.js's
 * _switchToDwgDesignerAdapter/_restoreDesignerAdapter, active only while
 * the panel is open) keeps the two dispatch trees — and the two
 * "devices" — genuinely separate.
 *
 * DwgDesignerVirtualDevice answers wire-protocol-faithfully for exactly
 * two request shapes (see dwgWireEncoder.js for the actual wire-text
 * construction):
 *   {.} / {<version>:.}         -> a real one-item pfod main menu
 *                                  embedding the currently-selected dwg
 *   {<loadCmd>} / {<v>:<loadCmd>} -> that dwg's real "start" drawing
 *                                  response, or bare {+} if the request's
 *                                  version already matches what this
 *                                  device last sent for that loadCmd
 * loadCmd covers both the top-level previewed dwg AND any nested
 * insertDwg child — both are just DwgLibrary entries referenced by name,
 * namespaced under DWG_PREVIEW_KEY_PREFIX (dwgWireEncoder.js) so they
 * never collide with a real menu's own live dwg data of the same name.
 * Everything else (touchZone/touchAction/touchActionInput acks) is
 * UNCHANGED — a harmless PFOD_EMPTY, since those are handled entirely
 * client-side already (see dwgControlsPanelUI.js's own comments on the
 * touch-restore mechanism).
 *
 * Globals consumed at construction time (must be present in the bundle by
 * the time `new DwgDesignerVirtualAdapter(...)` runs):
 *   PfodConnectionBase   (connectionManager.js, loaded first)
 *   PFOD_EMPTY/PFOD_NO_REPLY (designer/dispatch.js, loaded earlier)
 *   parseVersion         (designer/dispatch.js, loaded earlier)
 *   DwgWireEncoder, DWG_PREVIEW_KEY_PREFIX (dwgWireEncoder.js, loaded
 *                        immediately before this file)
 *   DwgLibrary           (dwgDesigner/dwgLibrary.js, loaded earlier)
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

class DwgDesignerVirtualDevice {
  constructor() {
    // Which DwgLibrary dwg is "selected" right now, and the menu item's
    // own touch identifier to embed alongside its loadCmd in the {.}
    // response — both set by dwgControlsPanelUI.js via setPreviewDwg()
    // whenever the panel's selection changes.
    this.currentPreviewName = null;
    this.previewItemCmd = null;

    // loadCmd -> version string this device last SENT for that loadCmd.
    // A request whose version tag matches gets bare {+} (no change); any
    // mismatch (including "no entry yet") gets a fresh full "start". This
    // device owns the whole scheme — nothing prescribes how/when a
    // version is minted beyond "whenever the content might have
    // changed" (see invalidatePreviewVersion()).
    this.versions = {};
    this._nextVersionCounter = 1;

    // Mimics the real embedded pfodAutoCmd/pfodAutoIdx (pfodParser/src/
    // dwgs/pfodAutoCmd.cpp/pfodAutoIdx.h) — see _resetAutoAssignments()
    // and _resolveAutoCmdAndIdx() for the full scheme.
    this._resetAutoAssignments();

    // loadCmd -> items array. Set by forceNextUpdate() (the Dwg Controls
    // Panel's "Show" press-and-hold feature — see dwgControlsPanelUI.js's
    // _pressShowItem/_releaseShowItem), consumed by the very next fetch
    // request for that loadCmd: answered with a real pfod "update"
    // ({+|item...}) instead of the normal bare-{+}-or-full-"start" logic,
    // regardless of what version (if any) that request quotes. This is
    // how a real device would answer a hide/unhide toggle too — it's a
    // transient visibility flag on an already-sent item, not a change to
    // the drawing's own stored content, so it never bumps `versions`.
    this._pendingUpdates = {};

    // loadCmd -> {x,y,color,refresh,items} dwg-shaped object. Set by
    // forceNextStart() — the Show press-and-hold feature's fallback for an
    // item with no idxName/cmdName to hide/unhide-by-reference (nothing a
    // real device could target with a hide directive at all): a full
    // "start" re-encode of a MODIFIED item list (the target item spliced
    // out on press, restored on release) is the only way left to make the
    // toggle visible for that case. Unlike _pendingUpdates, this DOES bump
    // `versions` — encodeDwgStart's own idx placeholders + deferred-item
    // ordering assume a genuinely fresh render, and this is a full
    // "everything changed" resend even though nothing was really edited.
    this._pendingStarts = {};
  }

  /// (Re)initialize the cmd/idx auto-assignment counters/maps to a clean
  /// slate, AND drop every cached wire version (this.versions), forcing
  /// every loadCmd this new cycle touches — the newly-selected top-level
  /// dwg AND every dwg it reaches via insertDwg, no matter how recently
  /// any of them were served under some earlier cycle — to be resent as a
  /// fresh full "start" rather than a bare {+}. Called once from the
  /// constructor, and again from setPreviewDwg() every time a NEW
  /// top-level preview render cycle begins (a dwg gets selected/
  /// re-selected, or an edit/move forces a refresh) — per direction:
  /// "each send of a full dwg must regenerate the indices in the order
  /// the items are sent, and regenerate the dictionary of index name v
  /// idx for later use."
  ///
  /// The idx/cmd counters are ONE counter each, shared across the WHOLE
  /// render cycle (not per-dwg) — an insertDwg's own items are minted
  /// their idx/cmd from that SAME running counter as they are served,
  /// continuing from wherever the tree walk has reached when that
  /// insertDwg is encountered (dwgName only scopes the LOOKUP so a name
  /// already seen for that dwg resolves to its already-minted value, not
  /// the counter itself — see _resolveItemAutoCmdAndIdx). That only comes
  /// out correct if the WHOLE tree — main dwg, then every insertDwg child
  /// in the order each is reached — is walked and re-encoded together, in
  /// one pass, every time. If any part of the tree were instead served a
  /// cached {+} (skipping re-encoding), that part's idx/cmd would still
  /// be whatever a PREVIOUS, unrelated cycle's counter happened to assign
  /// it, out of step with the CURRENT cycle's own count — this is exactly
  /// what matters when an insertDwg item is added, edited, or reordered
  /// above another insertDwg or other indexed items: every item at or
  /// after that point needs its idx/cmd reminted against the new access
  /// order, including any inserted dwg's own contents. This is a local
  /// in-memory virtual device, not a real bandwidth-constrained
  /// connection, so giving up the bare-{+} "nothing to resend"
  /// optimization across cycle boundaries costs nothing real in exchange
  /// for correctness.
  _resetAutoAssignments() {
    this._autoCmdNext = 1;
    this._autoCmdMap = new Map();   // (dwgName + ' ' + cmdName) -> 'c<N>'
    this._autoIdxNext = 1;
    this._autoIdxMap = new Map();   // (dwgName + ' ' + idxName) -> N
    this.versions = {};
  }

  /// Resolve every item's REAL cmd/idx for the wire, the way the real
  /// pfodAutoCmd/pfodAutoIdx would if this dwg were compiled into a
  /// sketch: whatever cmd/idx is already stored on an item is a
  /// convenience for a standalone/offline preview only (see
  /// dwgValidate.js's own repair fallback) — NOT trusted here. Instead,
  /// for every item that carries a cmdName/idxName, this mints a fresh
  /// value the first time that (dwgName, name) pair is seen THIS render
  /// cycle and reuses it for every later reference to the same name — a
  /// touchAction/touchActionInput/hide/unhide/erase referencing the same
  /// cmdName/idxName as an earlier item (in this dwg) always resolves to
  /// the SAME generated value, while two different dwgs' identically-
  /// named items still get different, non-colliding cmd/idx (scoped by
  /// dwgName). The counters/maps themselves are reset at the START of
  /// each new render cycle (setPreviewDwg()), not carried over — so
  /// idx/cmd always reflect the CURRENT item order, not whatever was
  /// assigned during a previous, possibly now-stale, render. Items with
  /// no cmdName/idxName at all (older/hand-authored data) fall back to
  /// whatever raw cmd/idx they already carry, unresolved — this
  /// project's schema doesn't force every item to have a name.
  ///
  /// TWO PASSES, because a touchZone can now sit anywhere in the item
  /// list (dwgValidate.js no longer forces every touchZone to the bottom
  /// — that restriction was too limiting for real authoring order).
  /// Pass 1 (_resolveItemAutoCmdAndIdx, below) mints every TOP-LEVEL
  /// item's own cmd/idx, in array order, but deliberately leaves a
  /// touchActionInput's own idxName/textIdx reference — and a
  /// touchAction's nested action[0].idxName reference — UNRESOLVED,
  /// since those are references INTO some other top-level item that may
  /// not have been minted yet if it happens to appear LATER in this same
  /// array. Pass 2 (_fillTouchActionReferences) runs only after every
  /// top-level item has been minted, and fills in each reference by
  /// reusing the already-minted idx for that idxName — or, per direction
  /// ("if the index is missing from the top level, delete that action"),
  /// drops the touchActionInput/touchAction entirely if no top-level
  /// item anywhere in this dwg ever declares that idxName. Runs on the
  /// FLAT items form (touchZone's nested touchActionInput/touchActions
  /// expanded back to siblings) — flattenTouchActions() is a no-op on
  /// already-flat input, so this is safe regardless of which form
  /// DwgLibrary.get() handed back.
  /// @param {string} dwgName — bare DwgLibrary name (the (dwgName,name)
  ///        scoping key — NOT the DWG_PREVIEW_KEY_PREFIX-namespaced loadCmd)
  /// @param {object} dwg
  /// @returns {object} a new dwg object with resolved items (dwg itself
  ///          and its original items array are left untouched)

  /// Pass 1: resolve ONE item's own cmd (cmdName) and idx (idxName)
  /// against this device's running dictionary (minting on first sight).
  /// A touchActionInput's own idxName/textIdx is deliberately left
  /// unresolved here (filled in by pass 2 — see _resolveAutoCmdAndIdx's
  /// own doc). A touchAction's nested action[0] sub-item — a full item
  /// in its own right (e.g. a line/label the touchAction (re)draws over
  /// an already-indexed slot), test.json's own real saved shape — gets
  /// its OWN cmdName (e.g. a cmd-targeted hide/unhide) resolved normally
  /// right here (no ordering hazard for cmd — a touchZone/insertDwg's
  /// cmd is scoped/minted the exact same idempotent way regardless of
  /// which of the two references is encountered first), but its idxName
  /// (if any) is likewise deferred to pass 2.
  ///
  /// hide/unhide/erase targeting an insertDwg (by cmdName) are a special
  /// case: DwgLibrary's schema stores that target the same way as one
  /// targeting a touchZone (just `cmdName`), but the wire form is
  /// completely different — an insertDwg is identified purely by its own
  /// loadCmd, never an auto-minted cmd (see dwgWireEncoder.js's
  /// encodeInsertDwg/encodeHideUnhideErase). `insertDwgByCmdName` (built
  /// once per _resolveAutoCmdAndIdx call, from every insertDwg item in
  /// THIS dwg) is how this function tells the two cases apart; when the
  /// referenced cmdName belongs to an insertDwg, `out.drawingName` is set
  /// instead of `out.cmd` — no auto-cmd minted for it, since it isn't
  /// needed.
  /// @param {string} dwgName
  /// @param {object} item
  /// @param {Map<string,string>} insertDwgByCmdName — cmdName -> that
  ///        insertDwg item's own drawingName, for every insertDwg in
  ///        this same dwg (see _resolveAutoCmdAndIdx)
  /// @returns {object} shallow-copied, partially-resolved item
  _resolveItemAutoCmdAndIdx(dwgName, item, insertDwgByCmdName) {
    const out = Object.assign({}, item);
    const isHideFamily = item.type === 'hide' || item.type === 'unhide' || item.type === 'erase';
    if (isHideFamily && item.cmdName && insertDwgByCmdName.has(item.cmdName)) {
      out.drawingName = insertDwgByCmdName.get(item.cmdName);
      return out; // targets an insertDwg by loadCmd — nothing else to resolve
    }
    if (item.cmdName) {
      const key = dwgName + ' ' + item.cmdName;
      if (!this._autoCmdMap.has(key)) {
        this._autoCmdMap.set(key, 'c' + (this._autoCmdNext++));
      }
      out.cmd = this._autoCmdMap.get(key);
    }
    if (item.type === 'touchActionInput') {
      return out; // idxName/textIdx resolved in pass 2
    }
    if (item.idxName) {
      const key = dwgName + ' ' + item.idxName;
      if (!this._autoIdxMap.has(key)) {
        this._autoIdxMap.set(key, this._autoIdxNext++);
      }
      out.idx = this._autoIdxMap.get(key);
    }
    if (out.type === 'touchAction' && Array.isArray(out.action) && out.action[0]) {
      const nested = Object.assign({}, out.action[0]);
      const nestedIsHideFamily = nested.type === 'hide' || nested.type === 'unhide' || nested.type === 'erase';
      if (nestedIsHideFamily && nested.cmdName && insertDwgByCmdName.has(nested.cmdName)) {
        nested.drawingName = insertDwgByCmdName.get(nested.cmdName);
      } else if (nested.cmdName) {
        const key = dwgName + ' ' + nested.cmdName;
        if (!this._autoCmdMap.has(key)) {
          this._autoCmdMap.set(key, 'c' + (this._autoCmdNext++));
        }
        nested.cmd = this._autoCmdMap.get(key);
      }
      out.action = [nested]; // nested.idxName resolved in pass 2
    }
    return out;
  }

  /// Pass 2: fill in every touchActionInput's own idxName/textIdx, and
  /// every touchAction's nested action[0].idxName, now that pass 1 has
  /// minted every top-level item's idx — reusing the SAME numeric idx a
  /// top-level item with that idxName resolved to. Drops the
  /// touchActionInput/touchAction entirely when no top-level item ever
  /// declared that idxName (see _resolveAutoCmdAndIdx's own doc for why —
  /// this is the exact same check dwgValidate.js's own
  /// _dropOrphanedTouchActionTargets already runs at file-load time,
  /// applied again here since a dwg reaching the preview pipeline may
  /// have been built/edited without ever going through that file-load
  /// path). An action with no idxName at all (e.g. a cmd-targeted hide/
  /// unhide) has nothing to resolve and is left untouched.
  /// @param {string} dwgName
  /// @param {Array<object>} items — pass-1-resolved, flat
  /// @returns {Array<object>} final flat items, orphaned actions dropped
  _fillTouchActionReferences(dwgName, items) {
    return items.filter((item) => {
      if (item.type === 'touchActionInput') {
        if (!item.idxName) return true;
        const key = dwgName + ' ' + item.idxName;
        if (!this._autoIdxMap.has(key)) return false; // orphaned — dropped
        item.idx = this._autoIdxMap.get(key);
        item.textIdx = item.idx;
        return true;
      }
      if (item.type === 'touchAction' && Array.isArray(item.action) && item.action[0]) {
        const target = item.action[0];
        if (!target.idxName) return true;
        const key = dwgName + ' ' + target.idxName;
        if (!this._autoIdxMap.has(key)) return false; // orphaned — dropped
        target.idx = this._autoIdxMap.get(key);
        return true;
      }
      return true;
    });
  }

  _resolveAutoCmdAndIdx(dwgName, dwg) {
    const flat = flattenTouchActions(dwg.items || []);
    // cmdName -> drawingName for every insertDwg in THIS dwg — lets
    // _resolveItemAutoCmdAndIdx tell a hide/unhide/erase targeting an
    // insertDwg apart from one targeting a touchZone (both are stored as
    // plain `cmdName` on the hide/unhide/erase item itself) — see that
    // function's own doc.
    const insertDwgByCmdName = new Map();
    flat.forEach((item) => {
      if (item.type === 'insertDwg' && item.cmdName) {
        insertDwgByCmdName.set(item.cmdName, item.drawingName);
      }
    });
    const resolved = flat.map((item) => this._resolveItemAutoCmdAndIdx(dwgName, item, insertDwgByCmdName));
    const filled = this._fillTouchActionReferences(dwgName, resolved);
    // A missing insertDwg target (not currently loaded in DwgLibrary) must
    // not be PREVIEWED at all — no real `|d~...` wire fragment, so the
    // client never auto-fetches its loadCmd and there is nothing (e.g. a
    // touchZone inside it) registered to interact with. Dropped here, at
    // the SOURCE (the parent's own encoded wire), rather than patched
    // reactively when/if the client happens to request it. The dwg's own
    // stored data is untouched (this only filters the ephemeral resolved
    // copy used for THIS wire response) — the missing reference is still
    // fully present in DwgLibrary and in the Edit Dwg item list, just
    // annotated there (see dwgControlsPanelUI.js's own item-list
    // rendering) rather than drawn into the actual preview canvas. A
    // hide/unhide/erase targeting that same missing insertDwg
    // (out.drawingName, set above) is dropped alongside it — nothing to
    // hide/unhide/erase if it was never inserted in the first place.
    const final = filled.filter((item) => {
      const targetsMissingDwg = item.drawingName && !DwgLibrary.get(item.drawingName);
      if (!targetsMissingDwg) return true;
      const isHideFamily = item.type === 'hide' || item.type === 'unhide' || item.type === 'erase';
      return item.type !== 'insertDwg' && !isHideFamily;
    });
    return Object.assign({}, dwg, { items: final });
  }

  /// Called by dwgControlsPanelUI.js whenever the panel's dwg selection
  /// changes (a fresh top-level preview render cycle starting). Resets
  /// the cmd/idx auto-assignment dictionary AND drops every cached wire
  /// version (_resetAutoAssignments() — see its own doc for why both
  /// reset together): the newly-selected top-level dwg, and every dwg it
  /// reaches via insertDwg, are always resent as a fresh full "start"
  /// this cycle, so their idx/cmd values are minted by the shared counter
  /// in true tree-walk order rather than possibly being a stale {+} reuse
  /// of whatever some earlier, unrelated cycle assigned.
  /// @param {string} name    — DwgLibrary dwg name now selected
  /// @param {string} itemCmd — the dwg menu item's own touch identifier
  setPreviewDwg(name, itemCmd) {
    this.currentPreviewName = name;
    this.previewItemCmd = itemCmd;
    this._resetAutoAssignments();
  }

  /// Force the next fetch of `name`'s dwg data to return a fresh full
  /// "start" rather than bare {+} — the hook a future Edit Item screen
  /// (or manual testing) calls after mutating a DwgLibrary dwg's stored
  /// content, before firing a refresh request for it.
  /// @param {string} name — DwgLibrary dwg name (bare, not loadCmd-prefixed)
  invalidatePreviewVersion(name) {
    delete this.versions[window.DWG_PREVIEW_KEY_PREFIX + name];
  }

  /// Look up the numeric idx already minted for (identityName, idxName)
  /// during this render cycle's most recent full "start" encode — used by
  /// dwgControlsPanelUI.js's Show feature to build a hide/unhide-by-idx
  /// directive that targets the SAME idx the client already has on
  /// screen. Throws rather than returning undefined/null: this is only
  /// ever called for an item the Edit Dwg screen is already displaying,
  /// which means a full "start" already resolved and sent its idx —
  /// a miss here means that assumption broke, worth surfacing loudly
  /// rather than silently encoding an "idx: undefined" directive.
  /// @param {string} identityName
  /// @param {string} idxName
  /// @returns {number}
  resolveIdx(identityName, idxName) {
    const key = identityName + ' ' + idxName;
    if (!this._autoIdxMap.has(key)) {
      throw new Error('[DwgDesignerVirtualDevice] resolveIdx: no idx minted yet for ' + JSON.stringify(key));
    }
    return this._autoIdxMap.get(key);
  }

  /// Same as resolveIdx but for a cmdName (touchZone/insertDwg) -> the
  /// auto-assigned 'c<N>' cmd string.
  /// @param {string} identityName
  /// @param {string} cmdName
  /// @returns {string}
  resolveCmd(identityName, cmdName) {
    const key = identityName + ' ' + cmdName;
    if (!this._autoCmdMap.has(key)) {
      throw new Error('[DwgDesignerVirtualDevice] resolveCmd: no cmd minted yet for ' + JSON.stringify(key));
    }
    return this._autoCmdMap.get(key);
  }

  /// Make sure every item in `dwg` (scoped by identityName) has a minted
  /// idx/cmd in this render cycle's dictionary, resolving any that aren't
  /// there yet — idempotent: an item already minted (by an earlier full
  /// "start" encode for this SAME dwg) is left untouched, since
  /// _resolveItemAutoCmdAndIdx only mints on first sight. Needed because
  /// resolveIdx/resolveCmd must work even when called BEFORE the async
  /// {.}/{loadCmd} round-trip that would normally populate the dictionary
  /// has actually completed (e.g. the Dwg Controls Panel's Show button —
  /// dwgControlsPanelUI.js's _pressShowItem — can be pressed the instant
  /// the Edit Dwg screen renders, well before the simulated network delay
  /// resolves and encodeDwgStart runs for the first time). Calling this
  /// first with the SAME dwg/identityName that render cycle is using
  /// guarantees resolveIdx/resolveCmd never see an empty dictionary, and
  /// guarantees the eventual real fetch (whenever it does complete) reuses
  /// these exact same values instead of minting different ones, since it
  /// resolves against this same shared dictionary.
  /// @param {string} identityName
  /// @param {object} dwg
  ensureAutoAssignments(identityName, dwg) {
    this._resolveAutoCmdAndIdx(identityName, dwg);
  }

  /// Force the very next fetch of `loadCmd` to be answered with a real
  /// pfod "update" ({+|item...}) carrying exactly `items`, instead of the
  /// normal bare-{+}-or-full-"start" logic — see this.​_pendingUpdates's
  /// own constructor comment. One-shot: consumed and cleared by that next
  /// fetch, whatever version (if any) it quotes.
  /// @param {string} loadCmd
  /// @param {Array<object>} items — DwgLibrary-shaped items with resolved
  ///        numeric idx/cmd (not idxName/cmdName)
  forceNextUpdate(loadCmd, items) {
    this._pendingUpdates[loadCmd] = items;
  }

  /// Force the very next fetch of `loadCmd` to be answered with a fresh
  /// full "start" re-encoded from `dwg` (a {x,y,color,refresh,items}
  /// object — items may be the nested or flat form, encodeDwgStart/
  /// _resolveAutoCmdAndIdx each flatten it themselves) instead of the
  /// normal bare-{+}-or-real-content "start" logic, and bumps `versions`
  /// for this loadCmd (see this.​_pendingStarts's own constructor comment
  /// on why, unlike forceNextUpdate, this one counts as a real version
  /// change). One-shot: consumed and cleared by that next fetch, whatever
  /// version (if any) it quotes. Resolved against the SAME idx/cmd
  /// dictionary as every other encode this render cycle, so any item
  /// still present in `dwg.items` keeps the exact idx/cmd it already has.
  /// @param {string} loadCmd
  /// @param {object} dwg
  forceNextStart(loadCmd, dwg) {
    this._pendingStarts[loadCmd] = dwg;
  }

  /// Every well-formed cmd gets a real, wire-protocol-faithful answer for
  /// {.} and {<loadCmd>} shapes (see class doc comment); anything else
  /// (touch acks) gets the existing harmless PFOD_EMPTY. Malformed input
  /// (not a string) gets PFOD_NO_REPLY, matching DesignerVirtualDevice's
  /// own malformed-input handling (designer/index.js:44-49).
  /// @param {string} rawCmd
  /// @returns {Promise<string>}
  processCmd(rawCmd) {
    if (typeof rawCmd !== 'string') {
      console.error('[DwgDesignerVirtualDevice] processCmd: rawCmd must be a string, got:', typeof rawCmd);
      return Promise.resolve(PFOD_NO_REPLY);
    }

    // Strip any <version>: prefix (parseVersion expects/returns indices
    // into the ORIGINAL rawCmd — designer/dispatch.js:97-104) then the
    // trailing '}' to get the bare cmd content.
    const parsed = parseVersion(rawCmd);
    const bareCmd = rawCmd.substring(parsed.cmdStart).replace(/\}$/, '');
    const requestedVersion = parsed.version;
    // TEMP DEBUG: every cmd this device receives, and its own current
    // selection state — to see whether processCmd is even being reached,
    // and with what, when the render fails.
    console.log('[DWG_PREVIEW_DEBUG] processCmd rawCmd=' + JSON.stringify(rawCmd) +
      ' bareCmd=' + JSON.stringify(bareCmd) + ' requestedVersion=' + JSON.stringify(requestedVersion) +
      ' currentPreviewName=' + JSON.stringify(this.currentPreviewName) +
      ' previewItemCmd=' + JSON.stringify(this.previewItemCmd));

    // Deliberate 100ms delay, simulating the latency a real connection
    // (serial/BLE/HTTP) always has. Without it, this virtual connection
    // resolves so fast that a touchAction's optimistic "flash" redraw
    // (executeTouchAction) gets overwritten by the response's own redraw
    // before the browser ever paints a frame showing it. Confirmed by the
    // user this is acceptable/expected: the flash is just an indication
    // something happened, the response is the real state.
    return new Promise(resolve => setTimeout(() => {
      if (bareCmd === '.') {
        const loadCmd = window.DWG_PREVIEW_KEY_PREFIX + (this.currentPreviewName || '');
        const menuWire = DwgWireEncoder.encodeMainMenuWithDwgItem(this.previewItemCmd, loadCmd);
        console.log('[DWG_PREVIEW_DEBUG] resolving {.} with menu:', menuWire);
        resolve(menuWire);
        return;
      }

      if (bareCmd.startsWith(window.DWG_PREVIEW_KEY_PREFIX)) {
        if (this._pendingUpdates[bareCmd]) {
          const items = this._pendingUpdates[bareCmd];
          delete this._pendingUpdates[bareCmd];
          const updateWire = DwgWireEncoder.encodeDwgUpdate(items);
          console.log('[DWG_PREVIEW_DEBUG] resolving forced update for "' + bareCmd + '":', updateWire);
          resolve(updateWire);
          return;
        }
        const dwgName = bareCmd.substring(window.DWG_PREVIEW_KEY_PREFIX.length);
        if (this._pendingStarts[bareCmd]) {
          const forcedDwg = this._pendingStarts[bareCmd];
          delete this._pendingStarts[bareCmd];
          const forcedVersion = 'v' + (this._nextVersionCounter++);
          this.versions[bareCmd] = forcedVersion;
          const resolvedForcedDwg = this._resolveAutoCmdAndIdx(dwgName, forcedDwg);
          const startWire = DwgWireEncoder.encodeDwgStart(resolvedForcedDwg, forcedVersion);
          console.log('[DWG_PREVIEW_DEBUG] resolving forced start for "' + bareCmd + '":', startWire);
          resolve(startWire);
          return;
        }
        const dwg = DwgLibrary.get(dwgName);
        if (!dwg) {
          // A dwg that doesn't exist (not loaded / a missing insertDwg
          // target) used to resolve with a bare PFOD_EMPTY here — but
          // that's the generic "touch ack, nothing changed" response,
          // not a drawing response at all, so it left whatever the
          // client had PREVIOUSLY cached for this loadCmd (e.g. from an
          // earlier preview session, or a stale localStorage entry from
          // before the dwg was removed/renamed) on screen with no signal
          // to clear it. Answer with a genuine (empty, minimal-size)
          // "start" drawing instead, so the client's own normal
          // "received fresh drawing data, overwrite my cache" handling
          // naturally clears any stale content. Never cache a version
          // for this — always resend fresh so a dwg that gets loaded
          // later is picked up on the very next request, no separate
          // invalidation path needed.
          delete this.versions[bareCmd];
          const missingWire = DwgWireEncoder.encodeDwgStart(
            { x: 1, y: 1, color: -1, refresh: 0, items: [] },
            'v' + (this._nextVersionCounter++)
          );
          console.log('[DWG_PREVIEW_DEBUG] "' + dwgName + '" not found in DwgLibrary — resolving empty start for "' + bareCmd + '":', missingWire);
          resolve(missingWire);
          return;
        }
        const currentVersion = this.versions[bareCmd];
        if (requestedVersion && currentVersion && requestedVersion === currentVersion) {
          resolve('{+}');
          return;
        }
        const newVersion = 'v' + (this._nextVersionCounter++);
        this.versions[bareCmd] = newVersion;
        const resolvedDwg = this._resolveAutoCmdAndIdx(dwgName, dwg);
        const wire = DwgWireEncoder.encodeDwgStart(resolvedDwg, newVersion);
        // TEMP DEBUG: dump the source DwgLibrary JSON and the wire string
        // encoded from it, so both can be compared against
        // drawingDataProcessor.js's own [DWG_PREVIEW_DEBUG] log of what it
        // parsed back OUT of that same wire string.
        console.log('[DWG_PREVIEW_DEBUG] source DwgLibrary dwg "' + dwgName + '":', JSON.stringify(dwg, null, 2));
        console.log('[DWG_PREVIEW_DEBUG] encoded wire for "' + bareCmd + '":', wire);
        resolve(wire);
        return;
      }

      // Touch cmds and anything else — unchanged existing behaviour.
      console.log('[DWG_PREVIEW_DEBUG] falling through to bare PFOD_EMPTY for bareCmd=' + JSON.stringify(bareCmd));
      resolve(PFOD_EMPTY);
    }, 100));
  }
}

class DwgDesignerVirtualAdapter extends PfodConnectionBase {
  /// @param {object}            config  — connection config (unused)
  /// @param {ConnectionManager} manager — parent for cross-adapter callbacks
  constructor(config, manager) {
    super();
    this.protocol = 'dwgDesigner';
    this.manager  = manager;
    // Shared parser state — same fields Serial / HTTP / DesignerVirtualAdapter
    // expose, so the inherited processIncoming() / processReadBuffer()
    // pipeline behaves identically.
    this.readBuffer      = '';
    this.responseResolve = null;
    this.responseReject  = null;
    this._respCallbacks  = null;
    this.device = new DwgDesignerVirtualDevice();
  }

  /// Send one pfod cmd. Same shape as DesignerVirtualAdapter.send() —
  /// see that file's own doc comment for why processIncoming() is what
  /// actually resolves the returned promise.
  send(cmd) {
    return new Promise((resolve, reject) => {
      this.responseResolve = resolve;
      this.responseReject  = reject;
      if (ConnectionManager.messageCollector) {
        ConnectionManager.messageCollector.addMessage('sent', cmd, 'dwgDesigner');
      }
      // console.warn — NOTE this means these lines are suppressed along
      // with log/debug/info whenever the Debug logging checkbox is off
      // (applyDebugLogging() stubs warn too, only error is left alone);
      // unlike the error-level version this replaces, wire traffic is
      // only visible here when Debug logging is actually enabled.
      console.warn('[DWG_PREVIEW_WIRE] sent:', cmd);
      this.device.processCmd(cmd)
        .then(pfodResponse => {
          console.warn('[DWG_PREVIEW_WIRE] received:', pfodResponse);
          this._handleResponse(pfodResponse);
        })
        .catch(err => {
          console.warn('[DWG_PREVIEW_WIRE] error:', err);
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
  /// outer Promise created in send(). Identical to
  /// DesignerVirtualAdapter._handleResponse().
  _handleResponse(pfodResponse) {
    this.processIncoming(pfodResponse);

    if (!this.responseResolve) return; // already resolved by processReadBuffer

    if (this.readBuffer.length > 0) {
      const r = this.responseReject;
      if (ConnectionManager.messageCollector) {
        ConnectionManager.messageCollector.addMessage('timeout', this.readBuffer, this.protocol);
      }
      this.readBuffer      = '';
      this.responseResolve = null;
      this.responseReject  = null;
      r(new Error('dwgDesigner response missing closing } — handler bug'));
    } else {
      const r = this.responseResolve;
      this.responseResolve = null;
      this.responseReject  = null;
      r('');
    }
  }

  /// No connect phase — the device is always available.
  async connect() { /* no-op */ }

  /// No disconnect phase — the device has no resources to release.
  async disconnect() { /* no-op */ }
}

// Exposed globally the same way DesignerVirtualAdapter is — no module
// system in this bundle.
window.DwgDesignerVirtualAdapter = DwgDesignerVirtualAdapter;
