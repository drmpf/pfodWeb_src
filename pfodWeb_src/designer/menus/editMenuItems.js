/*
 * designer/menus/editMenuItems.js
 *
 * Handler pair for the editMenu's "Edit Menu" button — cmd 'J' (the
 * EM_EDIT_MENU_ITEMS_CMD already wired in editMenu.js).  Opens a
 * screen listing every item in the active menu so the user can pick
 * one to edit; the pick routes into the per-item editor (the 'd'
 * handler in editMenuItem.js).
 *
 * Mirrors pfodDesignerV2/DesignerMsgProcessor.java:
 *   editMenuItemsCmd      ('J', line 230) → editMenuItemsCmd  (line 3905)
 *   selectMenuItemToEditCmd ('K', line 231) → selectMenuItemToEdit (line 2776)
 * plus EditScreenData.java:
 *   getDesignerMenuWithoutPromptMsg (line 1166) — the per-row emit
 * and pfodAppBase V2_MenuItem.toMsgAsButtonNoFormat (line 290) which
 * is the helper Java's per-row call goes through:
 *   `|<cmd>~<+0><leadingTextNoFormat></+0>`
 *
 * Two-step workflow:
 *
 *   1. {J}        → render item-list screen (`{,…}` menu).  Per-row
 *                   cmd is `K<idx>` so the click routes to the 'K'
 *                   handler.  Per-row format is DESIGNER_MENU_FMT
 *                   (matches the other designer list screens).
 *   2. {K<idx>}   → set state.activeItemIdx = idx, queue `{d}` to
 *                   open the per-item editor, return PFOD_EMPTY.
 *                   pfodWeb's request queue then sends `{d}` which
 *                   dispatches to editMenuItem.js, rendering the
 *                   editor with the active item.
 *
 * Why queue `{d}` instead of returning the editor screen inline?
 * Returning inline would push `{K<idx>}` onto pfodWeb's nav stack,
 * so back-nav from the editor would re-fire the K cmd and re-set
 * activeItemIdx — idempotent but ugly.  Queueing `{d}` makes the
 * editor's natural cmd land on the nav stack instead, so back-nav
 * from the editor cleanly re-renders THIS list screen via `{J}`.
 *
 * Empty menu: Java shows a distinct "No menu items to edit in"
 * prompt and no rows — pointing the user back at the editMenu's
 * Add Menu Item button.  This handler matches that wording.
 *
 * Sub-menus: out of scope here — pfodWeb's state tree doesn't yet
 * have submenu items.  Once sub-menus land, the {K<idx>} branch
 * gains a "if item.type === 'submenu' → editSubMenuItem" path
 * mirroring Java's lines 2811-2814.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerEditMenuItems = (() => {

  // Cmd byte the per-row buttons send back; Java's
  // selectMenuItemToEditCmd at DesignerMsgProcessor.java line 231.
  const EMIE_SELECT_CMD = 'K';

  // ── Helpers ──────────────────────────────────────────────────────

  /// Parse a non-negative decimal integer starting at rawCmd[startIdx];
  /// stops at first non-digit.  Returns int or null when no digits.
  function _parseIdx(rawCmd, startIdx) {
    let s = '';
    for (let i = startIdx; i < rawCmd.length; i++) {
      const c = rawCmd[i];
      if (c >= '0' && c <= '9') s += c;
      else break;
    }
    if (s.length === 0) return null;
    return parseInt(s, 10);
  }

  /// `\n`→space + trim + single-space fallback.  Mirrors Java
  /// V2_MenuItem.getLeadingTextNoFormat (java/pfodAppBase/MenuItems/
  /// V2_MenuItem.java line 192-199).  Same helper shape as
  /// moveMenuItems / deleteMenuItems.
  function _leadingText(item) {
    const raw     = item.text || '';
    const trimmed = raw.replace(/\n/g, ' ').trim();
    return trimmed.length > 0 ? trimmed : ' ';
  }

  /// Type-tag suffix appended beneath the leading text on each row
  /// — `\n<bw><i><-3>(Button)` / `(Label)` / `(<type>)`.  Matches
  /// the row pattern used by moveMenuItems + deleteMenuItems and
  /// the parenthesised type names from
  /// pfodDesignerV2/.../designerSupport/V2_MenuItemEnum.java
  /// lines 48 / 54 / 60 / 66.
  function _typeTagSuffix(item) {
    let typeStr;
    if      (item.type === 'button') typeStr = '(Button)';
    else if (item.type === 'label')  typeStr = '(Label)';
    else if (item.type === 'onoff')  typeStr = '(On/Off Setting or Pulse)';
    else if (item.type === 'pwm')    typeStr = '(Slider Input, PWM or DAC Output)';
    else                             typeStr = '(' + item.type + ')';
    return '\n<bw><i><-3>' + typeStr;
  }

  // ── Screen ───────────────────────────────────────────────────────

  /// Render the item-list screen ({,…} menu).  Prompt text mirrors
  /// pfodDesignerV2 DesignerMsgProcessor.java lines 3916-3940
  /// (non-submenu branch — submenus not yet supported in pfodWeb).
  /// Per-row emit follows toMsgAsButtonNoFormat exactly:
  ///   |K<idx><DESIGNER_MENU_FMT>~<+0><leadingText></+0>
  /// No type-tag suffix (unlike delete / move screens) — Java's
  /// emit here is intentionally bare so the row reads as a direct
  /// "click this item to edit it" affordance.
  function _renderListScreen(state) {
    const menu = state.getActiveMenu();
    const hasItems = menu.items.length > 0;

    let out = '{,' + DESIGNER_PROMPT_FMT + '~';

    if (hasItems) {
      out += '<+2><b><y>Edit a Menu Item from</b>\n<b>';
      out += '<l>' + state.name + '</l></b><-2>\n';
      out += 'Select a menu item to edit it.\n';
      out += '<i><y>Preview Menu</i> and <i><y>Editing Menu Item</i> screens show an accurate preview.\n';
      out += 'Use <i><y>Add Menu Item</i> from the main Editing screen, to add a new menu item.';
    } else {
      out += '<+2><b><y>No menu items to edit in</b>\n<b>';
      out += '<l>' + state.name + '</l></b><-4>\n';
      out += 'Go back and use <i><y>Add Menu Item</i> to add a new menu item.';
    }

    // Per-row emit: `|K<idx>~<+0><leadingText></+0><typeTag>`
    // — V2_MenuItem.toMsgAsButtonNoFormat shape (no format prefix
    // between cmd and `~`) plus the parenthesised type suffix on a
    // second line so the user can tell rows apart by type, matching
    // the pattern moveMenuItems / deleteMenuItems use.  Java's
    // toMsgAsButtonNoFormat itself doesn't add the type tag, but
    // the user wants every item-list screen in the designer to
    // share the same row shape.
    menu.items.forEach((item, idx) => {
      out += '|' + EMIE_SELECT_CMD + idx;
      out += '~<+0>' + _leadingText(item) + '</+0>';
      out += _typeTagSuffix(item);
    });
    out += '}';
    return out;
  }

  // ── Dispatch ─────────────────────────────────────────────────────

  /// Handler for cmd byte 'J'.  Always renders the item-list screen;
  /// any trailing bytes after 'J' are ignored (Java's editMenuItemsCmd
  /// at line 3905 likewise ignores anything past the bare cmd — the
  /// dispatch on row clicks goes through 'K', not back through 'J').
  function _sendJ(rawCmd, state, depth) {
    console.error('[Designer] {J} Edit Menu Items: path=' + JSON.stringify(state.activeMenuPath) +
                  ' idx=' + state.activeItemIdx +
                  ' items.length=' + state.getActiveMenu().items.length);
    return { pfod: _renderListScreen(state), skipSave: true };
  }

  /// Handler for cmd byte 'K'.  Parses `{K<idx>}`, validates idx,
  /// stashes it as state.activeItemIdx so editMenuItem.js's
  /// getActiveItem() resolves the row, then queues `{d}` to open
  /// the editor.  Returns PFOD_EMPTY — the queued `{d}` is the
  /// actual screen the user lands on.  Out-of-range idx falls
  /// through to PFOD_EMPTY without mutating activeItemIdx (avoids
  /// stale pointers if a re-fire ever lands on a now-shorter list).
  function _sendK(rawCmd, state, depth) {
    const idx = _parseIdx(rawCmd, depth + 1);
    if (idx === null) return PFOD_EMPTY;
    const menu = state.getActiveMenu();
    if (idx < 0 || idx >= menu.items.length) return PFOD_EMPTY;

    console.error('[Designer] {K' + idx + '}: selecting item in path=' +
                  JSON.stringify(state.activeMenuPath) + ' type=' + menu.items[idx].type);
    state.activeItemIdx = idx;
    state.save();
    // Dispatch {d} directly — returns the item editor screen so pfodWeb
    // pushes {d} (not {K<idx>}) onto the nav stack.
    return DesignerDispatch.dispatch('{d}', state, DISPATCH_ROOT_DEPTH);
  }

  return Object.freeze({ sendJ: _sendJ, sendK: _sendK });
})();

// Self-register both cmd bytes into the top-level designer dispatcher.
DesignerDispatch.add('J', DesignerEditMenuItems.sendJ);
DesignerDispatch.add('K', DesignerEditMenuItems.sendK);
