/*
 * designer/menus/formats.js
 *
 * Shared pfod-format constants + helpers used by every designer menu
 * file under designer/menus/.  Lives at the top of the menu-file load
 * order so each handler can reference these as plain globals.  Change
 * a colour or spacer size here, every menu picks it up.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java private constants
 *         (BACKGROUNG_COLOR, Designer_Prompt_Format, Designer_Menu_Format,
 *         Desinger_EnabledMenu_Format, Desinger_DisabledMenu_Format) and
 *         getSpacingLabel().  The JS port intentionally diverges from
 *         the Java's literal "<bg gy><gy>" disabled style (see
 *         DESIGNER_DISABLED_FMT comment below).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// Dark navy background colour used across every designer screen.
const DESIGNER_BG = '<bg 0f0f30>';

// Prompt-area format — title / header block.
const DESIGNER_PROMPT_FMT = DESIGNER_BG + '<w>';

// Default menu-item format (full prompt-bg + white text).
const DESIGNER_MENU_FMT = DESIGNER_BG + '<w>';

// Alias for the cases where the Java named the same format differently
// to signal "this item toggles between enabled and disabled".  Kept for
// readability at call sites: `editDeleteFmt = (count===0) ? DISABLED : ENABLED`.
const DESIGNER_ENABLED_FMT = DESIGNER_MENU_FMT;

// Disabled menu-item format — '!' prefix marks the item disabled (no
// cmd fires when pressed) plus a darker variant of the prompt-bg so
// the disabled state is visually distinct.  pfodWeb's CSS rule
// `.pfod-menu-button:disabled` supplies the dashed outline and grey
// text on top.  Java used "<bg gy><gy>" (literal grey rectangle) which
// fights the dashed-on-dark look; the JS port deliberately diverges.
const DESIGNER_DISABLED_FMT = '!<bg 050518>';

// pfod cmd byte used for no-op spacer label items.  pfodDesignerV2
// reserved 'Z' for this so multiple spacers don't collide with real
// menu cmds; we follow the same convention.
const DESIGNER_EMPTY_RESPONSE_CMD = 'Z';

/// Produce a pfod menu-item that renders as a thin spacer.  `n` is a
/// per-menu unique suffix so adjacent spacers have distinct cmd paths
/// (pfodWeb dedupes by cmd).  Always disabled, sized at -12pt to take
/// minimal vertical room.
///
/// @param {number} n — spacer index within the menu (0, 1, 2, …)
/// @returns {string} pfod menu-item fragment, e.g. "|!Z0<-12>"
function designerSpacing(n) {
  return '|!' + DESIGNER_EMPTY_RESPONSE_CMD + n + '<-12>';
}

/// Shared Target header prefix for the designer's top-level screens
/// (mainMenu, selectFromMenuList, editMenu).  Just the board name in
/// bold yellow followed by a blank line so the screen-specific title
/// that follows is visually separated:
///
///   <b><y>boardName</y></b>
///   <blank>
///
/// Lives here so every screen renders the same block — change the
/// formatting once and every entry point picks it up.  state.board is
/// guaranteed present by the DesignerVirtualDevice constructor.
///
/// @param {DesignerState} state
/// @returns {string} pfod prompt fragment ready to concatenate after
///                   the opening `{,<promptFmt>~`.
function designerTargetHeader(state) {
  return '<b><y>' + state.board.name + '</y></b>\n\n';
}

// ── Colour palette (pfod 16 named colours + Default) ────────────────
//
// Used by the Edit Prompt screen's Set Font Colour / Set Background
// Colour pickers.  Order is significant — the index in this array is
// what the picker sends back via {<pickerCmd>`<idx>}, so reordering
// would break already-saved designs.  Index 0 is always "Default" (a
// null code meaning "clear the override").  Remaining entries match
// Java pfodDesignerV2's `ColourMapEntry.COLORS_16` so a design's stored
// codes round-trip with the Java version.
//
// `code` is the pfod tag suffix that goes straight into `<bg X>` and
// `<X>` tags at render time — no name-to-code translation needed.
const DESIGNER_COLOUR_PALETTE = Object.freeze([
  { label: 'Default', code: null },
  { label: 'Black',   code: 'bk' },
  { label: 'Red',     code: 'r'  },
  { label: 'Green',   code: 'g'  },
  { label: 'Yellow',  code: 'y'  },
  { label: 'Blue',    code: 'bl' },
  { label: 'Magenta', code: 'm'  },
  { label: 'Cyan',    code: 't'  },
  { label: 'White',   code: 'w'  },
  { label: 'Grey',    code: 'gy' },
  { label: 'Lime',    code: 'l'  },
  { label: 'Olive',   code: 'o'  },
  { label: 'Navy',    code: 'n'  },
  { label: 'Purple',  code: 'p'  },
  { label: 'Silver',  code: 's'  },
  { label: 'Fuchsia', code: 'f'  },
  { label: 'Aqua',    code: 'a'  },
]);

/// Look up the palette index for a stored colour code.  Falls back to
/// 0 (Default) on null / unknown — used by the picker to set the
/// initial selection cursor so the user sees their current choice
/// highlighted.
function designerColourIndex(code) {
  if (code === null) return 0;
  for (let i = 1; i < DESIGNER_COLOUR_PALETTE.length; i++) {
    if (DESIGNER_COLOUR_PALETTE[i].code === code) return i;
  }
  return 0;
}

/// Look up the palette entry for an index (clamped to valid range).
/// Used by the picker's apply path to translate the submitted index
/// back into a code string for state.
function designerColourFromIndex(idx) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= DESIGNER_COLOUR_PALETTE.length) {
    return DESIGNER_COLOUR_PALETTE[0];
  }
  return DESIGNER_COLOUR_PALETTE[idx];
}

// ── Refresh-interval table (Java RefreshIntervalEnum) ───────────────
//
// Six fixed options that the editMenu's "Refresh Interval" toggle
// cycles through.  Order is significant — the index is what pfodWeb
// sends back via {M`<idx>}, so reordering would break already-saved
// designs.  Labels match pfodDesignerV2/designerSupport/
// RefreshIntervalEnum.java exactly.  ms is the value stored on the
// active menu's refresh_ms field; 0 = NONE (no auto-refresh).
const DESIGNER_REFRESH_INTERVALS = Object.freeze([
  { label: 'None',   ms: 0 },
  { label: '1 sec',  ms: 1000 },
  { label: '5 sec',  ms: 5000 },
  { label: '30 sec', ms: 30 * 1000 },
  { label: '5 min',  ms: 5 * 60 * 1000 },
  { label: '15 min', ms: 15 * 60 * 1000 },
]);

/// Pre-built option string for the toggle item — labels separated by
/// '\' (the pfod toggle-options separator pfodMenuParser splits on
/// when the string contains no '|').  Matches Java's
/// RefreshIntervalEnum.getMenuString().
const DESIGNER_REFRESH_OPTIONS_STR =
  DESIGNER_REFRESH_INTERVALS.map((e) => e.label).join('\\');

/// Translate a stored refresh_ms value to its palette index.  Matches
/// Java's RefreshIntervalEnum.refreshIntToEnum: 0 → NONE (idx 0); a
/// non-zero value picks the FIRST entry whose ms is >= the stored
/// value, falling back to the largest entry.  Closest-fit lets a
/// stale refresh_ms (e.g. from a future device that picked some
/// arbitrary ms) still map onto one of the six options.
function designerRefreshIdx(ms) {
  if (ms === 0) return 0;
  for (let i = 1; i < DESIGNER_REFRESH_INTERVALS.length; i++) {
    if (ms <= DESIGNER_REFRESH_INTERVALS[i].ms) return i;
  }
  return DESIGNER_REFRESH_INTERVALS.length - 1;
}

/// Look up the refresh-interval entry for an index (clamped).  Used
/// by the toggle's apply path to translate the submitted index back
/// into ms for state.
function designerRefreshFromIndex(idx) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= DESIGNER_REFRESH_INTERVALS.length) {
    return DESIGNER_REFRESH_INTERVALS[0];
  }
  return DESIGNER_REFRESH_INTERVALS[idx];
}

// ── Item format encoding split into two slots ───────────────────────
//
// Menu items have two places format can live:
//   - The ITEM-FORMAT slot between cmd and `~`  (e.g. `|A<bg gy>~Text`)
//   - INLINE inside the text content after `~`  (e.g. `|A~<b>Text`)
//
// pfodMenuDisplay.applyUpdate merges item-format-slot sticky fields
// (bold/italic/underline/fontSize/textColor) with upgrade-only
// semantics — a `false`/`0`/`null` value in the update is treated as
// "leave alone".  That means a designer toggle-OFF (which sends
// bold=false) can't clear bold in the item-format slot.  item.text,
// in contrast, is fully replaced when non-empty.
//
// Workaround: put sticky inline-eligible formats INSIDE the text
// content, not in the item-format slot.  Whatever inline tags the
// designer emits drive the look entirely; toggle-OFF just stops
// emitting them and the next text replace wipes them.  `<bg X>`
// stays in the item-format slot because pfodSetFormattedText rejects
// inline `<bg X>` (see pfodButtonRenderer.js).  Non-sticky `+`/`@`
// flags stay in the slot too because applyUpdate already full-
// replaces them.

/// Build the item-format-slot prefix.  Goes between the cmd byte and
/// the `~` separator: `|<cmd><prefix>~<inlineFmt><text>`.  Carries
/// only the slot fields that aren't suitable inline.
function designerItemPrefix(fmt) {
  let out = '';
  if (fmt.bgColour) out += '<bg ' + fmt.bgColour + '>';
  if (fmt.flash)    out += '+';
  if (fmt.sound)    out += '@';
  return out;
}

/// Build the inline-format tags that go INSIDE the text content,
/// before the user-visible text.  Order: size → bold → italic →
/// underline → fontColour.  pfodSetFormattedText's tag stack keeps
/// these open until end-of-text (auto-close rule); no closing tags
/// needed.
function designerInlineFormat(fmt) {
  let out = '';
  if (fmt.fontSize > 0) out += '<+' + fmt.fontSize + '>';
  if (fmt.fontSize < 0) out += '<' + fmt.fontSize + '>';   // already has '-'
  if (fmt.bold)         out += '<b>';
  if (fmt.italic)       out += '<i>';
  if (fmt.underline)    out += '<u>';
  if (fmt.fontColour)   out += '<' + fmt.fontColour + '>';
  return out;
}
