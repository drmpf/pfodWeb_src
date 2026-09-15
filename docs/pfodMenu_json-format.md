# pfodWeb Menu Design JSON (`.pfodMenu_json`) — Format Reference

Audience: an AI (or tool) that must **read and modify a saved pfodWeb menu design**
so a user can say "add a menu item that ..." and get a correct file back.

Companion document: `pfodDwg_json-format.md` (drawing files, `.pfodDwg_json`).

---

## 1. What this file is

A `.pfodMenu_json` file is a complete, self-contained snapshot of one **menu design**
created in the pfodWeb Menu Designer. It holds the whole menu **tree** (a root menu
plus any nested sub-menus), the target board, and the connection type. From it the
designer can:

* re-open the design for editing (`importFromObject`),
* live-preview it as a real pfod device,
* generate an Arduino/C++ sketch that serves that menu.

### Producers / consumers in the source

| Role | File | Function |
|---|---|---|
| Writer (canonical) | `pfodWeb_src/designer/state.js` | `DesignerState.exportToJSON()` / `_exportableMenu()` |
| Reader (canonical) | `pfodWeb_src/designer/state.js` | `DesignerState.importFromObject()` → `_parseMenuTolerant()` → `_parseItemTolerant()` |
| File save UI | `pfodWeb_src/designer/menus/saveToFile.js` | bare `.pfodMenu_json`, or a `<name>_menuJson.zip` when the design links drawings |
| File load UI | `pfodWeb_src/designer/menus/loadFromFile.js` | accepts both the bare file and the zip |
| Code generation | `pfodWeb_src/designer/menus/generateCode.js`, `generateCcode.js` | |
| Live preview (wire encode) | `pfodWeb_src/designer/menus/previewMenu.js` | |

### File / bundle shapes

* **No linked drawings** → a single `<Name>.pfodMenu_json`.
* **One or more `drawing` items** → `<Name>_menuJson.zip` containing

  ```
  <Name>.pfodMenu_json             <- at the zip's root, no wrapper directory
  dwgs/
      <DwgA>.pfodDwg_json
      <DwgB>.pfodDwg_json          <- every dwg reached, including via insertDwg
  ```

  The `.pfodMenu_json` bytes are identical either way; the loader accepts both.

  Three commands write this exact shape — *Save Design to File*, the Dwg
  Controls Panel's *Save Dwg* (which wraps the drawing in a trivial
  one-item design so it is an ordinary bundle), and every *Generate Code*
  target, which carries it in the sketch's `menujson/` directory. They all
  go through one builder, `saveToFile.js`'s `buildBundleFrom`.

  The loader matches on POSITION, not just on extension: the design at the
  root, the drawings under `dwgs/`. Write that shape. Matching on position
  is what makes it a real check rather than a guess about any zip that
  happens to hold a likely-looking json.

  Reading is more forgiving than writing, because a user will unzip a
  bundle, edit a drawing and zip it back up — and no ordinary tool
  reproduces what pfodWeb writes. So on the way in:

  * **One wrapping directory is looked through**, whatever it is called.
    Zipping the *folder* rather than its contents puts its name in front of
    every path; that is the obvious gesture and it loads. Only one level —
    see below.
  * **Packaging debris is ignored**: a macOS `__MACOSX/` tree and its
    `._`-prefixed AppleDouble stubs, `.DS_Store`, `Thumbs.db`, and
    directory entries. The zip therefore does not need a single tidy
    top-level folder — a stray readme beside it is fine too.
  * **STORE and DEFLATE are both read.** pfodWeb only ever writes STORE
    (there is nothing to gain compressing a few hundred bytes of json), but
    every desktop zip tool writes DEFLATE, so refusing it would break the
    round trip for no benefit.

  Still rejected, and deliberately: a design **two** or more directories
  down.
When you add a `drawing` menu item to a zip bundle, **add the matching
`.pfodDwg_json` under `dwgs/` too**. The loader reads a zip's `dwgs/` entries into the
drawing library *before* it parses the menu json, so a self-contained bundle resolves
every reference with no prompting.

Leaving it out is recoverable rather than fatal — see
[Missing Drawings](#81-missing-drawings) — but it makes the bundle depend on whatever
the user happens to have loaded already, which is exactly what the zip exists to avoid.

---

## 2. Top-level object

```json
{
  "format": "pfodDesigner",
  "schema": 12,
  "name": "LedOnOff_serial",
  "connection": "serial",
  "boardName": "Arduino UNO",
  "savedAt": "2026-07-30T06:31:50.540Z",
  "js_ver": "V4.1.2-- 27th July 2026",
  "rootMenu": { }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `format` | string | **yes** | Must be exactly `"pfodDesigner"`. Any other value is a **hard** load failure — the file is rejected and nothing is imported. |
| `schema` | number | yes | Current version is `12`. **`11` is an accepted legacy version** — it loads with no mismatch warning, and is assumed to have been built for an Arduino UNO (see [§2.1](#21-target-verification-on-load)). Any other value still loads but warns. Keep it at `12` when editing. |
| `name` | string | **yes** | Design name. Non-empty. Hard failure if missing (unless the loader supplies an override name). If the name collides with an existing design, the loader auto-suffixes `_2`, `_3`, … |
| `savedAt` | string | no | ISO-8601 timestamp. Regenerated on every save; never read back. |
| `js_ver` | string | no | Designer build string. Informational only. |
| `rootMenu` | object | **yes** | The root [menu node](#3-menu-node). Missing → replaced with a fresh empty menu + warning. |
| `connection` | string | no | One of `"serial"`, `"ble"`, `"tcp"`, `"http"`. Only applied on load if the currently-selected board supports it; otherwise silently left at the board default. |
| `boardName` | string | no | **New in schema 12.** The target this design was built for, e.g. `"Arduino UNO"`, `"Bee Motion"` — the board's own display name. Drives the load-time checks in [§2.1](#21-target-verification-on-load). Absent in schema 11 files, which are assumed to be UNO. |

Written in that order: what the file is (`format`, `schema`), what the design is called
(`name`), what it targets (`connection`, `boardName`), how it was produced (`savedAt`,
`js_ver`), then `rootMenu` last because it is by far the largest. Order is presentation
only — the loader reads named fields, so a file with the keys in any order loads
identically.

Top-level keys other than these are ignored.

### 2.1 Target verification on load

Pin assignments and ADC ranges are **board-specific**, but a design file can be opened
against any board. So on every load the designer repairs the design against the board
currently selected — you do not have to keep them in sync by hand, and you cannot
assume the values you write will survive unchanged onto a different target.

**Pins** (`_clearInvalidPins()`, runs on every load):

* a pin whose `name` is not on the current board → `null`
* a pin whose name exists but whose **capabilities no longer cover the item's
  `type`** (a `pwm_output` on a pin that is digital-only here) → `null`
* `pwm_output` → `dac_output` where the board pin natively supports DAC
* a missing `codeName` is filled in from the board pin
* on a board with no pins at all (Unlisted Board), a real pin is downgraded to the
  `"?"` placeholder rather than silently disconnected

**ADC-seeded ranges** (`_retargetAdcRanges()`, runs only when `boardName` differs from
the current board). `datadisplay` items and `chart` plots are seeded from the board's
ADC block when created, so moving a 10-bit/5 V AVR design to a 12-bit/3.3 V ESP32 would
otherwise leave them reading the wrong full scale:

| Field | Re-derived? |
|---|---|
| `maxValue` / `dataRangeMax` | **always** — the ADC's full-scale count is a hardware fact |
| `maxScaleStr` / `displayMax` | only while the units still read exactly `"V"`, i.e. still the seeded reference-voltage reading |
| `trailingText` / `units` | never |

The units condition is what protects deliberate scaling: set `trailingText` to
`"degC"` and your `maxScaleStr` is left alone, while the raw range is still corrected.
Every change is reported, so a cross-target load always tells the user what moved:

```
rootMenu.items[0].maxValue: 1023 was set for "Arduino UNO" — re-derived to 4095 for "Bee Motion"
```

A schema 11 file has no `boardName`, so it is treated as an UNO design. That assumption
is only *reported* when it actually changed something — i.e. when the re-derivation
above rewrote at least one range. A design with no Data Display and no chart has
nothing for the target to affect, so it opens silently whatever board is selected.
When the note does appear it heads the list of changes it caused, and suggests
re-saving to record the real target.

Every current writer records `boardName`, including the wrapper menu bundled inside a
generated sketch zip — the Dwg Designer is reached through the Menu Designer, so a
target is always selected. A schema 12 file without the field is therefore unusual,
and is handled the same way as a schema 11 one.

---

## 3. Menu node

`rootMenu`, and every `subMenu` inside a `submenu` item, have the **same shape**:

```json
{
  "promptText": "Prompt Not Set",
  "promptFormat": { },
  "items": [ ],
  "refresh_ms": 0
}
```

| Field | Type | Default | Notes |
|---|---|---|---|
| `promptText` | string | `"Prompt Not Set"` on a fresh menu (saved examples often use `""`) | Title text, shown **below** the menu items (pfodWeb renders the prompt in the bottom strip — `pfodMenuDisplay.js`). `\n` is a real newline. May contain a Markdown link `[text](url)` — see [§5.3](#53-links-in-label-and-prompt-text). |
| `promptFormat` | object | all-defaults | See [§4](#4-format-object). Applies to the prompt text. |
| `items` | array | `[]` | Ordered list; **display order == array order**. |
| `refresh_ms` | number | `0` | Auto re-request interval in **milliseconds**. `0` = no auto-refresh. The designer UI only offers `0, 1000, 5000, 30000, 300000, 900000`; other values load fine but the UI toggle snaps to the nearest listed one. |

A menu node has **no** name or cmd of its own — a sub-menu is reached through its
parent's `submenu` item.

---

## 4. Format object

Used for `menu.promptFormat` and for every item's `formats`. **Exactly these nine
keys** are recognised; anything else produces an "unrecognised field — ignored"
warning on load.

```json
{
  "fontSize": 0,
  "bold": false,
  "italic": false,
  "underline": false,
  "flash": false,
  "sound": false,
  "disabled": false,
  "fontColour": null,
  "bgColour": null
}
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `fontSize` | number | `0` | **Signed relative** size step, not points. `0` = the base size, positive = larger (`<+N>`), negative = smaller (`<-N>`). **+6 doubles the size, −6 halves it** — see [font-size scale](#41-the-fontsize-scale). UI range −6 … +12. |
| `bold` | boolean | `false` | `<b>` |
| `italic` | boolean | `false` | `<i>` |
| `underline` | boolean | `false` | `<u>` |
| `flash` | boolean | `false` | item flashes |
| `sound` | boolean | `false` | plays the alert sound when the item appears |
| `disabled` | boolean | `false` | "User Input Disabled" — the button renders but sends no cmd. Meaningless on `label` items (they are already non-interactive). |
| `fontColour` | string \| null | `null` | `null` = **BLACK_WHITE** — the renderer picks black or white automatically, whichever contrasts with the effective background. Otherwise one of the **16 short colour codes** (see below), dropped straight into a `<X>` tag. **Always a quoted code string — the 16 names only, never a JSON number.** |
| `bgColour` | string \| null | `null` | `null` = **inherit the menu background** (which is itself black unless the menu's own `promptFormat.bgColour` sets it). Otherwise one of the 16 short colour codes, dropped into `<bg X>`. **Always a quoted code string — the 16 names only, never a JSON number.** |

### 4.1 The `fontSize` scale

`fontSize` is an integer **step**, not a point size. Every **+6 doubles** the rendered
size and every **−6 halves** it; the five steps in between are the evenly-spaced
sub-multiples of that doubling (`×1.1225`, `×1.2599`, `×1.4142`, `×1.5874`, `×1.7818`).

Above the first doubling the growth is **linear, not exponential** — each further +6
band adds one more multiple of the base size:

| `fontSize` | −24 | −18 | −12 | −6 | −1 | 0 | +1 | +6 | +12 | +18 | +24 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| size | ÷8 | ÷6 | ÷4 | ÷2 | ÷1.1225 | ×1 | ×1.1225 | ×2 | ×4 | ×6 | ×8 |

Negative steps are the reciprocal of the matching positive step. Non-integer values are
rounded. Implemented by `getActualFontSize()` in `pfodWeb_src/redraw.js`, matching
Android pfodApp's `V2_ImageTextUpdate` exactly.

### Colour values (for `fontColour` / `bgColour`)

**Use one of the 16 short colour codes listed below, and nothing else.** They are the
only values the menu designer can actually round-trip.

The value is written verbatim into a `<X>` / `<bg X>` tag, and the *pfod message layer*
(`pfodColorTagToHex()` in `pfodWeb_src/redraw.js`) is more permissive than that — it
also resolves a `"0"`-`"255"` palette number or an `"RRGGBB"` hex string. **Do not use
those two forms in a menu design.** They render, but the designer does not understand
them, and you lose the value:

* **The colour picker cannot show them.** `designerColourIndex()` (`formats.js:112`)
  scans the 16-entry palette for an exact match and returns `0` (Default) for anything
  else. So the picker opens on "Default" rather than the real colour — and because the
  apply path writes back `designerColourFromIndex(idx).code`, the first time the user
  touches that picker the custom value is **silently overwritten**.
* **Generated code labels them wrong.** `_colorName()` (`generateCode.js:618`) is
  `_COLOR_NAME[code] || code`, so a sketch comment reads `12 text` instead of
  `Red text`. The emitted pfod string itself is still correct.

So the three forms are a property of the *wire protocol*, not of this file format.
A menu design that sticks to the 16 codes survives an edit-and-resave; one that does
not, may not.

> **Also:** whatever you write must be a **string**. A raw JSON number —
> `"fontColour": 12` — is rejected by `_parsePromptFormatTolerant` and silently
> defaults to `null` (with a *"not null|string — defaulted to null"* warning). This
> differs from the **dwg** format, where an item's `color` is a bare JSON number: `-1`
> or a palette index `0`–`255`, and nothing else. The two formats take opposite halves
> of the pfod colour syntax — names here, palette numbers there.

The 16 short colour codes:

| Code | Colour | Code | Colour |
|---|---|---|---|
| `bk` | Black | `l` | Lime |
| `r` | Red | `o` | Olive |
| `g` | Green | `n` | Navy |
| `y` | Yellow | `p` | Purple |
| `bl` | Blue | `s` | Silver |
| `m` | Magenta | `f` | Fuchsia |
| `t` | Cyan / Teal | `a` | Aqua |
| `w` | White | `gy` | Grey |

The designer's colour picker calls its first entry "Default", and picking it stores
`null` — meaning **no tag is emitted for that field**. What you actually get then
differs between the two fields:

* **`fontColour: null`** → the renderer's `<bw>` default: `getBlackWhite()` picks black
  or white for best contrast against the effective background
  (`pfodButtonRenderer.js` — `renderPfodButton`, `renderPfodLabel`, and every other
  item renderer; `pfodMenuDisplay.js:246` for the prompt). Border colour always uses
  this contrast colour regardless of `fontColour`.
* **`bgColour: null`** → the item inherits the menu background:
  `effectiveBg = item bgColor || menuBgColor || '#000000'`.

So a `null` font colour is self-adjusting — set `bgColour` to something dark and the
text flips to white on its own.

> **Exception — `drawing` items.** On export, a `drawing` item's `formats` object is
> trimmed to just `disabled`, `sound` and `flash`, because a dwg item renders as its
> own canvas, never as a formatted text button. Write only those three keys for a
> drawing item.

---

## 5. Menu items

Every item is an object in a menu node's `items` array.

### 5.1 Fields common to all item types

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | **yes** | One of the nine types in §5.2, exactly. Anything else — an unrecognised type, or no `type` at all — means the **whole item is dropped** on load, with a warning naming it. There is no forward-compatibility passthrough. |
| `text` | string | yes | The visible label. For `onoff` / `onoffdisplay` / `pwm` / `datadisplay` this is the **leading** text that precedes the value (note the deliberate trailing space in defaults such as `"PWM Setting "`). |
| `autoCmd` | string | yes | Stable authoring-side identity. Becomes the C++ identifier stem in generated code (`<autoCmd>` → cmd variable, `<autoCmd minus _Cmd>_var` → value variable, `<autoCmd>_pin` → pin constant). **Must be unique across the whole design**, not just within one menu. Convention: `<type>_<Text_with_underscores>_Cmd`, e.g. `button_Start_Cmd`. If invalid/missing it is regenerated from type+text (with a warning). |
| `formats` | object | yes | [Format object](#4-format-object). Missing → all defaults + warning. |
| `ccodeCmd` | string | no | Single letter `A`–`Z` then `a`–`z`. Auto-assigned lazily, only for the "Minimal C Code" target. **Do not invent one** — omit it and let the designer assign it. An invalid value is dropped with a warning. |

The pfod wire cmd actually sent by the device is **not** in this file — it is minted
automatically (sequential `c1`, `c2`, … in preview; generated constants in codegen).

### 5.2 Item types

| `type` | UI name | Interactive? |
|---|---|---|
| `button` | Button | yes |
| `label` | Label | no (rendered with the pfod `!` disabled prefix) |
| `onoff` | On/Off (output) | yes |
| `onoffdisplay` | On/Off Display (input) | no |
| `pwm` | PWM / Slider | yes |
| `datadisplay` | Data / ADC Display | no |
| `submenu` | Sub-menu | yes (opens nested menu) |
| `chart` | Chart | yes (opens a chart view) |
| `drawing` | Drawing | yes (loads a dwg) |

---

### `button`

Nothing beyond the common fields.

```json
{
  "type": "button",
  "autoCmd": "button_Start_Cmd",
  "text": "Start",
  "formats": { "fontSize": 0, "bold": false, "italic": false, "underline": false,
               "flash": false, "sound": false, "disabled": false,
               "fontColour": null, "bgColour": null }
}
```

### `label`

Same shape as `button`, with `type: "label"`. Never sends a command. Default text `"Label"`.
The `text` may contain a Markdown link `[text](url)` — see [§5.3](#53-links-in-label-and-prompt-text).
The designer's text editor allows 128 characters for a label (64 for other item types)
so a link fits.

### `onoff` — two-state output toggle

| Field | Type | Default | Notes |
|---|---|---|---|
| `text` | string | `"Output is "` | leading text |
| `trailingText` | string | `""` | text after the state word |
| `lowText` | string | `"Low"` | label for state 0 |
| `highText` | string | `"High"` | label for state 1 |
| `current` | number | `0` | `0` or `1` — initial/current state. Any other number is coerced to `0`. |
| `pulse` | string | `"none"` | `"none"` = latching setting; `"low"` = a click pulses the output LOW for `pulse_ms`; `"high"` = pulses HIGH. (Legacy boolean `isPulse` is still accepted on load: `true` → `"high"`.) |
| `pulse_ms` | number | `1000` | Pulse duration in ms, must be ≥ 0. Ignored when `pulse` is `"none"`. |
| `displayFormat` | string | `"both"` | `"both"` (text + slider widget), `"text"`, or `"slider"`. |
| `pin` | object \| null | `null` | See [§6](#6-pin-object). Only `onoff` pins carry `invertOutput`. |

### `onoffdisplay` — read-only two-state input

Same as `onoff` **minus** `pulse` / `pulse_ms` (a display item has no output
behaviour). Defaults: `text` `"Input is "`, `lowText` `"Off"`, `highText` `"On"`.
Rendered with the pfod `!` disabled flag so no command is ever sent.

### `pwm` — numeric slider (output)

| Field | Type | Default | Notes |
|---|---|---|---|
| `text` | string | `"PWM Setting "` | leading text |
| `trailingText` | string | `"%"` | trailing text / units |
| `currentValue` | number | `0` | current raw value |
| `maxValue` | number | `255` | raw range max (what the device receives) |
| `minValue` | number | `0` | raw range min |
| `maxScaleStr` | **string** | `"100"` | label shown at the max end of the track |
| `minScaleStr` | **string** | `"0"` | label shown at the min end |
| `displayFormat` | string | `"both"` | as above |
| `pin` | object \| null | `null` | typically `pwm_output` |

`maxScaleStr` / `minScaleStr` are **strings**, kept verbatim, so a raw `0..255` range
can be displayed as `0..100`.

### `datadisplay` — read-only numeric slider (e.g. an ADC reading)

Identical field set to `pwm`, but read-only (pfod `!` prefix), and **`trailingText`
carries the units string** (matching its wire-format position).
Defaults: `text` `"Reading "`, `maxValue` `1023` (or the board's ADC full scale),
`minValue` `0`, `maxScaleStr` `"1023"` (or the board's reference volts), `minScaleStr` `"0"`.

### `submenu` — nested menu

| Field | Type | Required | Notes |
|---|---|---|---|
| `subMenu` | object | **yes** | A full [menu node](#3-menu-node) — its own `promptText`, `promptFormat`, `items`, `refresh_ms`. Missing → replaced with a fresh empty menu + warning. |

Nesting depth is not limited by the format. Default `text` is `"Sub-menu"`.

### `chart` — opens a chart with up to 3 plots

| Field | Type | Default | Notes |
|---|---|---|---|
| `text` | string | `"Chart"` | the **button** label in the menu |
| `chartLabel` | string | `"Chart"` | the title shown **inside** the chart view |
| `xAxisIdx` | number | `1` | index into the x-axis format list below. Out of range or fractional → **coerced to the nearest valid slot** on load, and reported. |
| `separatePlots` | boolean | `true` | **always written; must be present.** Absence is reported as an error on load (the design still loads, using the default). |
| `dataIntervalIdx` | number | `0` | index into the data-interval list below. **Always written; must be present.** Out of range or fractional → **coerced to the nearest valid slot**, and reported. |
| `plots` | array | 3 fresh plots | **Exactly 3 entries**, always. Slots you don't use are still written (set `showPlot: false`). |

`xAxisIdx` → format:

| idx | value | label |
|---|---|---|
| 0 | `sS` | Secs since start |
| 1 | `ms` | Min:Sec since start *(default)* |
| 2 | `dHms` | Day Hr:Min:Sec |
| 3 | `ymdHms` | Yr/Mo/Day Hr:Min:Sec |
| 4 | `weekDayHms` | WeekDay Hr:Min:Sec |
| 5 | `weekDayHm` | WeekDay Hr:Min |
| 6 | `weekDayHmsUTC` | WeekDay Hr:Min:Sec UTC |
| 7 | `weekDayHmUTC` | WeekDay Hr:Min UTC |

`dataIntervalIdx` → sample interval:

| idx | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| ms | 1000 | 10000 | 30000 | 60000 | 300000 | 900000 |
| label | 1 sec | 10 secs | 30 secs | 1 min | 5 mins | 15 mins |

Both indexes are validated on load and **clamped to the nearest valid slot** rather
than reset to the default (`_coerceListIdx()` in `state.js`):

| Written | Loads as | Why |
|---|---|---|
| `9` (xAxisIdx, 0–7) | `7` | nearest end, not the default `1` |
| `-1` | `0` | nearest end |
| `2.6` | `3` | rounded to the nearest slot, then clamped |
| `"3"`, `null`, `NaN` | the default | a non-number has no "nearest" |

This matters most for `dataIntervalIdx`: a file written by a build with more intervals
saying `9` means *"the slowest rate I had"*, so it clamps to `5` (15 mins). Resetting it
to the default `0` would silently turn it into the **fastest** rate. Every coercion is
reported, e.g.

```
rootMenu.items[0].dataIntervalIdx: 7 out of range 0-5 — using nearest, 15 mins
```

Because of that clamping an out-of-range index can no longer reach code generation,
where `chartDataIntervalIdx()` would throw — but write `0`–`5` (and `0`–`7`) anyway.

Each entry of `plots`:

| Field | Type | Default | Notes |
|---|---|---|---|
| `plotLabel` | string | `"Plot 1"` / `"Plot 2"` / `"Plot 3"` | |
| `units` | string | `""` (or `"V"` when seeded from a board's ADC) | |
| `dataRangeMax` | number | `1023` (or board ADC full scale) | **raw** counts the device sends |
| `dataRangeMin` | number | `0` | |
| `autoScale` | boolean | `true` | |
| `showPlot` | boolean | `true` | set `false` to leave the slot unused |
| `displayMax` | **string** | `"1023"` (or the board's reference volts) | displayed value at `dataRangeMax` |
| `displayMin` | **string** | `"0"` | displayed value at `dataRangeMin` |
| `pin` | object | absent | optional; if present it must have `name` (and may have `codeName`). Any `type` you write is **ignored** — see below. |

A plot always reads an analog input, so that is the one capability it can require:
whatever `type` the file gives a plot pin is discarded, and the loaded pin is recorded
as `analog_input`. That records what the plot **needs** — it is not a claim about the
pin. The pin is then checked against the board like any other and **dropped to `null`
if it cannot actually provide analog input** (see
[§2.1](#21-target-verification-on-load)). Naming a digital-only pin therefore does not
turn it into an analog one; it just loses the pin.

On an UNO, `{ "name": "A0" }` loads as
`{ "name": "A0", "codeName": "A0", "type": "analog_input" }`, while `{ "name": "D2" }`
loads as `null`. ESP32 ADC2 pins count as analog **only on a Serial connection**, so
the same plot pin may be kept or dropped depending on `connection`.

### `drawing` — loads a dwg

| Field | Type | Required | Notes |
|---|---|---|---|
| `dwgName` | string | **yes, non-empty** | Name of the drawing. Must match the `name` inside the matching `.pfodDwg_json` (and that file's basename in a zip bundle). |
| `formats` | object | yes | **Only** `disabled`, `sound`, `flash` are meaningful/written. |

Two different failures, with very different outcomes — don't confuse them:

* **`dwgName` missing or empty** → the **whole item is dropped** on load (not just the
  field), with a warning. Never write one without it.
* **`dwgName` present but not resolvable** — no such drawing in the library, and none
  supplied in the zip → the item is **kept**, and the user is prompted to supply the
  file. See [Missing Drawings](#81-missing-drawings).

```json
{
  "type": "drawing",
  "autoCmd": "drawing_LedOnOff_Cmd",
  "text": "LedOnOff",
  "formats": { "disabled": false, "sound": false, "flash": false },
  "dwgName": "LedOnOff"
}
```

### 5.3 Links in label and prompt text

A `label` item's `text`, and a menu's `promptText`, may contain a Markdown link:

```
[text](url)
```

pfodWeb renders `text` as a link that opens `url` in a **new browser tab**; the rest
of the string is ordinary pfod text, and the inline format tags work around and
inside the link (`[<+1>manual</+1>](https://…)`). Nothing changes on the wire — it
is just characters in the text field — so it works on every connection type.

```json
{ "type": "label", "autoCmd": "label_Help_Cmd",
  "text": "Read the [manual](https://www.forward.com.au/pfod/) first", "formats": { } }
```

```json
"promptText": "<+2>Pool Pump\n<-2>[setup guide](/setup.html)"
```

Rules, all of which follow from the one match pfodWeb makes
(`/\[([^\[\]]+)\]\(((?:https?:\/\/|\/(?!\/))[^\s()]+)\)/`):

* The `url` must begin `http://`, `https://`, or a single `/`. That is what keeps ordinary
  prose safe — `"Battery [12] (%)"` has brackets and parentheses but `%` is not a url, so it
  renders as typed — and it is the security boundary: `javascript:` never matches.
* A `/path` url is a page on the **device's own web root** (the same LittleFS that serves
  `pfodWeb.html`), resolved against the http connection. It only works on an http
  connection; over serial or BLE, or in the designer's preview, the words render as plain
  text with no link. Full `http(s)://` urls work everywhere.
* The url runs to the closing `)`, so it cannot contain spaces or parentheses — percent-encode
  them — nor `|`, `~` or `}`, like any pfod text. Its bytes count against the 1024-byte
  message cap.
* The link `text` may not itself contain `[` or `]`.

**Only labels and prompts.** Labels and prompts have no cmd, which is the whole reason the
link is rendered there — a tap can never both open a page and send a cmd. In any other
item type (`button`, `onoff`, …) the characters are shown **exactly as written**,
`[..](..)` and all, and nothing is a link.

**pfodApp (Android) does not render links.** It shows the label as written —
`[manual](https://www.forward.com.au/pfod/)` — readable, with the url visible, but there
is no copy on that screen, so the user retypes it. For a menu that pfodApp will also see,
keep such urls short and typeable and let the link text carry the meaning:
`[setup guide](/setup.html)`, not `[/setup.html](/setup.html)`.

---

## 6. Pin object

Applies to `onoff`, `onoffdisplay`, `pwm`, `datadisplay` (and, in a reduced form, to
chart plots). `null` means "not connected to hardware".

```json
"pin": { "name": "D13", "type": "digital_output", "invertOutput": false }
```

| Field | Type | Notes |
|---|---|---|
| `name` | string | **required** — the board's own pin name. Must exist on the selected board **and still support `type`**, or the loader clears the pin — see [§2.1](#21-target-verification-on-load). |
| `type` | string | **required** — a `PinType` value (below). |
| `invertOutput` | boolean | **`onoff` only.** Output drive polarity. Omit it for the other types rather than writing `false`. |

If either `name` or `type` is missing, the whole pin is reset to `null` with a warning.

Common `PinType` values: `digital_input`, `digital_output`, `pwm_output`,
`analog_input`, `analog_input_serial` (ESP32 ADC2 — Serial connection only),
`dac_output`. (Bus/identity tags such as `i2c_sda`, `spi_sck`, `button`, `led_high`,
`led_low`, `led_neopixel` also exist but are board-capability tags, not item pin roles.)

Because pins are board-specific, **prefer leaving `pin` as `null` and letting the user
assign it in the designer** unless they name a specific pin. A pin you write by hand is
only kept if the currently-selected board has that name *and* the capability the item
needs.

---

## 7. Rules an editor must obey

1. **`format` must stay `"pfodDesigner"`** and `schema` `12` (`11` still loads as a
   legacy UNO design). Changing `format` breaks the load outright.
2. **`autoCmd` must be unique across the entire design** (all menus, all nesting
   levels) — it becomes a C++ global identifier. Use `<type>_<Text>_Cmd`, adding
   `_2`, `_3`, … on collision.
3. **Item order is display order.** Insert at the array position where the item should
   appear.
4. **Every item needs `type`, `text`, `autoCmd`, `formats`.** Write the full nine-key
   format object (the three-key form for `drawing`). `type` must be one of the nine
   exactly — a typo does not degrade the item, it **deletes** it.
5. **Don't invent `ccodeCmd`** — omit it.
6. **`drawing` items need a non-empty `dwgName`** — an empty one deletes the item. Ship
   the matching `.pfodDwg_json` (in `dwgs/` for a zip bundle) so the reference resolves
   on its own; an unresolvable one is recoverable via the Missing Drawings prompt, not
   a hard error.
7. **`chart` items must carry `separatePlots`, `dataIntervalIdx` and exactly 3
   `plots`.**
8. **`submenu` items must carry a complete `subMenu` node** — including `items: []`
   and `refresh_ms: 0` for an empty one.
9. **Numbers stay numbers, strings stay strings.** In particular `maxScaleStr`,
   `minScaleStr`, `displayMax`, `displayMin` are strings; everything else numeric is a
   real JSON number. **Booleans are real booleans** — the same rule as the dwg format,
   which no longer accepts the quoted `"true"`/`"false"` form either.
10. **`fontColour` / `bgColour` take `null` or one of the 16 short colour codes**, as a
    quoted string. Palette numbers and `RRGGBB` hex reach the device correctly but the
    designer cannot round-trip them — the picker shows "Default" and overwrites the
    value on the next edit.
11. **Keep `boardName` truthful, or omit it.** It decides whether ADC ranges are
    re-derived on load ([§2.1](#21-target-verification-on-load)). Writing the wrong
    board is worse than writing none — an omitted one is assumed to be an UNO.
12. `savedAt` / `js_ver` are regenerated by the designer; leaving them stale is harmless.

---

## 8. What the loader does with bad data

`importFromObject()` has two failure modes.

**HARD — nothing is imported, the file is rejected:**

* `format` missing or not `"pfodDesigner"`,
* `name` missing/empty and no override name supplied,
* not valid JSON.

**PARTIAL — the design *is* loaded, with a warning list shown to the user:**

* `schema` is neither `12` nor the accepted legacy `11`,
* any field of the wrong type → replaced with its default, warned,
* any unrecognised key anywhere in a menu node, item, or format object → ignored, warned,
* an item that is `null` / not an object → dropped,
* a `drawing` item with no `dwgName` → dropped,
* an item with an **unknown or missing `type`** → dropped, warned,
* a pin the current board cannot provide → `null`, and an ADC range belonging to a
  different target → re-derived, both reported ([§2.1](#21-target-verification-on-load)).

### 8.1 Missing Drawings

Separately from the per-field repairs above, a design that references drawings which
aren't loaded gets a **Missing Drawings** screen immediately after it loads —
`DesignerMissingDwgPrompt.maybeShow()`, composed as
`maybeShow(state) || DesignerEditMenu.send(state)` from both entry points (Load Design
from File, and picking from the Edit existing Menu list).

It lists every `dwgName` referenced by a `drawing` item **anywhere in the design** (all
sub-menus, unlimited depth), each expanded through `DwgArduinoExport.collectAllDwgs` so
the drawings *those* reach via `insertDwg` are included too. For each one the user can
pick a `.pfodDwg_json`. The file's own name is irrelevant — what must match is the
**`name` inside it**, which has to be the missing name exactly; that name is the
drawing's identity, so it is not rewritten to fit the reference. A file holding a
differently-named drawing is reported and not loaded, naming both what was found and
what was wanted. Or *Continue without loading*, which leaves the item in place showing a
"not loaded" placeholder until it is linked.

The list is recomputed on every render, never cached: loading one drawing can reveal
*its* missing `insertDwg` children, which only become visible once the parent is
actually in the library.

So an unresolvable `dwgName` costs the user a prompt, not the item — which is why it
is worth keeping distinct from an **empty** `dwgName`, where the item really is
deleted.

Silent (unwarned) defaults happen when a field is simply *absent* — absence is treated
as "older/partial schema", not corruption. The two exceptions are the chart fields
`separatePlots` and `dataIntervalIdx`, which are always written and so are reported
when missing.

---

## 9. Recipes

### 9.1 Add a Button to the root menu

Append to `rootMenu.items`:

```json
{
  "type": "button",
  "autoCmd": "button_Reset_Cmd",
  "text": "Reset",
  "formats": { "fontSize": 0, "bold": false, "italic": false, "underline": false,
               "flash": false, "sound": false, "disabled": false,
               "fontColour": null, "bgColour": null }
}
```

Check `autoCmd` against every existing `autoCmd` in the file first.

### 9.2 Add a red, bold, flashing Label

```json
{
  "type": "label",
  "autoCmd": "label_Warning_Cmd",
  "text": "Warning: motor hot",
  "formats": { "fontSize": 2, "bold": true, "italic": false, "underline": false,
               "flash": true, "sound": false, "disabled": false,
               "fontColour": "r", "bgColour": null }
}
```

### 9.2a Add a Label with a link to the manual

```json
{
  "type": "label",
  "autoCmd": "label_Manual_Cmd",
  "text": "Read the [manual](https://www.forward.com.au/pfod/) before changing settings",
  "formats": { "fontSize": 0, "bold": false, "italic": false, "underline": false,
               "flash": false, "sound": false, "disabled": false,
               "fontColour": null, "bgColour": null }
}
```

pfodWeb shows "manual" as a link opening in a new tab; pfodApp shows the text as
written. See [§5.3](#53-links-in-label-and-prompt-text).

### 9.3 Add an On/Off output on pin D13 that pulses HIGH for 500 ms

```json
{
  "type": "onoff",
  "autoCmd": "onoff_Relay_Cmd",
  "text": "Relay is ",
  "trailingText": "",
  "lowText": "Off",
  "highText": "On",
  "current": 0,
  "pulse": "high",
  "pulse_ms": 500,
  "displayFormat": "both",
  "formats": { "fontSize": 0, "bold": false, "italic": false, "underline": false,
               "flash": false, "sound": false, "disabled": false,
               "fontColour": null, "bgColour": null },
  "pin": { "name": "D13", "type": "digital_output", "invertOutput": false }
}
```

### 9.4 Add a Sub-menu holding one button

```json
{
  "type": "submenu",
  "autoCmd": "submenu_Settings_Cmd",
  "text": "Settings",
  "formats": { "fontSize": 0, "bold": false, "italic": false, "underline": false,
               "flash": false, "sound": false, "disabled": false,
               "fontColour": null, "bgColour": null },
  "subMenu": {
    "promptText": "Settings",
    "promptFormat": { "fontSize": 0, "bold": false, "italic": false, "underline": false,
                      "flash": false, "sound": false, "disabled": false,
                      "fontColour": null, "bgColour": null },
    "items": [
      {
        "type": "button",
        "autoCmd": "button_Calibrate_Cmd",
        "text": "Calibrate",
        "formats": { "fontSize": 0, "bold": false, "italic": false, "underline": false,
                     "flash": false, "sound": false, "disabled": false,
                     "fontColour": null, "bgColour": null }
      }
    ],
    "refresh_ms": 0
  }
}
```

### 9.5 Add a Drawing item

```json
{
  "type": "drawing",
  "autoCmd": "drawing_Gauge_Cmd",
  "text": "Gauge",
  "formats": { "disabled": false, "sound": false, "flash": false },
  "dwgName": "Gauge"
}
```

Then make sure a drawing named `Gauge` exists — see `pfodDwg_json-format.md` — and, in
a zip bundle, add `dwgs/Gauge.pfodDwg_json`. If it isn't there, the design still loads
and the user is prompted for the file ([§8.1](#81-missing-drawings)).

### 9.6 Add a Chart with one active plot

```json
{
  "type": "chart",
  "autoCmd": "chart_Temperature_Cmd",
  "text": "Temp Chart",
  "formats": { "fontSize": 0, "bold": false, "italic": false, "underline": false,
               "flash": false, "sound": false, "disabled": false,
               "fontColour": null, "bgColour": null },
  "chartLabel": "Temperature",
  "xAxisIdx": 1,
  "separatePlots": true,
  "dataIntervalIdx": 0,
  "plots": [
    { "plotLabel": "Temp", "units": "C", "dataRangeMax": 1023, "dataRangeMin": 0,
      "autoScale": true, "showPlot": true, "displayMax": "100", "displayMin": "0" },
    { "plotLabel": "Plot 2", "units": "", "dataRangeMax": 1023, "dataRangeMin": 0,
      "autoScale": true, "showPlot": false, "displayMax": "1023", "displayMin": "0" },
    { "plotLabel": "Plot 3", "units": "", "dataRangeMax": 1023, "dataRangeMin": 0,
      "autoScale": true, "showPlot": false, "displayMax": "1023", "displayMin": "0" }
  ]
}
```

### 9.7 Change the menu's auto-refresh to 5 seconds

Set `rootMenu.refresh_ms` to `5000` (UI-offered values: 0, 1000, 5000, 30000, 300000, 900000).

---

## 10. Complete minimal example

```json
{
  "format": "pfodDesigner",
  "schema": 12,
  "name": "Hello World",
  "connection": "serial",
  "boardName": "Arduino UNO",
  "savedAt": "2026-07-29T05:16:24.502Z",
  "js_ver": "V4.1.2-- 27th July 2026",
  "rootMenu": {
    "promptText": "",
    "promptFormat": {
      "fontSize": 0, "bold": false, "italic": false, "underline": false,
      "flash": false, "sound": false, "disabled": false,
      "fontColour": null, "bgColour": null
    },
    "items": [
      {
        "type": "drawing",
        "autoCmd": "drawing_Drawing_Cmd",
        "text": "Hello World",
        "formats": { "disabled": false, "sound": false, "flash": false },
        "dwgName": "HelloWorld"
      }
    ],
    "refresh_ms": 0
  }
}
```

---

*(c)2026 Forward Computing and Control Pty. Ltd.*
