/*
 * designer/menus/deleteMenuItems.js
 *
 * Handler for the 't' (EM_DELETE_MENU_ITEMS_CMD) item on the editMenu
 * screen: opens a list of the active menu's items, then on the second
 * cmd deletes the picked entry.
 *
 *   {t}      → list every item in the active menu as a red delete
 *              button (one button per item, cmd `t<idx>`)
 *   {t<n>}   → splice items[n] out of menu.items, then re-emit the
 *              edit menu so the user lands back at the items-list
 *              caller (NOT this delete screen — see "back-nav
 *              idempotency" below)
 *
 * Back-nav idempotency: pfodWeb pushes the cmd that produced each
 * non-update menu response onto its nav stack.  If `{t<n>}` were
 * answered with a refreshed list screen, the user's back-press from
 * that list would re-fire `{t<n>}` and silently delete whatever was
 * now sitting at index <n>.  Mirroring deleteEmptyMenuList's design
 * by returning the EDIT MENU instead means the cmd on the stack
 * after a delete is the edit menu (`{a}` shape), so back-press is a
 * harmless re-render — never a re-delete.  The cost is one extra tap
 * if the user wants to delete several items in a row.
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

/// Read a non-negative decimal integer starting at rawCmd[startIdx];
/// stops at the first non-digit (typically `}`).  Returns the integer
/// or null when no digits were found (bare `{t}` case).
function _parseDeleteIdx(rawCmd, startIdx) {
  let s = '';
  for (let i = startIdx; i < rawCmd.length; i++) {
    const c = rawCmd[i];
    if (c >= '0' && c <= '9') s += c;
    else break;
  }
  if (s.length === 0) return null;
  return parseInt(s, 10);
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

  /// Render the delete-list screen for the active menu.  Each row is
  /// a clickable red-bg button whose cmd is `t<idx>` so the click
  /// round-trips through this same 't' handler.  Empty list shows a
  /// distinct prompt so the user knows there's nothing left.  No
  /// version tag — the list shrinks every delete, so caching would
  /// stale immediately.
  ///
  /// Per-row text matches Java DesignerMsgProcessor.java:4060-4061
  /// exactly: format prefix `<bg r><w>` then `~Delete\n<leadingText>
  /// \n<bw><i><-3>(Type)`.  Renders as three stacked lines —
  ///   line 1: literal "Delete" cue
  ///   line 2: the item's one-line leading text
  ///   line 3: small italic "(Button)" / "(Label)" type tag
  /// — visually marking each row as a delete action separate from
  /// the actual menu item it refers to.
  function _renderListScreen(state) {
    const menu = state.getActiveMenu();
    if (menu.items.length === 0) {
      return '{<}';
    }
    const prompt = 'Click the item to be removed from the menu\n<-2>Use the bottom back arrow to return to the <i><y>Editing Menu</i> screen';
    let out = '{,' + DESIGNER_PROMPT_FMT + '~' + prompt;
    menu.items.forEach((item, idx) => {
      out += '|t' + idx + '<bg r><w>~Delete\n';
      out += _leadingText(item);
      out += _typeTagSuffix(item);
    });
    out += '}';
    return out;
  }

  /// Splice items[idx] out, fix up activeItemIdx, save, then return
  /// the editMenu screen as an in-place update `{;…}`.
  ///
  /// Both the delete-list screen ({t}) and this response are returned
  /// as `{;…}` (in-place updates), so neither adds an entry to
  /// pfodWeb's nav stack.  Back-nav from the resulting editMenu screen
  /// re-fires whatever `{,}` cmd brought the user to editMenu in the
  /// first place (e.g. `{b12}` from selectFromMenuList), skipping the
  /// delete-list entirely — which is the expected behaviour regardless
  /// of the entry path.
  ///
  /// Out-of-range idx (stale re-fire): no mutation, still returns the
  /// editMenu update so the user lands on editMenu, never a stale list.
  function _cannotDeleteSubMenuMsg(item) {
    const name = _leadingText(item);
    return '{=<bg w><bl><+2>Requested Delete not Completed</+2>\n<bl><-1>Use back button\nto return to previous menu.}'
      + '\n=========================\n'
      + 'Cannot delete \n  ' + name + '\n'
      + 'It is a subMenu button that is connected to \n  ' + name + '\n'
      + 'Delete all the menu items from\n ' + name + ' first.'
      + '\n=========================\n';
  }

  function _deleteAndReturnEmpty(state, idx) {
    const menu = state.getActiveMenu();
    if (idx >= 0 && idx < menu.items.length) {
      const item = menu.items[idx];
      if (item.type === ITEM_TYPE_SUBMENU && item.subMenu && item.subMenu.items.length > 0) {
        return { pfod: _cannotDeleteSubMenuMsg(item), skipSave: true };
      }
      menu.items.splice(idx, 1);

      // Keep state.activeItemIdx pointing at the same authored
      // row, or null when its row was the deleted one.
      if (state.activeItemIdx !== null && state.activeItemIdx !== undefined) {
        if (state.activeItemIdx === idx)    state.activeItemIdx = null;
        else if (state.activeItemIdx > idx) state.activeItemIdx -= 1;
      }
      state.save();
    }
    if (menu.items.length === 0) {
      return '{<}';
    }
    return DesignerDispatch.dispatch('{t}', state, DISPATCH_ROOT_DEPTH);
  }

  /// Dispatch handler.  depth points to the matched 't' byte; the
  /// optional decimal index follows at depth+1.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth — index of 't' in rawCmd
  /// @returns {{pfod: string, skipSave: boolean}}
  function send(rawCmd, state, depth) {
    const idx = _parseDeleteIdx(rawCmd, depth + 1);
    if (idx === null) {
      // Bare `{t}` — just the list, no mutation.
      return { pfod: _renderListScreen(state), skipSave: true };
    }
    return _deleteAndReturnEmpty(state, idx);
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('t', DesignerDeleteMenuItems.send);
