# pfodWeb Drawing JSON (`.pfodDwg_json`) — Format Reference

Audience: an AI (or tool) that must **read and modify a saved pfodWeb drawing (dwg)**
so a user can say "add a circle / a button / a touch zone to this drawing" and get a
correct file back.

Companion document: `pfodMenu_json-format.md` (menu designs, `.pfodMenu_json`).

---

## 1. What this file is

A `.pfodDwg_json` file is a complete, self-contained snapshot of one **drawing**: a
fixed-size canvas plus an ordered list of drawing/touch items. A menu design links to
it by name through a `drawing` menu item (`dwgName`), and a drawing can embed other
drawings through `insertDwg` items.

### Producers / consumers in the source

| Role | File | Function |
|---|---|---|
| Writer (canonical) | `pfodWeb_src/dwgDesigner/dwgLibrary.js` | `buildSaveableDwg()` |
| Reader / validator | `pfodWeb_src/dwgDesigner/dwgValidate.js` | `looksLikeDwgFile()`, `validateAndRepairDwg()`, `nestAndValidateTouchActions()`, `flattenTouchActions()` |
| Editor UI | `pfodWeb_src/dwgDesigner/dwgControlsPanelUI.js` | Add/Edit Item screens |
| Wire encoder (preview / device) | `pfodWeb_src/dwgDesigner/dwgWireEncoder.js` | |
| cmd / idx minting | `pfodWeb_src/dwgDesigner/dwgDesignerAdapter.js` | `_resolveAutoCmdAndIdx()` |
| Runtime item processor | `pfodWeb_src/drawingDataProcessor.js` | authoritative item-type behaviour |
| Arduino code generation | `pfodWeb_src/dwgDesigner/dwgArduinoExport.js` | |

A drawing may be saved on its own, or bundled inside a menu design's
`<Name>_menuJson.zip` under `dwgs/<DwgName>.pfodDwg_json`.

The Dwg Controls Panel's **Save Dwg** picks between those two: a drawing
that inserts no other is written on its own; one that does is written as a
bundle carrying every drawing it reaches, with a trivial one-item design at
the root so it is an ordinary `_menuJson.zip` rather than a shape of its
own. See `pfodMenu_json-format.md` for the layout.

---

## 2. Top-level object

```json
{
  "format": "pfodDwgDesigner",
  "schema": 1,
  "savedAt": "2026-07-30T06:31:50.540Z",
  "name": "LedOn",
  "description": "",
  "js_ver": "V4.1.2-- 27th July 2026",
  "x": 50,
  "y": 25,
  "color": 12,
  "dwgRefresh_ms": 0,
  "items": [ ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `format` | string | **yes** | Must be exactly `"pfodDwgDesigner"`. A file without it is **rejected** before validation — not recognised as a drawing at all. |
| `schema` | number | no | Currently `1`. Not checked on load — `format` alone decides whether the file is a drawing. |
| `savedAt` | string | no | ISO-8601 timestamp, regenerated on every save. |
| `name` | string | **yes** | The drawing's name — what a menu `drawing` item's `dwgName`, and another drawing's `insertDwg.drawingName`, refer to. **Trimmed on load** (see [§5.1](#51-names-are-trimmed)). A file without a non-empty string here — including one that is only whitespace — is **rejected**, with a message naming this field. Not derivable: nothing outside the file knows what references point at it, so it is never guessed from the filename or anything else. |
| `description` | string | no | Free text, defaults to `""`. |
| `js_ver` | string | no | Designer build string; informational. |
| `x` | number | recovered | Canvas **width** in drawing units. Integer, **1–255**. Missing → defaults to 50, reported; out of range → clamped, reported. |
| `y` | number | recovered | Canvas **height** in drawing units. Integer, **1–255**. Missing → set equal to `x`, reported; out of range → clamped, reported. |
| `color` | number | no | Canvas **background** colour, used only when this drawing is the top-level one — it is **ignored if the drawing is inserted into another** ([§7](#insertdwg--embed-another-drawing)). See [§3](#3-colours). **Defaults to `0` (Black) when absent** — note this differs from item colours, which default to `-1`. |
| `dwgRefresh_ms` | number | no | Auto-refresh interval in **MILLISECONDS** (`0` = no auto-refresh). Same unit as the wire start header and the generated sketch's own `dwgRefresh_ms` member, so it passes through both emit paths unconverted. Must be a non-negative number, or the wire encoder throws. **The Dwg Controls Panel's input field is in whole seconds** (max 3600 s) and is the only layer that converts — see [§2.1](#21-refresh-units). |
| `items` | array | no | Ordered item list. Missing / not an array → `[]`, silently. |

**Two fields are required, and a file missing either is refused outright** — it is not
loaded, repaired, or partially applied. Every load path checks them before validation
and reports which one failed:

| Missing | Message |
|---|---|
| `format` | `"MyDwg.pfodDwg_json" does not look like a dwg file (missing "format": "pfodDwgDesigner") and was not loaded.` |
| `name` | `"MyDwg.pfodDwg_json" is missing the required "name" property and was not loaded.` |
| neither (not an object) | `"MyDwg.pfodDwg_json" is not a JSON object and was not loaded.` |

`format` is the discriminator — a chosen folder may hold unrelated JSON, and this is
what tells a drawing apart from it. `name` is required because it cannot be
reconstructed: it is the identity every reference to this drawing resolves against, so
a guessed one produces a drawing that silently fails to link. It is never derived from
the filename.

Everything else is defaulted or clamped, with any repair reported on the Validation
Errors screen — see [§9](#9-what-the-loader-does-with-bad-data). Fields marked
*recovered* are reconstructed from other fields (`y` from `x`) rather than guessed.

That tolerance is for opening damaged or foreign files, not a licence to omit fields:
a drawing you write by hand should carry every field in the table.

### 2.1 Refresh units

`dwgRefresh_ms` is **milliseconds** in the file, on the wire, and in generated firmware.
The Dwg Controls Panel is the *only* place that works in seconds — its "Refresh rate
(seconds, 0 = no refresh)" input, `max="3600"` — and it converts in both directions
(`_refreshMsToSecs` / `_refreshSecsToMs` in `dwgControlsPanelUI.js`):

| Stored `dwgRefresh_ms` | Panel shows | Saving that back stores |
|---|---|---|
| `0` | `0s` (no refresh) | `0` |
| `1` … `999` | `1s` — floored, never `0s` | `1000` |
| `2000` | `2s` | `2000` |
| `2500` | `3s` — rounded | `3000` |
| `3600000` | `3600s` | `3600000` |

The 1–999 ms floor exists because such a value can only come from a hand-edited or
externally-produced file, and rounding it to `0s` would make the panel report "never
refreshes" for a dwg that does. Editing that dwg in the panel normalises it to `1000`.

Don't confuse this with the menu format's own `refresh_ms` — same unit, different file.

> **Older files — `refresh`.** Files predating this field carry `refresh` instead.
> Loading one converts it (`_migrateLegacyDwgFields()` in `dwgValidate.js`) and reports
> what it assumed on the Validation Errors screen. This is a **temporary shim scheduled
> for removal** — `refresh` is not part of the format, is never written, and must not be
> relied on. **Always write `dwgRefresh_ms`.** To bring an old file over permanently,
> load and re-save it while the shim is still in place.

### Coordinate system

* Origin `(0, 0)` is the **top-left** of the canvas; `x` runs right, `y` runs down.
* All item offsets/sizes are in the same drawing units as `x` / `y` — they are **not**
  pixels. The canvas is scaled to fit the display.
* Fractional values are allowed (e.g. `yOffset: 12.5`).

---

## 3. Colours

A `color` field takes **one of two values**:

| Value | Meaning |
|---|---|
| `-1` | **BLACK_WHITE mode** — the renderer picks black or white automatically for contrast against the background. This is the default for **items** when the field is absent. |
| integer `0`–`255` | xterm-256 palette index. |

Anything else is flagged on load and replaced with the direction's default — `-1` for
items, `0` (Black) for the dwg background. The Dwg Controls Panel's picker offers
exactly these two: BLACK_WHITE mode, and a 0–255 palette grid.

Useful palette indices (0–15 are the standard 16):

| # | Colour | # | Colour | # | Colour | # | Colour |
|---|---|---|---|---|---|---|---|
| 0 | Black | 4 | Navy | 8 | Grey | 12 | Blue |
| 1 | Maroon | 5 | Purple | 9 | Red | 13 | Fuchsia |
| 2 | Green | 6 | Teal | 10 | Lime | 14 | Aqua |
| 3 | Olive | 7 | Silver | 11 | Yellow | 15 | White |

16–231 are the 6×6×6 colour cube; 232–255 are a greyscale ramp.

### 3.1 Other pfod colour forms

The pfod protocol itself allows more than a palette number — colour **names** like `r`
and `bk`, and `RRGGBB` **hex**. Neither is a dwg JSON colour value:

* **Names** belong to the inline *text* tags (`<r>`, `<bg gy>`) inside a label or
  value's text, and to the menu format object — a different mechanism entirely. The loader flags it and resets to `-1`.
* **Hex** is **rejected on load** — reset to `-1` for an item, `0` (Black) for the dwg
  background, with a warning naming the value.

So: **write `-1` or `0`–`255`.**

---

## 4. Booleans

Write a **real JSON boolean** — `true` or `false`, unquoted:

```json
"filled": true, "centered": true, "rounded": false
```

`filled`, `centered`, `rounded`, `bold`, `italic` and `underline` — wherever they appear,
including on the item nested inside a `touchAction`'s own `action` array, which is a full
drawable item and carries the same fields.

The older pfodWebDesigner wrote these as the strings `"true"` / `"false"`. Those two exact
strings say what the author meant, so they are **converted** to the real boolean on load and
reported. Nothing else is: `1`, `"yes"` and friends are not a boolean in any format this ever
wrote, so there is no intent to recover and they take the field's default.

| Written | Loads as | Reported |
|---|---|---|
| `true` / `false` | unchanged | no |
| `"true"` / `"false"` | `true` / `false` — converted | **yes** |
| `1` / `0`, `"yes"`, anything else | the field's default | **yes** |
| absent | the field's default | no |

Either way the file that comes back out of a re-save holds a real boolean, so a legacy drawing
only passes through this once.


---
## 5. Names vs wire values — the single most important rule

Each addressable item has **two** identities:

| Concept | Field | Who writes it |
|---|---|---|
| Stable authoring name | `cmdName` (touch/command) / `idxName` (index) | you / the designer — **this is what belongs in the file** |
| Transient wire value | `cmd` / `idx` / `textIdx` | minted automatically at preview/encode time |

`buildSaveableDwg()` **strips `cmd` from any item that has a `cmdName`, and strips
`idx` and `textIdx` from any item that has an `idxName`**, precisely because the
numeric/wire values are only ever "whatever the device last happened to assign".

**When adding items, write `cmdName` / `idxName` and do NOT write `cmd`, `idx` or
`textIdx`.** They are regenerated (`c1`, `c2`, … for cmds; `1`, `2`, … for idxs) in
item order every time the drawing is previewed or encoded.

**A stored `idx`, `cmd` or `textIdx` is stripped on load, and reported.** There is no
`idx`, `cmd` or `textIdx` on incoming JSON — or there should not be. All three are wire
values, minted at encode time (`idx` from `idxName`, `cmd` from `cmdName`, `textIdx` from
a `touchActionInput`'s `idxName`) and removed on save by `buildSaveableDwg`, so nothing
this app writes ever produces one. A hand-written one is not a shortcut — it is quietly
destructive:

* **It collides silently.** The minting counters know nothing about hand-written
  values, so a raw `idx: 1` and the first minted index both claim slot 1. On the wire
  that is one `` |i`1 `` followed by two items carrying idx 1 — the second overwrites
  the first and one of your items simply disappears. A raw `cmd` behaves the same way:
  it either steals whatever the minted value of that name addresses, or addresses
  nothing at all.
* **Nothing catches it.** Every check in this format matches on `idxName` / `cmdName`,
  and an item carrying only a raw value has neither — so the tests built for exactly
  these collisions cannot see it.

Stripping leaves the item otherwise intact: its geometry and colour are fine, the only
thing wrong was a field the format says not to write. A stripped `idx` leaves the item
un-indexed, which moves it from the indexed draw pass to the un-indexed one, so its
stacking can change ([§6.1](#61-draw-order-is-not-array-order)); give it an `idxName` to
index it. A `hide`/`unhide`/`erase` left with no name at all after the strip has nothing
to act on and is dropped. Anything that referenced the old raw value becomes an orphan
and is dropped in turn.

### 5.1 Names are trimmed

Every name is matched by **exact string equality** — a menu Drawing item's `dwgName`
against a drawing's `name`, an `insertDwg`'s `drawingName` against another drawing's
`name`, a `touchAction`/`touchActionInput`'s `cmdName` against its `touchZone`'s, a
`hide`/`unhide`/`erase`'s `idxName` against the item that declares it. So `" LedOn "`
and `"LedOn"` are different drawings.

On load, leading and trailing whitespace is stripped from **`name`, `cmdName`,
`idxName` and `drawingName`** — including a `touchAction`'s nested `action[0]` — and
each change is reported. This happens *before* anything matches on those values, so a
padded copy of a name is recognised as the same name rather than a second declaration.

The designer's own screens already trim what you type, so padding only ever arrives
from a hand-edited or externally-produced file. Write names
without surrounding whitespace.

### Which items declare, which reference

| Kind | Types | Field |
|---|---|---|
| **Declare a cmd** | `touchZone`, `insertDwg` | `cmdName` |
| **Reference a cmd** | `touchAction`, `touchActionInput`, `hide`, `unhide`, `erase` | `cmdName` (same string as the declarer) |
| **Declare an idx** | `rectangle`, `line`, `circle`, `arc`, `label`, `value`, `touchZone`, `index` | `idxName` |
| **Reference an idx** | `hide`, `unhide`, `erase`, `touchActionInput`, and a `touchAction`'s `action` | `idxName` (same string as the declarer) |

Rules enforced on load:

* `cmdName` is a **single shared namespace** across `touchZone` and `insertDwg` —
  no duplicates.
* `idxName` must be unique — but the rule is split in two, because an `index`
  placeholder is allowed to name the same slot a drawing item does. Duplicates found
  during a file load are merged/dropped with a report. See
  [§5.2](#52-sharing-an-idxname).
* A reference (`hide`/`unhide`/`erase`/`touchActionInput`/`touchAction.action`)
  whose `idxName` matches **no declaring top-level item** is **deleted** with a report.
* **Nothing is ever invented.** `idxName` is never auto-generated at all. A missing
  `cmdName` is either *derived*, when the value is fully determined, or the item is
  dropped:
  * `insertDwg` → derived as `"dwg_" + drawingName`, reported. Not a guess: that is the
    definition, and `drawingName` is already required on the item.
  * `touchZone` → the **item is dropped**, reported. Its `cmdName` is not derivable from
    anything, and without one the zone cannot be touched at all, so it is unusable.
    Its own `touchAction`s / `touchActionInput` then follow it out as orphans.
* An `insertDwg`'s `cmdName` is always exactly `"dwg_" + drawingName`.

### 5.2 Sharing an `idxName`

Declaring items fall into two groups, and `idxName` has to be unique **within** a
group but may be shared **across** them:

| Group | Types |
|---|---|
| **Real items** — anything that claims the index for itself | `rectangle`, `line`, `circle`, `arc`, `label`, `value`, `touchZone` |
| **Index placeholders** — reserve a slot and nothing else | `index` |

| Two items with the same `idxName` | Result |
|---|---|
| two real items (e.g. a `rectangle` and a `label`) | **duplicate** — collapsed to one, reported |
| a `touchZone` and a drawing item | **duplicate** — collapsed to one, reported |
| two `index` placeholders | **duplicate** — collapsed to one, reported |
| one `index` placeholder and one real item | **fine** — both kept, no report |

The last case is the point of the split: a placeholder exists precisely so an item
appearing *earlier* in the list can reference an index whose real content is defined
later, so the two are *meant* to name the same slot and resolve to the same `idx`.

When two items in the same group do collide, the loader collapses them the way a device
would: the **last** occurrence that is not a placeholder supplies the content, and it is
moved to the **first** occurrence's array position. Everything else in the group is
removed.

That mirrors what happens at run time, which is worth understanding because it is *not*
"the second item replaces the first". **A repeated item UPDATES the one already at that
`idx`, in place:** the new item inherits the existing one's transform, clip region and
visibility — the `pushZero` context captured when that index was *first* seen — and only
its own content takes over. The same holds for a `touchZone` repeated on a `cmd`. So the
surviving declaration keeps the earlier item's position and context, and that is why the
winner is moved to the first occurrence's slot rather than left where it was written.

**A `touchZone` is a real item here**, even though it paints nothing. Its index is its
touch priority ([§7](#touchzone--a-touchable-rectangle)), but it is minted from the same
counter as every other index and there is only one `idxName` namespace, so a zone sharing
a name with a label is a genuine collision — they would resolve to the same `idx` — and
it is caught like any other. Pairing a zone with an `index` placeholder is still allowed,
and is how you reserve a zone's priority number early.

(This is about `idxName`, the authoring name. `cmdName` is a separate namespace with no
such split — shared by `touchZone` and `insertDwg`, no duplicates allowed at all. A
`touchZone` is the one type that declares in **both**: always a `cmdName`, and an
`idxName` too when it needs a touch priority. The two names are independent and need not
match.)

### 5.3 An `idxName` never crosses a drawing

**Every `idxName` reference resolves inside its own drawing, and nowhere else.** An
inserted drawing's items are not candidates: a `touchAction`, `touchActionInput` or
`hide`/`unhide`/`erase` in the parent cannot name something the child declares, and
writing one deletes the reference on load. Generated firmware enforces the same thing
structurally: each `idxName` becomes a `pfodAutoIdx` **member of that drawing's own
`Dwg_<Name>` class**, so a child's index names are simply not in scope in the parent.

That is not a limitation of the checking, it is what the index *is*. Indices are minted
per drawing — the mint map is keyed by drawing name plus `idxName` — so the same name in
a parent and in its child are **two different indices**, and asking for a name the
drawing never declared is an error, not a lookup that might succeed later.

It also fixes *when* the check can run: **on load, per file**, against that one
drawing's `items`. It is not deferred until the inserted drawings arrive, because they
could not contribute a match anyway — waiting would only let a broken reference survive
longer. Each drawing is validated as it is loaded, the parent and each child
independently.

What *can* cross a drawing is a **`cmdName`**: a `hide`/`unhide`/`erase` addresses an
inserted drawing by its `dwg_<drawingName>` loadCmd, hiding or erasing the whole child
([§7](#hide--unhide--erase--act-on-an-existing-item)). To reach a single item inside a
child, put the `hide`/`unhide`/`erase` **in the child**, where its `idxName` resolves.

---

## 6. Item list structure

`items` is a **flat** array. Array order is *not* draw order — see
[§6.1](#61-draw-order-is-not-array-order).

Four things here are ordering-sensitive:

1. **`pushZero` / `popZero`** form a transform stack that affects every item between
   them. They must be balanced.
2. **`touchAction` and `touchActionInput` must immediately follow their `touchZone`**,
   with the **same `cmdName`**, with nothing else in between. A `touchAction` or
   `touchActionInput` that does not is an orphan and **that item is deleted** on load —
   the `touchZone` itself is untouched, as is anything else in the array. At most
   **one** `touchActionInput` per touchZone (a second is deleted as a duplicate); any
   number of `touchAction`s.
3. **A `hide`/`unhide`/`erase` must come after whatever it targets** — the `insertDwg`
   for a `cmdName`, or the first item declaring the `idxName`. These act on something
   the device has already been told about, and they are sent exactly where they sit, so
   one placed earlier refers to nothing. Either way it is **dropped** on load. For an
   `idxName` you can also satisfy this by putting an
   [`index` placeholder](#index--reserve-an-index-without-drawing-anything) above it.
4. An **indexed** item's array position determines both the transform context its
   index is reserved under and how early a `hide`/`unhide`/`erase` can reference it.

Everything else (including where touchZones sit relative to plain items) is free. In
particular a **`touchAction`/`touchActionInput` may target an `idxName` declared later
in `items`** — only existence is checked, never position. The two cases differ by *when
the reference is acted on*: `hide`/`unhide`/`erase` run as the drawing is parsed, so
their target must already exist at that point, whereas a touch action is stored
behaviour that runs only when the user touches the zone — by then the whole drawing has
arrived and every index in it exists.

> **Both are checked, and either one wrong deletes that child.** A
> `touchAction`/`touchActionInput` must *immediately follow* its `touchZone` **and**
> carry the *same* `cmdName`. 
>
> If a mismatch is reported and **that child is deleted**. A child with no `cmdName` at
> all counts as a mismatch: the name is required, not optional-and-filled-in. Only the
> offending child goes — the run continues, so one mis-named action does not orphan the
> correctly-named ones after it, and the `touchZone` is untouched either way.
>
> Practical effect: moving a `touchZone` without its children will not
> re-parents them; they are deleted with a message naming both the child's `cmdName` and
> the zone it ended up under. Keep each zone and its children together as a block.
### 6.1 Draw order is not array order

The canvas is painted in **three passes** (`redrawCanvasImpl` in `redraw.js`), so a
later item does not simply cover an earlier one:

| Pass | What | Order within the pass |
|---|---|---|
| 1 | items with **no** `idxName` | array order |
| 2 | **indexed** items | ascending numeric `idx` |
| 3 | `touchZone`s | unspecified (they usually paint nothing) |

Two consequences worth designing around:

* **An indexed item always paints on top of every un-indexed item**, wherever it sits
  in `items`. Indexing a label to update it later also lifts it above the background
  shapes — usually what you want, but it is a side effect of indexing, not of position.
* **Among indexed items, order still follows the array** — the `idx` numbers are minted
  by walking `items` and handing out the next number on first sight of each `idxName`,
  so ascending `idx` *is* declaration order. Sorting by `idx` is how the renderer does
  it, not a separate ordering you have to track. An
  [`index` placeholder](#index--reserve-an-index-without-drawing-anything) claims the
  number at its own position, so it fixes both the stacking of an item whose real
  content appears later *and* the point from which a `hide`/`unhide`/`erase` may
  reference it.

One thing does break that correspondence — and it breaks it predictably:

* **Items merged in from an `insertDwg` child** are numbered from the same running
  counter as the parent, but they never interleave with it. A drawing is served in
  full before any of its children are requested, and the children are then requested
  in the order their `insertDwg` items appear. So every index in a child is higher
  than every index in its parent, and an earlier sibling's indices are all lower than
  a later sibling's.

In pass 2 that has a concrete consequence worth designing around: **an inserted
drawing's indexed items always paint above the parent's indexed items** — the whole
tree stacks depth-first, parent first, siblings in `insertDwg` order. You cannot put a
parent's indexed item on top of a child's. If you need something to sit above an
inserted drawing, it has to be indexed and come later in that walk — put it in a
drawing inserted *after* that one, or inside the child itself.

> One caveat on a real device: `pfodAutoIdx` fixes a drawing's indices on its **first**
> call and they stay fixed wherever that drawing is used afterwards. A shared child that
> was first loaded under some *other* parent keeps the numbers it got then, so it can
> land below the parent it is inserted into here. The designer's preview remints the
> whole tree on every render cycle, so it always shows the clean depth-first order.

A hand-written numeric `idx` is *not* a second way in: it is stripped on load and the
item left un-indexed, which moves it out of pass 2 altogether and into pass 1.

So: to put shape A behind shape B, order them in the array — that works whether both
are un-indexed or both are indexed. What does not work is mixing the two and relying on
array order, because every indexed item is above every un-indexed one regardless.


---

## 7. Item types

`type` must be one of:

```
rectangle  line  circle  arc  label  value
touchZone  touchAction  touchActionInput
insertDwg  index  hide  unhide  erase
pushZero   popZero
```

An unrecognised `type` causes the item to be **deleted** on load (it is never guessed at).

**A non-blank `idxName` is what makes an item indexed** — there is no separate flag. Give
an item a name and it declares an index; leave the field out and it does not. It is
listed in each item table below, and every type that can paint accepts it: `rectangle`,
`line`, `circle`, `arc`, `label`, `value` — plus `touchZone` (where the index is a touch
priority) and `index` (which is nothing but the reservation).

On the reference types (`hide`, `unhide`, `erase`, `touchAction`, `touchActionInput`) an
`idxName` means the opposite: it names *someone else's* index. Those types never declare
one.


### 7.1 The `fontSize` scale

Used by `label`, `value` and `touchActionInput`. `fontSize` is an integer **step**, not
a point size. Every **+6 doubles** the rendered size and every **−6 halves** it; the
five steps in between are the evenly-spaced sub-multiples of that doubling (`×1.1225`,
`×1.2599`, `×1.4142`, `×1.5874`, `×1.7818`).

Above the first doubling the growth is **linear, not exponential** — each further +6
band adds one more multiple of the base size:

| `fontSize` | −24 | −18 | −12 | −6 | −1 | 0 | +1 | +6 | +12 | +18 | +24 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| size | ÷8 | ÷6 | ÷4 | ÷2 | ÷1.1225 | ×1 | ×1.1225 | ×2 | ×4 | ×6 | ×8 |

Negative steps are the reciprocal of the matching positive step. Non-integer values are
rounded. `0` is the base size — about 2.83 drawing-column units tall, so a `fontSize: 0`
line of text is roughly 2.8 units high whatever the canvas `x`/`y` and whatever the
display resolution. Implemented by `getActualFontSize()` in `pfodWeb_src/redraw.js`,
matching Android pfodApp's `V2_ImageTextUpdate` exactly.

---

### `rectangle`

| Field | Type | Default |
|---|---|---|
| `idxName` | string | *(omit)* |
| `xOffset` | number | `0` |
| `yOffset` | number | `0` |
| `xSize` | number | `1` |
| `ySize` | number | `1` |
| `filled` | boolean | `false` |
| `centered` | boolean | `false` |
| `rounded` | boolean | `false` |
| `color` | colour | `-1` |

`centered: false` → `(xOffset, yOffset)` is the **top-left corner**.
`centered: true` → it is the **centre**.

### `line`

| Field | Type | Default |
|---|---|---|
| `idxName` | string | *(omit)* |
| `xOffset` | number | `0` |
| `yOffset` | number | `0` |
| `xSize` | number | `1` |
| `ySize` | number | `1` |
| `color` | colour | `-1` |

A line runs from `(xOffset, yOffset)` to `(xOffset + xSize, yOffset + ySize)`.

### `circle`

| Field | Type | Default |
|---|---|---|
| `idxName` | string | *(omit)* |
| `xOffset` | number | `0` — centre |
| `yOffset` | number | `0` — centre |
| `radius` | number | `1` |
| `filled` | boolean | `false` |
| `color` | colour | `-1` |

### `arc`

| Field | Type | Default | Notes |
|---|---|---|---|
| `idxName` | string | *(omit)* | names this item's index — see [§5](#5-names-vs-wire-values--the-single-most-important-rule) |
| `xOffset` | number | `0` | centre |
| `yOffset` | number | `0` | centre |
| `radius` | number | `1` | |
| `start` | number | `0` | start angle, degrees, **anti-clockwise** from 3 o’clock |
| `angle` | number | `90` | sweep, degrees; negative sweeps clockwise |
| `filled` | boolean | `false` | fills a **pie**, not a segment — see below |
| `color` | colour | `-1` | |

Angles are anti-clockwise from 3 o’clock, and y runs **down** the canvas, so a point at
angle `A` on radius `r` — measured from the arc’s own centre — is at
`x = r * cos(A)`, `y = -r * sin(A)`. That is the library’s own `pfodDwgs::xRadius()` /
`yRadius()`; use it to place anything that has to line up with an arc, rather than
measuring off a screenshot. `90` is straight up, `217.5` is down-left.

An arc is a **pie**: the path runs centre → rim → back to centre, and both the fill and
the outline follow it. Two consequences worth knowing before you use one:

* A filled arc is a wedge including its two straight edges, not a segment cut by a chord.
* A **zero sweep** (`"angle": 0`) encloses no area, so there is nothing to fill and the
  outline — a radial line from the centre out to `radius` — is all that appears. `filled`
  therefore makes no difference at all to a zero-sweep arc. That is how tick marks are
  made ([§10.12](#1012-a-radial-gauge)); how much of the line you see depends on what is
  drawn over it.

### `label` — static text

| Field | Type | Default | Notes |
|---|---|---|---|
| `idxName` | string | *(omit)* | names this item's index — see [§5](#5-names-vs-wire-values--the-single-most-important-rule) |
| `xOffset` | number | `0` | anchor point; see `align` |
| `yOffset` | number | `0` | |
| `text` | string | `""` | **pre-escaped pfod text** — a literal `` ` `` `{` `\|` `}` `~` `<` `\` `&` must be written as its escape sequence, see [§7.2](#72-restricted-characters-and-unicode-in-text) |
| `fontSize` | number | `0` | **signed relative** size step, not points. **+6 doubles the size, −6 halves it** — see [the font-size scale](#71-the-fontsize-scale). UI range −24 … +24. Emitted as `<+N>` / `<-N>`. |
| `align` | string | `"center"` | `"left"`, `"center"`, `"right"` — anything else is silently corrected; an invalid value reaching the encoder throws. |
| `bold` | boolean | `false` | |
| `italic` | boolean | `false` | |
| `underline` | boolean | `false` | |
| `color` | colour | `-1` | |
| `value` | number | *(omit)* | **Optional.** When present, a formatted number is appended to `text`. |
| `decimals` | **integer** | *(omit)* | Decimal places, **−6 … +6**. **Negative rounds left of the point** (e.g. `-2` renders 1234 as 1200). Rounded and clamped on load if present; **absent stays absent** — it is not defaulted in. |
| `units` | string | `""` | Appended after the formatted value. Escaped like `text` ([§7.2](#72-restricted-characters-and-unicode-in-text)). |

`value` / `decimals` / `units` are an optional authoring convenience: they are baked
into the transmitted text, not separate wire fields. Include them only when wanted —
`decimals` and `units` may be set without `value`, but have no visible effect until
`value` is also set. (Designer-saved labels often carry a harmless `"decimals": 2`.)

Because they are opt-in, an absent one is **not** filled in with a default — the loader
leaves it absent rather than writing `"decimals": 2` onto every label. A `decimals` that
*is* present is checked like a `value` item's: it reaches the device as `.decimals(n)`
either way, so it is rounded to a whole number and clamped to −6 … +6, both reported.

### `value` — a live numeric readout

All the `label` fields (`idxName`, `xOffset`, `yOffset`, `text`, `fontSize`, `align`,
`bold`, `italic`, `underline`, `color`) **plus**:

| Field | Type | Default | Notes |
|---|---|---|---|
| `intValue` | **integer** | `0` | the current raw value |
| `min` | **integer** | `0` | raw range min |
| `max` | **integer** | `1` | raw range max |
| `displayMin` | number | `0` | displayed value at `min` |
| `displayMax` | number | `1` | displayed value at `max` |
| `decimals` | **integer** | `2` | decimal places for the displayed value, **−6 … +6** |
| `units` | string | `""` | appended to the displayed value; escaped like `text` ([§7.2](#72-restricted-characters-and-unicode-in-text)) |

`text` is the leading text shown before the number.
Unlike the menu format, these scale fields are **numbers**, not strings.

**The raw side is integer, the displayed side is not.** `intValue`, `min` and `max` are
`int32_t` on the device (`pfodLabel::intValue/minValue/maxValue`); only `displayMin` and
`displayMax` are floats. So the raw range is a whole-number count — an ADC reading, a
step index — and the fractional units belong on the display side:

```json
"intValue": 512, "min": 0, "max": 1023,
"displayMin": 0, "displayMax": 3.3, "decimals": 2, "units": "V"
```

This is enforced on load. A fractional `intValue` / `min` / `max` / `decimals` is
**rounded to nearest and reported** — left alone it would be truncated on the device,
and the file would no longer describe what actually runs. `decimals` is additionally
**clamped to −6 … +6**, the device's own limit, which it applies silently; rounding
happens first, so `7.6` is reported twice (rounded to 8, then clamped to 6).
`displayMin` / `displayMax` are floats and are left exactly as written.

### 7.2 Restricted characters and Unicode in text

Used by `label` / `value` (`text`, `units`) and `touchActionInput` (`prompt`).

**What you write in the file goes onto the wire unchanged.** The encoder does not escape
anything, and the renderer *decodes* escapes before drawing — so these strings are
**pre-escaped pfod text**, not plain text. Eight characters have to be written as an
escape sequence, and these are the only escapes there are:

| To display | Write | | To display | Write |
|---|---|---|---|---|
| `` ` `` | `&#96;` | | `~` | `&#126;` |
| `{` | `&#123;` | | `<` | `&lt;` |
| `\|` | `&#124;` | | `\` | `&#92;` |
| `}` | `&#125;` | | `&` | `&amp;` |

Everything else passes through untouched, including runs of consecutive spaces. A
carriage return, a linefeed, or the pair, all mean one new line.

**Getting this wrong corrupts the message, silently.** `` ` ``, `{`, `|`, `}` and `~` are
the wire's own framing characters, so an unescaped one is read as structure rather than
text:

```
"text": "A|B"        ->  |t~1~A|B~1~1~L        the | starts a new item; the label is cut short
"text": "{x}~y"      ->  |t~1~{x}~y~1~1~L      braces break the message, ~ adds a field
"text": "A&#124;B"   ->  |t~1~A&#124;B~1~1~L   intact, and renders as  A|B
```

`<` is different but just as quiet: it opens an inline format tag, so `"a<b>c"` renders
as `ac` with the `c` in bold. Write `&lt;` for a literal one.

**You rarely have to do this by hand.** Two layers escape for you, so writing an escape
yourself is only needed when you author JSON directly and want to be exact:

* **The Dwg Controls Panel escapes what you type.** Type `|}` into a label's Text field
  and the file stores `&#124;&#125;`; reopen the item to edit it and the field shows `|}`
  again. Same for a label's or value's Units and a touchActionInput's Prompt.
* **The loader escapes what it finds.** A raw framing character in any of those fields is
  **escaped and reported** — the item is otherwise untouched and renders identically, so
  it is a repair rather than a rejection.

> **On a device, the library escapes for you too.** `pfodDevice`/`pfodParser` escape a
> drawing's `text` and `units` automatically on send, so sketch code passes plain text.
> `doNotEncode()` turns that off — `dwgsPtr->label().doNotEncode()…send();` — and then
> unescaped restricted characters are **silently discarded** before sending. This file
> format is the already-escaped form either way.

Note that only the five framing characters are handled automatically. `<` and `&` are
**not** escaped for you, and must not be: `<` opens an inline format tag and `&` starts
every escape sequence, so escaping either would destroy formatting you meant to keep.
Write `&lt;` and `&amp;` yourself when you want those two as literal text.

#### Unicode

Write the character itself — the file is UTF-8, so `"text": "25 ℃"` is fine and is what
the designer produces.

`\uXXXX` sequences are **not** decoded when a drawing is rendered; they are only
interpreted where a *user types* them — the String Input screen and the
`touchActionInput` edit dialog — where typing `\u2109` becomes ℉ and `\u2103` becomes ℃
as you type. To type one and keep it as literal text, enter `&#92;u2109`.

Because of that live conversion, the dialog also protects text it loads for editing: any
`\uXXXX` already in the target item comes back as `&#92;uXXXX`, so re-saving does not
silently turn it into a character (`_pfodDwgUnescapeRestrictedChars` in
`pfodWebMouse.js`, matching pfodApp).

In hand-written Arduino code use the octal bytes instead — ℉ is `\342\204\211` and ℃ is
`\342\204\203`. The [`UTF8converter.jar`](https://www.forward.com.au/pfod/ArduinoProgramming/Languages/index.html) tool converts between the character, the
`\uXXXX` form and octal.

### `touchZone` — a touchable rectangle

| Field | Type | Default | Notes |
|---|---|---|---|
| `cmdName` | string | **required** | **The declaring identity.** Must be unique among all `touchZone` + `insertDwg` cmdNames. Not derivable, so a touchZone without one is **dropped** on load — write it. |
| `idxName` | string | — | gives the zone an index — its **touch priority**, see below |
| `xOffset` | number | `0` | |
| `yOffset` | number | `0` | |
| `xSize` | number | `1` | |
| `ySize` | number | `1` | |
| `centered` | boolean | `false` | same meaning as on `rectangle` |
| `filter` | number | `0` | touch filter, see table |

**An indexed touchZone.** A zone's index is its **touch priority** among overlapping
zones, not a handle for redrawing it — a zone paints nothing. It is written the same way
as on any other item (an `idxName`), and it is a **real index**: it comes out of the one
shared `idxName` namespace and is deduped against every other declaring item, so a zone
cannot quietly share a name with a label.

When a touch lands inside more than one zone, **the highest index wins**, whatever order
the zones appear in `items`. A zone with no index counts as `0`, so any indexed zone
beats every un-indexed one. Only when two candidates hold the *same* index does the
geometric rule decide, and it comes in two halves. If one candidate **completely
contains** the other, the **containing** zone wins — deliberately, so a full-canvas zone
can sit over other drawings and take a drag without the zones underneath firing.
Otherwise, on a partial overlap, the zone whose edge is closest to the touch loses — the
zone more 'central' to the touch wins, and on an exact tie the later zone takes it.
Between two un-indexed zones nothing changes — they are both `0`, and that geometric rule
is all there is ([§10.8](#108-give-one-touch-zone-priority-over-an-overlapping-one)).

**Between two indexed zones, the later one wins.** You do not choose the number: indices
are minted by walking `items` and handing out the next one on first sight of each
`idxName` ([§6.1](#61-draw-order-is-not-array-order)), so a zone declared further down
always gets a higher index than one above it. Ranking zones is therefore a matter of
ordering them — the last indexed zone over a spot is the one that gets the touch. An
[`index` placeholder](#index--reserve-an-index-without-drawing-anything) moves that
claim earlier if you need a zone to rank low while sitting late in the array.

That is what makes an index useful here: it lets you drop a full-canvas zone (for
dragging, say) underneath the controls without swallowing their touches, or force one
small zone to win against a background zone that would otherwise cover it.

An indexed zone differs from an ordinary indexed item in one way that matters: it is
**never deferred**. An ordinary indexed item is sent as a bare `` |i `` placeholder at
its own position with its real content moved to the end of the message; doing that to a
zone would leave its `touchAction`/`touchActionInput` children — which are never
deferred — sitting ahead of the zone they belong to. So a zone is always sent whole, in
place, and the same holds in generated Arduino code (`.idx(idxName)` is emitted inline
on the `touchZone()` line, not from `sendIndexedItems()`).

> The Dwg Controls Panel has no "Assign Index" control on a touchZone; a zone's index is
> a file-level feature, hand-written or produced by another tool. It validates, encodes
> and exports correctly, and editing that zone in the panel carries an existing `idxName`
> through untouched rather than stripping it.

`docs/ZonePriority.pfodDwg_json` is a loadable example: a full-canvas un-indexed zone
with a small indexed zone on top, each writing its own name into a shared indexed
readout label.

Touch filter values:

| Value | Name | Meaning |
|---|---|---|
| `0` | `TOUCH` | default — a plain touch |
| `1` | `DOWN` | finger down |
| `2` | `DRAG` | finger dragging |
| `4` | `UP` | finger lifted |
| `8` | `CLICK` | |
| `16` | `PRESS` | long press |
| `32` | `ENTRY` | (never sent to the app) |
| `64` | `EXIT` | (never sent to the app) |
| `256` | `DOWN_DRAG_UP` | touchActions run on down and drag, but **one** message is sent, on UP — see [§10.11](#1011-a-slider-with-pixel-resolution) |
| `512` | `TOUCH_DISABLED` | the zone is off: it captures the touch (so the page does not scroll) and does nothing else — no cmd, no touchAction, and the drawing keeps auto-refreshing under it |

`ENTRY` (32) and `EXIT` (64) are real runtime filter values but are not offered by the
designer's own filter dropdown, which lists 0, 1, 2, 4, 8, 16, 256, 512.

**`filter` is a bit mask — OR the values together to fire on more than one thing.** The
values are powers of two and every check is a bitwise `&`, so one zone can respond to
several kinds of touch. The most useful pairing is a short tap *and* a long hold:

```json
"filter": 24
```

`24` is `8 | 16` — `CLICK` plus `PRESS`. A quick tap sends `` `8 `` as the touchType, and
holding for 700 ms sends `` `16 `` instead; the click is suppressed in that case, so a
long hold gives you exactly one message, not both. The device tells them apart by the
touchType field of the reply, which carries the single value that fired rather than the
mask.

Any combination works the same way — `3` is DOWN + DRAG, `7` is DOWN + DRAG + UP — but
two of the values are not flags and must not be OR'd:

| Value | Why it is different |
|---|---|
| `0` `TOUCH` | Zero has no bit, and it is matched by equality rather than by `&`. `0 \| 8` is just `8`, and the zone becomes CLICK-only. Use `TOUCH` on its own. |
| `512` `TOUCH_DISABLED` | OR'ing it does not half-disable a zone: the zone still takes part in hit-testing — so it still swallows the touch and shields anything beneath it — but activation returns early and nothing is ever sent. Use it on its own too. |

In the Dwg Controls Panel the Touch Filter dropdown lists the eight single values. A zone
holding a combination gets a ninth entry naming it — `Combined (24) - CLICK | PRESS` —
selected, so the value shows as what it is and survives an edit untouched. Choosing a
listed value from the dropdown still replaces the combination outright, which is the only
way to change it there; to build a different combination, edit the file.

> If the touchZone has a `touchActionInput`, the runtime forces `filter` to `TOUCH` (0)
> unless it is `TOUCH_DISABLED` (512). Use `0` for input zones.

#### What a touch sends back

Touching the zone sends the device one message carrying **where** it was touched and
**how**:

```
{<identifier>~<cmd>`<col>`<row>`<touchType>}
```

`<identifier>` is the **cmd of the menu's `drawing` item** that owns this canvas — it says
*which menu item's drawing* was touched, not which drawing or which zone. `<cmd>` is the
zone's own minted cmd, `<touchType>` the filter value that fired (`1` for DOWN, `2` for
DRAG, and so on — one of the values in the table above, not the zone's whole filter), and
`<col>`/`<row>` are the touch position. A `touchActionInput` on the zone appends the
edited text as one more field — `` …`<touchType>~<text>} `` — and when a cached version is
known the whole thing is prefixed, `{<version>:<identifier>~…`.

#### Covering a rectangle — give both the same size and let `pushZero` place them

When a zone sits over a shape, **give the two identical geometry and wrap them in one
`pushZero`**, rather than writing each at its own absolute position:

```json
{ "type": "pushZero", "x": 25, "y": 12.5, "scale": 1 },
{ "type": "rectangle", "xOffset": 0, "yOffset": 0, "xSize": 18, "ySize": 7, "centered": true, "…": "…" },
{ "type": "touchZone", "cmdName": "cmd_press", "xOffset": 0, "yOffset": 0, "xSize": 18, "ySize": 7, "centered": true, "filter": 0 },
{ "type": "popZero" }
```

Both are then `0, 0` in the same local space and the `pushZero` decides where the pair
goes and how big it is. Move or resize the button by editing one item instead of two,
and the zone cannot drift off the shape — which it silently does the moment someone
adjusts a size in one place and not the other.

> **Keep a `touchAction` inside the block.** It must *immediately* follow its
> `touchZone` ([§6](#6-item-list-structure)), so `popZero` goes after the action, not
> between them. Closing the block too early orphans the action and it is deleted on
> load — an easy mistake to make, since the zone looks like the end of the button.

#### `col` and `row` are relative to the zone, and always whole numbers

Two things about the position that decide how you size a zone:

* **It is measured inside the zone, not on the canvas.** `0,0` is the zone's own corner
  wherever the zone sits, so moving a zone does not change what its touches report.
* **It is always an integer**, floored, and clamped to the zone's own size: `col` runs
  `0 … xSize` and `row` runs `0 … ySize`. (For a negative size the range is `xSize … 0`,
  the same span measured the other way.)

So **the zone's size *is* the resolution of the position it reports.** A `10 × 4` zone
can only ever answer with one of 11 columns, however large it appears on screen — the
rendered size does not matter, only `xSize`/`ySize` do. If you need a finer answer, make
the zone logically bigger and scale it down to fit
([§10.11](#1011-a-slider-with-pixel-resolution)).

A touchZone with no `cmdName` is **dropped** on load, with a report — the name is not
derivable, and without a cmd the zone cannot be touched at all.

### `touchAction` — what is drawn *while* the zone is touched

| Field | Type | Required | Notes |
|---|---|---|---|
| `cmdName` | string | **yes** | Must equal the owning touchZone's `cmdName`. Auto-corrected to the zone's name on load. |
| `action` | array | **yes** | **Exactly one element** — a full drawing item in its own right. |

`action[0]` is a complete `rectangle` / `line` / `circle` / `arc` / `label` / `value`
(or a `hide` / `unhide`) item, **including an `idxName`** naming the indexed top-level item
it replaces while the zone is touched.

**Why an array, when only one element is allowed?** It is a container, not a list you
may fill. The wire form is `` |X~cmd~<one primitive> ``, `pfodTouchAction::action()`
takes one primitive, and the encoder emits `action[0]` and nothing else. The array shape
exists because the *runtime* keeps one list of action primitives per cmd and spreads each
item into it — so a zone with several action primitives is several `touchAction` items
**sharing a `cmdName`**, not one item with several elements.

| Written | Result |
|---|---|
| one element | used as-is |
| two or more | all but the first **dropped**, reported |
| `[]`, missing, or not an array | the `touchAction` is **deleted**, reported |

That target may sit **anywhere** in `items` — before or after this touchZone. The action
is stored and only runs when the zone is touched, by which point the whole drawing has
been received, so a forward reference is fine. Only existence is checked: an `idxName`
matching no declaring top-level item **of this drawing** deletes the `touchAction` (see
[§9](#9-what-the-loader-does-with-bad-data)) — see
[§5.3](#53-an-idxname-never-crosses-a-drawing) for why an inserted drawing's items do not
count.

Inside a `touchAction`'s `action[0]` only, three fields accept the special strings
`"COL"` and `"ROW"`, meaning "wherever the touch landed" rather than a fixed number:
`xOffset`, `yOffset`, and (for a `value` target) `intValue`. A plain top-level item's
offsets are always real numbers.

```json
{
  "type": "touchAction",
  "cmdName": "cmd_c1",
  "action": [
    {
      "type": "rectangle",
      "idxName": "idx_1",
      "color": 7,
      "xSize": 18, "ySize": 7, "xOffset": 25, "yOffset": 12.5,
      "filled": true, "centered": true, "rounded": false
    }
  ]
}
```

### `touchActionInput` — pop up a text-entry dialog on touch

| Field | Type | Required | Notes |
|---|---|---|---|
| `cmdName` | string | **yes** | Must equal the owning touchZone's `cmdName`. |
| `prompt` | string | **yes** | Dialog prompt text. The editor requires it to be non-empty. Escaped like a label's `text` ([§7.2](#72-restricted-characters-and-unicode-in-text)). |
| `idxName` | string | no | Names the indexed `label`/`value` whose text this input edits — and whose current displayed text **pre-fills the dialog** (see [§10.5](#105-add-a-touch-zone-that-pops-up-a-text-entry-dialog)). It may appear anywhere in `items`, before or after this touchZone. Resolved to the wire field `textIdx` automatically. Omit if the input doesn't target an item — the box then opens blank. |
| `fontSize` | number | `0` | signed relative step, −24 … +24 (**+6 doubles, −6 halves** — see [the font-size scale](#71-the-fontsize-scale)). Rendered as an inline tag inside the prompt (no dedicated wire slot). |
| `color` | colour | `-1` | prompt **text** colour, also inlined into the prompt. |
| `backgroundColor` | colour | `-1` | dialog **background** colour; emitted as a `<bg N>` tag. |

At most one `touchActionInput` per touchZone; a second is deleted with a report.

**The dialog escapes and un-escapes for the user.** Unlike a plain String Input screen,
a `touchActionInput` un-escapes `` ` `` `{` `|` `}` `~` when it loads the target item's
text for editing, and re-escapes them on the way back, so the user sees and types real
characters and never meets an escape sequence. `parser.getEditedText()` un-escapes at the
device end to match. See [§7.2](#72-restricted-characters-and-unicode-in-text) — the
`prompt` you write in the file is still pre-escaped, since that is your text, not the
user's.

### `insertDwg` — embed another drawing

| Field | Type | Required | Notes |
|---|---|---|---|
| `drawingName` | string | **yes** | The `name` of the drawing to insert. Missing → left empty and flagged (the item then points at nothing). |
| `cmdName` | string | yes | Always exactly `"dwg_" + drawingName` — the editor's own field is read-only. Derived on load if absent, so it cannot drift. |
| `xOffset` | number | `0` | **pans the child under the origin** — see below. Not where the child is placed |
| `yOffset` | number | `0` | |

An `insertDwg` is **never indexed** — any `idx` found on one is stripped. Address it by
`cmdName` (from a `hide`/`unhide`/`erase`) instead.

The inserted drawing is served after the whole parent, so all of its indexed items
paint **above** the parent's — see [§6.1](#61-draw-order-is-not-array-order).

**An inserted drawing keeps its items and loses its canvas.** The child's own top-level
fields are read and then, except for version, ignored:

| Field | What happens |
|---|---|
| `color` | **Never painted.** Only the *top-level* drawing's `color` fills the canvas. |
| `x` / `y` | **Neither bounds nor clips anything.** The clip region comes from the top-level drawing, so the child's items draw wherever the parent's transform puts them, including outside the child's declared canvas. |
| `dwgRefresh_ms` | **Never scheduled.** Only the top-level drawing's refresh is honoured — see below. |

**On the wire, that is everything, except version, from `{+` up to the first `|`** — the background
colour, the size and the refresh interval are all parsed and discarded for an inserted
drawing. Version is kept. Only the items after the first `|` are added to the parent.

**What the version is kept for.** The client stores an inserted drawing's version like
any other and sends it back on the next fetch (`{V1:<cmd>}`), so the device can answer
"nothing changed" rather than resending the whole child. It is the one header field an
inserted drawing still controls.

#### Refresh is a top-level decision

**An inserted drawing's `dwgRefresh_ms` never schedules anything.** Two things drive an
automatic re-request, and neither is a child:

* the **menu's** own refresh, and
* the **top-level drawing's** refresh — the one a menu Drawing item points at.

An inserted drawing is re-fetched only when its parent is: every parent response is
re-scanned for its `insertDwg` items and a version-stamped request goes out per child. So
a child under a refreshing parent is re-checked **at the parent's rate**, and a child
under a parent whose refresh is `0` is fetched once and then left alone — however short
its own interval says it is.

This is worth stating plainly because the failure is silent and looks like a broken
timer: put `2000` on the drawing that actually changes, leave the top-level drawing at
`0`, and nothing ever refreshes — no error, no retry, just a screen that never updates.
**Put the refresh on the top-level drawing**, and accept that its children come along at
that rate.

The child's items are merged into the parent and drawn with the parent's background
behind them. So **a drawing meant to be inserted cannot rely on its own background**.
That matters more than it sounds: any technique that paints in the background colour to
hide something — masking the middle of a ring to make it a donut, say — works only while
the parent happens to use that same colour, and shows up as a solid patch as soon as it
does not ([§10.12](#1012-a-radial-gauge)).

If a child needs a background, give it one **explicitly**: a filled `rectangle` as its
first item, sized to the area it wants to own. That is drawn like any other item, so it
travels with the drawing wherever it is inserted.

**Because there is no background to protect, inserted drawings can freely overlap each
other, or sit on top of the main drawing's own content** — unlike un-indexed items in a
single drawing, they don't need to be spaced apart on the canvas to keep one from hiding
behind another's background, because none of them has one. If a child's own explicit
background rectangle needs to cover the main drawing or an earlier-inserted sibling —
not just that child's own later items — give the rectangle an `idxName`: indexed items
always paint above un-indexed ones, and among inserted drawings paint order otherwise
follows `insertDwg` order in the parent's `items`
([§6.1](#61-draw-order-is-not-array-order)), so indexing is the only way to reach back
and cover something already drawn.

**Position and scale an inserted drawing with `pushZero`**, not with these offsets: the
child inherits the transform in force at the `insertDwg`'s position, and that is the only
thing that decides where its origin is and how big it is. `xOffset`/`yOffset` instead pan
the parent's origin over the child — a positive offset moves the child's items up and to
the left — see [§10.6](#106-embed-another-drawing-at-an-offset).

When you add an `insertDwg`, ship the referenced drawing too — a saved
`.pfodDwg_json` alongside this one, or an entry in the same zip bundle's `dwgs/`.

An unresolved reference is recoverable rather than fatal: the designer prompts for each
missing drawing after a load. The file the user picks must **contain a drawing whose own
`name` is the one being asked for** — the *file* name is free and is never looked at, but
the `name` inside is the drawing's identity and is not rewritten to fit the slot. Pick a
file holding some other drawing and it is reported and not loaded, naming both the name
found and the one wanted. That check is recursive, so a drawing loaded to satisfy one
reference is then itself scanned for further missing `insertDwg` targets. Skipping the
prompt leaves the parent drawing rendering without the inserted child rather than
failing. The same prompt covers a menu design's own `drawing` items — see
*Missing Drawings* in `pfodMenu_json-format.md`.

### `index` — reserve an index without drawing anything

| Field | Type | Notes |
|---|---|---|
| `idxName` | string | the name being reserved |

A placeholder that draws nothing. Its purpose is to reserve an index slot (and the
transform context at its array position) so items appearing earlier can reference an
index whose real content is defined later. An `index` may legitimately share an
`idxName` with one real item.

Because reserving an index is *all* it does, an `index` with no `idxName` has nothing
left to do and is **dropped** on load, rather than merely left un-indexed like a
`rectangle` (which still draws).

**An `index` takes an `idxName` and nothing else — never a `cmdName`.** There is no cmd
slot in the `` |i`idx `` wire form to put one in, and `pfodIndex` has no `cmd()` at all
(the library header has it commented out), so an index is not a way to make something
touchable — that is what a `touchZone` is for. A `cmdName` found on one is removed and
reported.

### `hide` / `unhide` / `erase` — act on an existing item

| Field | Type | Notes |
|---|---|---|
| `idxName` | string | target an indexed item by name, **or** |
| `cmdName` | string | target a `touchZone` or an `insertDwg` by name |

Exactly one of the two. `hide` makes the target invisible, `unhide` restores it,
`erase` clears it. When the `cmdName` belongs to an `insertDwg`, the whole inserted
child drawing is hidden/unhidden/erased (a distinct wire form, resolved automatically).

**The reference must resolve, or the item is dropped** (reported in every case):

| Problem | Result |
|---|---|
| `idxName` matches no declaring top-level item **in the same drawing** ([§5.3](#53-an-idxname-never-crosses-a-drawing)) | dropped |
| `cmdName` matches no `touchZone` or `insertDwg` in this drawing | dropped |
| targets an `insertDwg` that appears **later** in `items` | dropped — see below |
| targets an `idxName` first declared **later** in `items` | dropped — see below |
| neither `idxName` nor `cmdName` | dropped |

The ordering rule is what the last two rows mean. An inserted drawing is
hidden by its own loadCmd, which means nothing until that child has actually been sent,
and items go out in array order — so an `insertDwg` below the `hide` has not been
inserted yet and there is nothing to hide. Put the `hide`/`unhide`/`erase` *after* the
`insertDwg` it targets.

The same applies to an `idxName` target, for the same reason: `hide`/`unhide`/`erase`
are never deferred, so they go out at their array position, while the `|i` placeholder
that *creates* an index is emitted where that index is first declared. A hide above its
target therefore emits `` |h`1 `` before `` |i`1 ``. An
[`index` placeholder](#index--reserve-an-index-without-drawing-anything) does not exempt
you from this — it is how you satisfy it early, by reserving the number above the hide
so the real content can still come later.

A `touchZone` target is the exception: it only has to exist somewhere in the drawing,
with no ordering requirement. Note that this ordering rule is specific to
`hide`/`unhide`/`erase`, which act as the drawing is parsed — a `touchAction`/
`touchActionInput` may reference an index declared later ([§6](#6-item-list-structure)).

### `pushZero` / `popZero` — transform stack

```json
{ "type": "pushZero", "x": -8, "y": -3, "scale": 0.7 }
{ "type": "popZero" }
```

| Field | Type | Default |
|---|---|---|
| `x` | number | `0` |
| `y` | number | `0` |
| `scale` | number | `1` |

`pushZero` saves the current transform, then moves the origin by `(x, y)` **scaled by
the current scale** and multiplies the scale by `scale`. `popZero` restores the saved
transform. These have no colour and cannot be indexed or named. They must be balanced —
an unmatched `popZero` resets to the identity transform with a warning.

---

## 8. Rules an editor must obey

1. **`format` must stay `"pfodDwgDesigner"`**, `schema` `1`. Without the format tag the
   file is not even recognised as a drawing.
2. **`x` and `y` are integers 1–255.** Everything must fit inside them to be visible.
3. **Write `cmdName` / `idxName`; never write `cmd`, `idx` or `textIdx`.** All three are
   stripped on load and reported — they are not a way to set an index or a target by
   hand ([§5](#5-names-vs-wire-values--the-single-most-important-rule)). No surrounding
   whitespace in any name either; it is trimmed on load, but write it clean.
4. **`cmdName` is unique across all `touchZone` + `insertDwg` items.**
   **`idxName` is unique among drawing items, and separately among `index`
   placeholders** — one of each may share a name on purpose ([§5.2](#52-sharing-an-idxname)).
5. **A `touchAction` / `touchActionInput` must come immediately after its `touchZone`**
   AND carry the same `cmdName` — both are checked, and either one wrong deletes that
   child. One `touchActionInput` maximum.
6. **Every `idxName` reference must match a declaring top-level item in the same
   drawing**, or it is deleted on load. An inserted drawing's items do not count —
   indices are per drawing ([§5.3](#53-an-idxname-never-crosses-a-drawing)).
7. **A non-blank `idxName` is what makes an item indexed** — there is no separate flag.
   A legacy `indexed` boolean is removed on load.
8. **`touchAction.action` is an array of exactly one item**, and that item carries the
   `idxName` of the item it replaces.
9. **`insertDwg.cmdName` must be `"dwg_" + drawingName`** (derived on load if absent),
   and `insertDwg` is never indexed. **A `touchZone` must carry a `cmdName`** — it is
   not derivable, so one without it is dropped.
10. **Keep `pushZero` / `popZero` balanced.**
11. **`dwgRefresh_ms` is in milliseconds** — write `2000` for a 2-second refresh, not
    `2`. Only the Dwg Controls Panel's own input works in seconds.
12. **Item colour absent = `-1` (auto black/white); dwg `color` absent = `0` (Black).**
13. **A `value` item's raw range is whole numbers.** `intValue`, `min`, `max` and
    `decimals` are integers on the device; only `displayMin` / `displayMax` are floats.
    A fraction is rounded on load, and `decimals` is clamped to −6 … +6.
14. **Write real JSON booleans.** A legacy `"true"` / `"false"` string is converted
    to the real boolean and reported; any other non-boolean is defaulted and
    reported — see [§4](#4-booleans).
15. **Draw order is not array order.** Un-indexed items paint first in array order,
    then indexed items by ascending `idx`, then touchZones — so an indexed item is
    always above an un-indexed one ([§6.1](#61-draw-order-is-not-array-order)).

---

## 9. What the loader does with bad data

`validateAndRepairDwg()` never rejects a drawing outright (once it is past the
required-field gate above); it **repairs and reports**. Every repair is listed on a Validation Errors
screen before the user saves.

| Problem | Result |
|---|---|
| a name with leading/trailing whitespace | trimmed, reported |
| `format` ≠ `"pfodDwgDesigner"` | **file rejected** — not treated as a drawing at all |
| `name` missing or not a non-empty string | **file rejected**, with a message naming the field |
| `x` / `y` missing or out of 1–255 | defaulted / clamped, reported |
| `color` present but invalid — including `RRGGBB` hex and colour names | item → `-1`, dwg → `0`, reported |
| a raw `idx` / `cmd` / `textIdx` **beside** its `idxName` / `cmdName` | stripped, reported — the real value is minted from the name, so nothing else changes |
| a raw `idx` / `cmd` / `textIdx` with **no** such name | stripped, reported — the item loses that aspect: an `idx` leaves it un-indexed, and a `hide`/`unhide`/`erase` left with no target is then deleted |
| a fractional `intValue` / `min` / `max` / `decimals` | rounded to nearest, reported |
| a touchZone `priority` | removed — reported only when non-zero |
| `decimals` outside −6 … +6 | clamped to the limit, reported |
| a legacy `indexed` boolean | removed — reported only where dropping it changes something |
| a raw `` ` `` `{` `\|` `}` `~` in `text` / `units` / `prompt` | escaped, reported — it renders the same |
| a `cmdName` on an `index` item | removed, reported — an index never carries one |
| an `index` item with no `idxName` | dropped, reported |
| `dwgRefresh_ms` missing/negative | set to `0`, silent |
| unknown item `type` | **item deleted**, reported |
| a boolean written as the string `"true"` / `"false"` | converted to the real boolean, reported |
| field of the wrong type | replaced with its default (reported for numbers, colours and booleans; silent for enums/strings) |
| **absent** field | defaulted **silently** — this is normal, not corruption |
| `touchZone` with no `cmdName` | **item deleted**, reported — not derivable |
| `insertDwg` with no `cmdName` | derived as `"dwg_" + drawingName`, reported |
| `hide`/`unhide`/`erase` whose `cmdName` matches nothing | **item deleted**, reported |
| `hide`/`unhide`/`erase` placed before the `insertDwg` it targets | **item deleted**, reported |
| `insertDwg` with no `drawingName` | set to `""`, reported |
| duplicate declared `idxName` | later declaration's content moved onto the first occurrence's position, the rest deleted, reported |
| orphaned `touchAction` / `touchActionInput` (no matching preceding touchZone) | **deleted**, reported |
| `touchAction` / `touchActionInput` whose `cmdName` differs from the touchZone it follows (or is absent) | **deleted**, reported |
| second `touchActionInput` on one touchZone | **deleted**, reported |
| reference to an `idxName` nothing declares | **deleted**, reported |

---

## 10. Recipes

### 10.1 Add a filled red circle

Append to `items`:

```json
{
  "type": "circle",
  "xOffset": 25,
  "yOffset": 12,
  "radius": 6,
  "filled": true,
  "color": 9
}
```

### 10.2 Add a centred bold label

```json
{
  "type": "label",
  "color": 15,
  "xOffset": 25,
  "yOffset": 40,
  "text": "Status: OK",
  "fontSize": 2,
  "bold": true,
  "italic": false,
  "underline": false,
  "align": "center"
}
```

### 10.3 Add a label that can be updated later (indexed)

```json
{
  "type": "label",
  "idxName": "idx_status",
  "color": 15,
  "xOffset": 25,
  "yOffset": 40,
  "text": "Status: OK",
  "fontSize": 0,
  "bold": true,
  "italic": false,
  "underline": false,
  "align": "center"
}
```

Pick an `idxName` not already used by another non-`index` item.

### 10.4 Add a complete push-button (rectangle + label + touch zone + press feedback)

A complete drawing, ready to load. The six items between `pushZero` and `popZero` are
also the unit to copy into a bigger drawing — they are all at `0, 0` in the pushZero’s
local space and share one set of sizes, so nothing inside has to be re-measured
([§7](#covering-a-rectangle--give-both-the-same-size-and-let-pushzero-place-them)).
The `touchAction` must directly follow the `touchZone` and share its `cmdName`, so
`popZero` closes the block **after** the action:

```json
{
  "format": "pfodDwgDesigner",
  "schema": 1,
  "name": "PushButton",
  "description": "One push-button: rounded background, label, touch zone and press feedback. Everything sits at 0,0 in the pushZero's local space, so the pushZero alone places and sizes the whole button.",
  "x": 50,
  "y": 25,
  "color": 15,
  "dwgRefresh_ms": 0,
  "items": [
    { "type": "pushZero", "x": 25, "y": 12.5, "scale": 1 },
    {
      "type": "rectangle",
      "idxName": "idx_btn_bg",
      "color": 10,
      "xSize": 18, "ySize": 7, "xOffset": 0, "yOffset": 0,
      "filled": true, "centered": true, "rounded": true
    },
    {
      "type": "label",
      "idxName": "idx_btn_text",
      "color": 0,
      "xOffset": 0, "yOffset": 0,
      "text": "Press Me",
      "fontSize": 0,
      "bold": true, "italic": false, "underline": false,
      "align": "center"
    },
    {
      "type": "touchZone",
      "cmdName": "cmd_press",
      "xSize": 18, "ySize": 7, "xOffset": 0, "yOffset": 0,
      "filter": 0,
      "centered": true
    },
    {
      "type": "touchAction",
      "cmdName": "cmd_press",
      "action": [
        {
          "type": "rectangle",
          "idxName": "idx_btn_bg",
          "color": 7,
          "xSize": 18, "ySize": 7, "xOffset": 0, "yOffset": 0,
          "filled": true, "centered": true, "rounded": false
        }
      ]
    },
    { "type": "popZero" }
  ]
}
```

Ships as `docs/PushButton.pfodDwg_json`.

To move the button, change the `pushZero`; to resize it, change the `scale`. Nothing
else has to be kept in step.

While the zone is held, the background rectangle `idx_btn_bg` is redrawn in Silver;
on release it reverts.

**Why the label is indexed too, and why it comes after the rectangle.** Only
`idx_btn_bg` is ever updated — the label's text never changes — so `idx_btn_text` looks
redundant. It is not, and neither is its position:

* **The label must be indexed**, because the rectangle is. Indexed items paint in a
  later pass than un-indexed ones ([§6.1](#61-draw-order-is-not-array-order)), so an
  un-indexed label would be painted *first* and the indexed rectangle would then cover
  it — a button with no text on it. Giving the label an index puts it in the same pass,
  where its position in `items` decides the order.
* **The label must come after the rectangle**, because within that pass items paint by
  ascending `idx`, and indices are handed out on first sight walking `items`. Later in
  the array means a higher index means painted on top. Swap the two and the background
  covers the text again.

So the label's index is not there to be updated — it is there to keep the text above the
part that *is*. The same applies to any label sitting on an indexed shape.

### 10.5 Add a touch zone that pops up a text-entry dialog

```json
{
  "type": "label",
  "idxName": "idx_name",
  "color": 15,
  "xOffset": 25, "yOffset": 20,
  "text": "(unset)",
  "fontSize": 0,
  "bold": false, "italic": false, "underline": false,
  "align": "center"
},
{
  "type": "touchZone",
  "cmdName": "cmd_setname",
  "xSize": 30, "ySize": 8, "xOffset": 25, "yOffset": 20,
  "filter": 0,
  "centered": true
},
{
  "type": "touchActionInput",
  "cmdName": "cmd_setname",
  "prompt": "Enter a name",
  "idxName": "idx_name",
  "fontSize": 0,
  "color": 15,
  "backgroundColor": 0
}
```

**The dialog opens pre-filled with the target item's current text.** `idxName` does not
only say where the typed value goes — it also says what the box starts out showing. Here
that is the label's own `text`, so the first press opens the dialog on `(unset)`, and
every press after that opens it on whatever was last entered. Omit `idxName` and the box
opens blank.

What it pre-fills with is the item's **displayed** string, read from the live drawing
rather than from the file:

| Target | Pre-filled with |
|---|---|
| `label` | its `text`, plus the optional `value` / `decimals` / `units` suffix if present — exactly the string on the canvas |
| `value` | its `text` prefix + the scaled value + `units`, using the same `min`/`max` → `displayMin`/`displayMax` scaling the canvas uses |
| anything else, or no `idxName` | blank |

It is read as the touch begins, so a `touchAction` on the same zone that changes the
label does not change what the dialog shows.

Omitting `idxName` is a supported case. A missing `textIdx`, or one that does not
reference a dwg item in this dwg **and its inserted dwgs**, or one referencing an item
that is not a `label`/`value`, also just opens blank. The wire form is then
`` |XI~cmd~prompt `` with no trailing `` `idx ``; firmware does the same, since `textIdx`
defaults to `0` and `pfodDwgsBase::printIdx()` prints nothing for `0`.

> Note the two different scopes, which are not in conflict. **`idxName` is per drawing**
> and never crosses one ([§5.3](#53-an-idxname-never-crosses-a-drawing)) — a parent cannot
> *name* a child's index, so a designer-authored `touchActionInput` always targets an item
> in its own drawing. **`textIdx` is a wire value resolved against the merged tree**,
> whose numeric idx space spans the parent and every drawing it inserts, so a hand-written
> sketch calling `.textIdx()` with a child's index does resolve — which is why the lookup
> reaches into the inserted drawings.

### 10.6 Embed another drawing at an offset

```json
{ "type": "pushZero", "x": 29, "y": 0, "scale": 1 },
{ "type": "insertDwg", "drawingName": "LedOff", "cmdName": "dwg_LedOff",
  "xOffset": 0, "yOffset": 0 },
{ "type": "popZero" }
```

**`pushZero` is the way to position and scale an inserted drawing.** It is not optional
decoration around the `insertDwg` — it is the only thing that sets where the child's
origin is and how big it is. The child inherits whatever transform is in force at the
`insertDwg`'s position, so the `pushZero` above places it at `(29, 0)` and sizes it by
`scale`; `popZero` puts the parent's origin back for whatever follows.

**The `insertDwg`'s own `xOffset`/`yOffset` do something different — they pan the
viewport over the child.** The offset names a point *inside the child*, and that point is
brought to the current origin, so the child's items move **up and to the left** for a
positive offset:

```js
dwgTransform.x += (-xOffset) * scale;   // drawingMerger.js — note the negation
dwgTransform.y += (-yOffset) * scale;
```

So `"xOffset": 10` does not place the child 10 to the right — it slides the child 10 to
the left, showing the part of it that starts 10 in from its own left edge. Think of the
parent's origin as a window onto the child and these two as scrolling it. They also do
**not** move the child's background rectangle, only its items.

Use `pushZero` to say *where and how big*; use the offsets only when you actually want to
show a different part of the child.

### 10.7 Hide an inserted drawing when a zone is touched

```json
{
  "type": "touchAction",
  "cmdName": "cmd_press",
  "action": [ { "type": "hide", "cmdName": "dwg_LedOff" } ]
}
```

### 10.8 Give one touch zone priority over an overlapping one

**First, what happens with no priority at all.** Overlapping un-indexed zones all tie at
index `0`, so the hit test falls back to geometry, in this order:

1. **Candidates** are the visible (not hidden), non-`TOUCH_DISABLED` zones whose
   rectangle contains the touch. Each rectangle is first grown on every side by a minimum
   touch size — **whichever is larger of about 4.5 mm and 2 % of the canvas** (its width
   for the left/right margin, its height for top/bottom) — so a small zone stays reachable
   on a large display as well as a small one.
2. **If one candidate completely contains another, the containing one wins.** That is
   deliberate rather than a quirk: it lets you lay a full-canvas zone over a drawing and
   click and drag without the zones inside it firing.
3. **Otherwise the more central zone wins** — of the two, whichever has the touch nearer
   to one of its edges loses. On an exact tie, the zone declared later takes it.

Which is fine until you need the *smaller* zone to win over one that encloses it, since
rule 2 hands that to the big one. That is what an index (the priority) is for.

**Add an `idxName` to the zone that should win.** Nothing else changes, and the zone that
should lose needs no edit at all — un-indexed counts as `0`.

```json
{
  "type": "touchZone",
  "cmdName": "cmd_bg",
  "xOffset": 0, "yOffset": 0, "xSize": 50, "ySize": 30,
  "filter": 1, "centered": false
},
{
  "type": "touchZone",
  "cmdName": "cmd_small",
  "idxName": "idx_priority",
  "xOffset": 18, "yOffset": 10, "xSize": 14, "ySize": 10,
  "filter": 1, "centered": false
}
```

A touch inside the small zone reports `cmd_small`; one outside it but on the canvas
reports `cmd_bg`. Array order does not matter here, because only one of the two is
indexed and any index beats none — so the zones can be put either way round.

It *would* matter if you indexed both: between two indexed zones the later one wins, and
you do not pick the numbers ([§7](#touchzone--a-touchable-rectangle)). So index only the
zone that should win, and if you need to rank three or more, order them.

### 10.9 Make the canvas bigger

Change the top-level `x` / `y` (keep both integers 1–255). Existing item coordinates
are absolute, so they stay where they are — reposition items as needed.

Two things to know before you do, because "bigger" is the opposite of what it looks like:

* **A bigger canvas makes everything on it smaller.** `x` and `y` are not a size in
  pixels, they are how many units the drawing is divided into, and the canvas is then
  scaled to the space available. Doubling `x` and `y` halves every item on screen. To make
  the *contents* bigger, shrink the canvas or enlarge the items — not this.
* **A drawing unit is always square.** The canvas keeps the `x`:`y` aspect ratio exactly
  (`aspectRatio = x / y`, with `scaleX` and `scaleY` derived from it), so one unit
  across equals one unit down. There is no way to stretch a drawing on one axis.

**How the canvas is fitted.** A pfodWeb window is portrait with a **fixed width** — the
menu column is capped at 500 px however wide the browser is — and only the height varies
with the window:

* Normally the drawing is fitted to that fixed width, and its displayed height follows
  from the aspect ratio (`canvasHeight = canvasWidth / aspectRatio`).
* If that height would exceed the visible area, **both** dimensions are scaled down
  together until the height fits (`cssHeight = viewportHeight − 40`, width =
  height × aspectRatio). Nothing is cropped and nothing is stretched — the whole drawing
  just gets smaller, text included.

**So how tall can `y` be before it starts shrinking?** Up to the point where the drawing
still fits the height, i.e. roughly

```
y / x  ≈  (visible height in px) / (usable width in px)
```

The usable width is fixed at about 460 px of canvas (500 px column, less the scroll area's
padding and the wrapper's border). The visible height is the window's inner height less
the 40 px toolbar and a 40 px margin. That gives a rule of thumb:

| Browser window inner height | `y`:`x` that about fills it |
|---|---|
| ~700 px (small laptop, or a phone in portrait) | ≈ 1.4 : 1 |
| ~1000 px (typical full-height desktop window) | **≈ 2 : 1** |
| ~1400 px (tall monitor) | ≈ 3 : 1 |

Other menu items above or below the drawing do **not** shrink it: the height it is fitted
to is the scroll area's *visible* height, whatever the list happens to contain, so the
drawing is always sized for the full window and you simply scroll it into view
([§10.10](#1010-make-the-items-bigger)). A device-set prompt does take from it, though —
the prompt is a sibling of the scroll area, capped at half the menu height — so treat
these as an upper bound when the device sets one.

So with the common `x: 50`, a `y` of about 100 fills a full-height desktop window. Going
taller is not an error — it simply shrinks the whole drawing to fit, so a `50 × 200`
drawing renders at half the size of a `50 × 100` one in the same window. Pick the ratio
for the window you expect, and keep `y` at or under it if legibility matters.

### 10.10 Make the items bigger

The canvas is always fitted to the same fixed width, so "bigger" means *fewer units
across* — an item is drawn at `size × (fixed width / x)`. Three ways to get there,
depending on what you want bigger:

* **Everything at once — shrink the canvas.** Halving `x` and `y` doubles every item on
  screen. Item coordinates are absolute, so halve those too, or they land off-canvas.
  This is [§10.9](#109-make-the-canvas-bigger) run backwards, and it is the only one that
  makes the *whole drawing* bigger.
* **One group — wrap it in `pushZero` with a `scale`.** `scale: 2` doubles the sizes and
  the offsets of everything up to the matching `popZero`, relative to the origin that
  `pushZero` sets. Nothing else in the drawing changes, and the canvas is untouched:

  ```json
  { "type": "pushZero", "x": 10, "y": 10, "scale": 2 },
  { "type": "circle", "xOffset": 0, "yOffset": 0, "radius": 4, "filled": true, "color": 9 },
  { "type": "popZero" }
  ```

* **Text only — raise `fontSize`.** It is a relative step, not points: **+6 doubles the
  size, −6 halves it** ([§7.1](#71-the-fontsize-scale)). A label's size is independent of
  the shapes around it, so this is usually what you want for a readable caption on a
  drawing you do not otherwise wish to change.

**And you can give the drawing the whole screen.** A drawing shares `#menu-scroll-area`
with the rest of the menu, but it is *sized* against that area's full visible height, not
against whatever is left over after the other items. So scrolling the other items out of
the way does not resize it — it is already as large as the window allows; scrolling just
brings all of it into view at once. Nothing to configure: put the drawing in the menu and
scroll to it.

### 10.11 A slider with pixel resolution

A touchZone reports `col` as a whole number in `0 … xSize`
([§7](#touchzone--a-touchable-rectangle)), so a zone the width of a 50-unit canvas can
only answer with 51 positions — about one step every 9 screen pixels. For a slider that
is visibly coarse.

The fix is to make the zone **logically** much wider than the canvas and scale it back
down. The 1–255 limit applies to the canvas `x`/`y`, not to item sizes, and a `pushZero`
`scale` shrinks whatever it wraps — so a 500-wide zone inside `scale: 0.1` renders 50
units wide, exactly covering the canvas, while still reporting 0…500:

This one has to be read as a **whole drawing**, because the numbers only make sense
against the canvas: `500 × 0.1 = 50`, which is `x`.

```json
{
  "format": "pfodDwgDesigner",
  "schema": 1,
  "name": "Slider",
  "description": "Horizontal slider whose touch zone is 500 units wide inside a scale 0.1 pushZero, so it renders 50 units across the canvas while still reporting col over 0-500 - one step per screen pixel. The readout follows the touch on down, drag and up.",
  "x": 50,
  "y": 20,
  "color": 12,
  "dwgRefresh_ms": 0,
  "items": [
    {
      "type": "value",
      "idxName": "idx_pos",
      "xOffset": 25, "yOffset": 5,
      "text": "x = ", "fontSize": 2,
      "align": "center", "bold": true, "italic": false, "underline": false,
      "color": 15,
      "intValue": 0, "min": 0, "max": 500,
      "displayMin": 0, "displayMax": 500,
      "decimals": 0, "units": ""
    },
    { "type": "pushZero", "x": 0, "y": 12, "scale": 0.1 },
    {
      "type": "rectangle",
      "xOffset": 0, "yOffset": 0, "xSize": 500, "ySize": 40,
      "filled": true, "centered": false, "rounded": true, "color": 8
    },
    {
      "type": "touchZone",
      "cmdName": "cmd_slide",
      "xOffset": 0, "yOffset": 0, "xSize": 500, "ySize": 40,
      "filter": 7,
      "centered": false
    },
    {
      "type": "touchAction",
      "cmdName": "cmd_slide",
      "action": [
        {
          "type": "value",
          "idxName": "idx_pos",
          "xOffset": 25, "yOffset": 5,
          "text": "x = ", "fontSize": 2,
          "align": "center", "bold": true, "italic": false, "underline": false,
          "color": 15,
          "intValue": "COL", "min": 0, "max": 500,
          "displayMin": 0, "displayMax": 500,
          "decimals": 0, "units": ""
        }
      ]
    },
    { "type": "popZero" }
  ]
}
```

Ships as `docs/Slider.pfodDwg_json`.

The track and the zone are the **same size in the same `pushZero`**, so they cannot drift
apart ([§7](#covering-a-rectangle--give-both-the-same-size-and-let-pushzero-place-them)).
At `scale: 0.1` the pair renders `50 × 4` — the full canvas width — while the zone still
reports `col` across 0…500. The resolution comes from `xSize`, not from how big the zone
looks, so a thin track is as precise as a fat one.

**`filter: 7` is `DOWN | DRAG | UP` (1 | 2 | 4), and DRAG alone would not do.** A user
who wants a particular value does not necessarily drag to it — they tap it. A zone
filtered on DRAG only never hears that tap, so the slider ignores every plain click and
feels broken. DOWN catches the tap, DRAG follows the finger while it moves, and UP gives
the final resting value; a tap sends DOWN then UP, a drag sends DOWN, a run of DRAGs, and
UP. Adding the two extra bits costs nothing and removes the failure.

Dragging across the track sends:

```
{a~c1`0`10`1}      DOWN, at the left edge
{a~c1`125`10`2}    DRAG, a quarter across
{a~c1`250`10`2}    DRAG, halfway
{a~c1`499`10`4}    UP, at the right edge
```

and a plain tap in the middle sends just two, `` `2 `` never appearing:

```
{a~c1`250`10`1}    DOWN
{a~c1`250`10`4}    UP
```

**`filter: 256` (`DOWN_DRAG_UP`) is the alternative, and it sends far less.** It fixes
the same tap problem — a tap is still heard — but the device is told **once**, on UP:

```
{a~c1`250`10`256}    the only message, whether tapped or dragged
```

The readout still follows the finger the whole way. `touchAction`s are applied by the
client, so on down and on every drag the action runs and the display updates, with
nothing sent; only the release produces a message. That is the whole trade: **`7` is for
when the device has to react while you drag, `256` is for when it only needs the answer.**
A dimmer that should fade as you move wants `7`; a set-point the device acts on once
wants `256`.

Three differences worth knowing before choosing:

* **Message count.** `256` sends exactly one per touch. `7` sends one on DOWN, one on UP,
  and drags in between — throttled, not one per pixel: a drag for a zone whose message is
  still in flight is dropped rather than queued, so the rate follows the round-trip time.
* **Which values arrive.** Because of that throttling, `7` gives the device a *sample* of
  the drag, not every position — intermediate values are dropped on purpose. Only the UP
  message is guaranteed, and it carries the final value. `256` skips the sampling and
  sends that final value directly.
* **What the touchType says.** `7` reports `` `1 ``, `` `2 ``, `` `4 `` so the device can
  tell a press from a move from a release. `256` always reports `` `256 ``, so a tap and
  the end of a long drag are indistinguishable — which is usually the point, but rules
  out reacting differently to the two.

and adjacent screen pixels now report adjacent values — `` `0 ``, `` `1 ``, `` `2 `` —
where the same touches on an unscaled 50-wide zone all report `` `0 ``. That is the whole
point: **the zone's size sets the resolution, the scale sets the size on screen, and the
two are independent.** Pick `xSize` for the number of steps you want, then choose the
`scale` that makes it fit.

**The readout is a `value` whose `intValue` is `"COL"`.** Inside a `touchAction`'s
`action[0]`, `"COL"` means "wherever the touch landed"
([§7](#touchaction--what-is-drawn-while-the-zone-is-touched)), so the touchAction replaces
`idx_pos` with the same item carrying the touched column. `min`/`max` are `0`/`500` and
`displayMin`/`displayMax` match, so what you see is the raw `col` the zone reports — the
0…500 the whole recipe is about, not a rescaled version of it.

Note **where the readout is declared**: outside the `pushZero`, in canvas units, even
though the `touchAction` that updates it sits inside. That works because a touchAction
item is drawn with its **target's** transform, not the transform in force where the
action is written. It matters here: `pushZero` scales font size along with everything
else, so a readout declared inside `scale: 0.1` would render at a tenth of its size.

Two things to keep in mind:

* The **whole** drawing still has to fit `x`/`y` ≤ 255 once scaled — here 500 × 0.1 = 50,
  which is the canvas width. Scale and size have to be chosen together.
* `pushZero` scales `xOffset`/`yOffset` as well as sizes, so coordinates inside the
  block are in the zone's own enlarged units, not the canvas's.

### 10.12 A radial gauge

A semicircular gauge showing 0–100 %, ported from `Gauge` in the **pfodDwgControls**
library (`pfodDwgControls/Gauge.cpp`). It is worth reading as a worked example because
it uses indices for something no other recipe here needs: **controlling what covers
what**.

The face is built from three arcs — a grey background arc, a red arc showing the value,
and a white arc that masks the middle to leave a ring — and the red one has to sit
*between* the other two. **Two different mechanisms put it there**, which is what makes
this worth reading ([§6.1](#61-draw-order-is-not-array-order)):

* The grey arc carries **no `idxName` at all**. Un-indexed items are all painted first,
  in array order, so the grey arc is below every indexed item automatically — nothing
  had to be arranged. The 50 % tick and the three captions are un-indexed for the same
  reason.
* The red arc and the mask are both indexed, so between *those two* it is the index
  number that decides, and the number comes from the order the **names** are first seen.

So indices are handed out `idx_arc` 1, `idx_center` 2, the two end ticks 3 and 4,
`idx_label` 5 — the mask covers the value arc, the ticks are painted over the mask, and
the readout sits on top of everything. Array position had nothing to do with it: the red
arc is declared *after* all three captions and still paints before them.

> **The mask sweeps exactly the same span as the arcs it covers**, `217.5 / -255`, so the
> ring ends on a clean radial line at both 0 % and 100 % and nothing overhangs.
>
> The path is a **pie**: centre, arc, close. So that outline
> does not run from `radius 5` to `radius 5.5`, the part you want to see — it runs from the
> **centre** all the way out. Only paint order decides how much of it survives.
>
> The 50 % tick is **un-indexed**, so it is painted in the first pass, before any indexed
> item ([§6.1](#61-draw-order-is-not-array-order)). The grey ring and the white mask are
> then laid over its inner length and only the 5 → 5.5 stub is left showing — exactly the
> tick that was wanted, achieved by drawing it *first*.
>
> The 0 % and 100 % ticks carry `idx_tick0` / `idx_tick100`, minting 3 and 4, so they are
> painted **after** the mask at 2 — and nothing covers them. Their full radial stroke is
> drawn, from the centre out across the face. Move them to the un-indexed pass (delete the
> two `idxName`s) and they become stubs like the 50 % one; leave them indexed and they are
> full radials. Nothing else in the file changes either way.
>
> **An arc IS stroked**, at the same 2 px as everything else, so it is never *only*
> its fill: the stroke traces the pie’s two straight edges as well as its rim, and a
> zero-sweep arc is nothing but that stroke.
>
> **The tick marks and the captions are `"color": -1`, not black.** -1 is BLACK_WHITE
> ([§3](#3-colours)): it is not a colour of its own but a rule — resolve to whichever of
> black or white contrasts with the background it is drawn against. On this white canvas
> that is black, so it looks identical to `"color": 0` here; the difference only shows when
> the drawing is put somewhere darker, where a hard-coded black tick would vanish and a -1
> tick turns white by itself. It costs nothing on the wire either — BLACK_WHITE is the
> default, so the field is omitted entirely.


The drawing's own origin is the **centre of the gauge face**, which is why the labels use
negative offsets — and why the items sit inside a `pushZero` that puts that centre at
`8.5, 7.5`, on a 17 x 12 canvas. The face is 11 across (`radius 5.5` either side) and the
captions sit outside it, so the canvas is only as tall as the semicircle plus its labels
rather than square. Without the `pushZero` the gauge would be centred on the
canvas *corner* and three quarters of it would fall outside. Keeping the coordinates
centre-relative and moving them with one `pushZero` is the same pattern as everywhere
else here.

> **The end captions are `"right"` and `"left"`, not centred — and that is the reusable
> part.** Anchor a caption on the side facing the gauge and it grows *outwards*: `0%` is
> right-aligned at `-4.5`, so its right edge stays pinned beside the 0 % tick however long
> the text becomes, and `100%` is left-aligned at `4.5` for the mirror. `50%` stays centred
> because it sits directly above the middle, where both directions are equally away.
>
> Centre them all and it looks the same *for these three strings*, and only for these
> three. The moment a caption's text changes — a longer unit, a real scale like
> `0 rpm` / `6000 rpm`, or a value substituted at runtime — a centred caption grows half
> its extra width *into* the face and collides with the ring, while an outward-anchored
> one cannot. It also fixes the anchor: with `right`/`left` the offset means "this edge,
> here", so the captions stay put and only their far ends move.
>
> The general rule: **align text away from whatever it labels.** Left of a thing, anchor
> right; right of it, anchor left; above or below its centre, centre it.

```json
{
  "format": "pfodDwgDesigner",
  "schema": 1,
  "name": "Gauge",
  "description": "Semicircular 0-100% gauge, ported from Gauge.cpp in pfodDwgControls. Items keep the library's centre-origin coordinates; the pushZero puts that centre on this 17x12 canvas so it renders standalone.",
  "x": 17,
  "y": 12,
  "color": 15,
  "dwgRefresh_ms": 0,
  "items": [
    { "type": "pushZero", "x": 8.5, "y": 7.5, "scale": 1 },
    {
      "type": "arc",
      "xOffset": 0, "yOffset": 0, "radius": 5.5,
      "start": 90, "angle": 0,
      "filled": false, "color": -1
    },
    {
      "type": "arc",
      "xOffset": 0, "yOffset": 0, "radius": 5,
      "start": 217.5, "angle": -255,
      "filled": true, "color": 8
    },
    {
      "type": "label",
      "xOffset": -4.5, "yOffset": 3,
      "text": "0%", "fontSize": -6,
      "align": "right", "bold": false, "italic": false, "underline": false,
      "color": -1
    },
    {
      "type": "label",
      "xOffset": 0, "yOffset": -6,
      "text": "50%", "fontSize": -6,
      "align": "center", "bold": false, "italic": false, "underline": false,
      "color": -1
    },
    {
      "type": "label",
      "xOffset": 4.5, "yOffset": 3,
      "text": "100%", "fontSize": -6,
      "align": "left", "bold": false, "italic": false, "underline": false,
      "color": -1
    },
    {
      "type": "arc",
      "idxName": "idx_arc",
      "xOffset": 0, "yOffset": 0, "radius": 5,
      "start": 217.5, "angle": -128,
      "filled": true, "color": 9
    },
    {
      "type": "arc",
      "idxName": "idx_center",
      "xOffset": 0, "yOffset": 0, "radius": 4,
      "start": 217.5, "angle": -255,
      "filled": true, "color": 15
    },
    {
      "type": "arc",
      "idxName": "idx_tick0",
      "xOffset": 0, "yOffset": 0, "radius": 5.5,
      "start": 217.5, "angle": 0,
      "filled": false, "color": -1
    },
    {
      "type": "arc",
      "idxName": "idx_tick100",
      "xOffset": 0, "yOffset": 0, "radius": 5.5,
      "start": -37.5, "angle": 0,
      "filled": false, "color": -1
    },
    {
      "type": "value",
      "idxName": "idx_label",
      "xOffset": 0, "yOffset": -1.5,
      "text": "", "fontSize": -3,
      "align": "center", "bold": true, "italic": false, "underline": false,
      "color": 9,
      "intValue": 128, "min": 0, "max": 255,
      "displayMin": 0, "displayMax": 100,
      "decimals": 1, "units": "%"
    },
    { "type": "popZero" }
  ]
}
```

Ships as `docs/Gauge.pfodDwg_json`, ready to load.

**Placing it.** A gauge on its own is rarely what you want; insert it into a parent and
position it with `pushZero`, exactly as `Slider_Gauge_Serial` does
(`pushZero(25, 12, 1.5f)` then `insertDwg`):

```json
{ "type": "pushZero", "x": 25, "y": 12, "scale": 1.5 },
{ "type": "insertDwg", "drawingName": "Gauge", "cmdName": "dwg_Gauge", "xOffset": 0, "yOffset": 0 },
{ "type": "popZero" }
```

The `scale` is what sizes the gauge — a 17 × 12 drawing at `1.5` occupies 25.5 × 18 of the
parent — and the `pushZero` offset puts its centre where you want it
([§10.6](#106-embed-another-drawing-at-an-offset)).

**Updating the reading.** Only `idx_arc` and `idx_label` change: the arc's `angle` is
`-value` out of a −255 full sweep, and the value item carries the raw `intValue` with
`max: 255` / `displayMax: 100` so the device sends counts and the display shows percent
([§7](#value--a-live-numeric-readout)). Everything else is drawn once. On a device that
is `sendUpdate()` re-sending just those two items; from this file it is the same two
`idxName`s.

---

## 11. Complete example — a two-state LED button

```json
{
  "format": "pfodDwgDesigner",
  "schema": 1,
  "savedAt": "2026-07-30T06:31:50.540Z",
  "name": "LedOn",
  "description": "",
  "js_ver": "V4.1.2-- 27th July 2026",
  "x": 50,
  "y": 25,
  "color": 12,
  "dwgRefresh_ms": 0,
  "items": [
    {
      "type": "rectangle",
          "idxName": "idx_1",
      "color": 10,
      "xSize": 18, "ySize": 7, "xOffset": 25, "yOffset": 12.5,
      "filled": true, "centered": true, "rounded": true
    },
    {
      "type": "label",
          "idxName": "idx_2",
      "color": 9,
      "xOffset": 25, "yOffset": 12.5,
      "text": "Turn Led On",
      "fontSize": 0,
      "bold": true, "italic": false, "underline": false,
      "align": "center",
      "decimals": 2
    },
    {
      "type": "touchZone",
      "xSize": 18, "ySize": 7, "xOffset": 25, "yOffset": 12.5,
      "cmdName": "cmd_c1",
      "filter": 0,
      "centered": true,
      "priority": 0
    },
    {
      "type": "touchAction",
      "cmdName": "cmd_c1",
      "action": [
        {
          "type": "rectangle",
          "idxName": "idx_1",
          "color": 7,
          "xSize": 18, "ySize": 7, "xOffset": 25, "yOffset": 12.5,
          "filled": true, "centered": true, "rounded": false
        }
      ]
    }
  ]
}
```

A composing drawing that places two of these side by side:

```json
{
  "format": "pfodDwgDesigner",
  "schema": 1,
  "name": "LedOnOff",
  "description": "",
  "x": 40,
  "y": 15,
  "color": 7,
  "dwgRefresh_ms": 2000,
  "items": [
    { "type": "pushZero", "x": -8, "y": -3, "scale": 0.7 },
    { "type": "insertDwg", "drawingName": "LedOn", "cmdName": "dwg_LedOn",
      "xOffset": 0, "yOffset": 0 },
    { "type": "pushZero", "x": 29, "y": 0, "scale": 1 },
    { "type": "insertDwg", "drawingName": "LedOff", "cmdName": "dwg_LedOff",
      "xOffset": 0, "yOffset": 0 },
    { "type": "popZero" },
    { "type": "popZero" },
    {
      "type": "label",
          "idxName": "idx_1",
      "color": 0,
      "xOffset": 20, "yOffset": 11.5,
      "text": "Led is Off",
      "fontSize": 0,
      "bold": true, "italic": false, "underline": false,
      "align": "center",
      "decimals": 2
    }
  ]
}
```

---

*(c)2026 Forward Computing and Control Pty. Ltd.*
