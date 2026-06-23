/*
 * designer/menus/moveMenuItems.js
 *
 * Handler pair for "Move Items Up/Down" — the 'u' (select item) and
 * 'v' (pick destination) cmds reached from the editMenu's
 * EM_SELECT_TO_MOVE_CMD button.
 *
 * Mirrors pfodDesignerV2/DesignerMsgProcessor.java cases
 *   selectMenuItemToMoveCmd ('u'): selectMenuItemToMove (line 1171)
 *   moveMenuItemCmd        ('v'): moveMenuItem          (line 1142)
 * and EditScreenData.java helpers:
 *   getDesignerMsgWithSpecialFormatWithCount (line 1213)
 *   getMoveMenuSelectionList                 (line 1254)
 *   insertAndMoveDown                        (the array-edit logic)
 *
 * Two-step workflow:
 *
 *   1. {u}        → item-selection list (`{,…}` menu with `u<idx>`
 *                   buttons).  Resets `_movingItemIdx` on every bare
 *                   entry so a stale value from a prior aborted move
 *                   never leaks into a fresh one.
 *   2. {u<idx>}   → stash <idx> in `_movingItemIdx`, then render the
 *                   destination-selection screen.  This is a pfod
 *                   SELECTION SCREEN (`{?vc`<srcIdx>~…|opt|opt|…}`)
 *                   not a button menu — matches Java's
 *                   getMenuItemMoveSelectionScreen at line 1131.
 *                   pfodWeb's selection widget submits as
 *                   `{vc`<destIdx>}` and auto-queues a back-nav to
 *                   the previous menu (item-select), so the user
 *                   lands back on the item list after the move.
 *   3. {vc`<destIdx>} → splice `_movingItemIdx` out, splice it back
 *                   in at <destIdx> using Java's insertAndMoveDown
 *                   semantics (see "Insert semantics" below), clear
 *                   `_movingItemIdx`, return PFOD_EMPTY (the
 *                   selection-screen's auto back-nav handles the
 *                   actual navigation).
 *
 * INSERT SEMANTICS — Java reads the picked index in the ORIGINAL
 * list, then walks the SHORTENED list (after removing src) to insert.
 * Equivalent in JS:
 *   const item = items.splice(srcIdx, 1)[0];
 *   if (destIdx >= items.length) items.push(item);
 *   else items.splice(destIdx, 0, item);
 * NO "decrement destIdx when it crossed srcIdx" adjustment — that
 * was an earlier mistake in this file.  destIdx is interpreted as
 * the position in the POST-removal array, exactly like Java.
 *
 * Source-idx storage: kept in a module-level closure (matches Java's
 * `menuItemToMove` instance field).  Transient, in-memory only;
 * cleared on every bare {u}, every out-of-range fallback, and post-
 * move so back-nav re-firing of {vc`<destIdx>} can never double-move.
 *
 * activeItemIdx fix-up: if state.activeItemIdx pointed at the moved
 * row OR at a row between srcIdx and the final destination, it's
 * adjusted so editMenuItem.js's getActiveItem() still resolves the
 * same authored row.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerMoveMenuItems = (() => {

  // Source item's array index — set when the user picks an item on
  // the selection screen, cleared after the move (or on any reset).
  // Module-level closure mirrors Java's `menuItemToMove` instance
  // field.  No persistence — fresh every page reload.
  let _movingItemIdx = null;

  // ── Helpers ──────────────────────────────────────────────────────

  /// Read a non-negative decimal integer starting at rawCmd[startIdx];
  /// stops at the first non-digit.  Returns the int or null when no
  /// digits were found.
  function _parseDecimalAt(rawCmd, startIdx) {
    let s = '';
    for (let i = startIdx; i < rawCmd.length; i++) {
      const c = rawCmd[i];
      if (c >= '0' && c <= '9') s += c;
      else break;
    }
    if (s.length === 0) return null;
    return parseInt(s, 10);
  }

  /// User-facing leading text for an item.  Mirrors Java's
  /// V2_MenuItem.getLeadingTextNoFormat() (java/pfodAppBase/
  /// MenuItems/V2_MenuItem.java line 192-199):
  ///   rtn = rtn.replace('\n', ' ');
  ///   return rtn.trim();
  /// Embedded newlines in the item's text would otherwise spread an
  /// option row across multiple visible lines on the selection
  /// screen.  Empty / whitespace-only text falls back to a single
  /// space so the option button isn't zero-width (matches
  /// EditScreenData.java line 1238 `if (trimmedLeadingText.length()
  /// == 0) trimmedLeadingText = " ";`).
  function _leadingText(item) {
    const raw     = item.text || '';
    const trimmed = raw.replace(/\n/g, ' ').trim();
    return trimmed.length > 0 ? trimmed : ' ';
  }

  /// Item-type suffix appended below the leading text on selection-
  /// screen options.  Matches Java V2_MenuItemEnum.getMenuItemString
  /// at designerSupport/V2_MenuItemEnum.java line 129:
  ///   "\n<bw><i><-3>" + menuItemString
  /// — second line, auto-contrast colour, italic, smaller.  Type
  /// strings copied from each enum entry's constructor (lines 48 /
  /// 54 / 60 / 66) — ALWAYS wrapped in parentheses to match Java's
  /// `(Button)` / `(Label)` / `(Chart Button)` / `(Sub-Menu)`.
  function _menuItemTypeString(item) {
    let typeStr;
    if      (item.type === 'button') typeStr = '(Button)';
    else if (item.type === 'label')  typeStr = '(Label)';
    else if (item.type === 'onoff')  typeStr = '(On/Off Setting or Pulse)';
    else if (item.type === 'pwm')    typeStr = '(Slider Input, PWM or DAC Output)';
    else                             typeStr = '(' + item.type + ')';
    return '\n<bw><i><-3>' + typeStr;
  }

  // ── Screens ──────────────────────────────────────────────────────

  /// Item-selection list ({,…} menu).  Each item rendered as a
  /// clickable row whose cmd is `u<idx>` so the click round-trips
  /// through this same 'u' handler.  No version tag.  Matches Java
  /// selectMenuItemToMove (line 1171).
  ///
  /// The body uses the same `getDesignerMsgWithSpecialFormatWithCount`
  /// rendering pattern Java uses for delete + move + similar
  /// list-then-pick screens: each row carries the item's leading
  /// text then a second line with the item's type ("Button" / "Label"
  /// in smaller italic auto-contrast).  Helps the user tell rows
  /// apart when texts are short or empty.
  function _renderItemSelection(state) {
    const menu = state.getActiveMenu();
    const promptText = (menu.items.length === 0)
      ? 'There are no Items in this menu'
      : 'Select the Item to be moved';

    let out = '{,' + DESIGNER_PROMPT_FMT + '~' + promptText;
    menu.items.forEach((item, idx) => {
      out += '|u' + idx + DESIGNER_MENU_FMT + '~';
      out += _leadingText(item) + _menuItemTypeString(item);
    });
    out += '}';
    return out;
  }

  /// Destination-selection SCREEN — pfod `{?` single-pick widget.
  /// Format (Java line 1131-1140):
  ///   {?vc`<srcIdx>~<promptFmt>Moving \n<i><srcText></i>\n
  ///        Select where to move the item|<menuFmt><opt0>|<menuFmt><opt1>|…}
  /// The default-selected option is the source's current index so
  /// the user sees their picked item highlighted on entry.  The 'c'
  /// after the 'v' cmd byte is Java's sub-byte convention — see the
  /// _sendV handler for the matching parse.
  ///
  /// Java guards `getMoveMenuSelectionList` against the 1-item case
  /// (head.getNext() != null) but editMenu's Move button is already
  /// disabled when items.length < 2, so this code path expects 2+
  /// items.  Defensive fallback returns the item-selection screen
  /// when invoked anyway.
  function _renderDestinationSelection(state) {
    const menu = state.getActiveMenu();
    const src  = menu.items[_movingItemIdx];
    if (!src || menu.items.length < 2) {
      _movingItemIdx = null;
      return _renderItemSelection(state);
    }

    let out = '{?vc`' + _movingItemIdx + '~' + DESIGNER_PROMPT_FMT;
    out += 'Moving \n<i>' + _leadingText(src) + '</i>\n';
    out += 'Select where to move the item';
    menu.items.forEach((item) => {
      // Selection-screen options carry NO cmd byte — pfod's `{?` widget
      // identifies the picked option by positional index, not by
      // emitted cmd.  Format prefix only.
      out += '|' + DESIGNER_MENU_FMT;
      out += _leadingText(item) + _menuItemTypeString(item);
    });
    out += '}';
    return out;
  }

  // ── Mutation ─────────────────────────────────────────────────────

  /// Splice _movingItemIdx out of items[], splice it back in at
  /// destIdx using Java insertAndMoveDown semantics, fix up
  /// state.activeItemIdx, save.  Returns PFOD_EMPTY — the selection
  /// screen's submit handler in responseHandlers.js already queues
  /// a back-nav to the item-select screen.
  function _moveAndReturnEmpty(state, destIdx) {
    const menu   = state.getActiveMenu();
    const srcIdx = _movingItemIdx;

    // Bail-out path: clear state, return PFOD_EMPTY.  pfodWeb's
    // queued back-nav still fires so the user lands somewhere
    // sensible.
    const bail = () => { _movingItemIdx = null; return PFOD_EMPTY; };

    if (srcIdx === null || srcIdx < 0 || srcIdx >= menu.items.length) return bail();
    if (destIdx < 0)                                                  return bail();

    // Perform the move.  Java reads destIdx in the ORIGINAL list but
    // applies it in the POST-removal array — equivalent to the splice
    // pair below.  destIdx === srcIdx ends up putting the item back
    // at its original position (no-op); destIdx >= post-removal
    // length appends to the tail (Java's "if not yet inserted" branch
    // of insertAndMoveDown).
    const item = menu.items.splice(srcIdx, 1)[0];
    let finalPos;
    if (destIdx >= menu.items.length) {
      menu.items.push(item);
      finalPos = menu.items.length - 1;
    } else {
      menu.items.splice(destIdx, 0, item);
      finalPos = destIdx;
    }

    // Keep state.activeItemIdx pointing at the same authored row
    // through the splice pair.  Three cases:
    //  - The moved row IS the active one  → follow it to finalPos.
    //  - The active row's index shifts by -1 from the splice-out
    //    (if srcIdx < activeIdx) and by +1 from the splice-in
    //    (if finalPos <= shiftedIdx).
    //  - Otherwise — unaffected.
    const aIdx = state.activeItemIdx;
    if (aIdx !== null && aIdx !== undefined) {
      if (aIdx === srcIdx) {
        state.activeItemIdx = finalPos;
      } else {
        let shifted = (aIdx > srcIdx) ? aIdx - 1 : aIdx;
        if (shifted >= finalPos) shifted += 1;
        state.activeItemIdx = shifted;
      }
    }

    _movingItemIdx = null;
    state.save();
    return PFOD_EMPTY;
  }

  // ── Dispatch ─────────────────────────────────────────────────────

  /// Handler for cmd byte 'u'.  Bare {u} renders item selection;
  /// {u<idx>} stashes the source and renders the destination
  /// selection SCREEN.
  function _sendU(rawCmd, state, depth) {
    const idx = _parseDecimalAt(rawCmd, depth + 1);
    if (idx === null) {
      // Bare {u} — fresh start.  Clear any half-finished move.
      _movingItemIdx = null;
      return { pfod: _renderItemSelection(state), skipSave: true };
    }
    const menu = state.getActiveMenu();
    if (idx < 0 || idx >= menu.items.length) {
      _movingItemIdx = null;
      return { pfod: _renderItemSelection(state), skipSave: true };
    }
    _movingItemIdx = idx;
    return { pfod: _renderDestinationSelection(state), skipSave: true };
  }

  /// Handler for cmd byte 'v'.  Expects {vc`<destIdx>} — Java's sub-
  /// byte 'c' then backtick then a non-negative decimal index.  Any
  /// other shape (bare {v}, missing 'c', missing backtick, non-int
  /// arg) falls through to a clean state-reset and PFOD_EMPTY.
  function _sendV(rawCmd, state, depth) {
    if (rawCmd[depth + 1] !== 'c' || rawCmd[depth + 2] !== '`') {
      _movingItemIdx = null;
      return PFOD_EMPTY;
    }
    const idx = _parseDecimalAt(rawCmd, depth + 3);
    if (idx === null) {
      _movingItemIdx = null;
      return PFOD_EMPTY;
    }
    return _moveAndReturnEmpty(state, idx);
  }

  return Object.freeze({ sendU: _sendU, sendV: _sendV });
})();

// Self-register both cmd bytes into the top-level designer dispatcher.
DesignerDispatch.add('u', DesignerMoveMenuItems.sendU);
DesignerDispatch.add('v', DesignerMoveMenuItems.sendV);
