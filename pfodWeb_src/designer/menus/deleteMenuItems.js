/*
 * designer/menus/deleteMenuItems.js
 *
 * Handler for the 't' (EM_DELETE_MENU_ITEMS_CMD) item on the editMenu
 * screen: opens a list of the active menu's items, then on the second
 * cmd deletes the picked entry.
 *
 *   {t}      → list every item in the active menu as a red delete
 *              button (one button per item, cmd `t<idx>`).  This is a
 *              full screen ({,...}) — the one legitimate nav-stack
 *              entry for this flow.
 *   {t<n>}   → splice items[n] out of menu.items, then redraw the SAME
 *              list in place ({;...}) with the deleted item's button
 *              gone.  Deleting several items in a row needs no extra
 *              taps — each click just updates the same screen.
 *
 * Back-nav idempotency: pfodWeb pushes the cmd that produced each
 * full-screen ({,...}) response onto its nav stack; in-place updates
 * ({;...}) never get pushed.  If every `{t<n>}` answered with a fresh
 * full screen, the user's back-press could land on a stale `{t<n>}`
 * (its index invalidated by later deletes) and silently delete
 * whatever now sits at that index.  Answering with an in-place update
 * instead means the nav stack still only has the original bare `{t}`
 * on top of it — so back-press from anywhere in a delete sequence
 * always returns cleanly to editMenu, never re-fires a delete.
 *
 * activeItemIdx fix-up: if the user was mid-editing an item when
 * they came here (state.activeItemIdx is set), removing items from
 * earlier in the array shifts the remaining items down.  The active
 * pointer is adjusted (cleared if its item was the one deleted,
 * decremented if its item is now at a smaller index, untouched
 * otherwise) so editMenuItem.js's getActiveItem() still resolves
 * the correct row when re-entered.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java case
 *         deleteMenuItemsCmd ('t') around line 4028.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── Helpers ─────────────────────────────────────────────────────────

/// Read a non-negative decimal integer starting right after the first
/// 'x' at/after rawCmd[startIdx]; stops at the first non-digit
/// (typically `}`).  Returns the integer, or null when no digits
/// followed 'x' (the bare list-open case).
///
/// The 'x' is a fixed delimiter separating the cmd's activeMenuPath
/// prefix (underscore-joined digits, see _openCmd) from the optional
/// snapshot-slot index — needed because pfodMenuParser.js's own cmd
/// token reader (parsePfodCmd) only accepts [a-zA-Z0-9_], so path
/// digits and the index digits would otherwise be indistinguishable;
/// a backtick or other punctuation can't be used as the separator
/// since the real parser would stop reading the cmd token there
/// (treating everything after it as format/value content instead).
function _parseDeleteIdx(rawCmd, startIdx) {
  const xIdx = rawCmd.indexOf('x', startIdx);
  if (xIdx === -1) return null;
  let s = '';
  for (let i = xIdx + 1; i < rawCmd.length; i++) {
    const c = rawCmd[i];
    if (c >= '0' && c <= '9') s += c;
    else break;
  }
  if (s.length === 0) return null;
  return parseInt(s, 10);
}

/// The "open this level's Delete Items list" cmd — see
/// formats.js's designerLevelSuffix() for why this needs to be
/// distinct per menu level and why 'x' is the delimiter. Appending the
/// row's own snapshot idx (see _buildListBody) gives the per-item
/// delete cmd.
function _openCmd(state) {
  return 't' + designerLevelSuffix(state);
}

// ── Handler ─────────────────────────────────────────────────────────

const DesignerDeleteMenuItems = (() => {

  /// User-facing leading text for an item — mirrors Java's
  /// V2_MenuItem.getLeadingTextNoFormat (java/pfodAppBase/MenuItems/
  /// V2_MenuItem.java line 192-199): collapse embedded newlines to
  /// spaces, trim, fall back to single space when empty.  Without
  /// this, multi-line item.text spreads the delete button row over
  /// extra visible lines.
  function _leadingText(item) {
    const raw     = item.text || '';
    const trimmed = raw.replace(/\n/g, ' ').trim();
    return trimmed.length > 0 ? trimmed : ' ';
  }

  /// Type-tag suffix beneath the leading text — matches Java
  /// V2_MenuItemEnum.menuItemString (designerSupport/V2_MenuItemEnum.java
  /// lines 48 / 54 / 60 / 66): `(Button)`, `(Label)`, `(Chart Button)`,
  /// `(Sub-Menu)`.  Same `\n<bw><i><-3>` prefix Java uses on every
  /// row in `getDesignerMsgWithSpecialFormatWithCount` so the tag
  /// reads as a smaller italic second line.
  function _typeTagSuffix(item) {
    let typeStr;
    if      (item.type === 'button') typeStr = '(Button)';
    else if (item.type === 'label')  typeStr = '(Label)';
    else if (item.type === 'onoff')  typeStr = '(On/Off Setting or Pulse)';
    else if (item.type === 'pwm')    typeStr = '(Slider Input, PWM or DAC Output)';
    else                             typeStr = '(' + item.type + ')';
    return '\n<bw><i><-3>' + typeStr;
  }

  /// Snapshot the active menu's items, taken once when the delete-list
  /// screen is first opened (bare `{t}`).  Cmd `t<idx>` is pinned to a
  /// SNAPSHOT SLOT for the rest of this delete session, never to a live
  /// position in the shrinking `menu.items` array — deleting one item
  /// must never renumber any other item's cmd.  Stored on `state` itself
  /// (not saved/persisted — state.save() only serialises an explicit
  /// payload, see state.js) so it survives across the `{t<n>}` round-trips
  /// of one delete session and is rebuilt fresh every time `{t}` bare is
  /// re-entered from editMenu.
  function _buildSnapshot(state) {
    const menu = state.getActiveMenu();
    return menu.items.map((item) => ({ item, deleted: false }));
  }

  /// Build the delete-list body from state's snapshot (see
  /// _buildSnapshot) — one row per snapshot slot, cmd `t<idx>` fixed to
  /// that slot for the whole session.  Already-deleted slots keep their
  /// row (so no other slot's cmd ever shifts) but render with the pfod
  /// hidden-format flag (`-`) so the button itself disappears.  No
  /// leading `{,`/`{;` marker or trailing `}` — callers wrap this in
  /// whichever screen-type they need (see _renderListScreen vs
  /// _renderListUpdate below).  No version tag — the list changes every
  /// delete, so caching would stale immediately.
  ///
  /// Per-row text matches Java DesignerMsgProcessor.java:4060-4061
  /// exactly: format prefix `<bg r><w>` then `~Delete\n<leadingText>
  /// \n<bw><i><-3>(Type)`.  Renders as three stacked lines —
  ///   line 1: literal "Delete" cue
  ///   line 2: the item's one-line leading text
  ///   line 3: small italic "(Button)" / "(Label)" type tag
  /// — visually marking each row as a delete action separate from
  /// the actual menu item it refers to.
  function _buildListBody(state) {
    const snapshot = state._deleteListSnapshot || [];
    const openCmd  = _openCmd(state);
    const prompt = 'Click the item to be removed from the menu\n<-2>Use the bottom back arrow to return to the <i><y>Editing Menu</i> screen';
    let out = DESIGNER_PROMPT_FMT + '~' + prompt;
    snapshot.forEach((entry, idx) => {
      const hiddenFlag = entry.deleted ? '-' : '';
      out += '|' + openCmd + idx + hiddenFlag + '<bg r><w>~Delete\n';
      out += _leadingText(entry.item);
      out += _typeTagSuffix(entry.item);
    });
    return out;
  }

  /// Full-screen ({,...}) delete list — used only for the initial bare
  /// `{t}` open from editMenu.  This is the one legitimate nav-stack
  /// entry for this flow (see file header).  Empty list shows a distinct
  /// prompt so the user knows there's nothing left.  Always rebuilds a
  /// fresh snapshot — a new delete session should start from every
  /// current item shown, nothing pre-hidden.
  function _renderListScreen(state) {
    const menu = state.getActiveMenu();
    if (menu.items.length === 0) {
      return '{<}';
    }
    state._deleteListSnapshot = _buildSnapshot(state);
    return '{,' + _buildListBody(state) + '}';
  }

  /// In-place redraw ({;...}) of the delete list — used after every
  /// `{t<n>}` (successful delete or stale/out-of-range no-op).  Never
  /// pushed onto pfodWeb's nav stack, so the physical back button always
  /// resolves to whatever led to the original bare `{t}` open (editMenu),
  /// never a stale `{t<n>}` from mid-delete-sequence.  Once every real
  /// item is gone there's nothing left to redraw, so go back instead.
  function _renderListUpdate(state) {
    const menu = state.getActiveMenu();
    if (menu.items.length === 0) {
      return '{<}';
    }
    return '{;' + _buildListBody(state) + '}';
  }

  function _cannotDeleteSubMenuMsg(item) {
    const name = _leadingText(item);
    return '{=<bg w><bl><+2>Requested Delete not Completed</+2>\n<bl><-1>Use back button\nto return to previous menu.}'
      + '\n=========================\n'
      + 'Cannot delete \n  ' + name + '\n'
      + 'It is a subMenu button that is connected to \n  ' + name + '\n'
      + 'Delete all the menu items from\n ' + name + ' first.'
      + '\n=========================\n';
  }

  /// idx here is a SNAPSHOT slot index (see _buildSnapshot), not a live
  /// menu.items position — the two only coincide until the first delete
  /// of this session.  The item's real, current position in menu.items
  /// is re-derived by object identity (indexOf) since earlier deletes in
  /// this same session may have shifted it down.
  function _deleteAndReturnEmpty(state, idx) {
    const snapshot = state._deleteListSnapshot;
    const entry    = snapshot && snapshot[idx];
    if (entry && !entry.deleted) {
      const item = entry.item;
      if (item.type === ITEM_TYPE_SUBMENU && item.subMenu && item.subMenu.items.length > 0) {
        return { pfod: _cannotDeleteSubMenuMsg(item), skipSave: true };
      }
      const menu    = state.getActiveMenu();
      const realIdx = menu.items.indexOf(item);
      if (realIdx !== -1) {
        menu.items.splice(realIdx, 1);

        // Keep state.activeItemIdx pointing at the same authored
        // row, or null when its row was the deleted one.
        if (state.activeItemIdx !== null && state.activeItemIdx !== undefined) {
          if (state.activeItemIdx === realIdx)    state.activeItemIdx = null;
          else if (state.activeItemIdx > realIdx) state.activeItemIdx -= 1;
        }
        entry.deleted = true;
        state.save();
      }
    }
    return _renderListUpdate(state);
  }

  /// Dispatch handler.  depth points to the matched 't' byte; the cmd's
  /// activeMenuPath prefix and 'x' delimiter follow at depth+1 (see
  /// _openCmd), then the optional snapshot-slot index.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth — index of 't' in rawCmd
  /// @returns {{pfod: string, skipSave: boolean}}
  function send(rawCmd, state, depth) {
    const idx = _parseDeleteIdx(rawCmd, depth + 1);
    if (idx === null) {
      // Bare open (no slot index after the 'x') — just the list, no mutation.
      return { pfod: _renderListScreen(state), skipSave: true };
    }
    return _deleteAndReturnEmpty(state, idx);
  }

  // openCmd is exposed so editMenu.js's own Delete Items button can emit
  // the exact same path-prefixed cmd this file expects to parse back.
  return Object.freeze({ send, openCmd: _openCmd });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('t', DesignerDeleteMenuItems.send);
