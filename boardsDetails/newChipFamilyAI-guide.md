---
name: newChipFamilyAI-guide
description: "Step-by-step AI-session runbook for adding a WHOLE NEW chip family/vendor BSP to pfodWeb's Designer (variants/, build_boards.js, docs/pfodWeb-variants-guide.html) — distinct from project_board_variant_pin_audit_playbook.md, which assumes the family/parser already exists and only re-audits pin-by-pin data quality within it. First applied 2026-09-13 adding the Seeed XIAO nRF52840 family (4 boards: base/Sense/Plus/Sense Plus); applied again the same day for Adafruit's own separate 'Adafruit nRF52' family (13 boards across nRF52832/833/840) to a repo that previously only had avr/esp32/esp8266/rp2040."
metadata:
  node_type: memory
  type: project
---

This is the companion guide to [[project_board_variant_pin_audit_playbook]] for the OTHER kind of board-support
task: bringing in a chip family that has never been in `variants/` before, rather than re-auditing pin data
within a family that's already there. Read `docs/pfodWeb-variants-guide.html` first (sections 1-9) for the
mechanical how-it-works reference — this file is about the judgment calls and gotchas that guide doesn't (and
structurally can't) cover, learned the hard way while doing the Seeed XIAO nRF52840 import.

## 0. Scope the import before writing anything

A vendor's single BSP/`boards.txt` often bundles genuinely different products with genuinely different pin
architectures under one repository. Seeed's `Seeed_nRF52` BSP has 6 boards: 4 XIAO nRF52840 variants whose
`variant.h` declares pins via the familiar `static const uint8_t NAME = value;` convention, and 2
"Tracker"/"SenseCAP" boards whose `variant.h` uses `#define D<n> (physical)` — a genuinely different,
non-contiguous pin-macro convention no existing parser handles, and one of which (`NUM_DIGITAL_PINS (0)`)
exposes literally zero user GPIOs at all (a sealed sensor/GNSS/LoRa card, not a dev board). Importing all 6 in
one pass would have meant writing a THIRD parser dialect and researching LoRa/GNSS dedicated-hardware exclusions
in the same session as the "easy" boards.

**Before touching any file**, read every board's actual pin-declaration file (not just the first one) and ask
the user to confirm scope when you find a real architectural split like this — it's exactly the kind of decision
"genuinely the user's to make" (a scope/effort tradeoff, not something derivable from the code). Don't silently
narrow scope on your own judgment, and don't silently take on 3x the work either.

## 1. Decide the parser dialect BEFORE writing any data files

Read one full example `pins_arduino.h`/`variant.h`/equivalent from the new vendor and check which existing
dialect (see `docs/pfodWeb-variants-guide.html` section 4) it already matches:

- `static const uint8_t NAME = value;` (or `= OTHER_NAME;` alias chains) → reuse `buildEsp32Board()`. This is
  the single most common convention across totally unrelated silicon (Espressif, Raspberry Pi/arduino-pico, and
  now Nordic/Adafruit-derived cores all use it) — check for this FIRST before assuming a new family needs new
  code. Adding the family costs one line in `SUPPORTED_FAMILIES` and one line in `main()`'s dispatch condition,
  nothing else in `build_boards.js`.
- `#define`-based pin macros + `NUM_DIGITAL_PINS`/analog-offset arithmetic, pins numbered contiguously from 0 →
  reuse `buildAvrBoard()`.
- Anything else (non-contiguous `#define D<n> (physical)` macros, a totally different declaration shape) → a
  real new parser function is needed. This is rare — confirm it's actually necessary (re-read section 4's table)
  before writing one, and if you do, keep it as narrowly scoped as `buildAvrBoard()`/`buildEsp32Board()` are:
  pure regex/text scanning, no C preprocessor, explicit about what it does and doesn't parse.

**The vendor's actual filename doesn't matter.** Variant discovery in `build_boards.js` only ever looks for a
file literally named `pins_arduino.h` — Seeed's own files are called `variant.h`. Copy the content in under the
name `pins_arduino.h` in your `variants/` tree; you are not obligated to preserve the vendor's filename or
directory layout, only the pin-declaration content.

## 2. Chip-level vs. per-board `board.json` — and the merge trap

Decide, per section 4 of `project_board_variant_pin_audit_playbook.md`, whether the new chip's `chipGpios`
should be chip-level (ESP32/ESP8266-style: one chip, uniform pin count, safe to declare once) or per-board
(RP2040-style: too heterogeneous). A single vendor can need BOTH within one chip bucket: the nRF52840 import
found that GPIOs 11-29 (LED, IMU, mic, charge, flash) are IDENTICAL in index and meaning across all 4 boards
(safe at chip level), while GPIOs 30+ diverge completely between the 33-pin and 39-pin sub-variants (needed
per-board entries).

**The trap:** `board.json` resolution is nearest-ancestor — ONE file wins, it does not merge with any ancestor
chip-level file. If a board has its own `board.json` (needed because it diverges from the chip default in ANY
way), that file's `chipGpios` map is the ENTIRE map used for that board — any chip-level entries not repeated in
the board's own file simply vanish from the output. This bit us directly this session: writing only the
board-specific NFC/VBAT exclusions into each board's `board.json` silently dropped the chip-level LED/IMU/flash
entries, and the bug was invisible until inspecting the actual generated JSON pin count (14 pins instead of the
expected 33). **Whenever a board needs its own `board.json`, copy the FULL chip-level `chipGpios` map into it
first, then add the board's own differences on top** — exactly like the existing ESP8266-pattern description in
the pin-audit playbook already says, but easy to under-apply when you're writing several similar board.json
files in a row and start copy-pasting only the "new" parts.

**Verification that actually catches this:** don't just check `build_boards.js` exits 0 — that only validates
schema, not pin count. Dump each new board's generated JSON (`require()` it, print `pins.length` and a few
named pins you expect) and compare against your own mental model of how many pins that board should expose.

## 3. This parser is comment-blind — deleting beats disabling, every time

Already documented in the pin-audit playbook (section 5, gotcha 2) for RETROACTIVE fixes, but it applies just
as much to a fresh import: if a vendor's file declares something you need to suppress (a colliding alias, a
wrong pin), **delete the line outright**. Commenting it out, or quoting the original line's exact text in an
explanatory comment, both still match the alias-scanning regex (there's no C-comment stripping) and silently
reintroduce the exact bug you were fixing. This session hit this directly: the first attempt at removing a
bad `RX`/`TX` alias pair replaced the declarations with a comment describing what was removed — including the
literal `static const uint8_t RX = ...;` shape in prose — which the regex matched just as if the line were
live. Caught only by rebuilding and re-inspecting the generated JSON, not by any static review. **After any
"remove a declaration" edit, always rebuild and check the specific pin's capabilities in the output — don't
trust that a comment saying "removed" means it's actually gone from the parser's perspective.**

## 4. Don't trust a vendor's generic `TX`/`RX` alias without checking what `Serial` really is

`buildEsp32Board()` was written for ESP32/ESP8266/RP2040, where a `pins_arduino.h`'s bare `TX`/`RX` alias is
always the chip's real UART0 pins, which is also always what the `Serial` object (and therefore pfodApp's
wired connection) uses — so forcing those GPIOs into an exclusive `serial_tx`/`serial_rx` role is correct.
**This assumption can be wrong for a new family.** A chip with native USB-CDC (TinyUSB or similar) has `Serial`
using no GPIO at all — if that vendor's header still happens to declare a generic `TX`/`RX` alias for some
OTHER, optional UART (as Seeed's Plus/Sense Plus `variant.h` does, aliasing an optional `Serial1` this way),
the parser will wrongly treat two ordinary, otherwise-general-purpose header pins as permanently dedicated and
unavailable for anything else.

**Before trusting a new family's `TX`/`RX` aliases:** find out what the `Serial` object actually is on that
core (grep the core's own source, or check its own getting-started docs) — native USB vs. a real UART. If it's
USB, treat the vendor's `TX`/`RX` aliases with suspicion and verify against the chip's actual pin count/header
layout whether those pins are meant to be freely available. If they are, fix it the same way as section 3
above: delete the offending alias declaration from your own copy of the file (never edit `build_boards.js`
itself for this — it stays correct for the families where the assumption does hold).

## 5. Physical header exposure is its own exclude criterion, separate from "dedicated hardware"

The existing pin-audit playbook's KEEP/EXCLUDE policy (section 3) is framed around whether a pin is "dedicated
to onboard hardware." For small-form-factor boards (XIAO-style castellated-edge modules, and likely similar
compact dev-board families in the future), there's a second, independent reason to exclude a pin: **it may
simply not be brought out to any physical header pad at all**, regardless of whether it drives fixed onboard
hardware or genuinely does nothing. Research this explicitly (vendor's own pinout diagram/wiki, or third-party
pinout-reference sites) — don't assume "has a real GPIO number" implies "a user can wire something to it."

The one exception: a pin can be internal-only AND still worth exposing in the Designer, when there's a
capability abstraction for exactly that case — an onboard LED or button is normally a soldered-down component
with no header pad by definition, and the `button`/`led_*` capability tags exist precisely so the Designer can
offer "control the onboard LED" without requiring a physical wire. Internal-only pins with no such Designer-side
feature (a dedicated IMU/mic/flash bus, for example) should be excluded; internal-only pins WITH such a feature
(the LED) should be tagged and kept.

**Caveat added after this session's own re-verification pass (see section 10 below):** a "not on any header
pad" claim is easy to get wrong from a secondary/summarized source, and — importantly — you don't actually need
it to justify excluding a dedicated-hardware pin. This session initially wrote "not on any header pad" into
several `board.json` notes based on an AI-summarized secondary source, then found via the page's own raw
pinout table (a stronger source) that some of those pins ARE documented on the board's header/back pads after
all. The exclude decision itself didn't need to change (the pins were still dedicated to specific onboard
peripherals with no general-purpose use), but the notes did. **Prefer excluding on the "dedicated to a specific
onboard peripheral" or "chip-level reserved function" grounds alone, and only add a "not physically
accessible" claim when you've verified it from a primary source** (the vendor's own pinout table/diagram,
fetched and read directly — not summarized) — it's a real, independent, useful reason when true, but don't
let it be the only reason a pin is excluded unless you're confident in the source.

## 6. Chip-specific "reserved by default" pins — check the datasheet's fine print, not just the schematic

Beyond ordinary "wired to an onboard chip" dedicated hardware, some silicon families have specific GPIOs that
are reserved for a special function BY DEFAULT AT THE SILICON LEVEL, usable as plain GPIO only after a
deliberate, sometimes irreversible configuration step the Arduino core's generated code never performs. Found
this session on Nordic nRF52840: P0.09/P0.10 default to the NFC antenna function via the UICR `NFCPINS`
register, and clearing that bit to use them as plain GPIO is a ONE-WAY change (undoing it needs a J-Link and a
full chip erase) — a plain `pinMode()`/`digitalWrite()` in a generated sketch would silently do nothing while
the register is still set. A wiki page describing these pins as "free GPIO" in general terms was technically
incomplete/misleading; the more specific community forum thread digging into the actual UICR behavior was the
source that mattered. **When a chip family is unfamiliar, spend one search specifically on "reserved pins" /
"strapping pins" / "default peripheral function" for that silicon, even when a general-purpose pinout page
doesn't flag anything unusual** — other examples of this general pattern: ESP32/ESP8266 boot-strapping pins
(already covered elsewhere in this repo), SWD/debug pins on ARM chips, crystal-oscillator pins.

## 7. Byte-identical sibling variants still each need their own `board.json`

A vendor often ships near-duplicate `variant.h` files for a "Sense"/"Plus"/similar SKU that differs only in
which components are physically populated, not in pin numbering — confirm this with a real `diff` against the
vendor's own source rather than assuming from file size or a skim. When confirmed identical, the sibling's
`board.json` chipGpios map is still a full, separate copy (per section 2 above — `board.json` resolution can't
reach sideways to a sibling directory, only up an ancestor chain), but the SIBLING'S OWN `notes.txt` should say
"identical to X, see that file" and only record what's genuinely different (e.g., "IMU is populated here, pads
are unpopulated on the base board") rather than re-deriving or re-citing the same research twice.

## 8. Don't trust a vendor's own polarity-declaring macro at face value

A vendor's header may declare something like `LED_STATE_ON` or an equivalent "which logic level means on"
macro that is simply wrong or misleading — found this session on the XIAO nRF52840, where `variant.h` declares
`LED_STATE_ON = (1)` (implying active-high) while the vendor's own separately-published wiki states the LED is
wired common-anode / active-LOW, and the same `variant.cpp`'s own `initVariant()` sets the LED pins HIGH at
startup specifically to leave them OFF (a pattern that only makes sense if HIGH = off, i.e. active-low) —
directly contradicting the macro. Cross-check any such macro against an independent source (product wiki, a
schematic, or at minimum the boot-time initialization code's own behavior) before trusting it; don't propagate
a vendor's own internal documentation bug into this repo's `led_high`/`led_low` tagging.

Also don't trust inline comments in a vendor's pin-mapping array (e.g. `variant.cpp`'s `g_ADigitalPinMap`) over
the array's actual POSITION — found a real case this session where every comment from a certain point onward in
that array named the wrong Arduino pin index (a stale copy-paste from an earlier revision), while the array
VALUES at each position were still correct and consistent with the same file's own `#define`s. Comments don't
compile; verify pin identity by cross-referencing the `#define`/`static const` values against array position,
not by reading the comments.

## 9. Writing a new BLE (or other transport) `.ino` template — read the family's REAL library API first

Don't copy an existing family's `.ino` template's internal class structure by default. ESP32's `ble.ino` needs
a hand-rolled `Stream` subclass wrapping `BLEDevice`/`BLECharacteristic` because that library doesn't implement
`Stream` itself. Other BLE libraries may already BE a `Stream` — Adafruit's Bluefruit library (used by
Adafruit_nRF52_Arduino-derived cores, including Seeed's) provides `BLEUart`, which already implements
`available()`/`read()`/`write()`/`peek()` directly, so it can be passed straight to
`parser.connect(&bleuart)` with no wrapper class at all — a much simpler, shorter template than ESP32's. Check
the new family's actual bundled library API before choosing a template structure; don't assume every family
needs the more complex pattern just because the first family you saw did.

If you can't verify a transport's library API with confidence, follow `variants/rp2040/ble.ino`'s precedent:
write a `#error`-guarded placeholder template that clearly documents what's missing and points at a working
example to follow, rather than shipping unverified/guessed code that would silently fail to compile or behave
incorrectly for users.

## 10. Prefer a page's raw HTML over an AI tool's summary of it, especially for image-derived claims

`WebFetch` converts a page to markdown and has a small model summarize it against your prompt — this is
convenient but not reliable for precise factual claims, and it is NOT vision: it cannot actually look at a
pinout diagram image, only whatever alt-text/surrounding caption exists near it. This session asked the same
`WebFetch` URL two separate times for the same fact (whether the XIAO nRF52840's NFC1/NFC2 pins are exposed on
a physical header pad) and got two DIRECTLY CONTRADICTORY answers. Neither answer was obviously wrong on its
face — both read as confident, specific claims.

**When a fact matters for a keep/exclude decision (not just background color), fetch the page's raw HTML
directly** (`curl`/`Bash`, not `WebFetch`) and look for real `<table>` markup or exact body text, then parse it
yourself (grep, or a short Node script pulling `<tr>`/`<td>` cells into plain rows). This session's target page
turned out to have a genuine per-board pinout `<table>` with an exact `P0.xx`/`P1.xx` ↔ pin-name ↔ function
mapping for all four boards — far more reliable than any summary of it, and cheap to extract once you know it's
there. Also grep the raw HTML for an exact phrase you expect ("active-low", "common anode", "turn on") — finding
the vendor's own literal sentence is stronger evidence than a paraphrase of it. A `WebFetch` summary is fine for
a first pass / getting oriented, but treat its specific factual claims as a lead to verify from the raw source,
not as the source itself, whenever the claim will drive a real capability decision.

## 11. When two sibling boards' own documentation disagrees about the same physical pin, dig for a mechanism that reconciles it — don't just pick the source that's easier to check

Sibling variants sharing one chip can have genuinely different vendor-documented pin behavior for the identical
physical silicon pin — found this session where the base/Sense boards' official pinout table (and diagram)
categorize a pin's function/color as `NFC`-only/"Peripheral", while the Plus/Sense Plus boards' own table AND
diagram for the SAME physical silicon pin (just renumbered) categorize it as plain `GPIO`/"Digital GPIO", with
NFC/UART shown only as bonus secondary capabilities. This is a real disagreement worth taking seriously (not
dismissing the more permissive source as simply wrong) — chip-level "reserved by default" behavior (section 6
above) can genuinely be pre-configured differently at the factory for different board SKUs.

**First instinct: resolve it against something mechanically checkable, like the repo's own imported
`boards.txt`.** This session initially did exactly that — grepped for the specific compiler flag community
sources named as the fix for this chip's reserved-pin behavior, found it absent, and concluded the more
restrictive/cautious source won. **This was the wrong call**, caught only because the user asked for a second
pass against the vendor's actual diagram images. A mechanically-checkable fact (a flag's presence in a file) is
appealing because it's unambiguous to verify, but "easy to check" is not the same as "the fact that actually
decides the question" — the real, deciding fact here was a hardware/firmware property (whether the chip's
one-time factory configuration register is cleared) that a `boards.txt` grep cannot observe at all, in either
direction.

**When the easily-checkable fact and the vendor's own current, most-authoritative documentation disagree, dig
for a mechanism that would make both true at once**, rather than treating it as one side simply being wrong.
Here: the chip's reserved-pin register (UICR on this Nordic part) is a one-time, fuse-like configuration that
ordinary application firmware uploads (Arduino IDE / bootloader / DFU) do NOT touch — only a full low-level
chip erase resets it. That makes it entirely coherent for a vendor to factory-provision certain board SKUs with
the register already cleared (a manufacturing-time step, invisible to any `boards.txt`/compiler-flag
inspection) while a compiler flag remains the *documented* fix only for someone reflashing from scratch via a
debug probe. Once that mechanism is in hand, the disagreement resolves itself: trust the vendor's own current,
actively-maintained, board-specific diagram over a generic community mention of a build flag, because the
diagram is describing the actual shipped hardware behavior and the flag-based advice was never claiming to
apply to every board SKU regardless of factory state.

**Write up BOTH the original (superseded) reasoning and the final one in the board's `notes.txt`**, including
that a reversal happened and why — a future reviewer who re-runs the "easy" check (e.g. the `boards.txt` grep)
and gets the same "absent" result should be able to see, from the notes alone, that this was already considered
and deliberately not treated as decisive.

## 12. When a table or its summary might be missing something, go look at the actual diagram image

A vendor's pinout *text* (a table, a summarized description) is one representation of the hardware; a pinout
*diagram image* is often a distinct, independently-authored representation of the same board, and the two can
each be incomplete in different places. This session found a real pin-identity gap that only closed once BOTH
the raw HTML table (section 10) AND the actual diagram images were checked — the table had two of an IMU's four
signals, the diagram image (a different section of the same page) had the other two, and neither alone was
complete.

More importantly, a diagram's non-textual encoding — **color-coding by category** — can carry a real, deliberate
signal that no text summary preserves. This session's key reversal (section 11 above) hinged entirely on
noticing that a vendor colored one pin "Digital GPIO" (green, matching other general-purpose pins already kept
available) on one board and "Peripheral" (navy, matching genuinely excluded pins) on a sibling board for the
identical physical silicon pin — a distinction a text-only table row ("GPIO, UART, ADC" vs. "NFC") hints at but
doesn't make as visually unambiguous.

**Practical method used this session**: find the actual image URLs in the page's raw HTML (`grep -oE
'src="[^"]*\.(png|jpg|...)"'` or similar over the `curl`-downloaded HTML — image sources are very often lazy-
loaded or otherwise absent from a naive `WebFetch` summary), download them (`curl`), and view them directly
with the `Read` tool, which supports images. `WebFetch` cannot do this — it has no vision, only whatever
alt-text/caption happens to sit near an `<img>` tag in the markdown conversion it produces (which, per section
10, isn't in the raw HTML for a lazy-loaded/JS-rendered image anyway). When a specific detail in a large image
needs confirming at higher fidelity than the model's downscaled view (e.g. distinguishing "35" from "32" in
small print), crop the region from the ORIGINAL file at native resolution first — PowerShell's
`System.Drawing.Bitmap`/`Graphics.DrawImage` (or ImageMagick/`sharp` if available in the environment) can crop
a native-resolution region to a new file, which the `Read` tool then renders at full clarity instead of a
downscaled thumbnail. Delete downloaded images from the repo root/scratch area once the check is done — they're
verification aids, not project assets.

## 14. A hex-literal sentinel (`0xff`) is silently misread as decimal `0` — a distinct gotcha from the existing "parser gotchas" list

`buildEsp32Board()`'s alias-scanning regexes (both the direct-numeric-literal match and the `#define`-resolution
fallback) only recognize DECIMAL digits (`\d+`). A vendor convention of using `0xff`/`0xFF` as a "this pin
doesn't physically exist" sentinel — found across several boards in the Adafruit nRF52 family, always on an
`A6`/`A7` alias with a comment like "to compile with Firmata library" — is NOT rejected or flagged: the regex
matches the leading `0` and silently stops before the `x`, so a `#define PIN_A7 (0xff)` resolves to numeric `0`.
Combined with an alias chain (`static const uint8_t A7 = PIN_A7;`), this produces a phantom `"A7 (GPIO0)"` pin
instead of correctly disappearing — and GPIO0 is often otherwise-unrelated (a UART pin, say), so the phantom can
look like a plausible real pin rather than an obvious error. **Before trusting any `A<n>`/`D<n>` alias whose
underlying numeric define uses a non-decimal literal (hex `0x..`, octal `0..`), verify by hand what
`build_boards.js`'s regex will actually extract** (a one-line `node -e` test against the exact source string is
enough, as done in this session) — don't assume a numeric-looking `#define` parses correctly just because it
compiles fine in C. The fix is the same as any other spurious-alias case: delete the affected `static const`
line outright from your copy of the file (never comment it out, per section 3's comment-blindness finding).

## 15. `chipGpios` capability overrides can ONLY grant capabilities from `CAP_ORDER` — bus-role tags (`i2c_sda`,
`spi_ss`, etc.) are NOT in that list and can't be added this way

It's tempting to think a `chipGpios` entry's `capabilities` array can contain any capability string the pin
JSON schema supports, including the six bus-role tags (`i2c_sda`/`i2c_scl`/`spi_ss`/`spi_mosi`/`spi_miso`/
`spi_sck`). It cannot: `buildEsp32Board()` filters a chipGpios override through `CAP_ORDER.filter(c =>
chipSet.has(c))`, and `CAP_ORDER` (defined near the top of `build_boards.js`, shared with `buildAvrBoard()`)
only lists the generic/identity capabilities (`analog_input`, `digital_input`, `digital_output`, `pwm_output`,
`dac_output`, `button`, and the `led_*` tags) — the six bus-role tags are ENTIRELY ABSENT from that array, so
listing e.g. `"i2c_sda"` in a chipGpios entry's capabilities is silently dropped, not an error. Bus-role tags are
only ever added by the separate, unconditional lines further down (`if (g === sda) caps.push('i2c_sda');` etc.),
driven exclusively by whether `parseEsp32Consts()` found a genuine bare `SDA`/`SCL`/`SS`/`MOSI`/`MISO`/`SCK`
alias in the file.

Found this session on the entire Adafruit nRF52 family: none of its 14 vendor `variant.h` files declare a bare
`static const uint8_t SDA/SCL` (only the `#define PIN_WIRE_SDA/SCL` macros), so on 10 of the 13 boards imported,
the Wire pins were not just missing the `i2c_sda`/`i2c_scl` label — they were ENTIRELY INVISIBLE (no alias at
all means the GPIO never enters `allGpios` unless a chipGpios entry independently adds it). An initial fix
attempt added the pins via chipGpios with `"i2c_sda"` in the capabilities list, which restored visibility for
the pin (chipGpios keys DO get unioned into `allGpios` regardless of content) but silently produced a pin with
no bus-role tag at all, because of the `CAP_ORDER` filtering just described. **The correct fix, when a genuinely
general-purpose bus pin has no bare alias in the vendor file: add a real `static const uint8_t SDA = ...;` /
`SCL = ...;` (or `SS`/`MOSI`/etc.) line to your own copy of the file**, pointing at the same `#define` the
vendor's own library already uses internally — this is a legitimate, low-risk augmentation (not a new pin
assignment, just exposing the standard Arduino alias name the vendor happened to omit), and it lets the
parser's own native SDA/SCL/SS/etc. detection produce the correct name, label, AND bus-role tag together,
instead of trying to reconstruct partial behavior via chipGpios. Reserve chipGpios purely for identity tags
(button/LED/analog exclusions) and full exclusions (`capabilities: []`) — never for bus-role visibility.

## 16. A vendor's official pinout diagram can mix numbering schemes (Arduino index vs. CircuitPython/physical-pin) — resolve against the Arduino-side source file, since that's the one this repo's parser actually reads

Adafruit's official pinout diagrams (and similar vendor diagrams generally) often show a pin's Arduino index,
its physical silicon address (`P0.xx`/`P1.xx`), AND a CircuitPython board-pin label all on the same row — and
the plain integer shown next to a CircuitPython-style label is not guaranteed to be that pin's Arduino index at
all; it can be a different numbering convention entirely (a raw physical-pin-within-port number, or
CircuitPython's own internal pin enumeration). Found this session on Circuit Playground Bluefruit: the official
diagram labels "BUTTON_B" with the index "15", which looked like a direct contradiction of this board's own
`variant.h` (`PIN_BUTTON2` = `5`). It wasn't a contradiction — the diagram's "15" turned out to just be the
physical pin's own P1.**15** suffix repeated as a number, and the board's own `variant.cpp` pin-mapping array
(`g_ADigitalPinMap[5]` → physical P1.15, annotated "Right button" in the vendor's own comment) independently
confirmed Arduino index 5 was correct all along.

**Since this repo's `build_boards.js` only ever reads the Arduino-side `pins_arduino.h`/`variant.h` (CircuitPython's
own board-pin definitions are a separate, unused code path for this project), resolve any apparent diagram-vs-
source conflict by checking the Arduino-side `variant.cpp`'s own pin-mapping array FIRST**, not by trying to
puzzle out which of the diagram's several coexisting numbering systems the conflicting number belongs to. If the
`variant.cpp` comment independently corroborates the vendor's own `variant.h` macro, the diagram's differently-
scoped number was never a real conflict — don't second-guess a value that two independent parts of the same
vendor's own Arduino-side source already agree on. This same cross-check occasionally surfaces genuinely new
facts, too: it uncovered two additional real pins (a "Speaker Shutdown" and confirmed the true "Audio Out" pin)
this session that the diagram displayed correctly but this repo's board.json had mischaracterized.

## 17. Verification checklist for a NEW family (adapted from the pin-audit playbook's section 6)

1. `node build_boards.js` (from `pfodWeb_src/`) — zero errors/warnings.
2. Dump every new board's generated JSON directly (`require()` + print `pins.length` and specific pins you have
   an expectation for) — a clean build exit code only proves schema validity, not correct pin counts or
   capabilities. This is where the merge trap from section 2 above actually gets caught.
3. Run the network-wide zero-pin scan and button/LED-vs-bus-role contamination scan (scripts are in
   `project_board_variant_pin_audit_playbook.md` sections 6/12) across the WHOLE repo, not just the new
   boards — confirms the new family didn't introduce contamination and that the scan scripts still see
   everything (a family whose `family` value string doesn't match the scan's directory-prefix filter would
   silently be skipped).
4. Add the new chip id to `build-bundle.js`'s `_chipDisplayName()` cosmetic pretty-printer (a one-line,
   easy-to-forget addition — without it the chip bucket just displays as its raw lowercase directory name in
   the target picker).
5. `node build-bundle.js` then the top-level `build-pfodWeb.bat`/`.sh` — the latter is what actually stages
   `pfodWeb.html` into the deployed `pfodWeb/pfodWeb/` output; `build-bundle.js` alone only writes a transient
   copy in the repo root.
6. Grep the final deployed `pfodWeb.html` for the new boards' `displayName` strings as a last sanity check that
   they actually made it into the shipped bundle, not just the intermediate per-board JSON files.
7. Update `docs/pfodWeb-variants-guide.html`'s family/parser table (section 4) if the new family reuses an
   existing parser — that table is meant to enumerate every `SUPPORTED_FAMILIES` value, and silently leaving a
   new one out makes the doc actively wrong rather than just incomplete.
8. Write a `boardsDetails/<family>/<chip>/<board>/notes.txt` per board per the pin-audit playbook's section 10
   convention, from the start — don't defer it to a later "documentation backfill" pass the way earlier ESP32
   work in this repo had to.

## 18. When a vendor ships an open-source bootloader repo, its per-board `board.h` files are a goldmine — often better than the product page

For any family whose vendor maintains an open-source USB/DFU bootloader (Adafruit's
`Adafruit_nRF52_Bootloader`, and the equivalent exists for many other MCU vendors), check
`github.com/<vendor>/<bootloader-repo>/src/boards/<board>/board.h` (or that repo's equivalent per-board
directory) BEFORE settling for "no public documentation found" or a conservative
exclude-rather-than-guess decision (section 8's precedent). These files exist per-board, are genuinely
official (shipped in the vendor's own production firmware, not a community fork), and typically declare
exactly the facts this parser's decisions hinge on but marketing pages never state precisely:
- `LED_STATE_ON` (0 or 1) — the actual, board-specific active-high/active-low polarity, often for BOTH a
  primary status LED and a separate RGB LED trio under the same constant, letting a confirmed polarity on
  one extend validly to the other on the same board.
- `LED_PRIMARY_PIN` / `LED_SECONDARY_PIN` / `LED_RGB_RED_PIN` / `..._GREEN_PIN` / `..._BLUE_PIN` /
  `LED_NEOPIXEL`, and `BUTTON_DFU` / `BUTTON_DFU_OTA` — raw physical addresses (commonly wrapped in a
  `PINNUM(port, pin)`-style macro), which independently confirm not just "a pin is an LED/button" but
  WHICH specific Arduino index it is, once translated.

To use a `board.h` finding, translate its physical address into this board's own Arduino index by
cross-referencing the SAME board's `variant.cpp` (its `g_ADigitalPinMap[]`/pin-map array, which usually
carries inline comments naming the peripheral per index — see section 16's note on `variant.cpp` being
definitive). An exact match (bootloader's `P0.13` lands on the array's index that `variant.cpp` itself
labels e.g. `// D22 is P0.13 (LED_RGB_RED)`) is strong, board-specific, non-analogized evidence — enough
to resolve a genuinely unconfirmed decision (this family's Particle Xenon RGB-LED polarity, originally
left excluded rather than guessed, was confirmed and reversed into a tagged capability this way) or to
upgrade an analogy-based decision (a board's SPI bus "probably dedicated to an onboard TFT" claim) into a
directly-confirmed one, once the bootloader's own `DISPLAY_PIN_SCK`/`DISPLAY_PIN_MOSI`-style constants
match the array's addresses exactly.

Two sibling boards on different chips (e.g. an nRF52840 DK and its nRF52833 DK sibling, byte-identical
`variant.h` files) can each have their OWN `board.h` entry in the bootloader repo — don't assume the
constants are shared just because the Arduino-side variant files are; fetch each board's own file, it
costs one extra request and confirms the identical-values assumption rather than just inheriting it.

## 19. `board.json`'s `note`/`pinNotes` text is END-USER UI, not a research log — keep it under 64 characters and free of citations

`chipGpios[gpio].note` and `pinNotes[gpio]` both flow straight into the generated board JSON's
`pin.notes` and are rendered verbatim as the subtitle line under a pin option in the Designer's pin-picker
(`editMenuItemPin.js`: `entry.notes` becomes `<-2>subtitle` text beneath the option label). That is
limited screen real estate a user reads while picking a pin for their own sketch — it is NOT the place to
justify a decision or cite a source. Two rules, both enforced by a whole-repo audit on 2026-09-13 (1300
note fields across 214 `board.json` files were rewritten to comply, after the pattern had crept in over
several chip-family audits, worst in this session's own `adafruit_nrf52` additions, e.g. a 528-character
`PIN_5V_EN` note quoting the exact Learn-guide sentence it was confirmed against):

- **Keep every `note`/`pinNotes` string to 64 characters or fewer.** State only the pin's identity and/or
  why it's excluded/tagged the way it is (`"PIN_LED_RGB_RED, P0.13, active-high"`, `"PIN_5V_EN — onboard
  5V boost-converter enable"`) — not the full justification.
- **Never write "confirmed via / verified by / sourced from / checked against / cross-referenced /
  independently confirmed / per the bootloader's board.h / see notes.txt" (or any citation-shaped clause
  — a schematic net name, a GitHub URL, a datasheet section, a Learn-guide quote) into a `note`.** All of
  that belongs ONLY in the board's own `boardsDetails/<family>/<chip>/<board>/notes.txt` (section 17's
  convention) — write the full sourcing/reasoning there, and put just the short, functional conclusion in
  `board.json`. Every finding this repo verifies (via a datasheet, a bootloader repo, a diagram image,
  whatever) already gets documented in that board's `notes.txt` as a matter of course — `board.json` never
  needs to also carry proof of the work.

When writing a new family (or auditing an existing one), treat "does this note read like a sentence from a
lab notebook, or a one-line UI label a stranger could glance at and understand in under two seconds" as
the actual test — length alone doesn't catch a short-but-citation-flavored note like `"LED, confirmed via
schematic"` (still wrong: drop the citation clause, keep `"LED"` or whatever identity remains).

## 20. Mechanically truncating a note to fit 64 chars creates a NEW defect class — dangling mid-sentence fragments — that needs its own dedicated re-check pass

Section 19's whole-repo rewrite (1300 fields, 214 files) was done by a script: find the earliest
citation-style clause, cut there, then hard-truncate at a word boundary if still too long. That produces
a plausible-looking string that is very often NOT a complete phrase — the cut just lands wherever the
budget runs out, leaving fragments like `"...active-high, see"`, `"...transceiver's dedicated"`,
`"...LSM6DS3TR-C IMU I2C bus (Wire1) SCL, P0.27 — populated on this"`, or `"PIN_LCD_DC — onboard 1.28in
GC9A01-family round LCD's dedicated"` — each one under 64 chars and free of citation language, so it
passes both of section 19's checks while still being nonsense to read. This class of bug survived an
entire follow-up audit pass (a second "recheck every pin note" request) because a stopword-ending regex
check (flag any note ending in "a/the/of/for/dedicated/onboard/...") produces both false negatives (a
truncation that happens to land on a real noun, e.g. `"...transceiver's dedicated SPI"` ending in "SPI",
a legitimate-looking abbreviation) and, once the word list is widened, a flood of false positives (endings
like "header", "boot", "channel", "note" are frequently the CORRECT final word of a complete phrase, e.g.
`"Not physically exposed on the J7 header"`). Neither a narrow nor a wide keyword list catches everything
— e.g. `"PIN_VBAT (A7) — hard-wired to a resistor divider on the LiPo"` (cut mid-word, "LiPo" *what*?) has
no risky trailing word at all.

**The only technique that reliably catches these is reading the full file, not grepping/scripting for
`"note"` lines out of context.** A `grep '"note"'` pass shows the two or three notes near each other, and
a human eye immediately spots `"...dedicated"` with nothing after it, or `"...F0.14"` with nothing before
the em-dash, in a way a diff-of-flagged-lines-only pass does not (many defects here were only found because
reading the whole file surfaced a *sibling* pin whose note had the identical bug but hadn't matched any
keyword). When a family has multiple near-identical boards (siblings on different chips, e.g. the two
Nordic DK boards, or repeated Feather variants), the same broken string is very often duplicated
byte-for-byte across every sibling file — search the whole repo for the exact broken substring once found,
rather than assuming it was a one-off.

Two smaller, related traps hit during this cleanup:
- **Shell quoting can silently corrupt a regex passed via `node -e '...'`.** A backslash-heavy pattern
  (`\\b`, `\\.?`, `\\s*$`) built inside a bash single-quoted string intermittently lost backslashes when
  passed through this session's Bash tool, producing a regex that looked right when printed as a template
  literal but subtly failed at runtime (`\b(...).?s*$` instead of `\b(...)\.?\s*$` — silently matching
  almost nothing, making a whole scan report "0 issues" when the bug was still present). **Write any
  script with real backslash-escaped regex to a `.js` file and run it with `node <file>`** — never trust a
  multi-line, heavily-escaped inline `-e` invocation's result without spot-checking the regex actually
  built correctly (e.g. `console.log(re.source)`).
- **When two `board.json` fields (`pinNotes[g]` and `chipGpios[g].note`) both exist for the same pin, they
  render as two SEPARATE lines** (`noteParts.join('\n')` in `build_boards.js`), each independently capped
  at 64 — do not concatenate them with a separator and measure the combined string, or every board with
  both a strap-note and a chip-note will falsely report as "over 64" when neither individual field is. A
  single field can ALSO legitimately contain an embedded `\n` (two logical lines in one JSON string) — when
  checking length, split on `\n` first and check each resulting line separately.

## 21. Truncation doesn't just create dangling fragments — it silently deletes facts a user actually needs, and only a real diff against the pre-truncation original catches this

Section 20 covered *grammatically broken* truncations. A second, more dangerous class survives being
perfectly grammatical: the shortened sentence reads fine, parses fine, passes every keyword/length/
citation check — and is simply *missing the one fact that mattered*. This was only found by diffing every
touched `board.json` against a preserved pre-shortening copy (`variantsPrevious/`) line by line and asking,
for each pin, "does the short version still tell the user what they need to know, or just what's left after
cutting for length?" No script can safely answer that question — it requires understanding what the pin
actually does. Recurring patterns worth checking for specifically on any future shortening pass:

- **A multiplier/ratio needed to interpret an ADC reading correctly** — "battery-voltage sense" alone is
  useless if the user doesn't know the reading needs `x2` (1:1 divider) or a different multiplier (ratio-2,
  100k/100k → 6.6V effective range, etc.) to become an actual voltage. Every VBAT/battery-sense pin's
  shortened note was checked for whether the multiplier survived — many hadn't, and it's a silent-wrong-
  answer bug for anyone who trusts the raw `analogRead()` value.
- **A power/enable dependency between two pins** — a NeoPixel data pin that won't light up unless a
  *different* GPIO is first driven HIGH (`NEOPIXEL_POWER`, `BAT_VOLT_PIN_EN`, etc.) needs that dependency
  stated on both pins' notes (naming the other pin's number directly, e.g. `"power gated by GPIO26, drive
  HIGH first"` — not a "see GPIOx" pointer, per section 20/22's point below). Losing this doesn't break
  syntax, it just makes the feature silently not work for anyone who follows the note alone.
- **"Shared, not exclusive" vs. "dedicated, not general-purpose" is a meaning-flipping distinction, not
  decoration.** A note that used to say "shared with the onboard OLED, other I2C devices can still be
  added" and got shortened to "onboard OLED uses this pin" reads, out of context, exactly like every OTHER
  "onboard X uses this pin" note in the same family that means fully excluded/dedicated. If the ORIGINAL
  established a pin stays general-purpose despite an onboard consumer, the short version must keep saying
  so explicitly (e.g. "...still usable") — dropping just the one qualifying word inverts the practical
  takeaway for a reader skimming past it.
- **The absence of something a user would otherwise assume is present** — "no onboard user button" (when
  the vendor's cousin/sibling board line usually HAS one on this exact GPIO) or "sensor not populated on
  this board" (when the pin's own macro name, e.g. `PIN_LIGHTSENSOR`, implies otherwise) are exactly the
  facts a shortened note is most likely to drop, because they read as filler ("no risk of losing THIS since
  nothing's there") right up until a user assumes the opposite from the identifier alone.
- **Why a capability tag is deliberately absent** — "polarity unknown, no led tag applied" on an LED pin
  that only has `digital_output`/`pwm_output` (no `led_high`/`led_low`) tells a reader this was a considered
  omission, not a bug or an oversight to file a report about.

When a `variantsPrevious`-style backup exists, treat any request to "recheck the notes" as requiring a real
`diff -u` per touched file, not another keyword scan over the current state alone — the keyword scan can
only catch what's still visibly broken, not what quietly disappeared while becoming well-formed.

## 22. A cross-reference is still a "see note" violation even when it names the specific pin and reads as a complete sentence

Section 20 already established that dangling `"...see PIN_LED1's note"` fragments (the reference itself cut
off) must be fixed. The stricter version of this rule, confirmed after a user re-review: `"LED2 — active-
high, see PIN_LED1's note"` and `"blue channel of the RGB status LED (see GPIO8)"` are BOTH still violations
even though they are grammatically complete and unambiguous — any phrase telling the reader to go look at a
different pin's note is out, full stop, regardless of whether the pointer itself is well-formed. The fix is
always to inline the actual fact directly (`"PIN_LED2/LED_CONN/LED_BLUE — active-high"`, dropping the
pointer entirely once the fact is self-evident from the identifier plus polarity) rather than to just tidy
up the reference's grammar. This is easy to miss on a first pass because a well-formed "see X" reads as
helpful, not broken — it takes a second, rule-focused pass (or an explicit reminder of the rule) to catch
every instance, including ones a previous pass judged "fine" under a looser reading of the same rule.

## 23. Remove ALL source-attribution language from `board.json` notes — not just "confirmed via"/"verified by" citation phrases, but file names, silkscreen-as-citation, and library/SDK framing too

A user picking a pin in the Designer UI does not care *where* a fact was learned — only what the fact
*is*. Earlier passes in this project treated `"per variant.h"`, `"per pins_arduino.h"`, and
silkscreen-framed references ("silkscreen 'X'", "silkscreened X") as acceptable "primary source" citations,
on the theory that naming the actual source file (rather than a secondary web page) was different in kind
from `"confirmed via <vendor blog>"`. **A user correction overturned this**: it's still a source reference
either way, and still useless for choosing a pin. The rule is now unconditional — strip every trace of
*where the fact came from*, keep only the fact itself. This covers, at minimum:

- Explicit verification phrases: `"confirmed via X"`, `"verified by X"`, `"sourced from X"`, `"checked
  against X"`, `"CONFIRMED"` (bare, all-caps), `"confirmed as"`.
- File-name framing, even for the board's own primary source file: `"per variant.h"`, `"per
  pins_arduino.h"`, `"declared in variant.h"`, `"not declared in this board's pins_arduino.h"`, `"inherited
  from common.h template"`.
- Silkscreen-as-citation: `"silkscreen 'X'"`, `"Silkscreened X"` — the physical print label itself can stay
  as plain fact (`"(D13)"`, `"(28/BOOT)"`, `"aka 'Stepper X'"`) but never framed as evidence being cited.
- Vendor/library/SDK-name framing: `"vendor's own comment says..."`, `"per pico-sdk's
  PICO_DEFAULT_LED_PIN"` — keep the macro/alias name itself as a plain identity label
  (`"PIN_LED (PICO_DEFAULT_LED_PIN)"`), drop the "per X's" wrapper.
- Datasheet/schematic/wiki/forum/manual/GitHub/product-page mentions of any kind.

**Not a violation, and left alone**: a note stating genuine *uncertainty about the hardware itself* — e.g.
`"Labelled VBAT but no divider confirmed; not calibrated"` — is not a citation, it's a caveat about what is
and isn't known to be physically present on the board, which is exactly the kind of fact a user DOES need
when deciding whether to trust a reading from that pin. The test is: does the phrase say *where a fact was
learned* (violation), or does it describe *a real ambiguity in the hardware itself* (keep)? A broad regex
keyed on words like "confirmed" will flag both — every hit still needs a human read before editing, the
same lesson as section 19/20/21's insistence on reading full context rather than trusting a keyword match
alone.

A whole-repo regex sweep (patterns: `.h`/`.cpp`/`variant.h`/`pins_arduino`/`.pdf`/`.dts`/`.py`/`.c`/
`datasheet`/`schematic`/`product page`/`learn guide`/`documentation`/`docs.`/`github.com`/`wiki.`/`forum`/
`blog`/`manual`/`official`/`website`/`per`/`silkscreen`/`hookup guide`/`getting started`/`user guide`/
`vendor`/`library`/`firmware`/`source`/`pico-sdk`/`circuitpython`/`zephyr`/`kicad`/`netlist`/`product
listing`/`confirmed`/`verified`/`declared in`/`own pins_arduino`) over every `pinNotes` and `chipGpios[].note`
value in the repo is the reliable way to find every instance — narrower phrase-specific regexes (as used in
earlier passes) miss the file-name and silkscreen-framing variants entirely.

## 24. Splitting a full-repo `diff` recheck across parallel forks by family works well, but expect ~10-15% real defect density and check for cross-fork file overlap

After a citation-removal pass, a full logic recheck of all 214 changed `board.json` files (per-file `diff -u`
against `variantsPrevious/`, judging whether each shortened note still states every functionally-important
fact — the section 21 taxonomy) was split across 7 parallel forked sub-agents by family/chunk (adafruit_nrf52
+nrf52, arduino/avr, esp32, esp8266, and rp2040 split into three ~40-file batches), each given the full
defect taxonomy and told to fix issues directly rather than just report them. Results: 6 of 7 forks found
and fixed real defects (only arduino/avr came back clean); across ~214 files this surfaced roughly 25-30
genuine logic regressions — meaningfully higher than expected for a "just remove citation text" pass, since
several were introduced by the ORIGINAL shortening pass (weeks earlier) and had simply never been caught by
the citation/readability-focused review rounds. Recurring defect shapes found this round, useful to check
first on any future pass:

- **A second alt-function name silently dropped** when a pin serves two roles (e.g. a SPI MISO pin that is
  *also* a PDM mic data line; an LED pin that is *also* a bus clock line) — the shortened note kept only
  one identity, hiding a real pin-conflict a user needs to know about before wiring both uses.
- **A polarity/direction word dropped from a power-enable pin** (e.g. "LOW to read VBAT, HIGH otherwise"
  shortened to just naming the pin) — this is categorically different from losing a nice-to-have detail:
  driving the pin the wrong way is a real, physical mistake the note exists specifically to prevent.
- **A dependent pin's note losing the OTHER pin's number entirely** (e.g. "requires VBAT_ENABLE" with no
  GPIO number, when the previous version said "needs GPIO14 driven LOW first") — the reader can no longer
  act on the note without hunting for which pin that is.
- **A "some board revisions need a solder jumper bridged" or similar hardware-revision caveat dropped** —
  easy to cut as verbose-sounding trivia, but it directly explains a support question ("why doesn't my
  NeoPixel respond") a user would otherwise have no way to self-diagnose.
- **Sibling boards sharing one template inconsistently kept vs. dropped the same fact** — when N nearly-
  identical variants (Seeed XIAO nRF52840 base/Sense/Plus/Sense_Plus, or four Feather boards with the same
  NEOPIXEL_POWER pin pair) come from the same underlying board.json lineage, check that a fact preserved on
  one sibling is preserved on ALL of them — the defect pattern in this pass was reliably duplicated across
  every sibling once found in one.
- **A "same as GPIOx" / "same reasoning as DI0" cross-reference reintroduced in different phrasing** than
  the "see note"/"see GPIOx" forms already banned by section 22 — a fork found and fixed several of these
  (`"(same as SWITCH_C)"`, `"same reasoning as DI0."`) that earlier citation-focused passes missed because
  they don't match "see X" wording at all, despite being the exact same violation in substance.

**Two coordination costs of the parallel-fork approach, worth planning for:** first, forks working on
adjacent/overlapping file sets can genuinely both end up touching the same file (one fork's assigned batch
strictly followed the file list; another fork, mid-iteration, diffed and fixed a file that belonged to a
different batch) — harmless when the fix itself is correct and non-conflicting, but the coordinator needs
to notice this in the fork's own report rather than assume batch boundaries were respected exactly as
assigned. Second, run the full rebuild+bundle+deploy pipeline only ONCE, after every fork has reported back
— not after each individual fork — since forks run concurrently and rebuilding mid-flight only re-validates
a partial, still-changing state.

## 25. When the user repeats an identical instruction verbatim, that is a request for a genuinely independent second pass — and it will find things the first pass missed

After the full 7-fork logic-recheck pass above completed and was reported to the user, the user's next
message was the exact same instruction repeated verbatim: "recheck all board.json files line by line
compared to previous for logic". This was correctly treated NOT as the user having missed the completion
report, but as an explicit request for a SECOND independent pass — same methodology, same 7-way family
split, each fork told what the first pass already found/fixed and asked to verify those fixes plus hunt
fresh. **This was the right call**: the second pass found real, additional defects in 5 of the 7 batches —
roughly 55 more genuine logic defects on top of the ~29 the first pass found, including one systemic class
the first pass's per-fork scoping had missed entirely:

- **"active-high"/"active-low" polarity wording dropped from a note while the `led_high`/`led_low`
  capability tag on the SAME pin stayed correct** — this is a distinct, sneakier failure than a capability/
  note *contradiction* (section 21's checklist item): the tag is right, the prose just stops saying the
  fact out loud. It's easy for a first read-through to see the correct tag and mentally credit the note as
  "fine" without checking whether the note ALSO states it (a user reading the pin-picker subtitle text
  alone, without inspecting internal capability flags, still needs the word "active-high"/"active-low" in
  the visible text). One rp2040 fork noticed this pattern recurring inside its own 42-file batch, then
  proactively wrote a repo-wide validator script and re-checked all 214 changed files against it — finding
  **37 more instances outside its assigned batch**, across families other forks had already marked clean.
  This is worth calling out explicitly in future instructions: check every `led_high`/`led_low`-tagged
  pin's note text for the literal word "active-high"/"active-low", independent of the family/batch
  boundary, since the defect isn't confined to one region of the repo once introduced by a shared
  shortening pass.
- Other second-pass-only findings, confirming multiple passes surface materially different things: dropped
  power-gate dependencies with the specific OTHER pin's number (feather_nrf52840_express/sense_tft
  NeoPixel↔NEOPIXEL_POWER, adafruit_feather_prop_maker EXTERNAL_POWER gating 6 sibling pins), dropped
  "external strip, not onboard" disambiguation on a `PIN_NEOPIXEL`-named pin that is misleading on its own,
  dropped voltage-divider scaling values on a battery/VIN-sense pin, dropped "NOT user-accessible, avoid
  using" warnings on pins wired to an onboard wireless module, and more disguised "(same as X)"/"same
  reasoning as X" cross-references and dangling mid-word truncations that the first pass's same checklist
  had already been told to look for but still missed on first read.

**Practical implication**: for a defect-hunting task at this scale (200+ files, dozens of independent
judgment calls per file), do not treat one full pass — even a thorough, multi-fork, checklist-driven one —
as exhaustive. If the user asks again, run it again for real, tell each fork exactly what the previous
round already found (so it can verify those fixes rather than re-discover them), and expect a
non-trivial new-defect rate even on the second pass. A third repeat would likely be worth another look
too, though with diminishing (not zero) returns, since the systemic classes tend to get exhausted within a
couple of passes once a fork starts writing repo-wide validators instead of just eyeballing its own batch.

**Confirmed on a third pass** (same 7-fork split, each told exactly what passes 1+2 already found, asked to
re-verify those fixes AND hunt fresh): the new-defect rate keeps dropping but does not hit zero — pass 3
found roughly 8 more genuine defects (arduino/avr esplora TFT/Serial1-conflict fact on GPIO0/1, adafruit
stemmafriend GPIO12's dropped uncertainty caveat, esp8266 espino GPIO2's dropped active-low despite sibling
channels correctly keeping it, esp32 sparkfun_pro_micro_esp32c3 GPIO5/6/10 dropping alt-function identities
entirely rather than just trimming citations) — even in families (arduino/avr, esp8266) that TWO prior
passes had already marked fully clean. By pass 3, several forks ran a targeted validator script (parse
every `chipGpios` entry, check every `led_high`/`led_low`-tagged pin's note text for the literal polarity
word) rather than relying on manual diff-reading alone for that specific defect class, and every such
scripted check came back clean — confirming the systemic active-high/active-low bug found in pass 2 was, in
fact, fully eradicated by that point; what pass 3 caught instead were one-off, board-specific fact drops
that only a fresh close read (not a repeatable script) can find. The coordinator ran its own final,
repo-wide validator after pass 3 (parse-check + 64-char-check + polarity-word-check across all 551
board.json files, not just the 214 changed ones) and got exactly 2 hits, both false positives on
inspection (one file's deliberate "polarity unconfirmed" caveat overriding the tag-implies-polarity
heuristic; one file's stylistic "active high" without a hyphen, same fact, different spelling) — a good
sign that a scripted final check, even a naive one, is worth running after every pass to catch what manual
review might still miss, as long as every hit gets a human look rather than being auto-"fixed" on pattern
match alone.

**Pass four (retried after a mid-run session rate-limit failure) still found more — the polarity bug had a
sibling class the earlier scripted check never covered.** 2 of 7 families (adafruit_nrf52/nrf52, esp32) came
back fully clean and stable across all 4 passes. The other 5 (arduino/avr, esp8266, all 3 rp2040 batches)
each found something: esp8266's two GENERIC/chip-level template boards (`esp8266/board.json`,
`esp8285/board.json` — used when a user has no specific vendor board to pick) had silently lost their A0 ADC
divider caution entirely, which is the single most load-bearing note in the whole family precisely because
generic-template users have no vendor documentation to fall back on; two separate rp2040 forks independently
found the SAME new pattern — a `button`-tagged pin dropping "active-low" while sibling buttons in the same
file correctly kept it (`electroniccats_huntercat_nfc` BUTTON_0, `pimoroni_plasma2350` USER_SW) — which is
the identical defect class as the pass-2 LED polarity bug, just on `button` capabilities instead of
`led_high`/`led_low`, so the earlier polarity-word validator script never caught it (it only checked
LED-tagged pins). **Lesson: when a scripted check targets one capability-tag family for a wording defect,
re-run the same check against every OTHER tag family that carries the same kind of implied-but-unstated
fact (any capability whose name or common usage implies a polarity/value/state) before declaring the defect
class closed.** Pass 4 also surfaced a battery of small "missing disambiguation" facts on rp2350 LED/power
pins (several boards' user-LED notes had dropped "(not power indicator)"/"not GPIO-controlled" clauses
distinguishing the tagged pin from a separate, similarly-described onboard indicator) — a distinct but
related pattern to section 21's "absence of an expected feature" class: here it's not an absent feature, but
an absent DISAMBIGUATION between two present but different things, which reads as harmless brevity right up
until a user wires to the wrong LED.

**Retrying after an interrupted pass**: one attempt at pass 4 failed for 5 of 7 forks mid-run with a
session-level rate limit (`HTTP 429`, "You've hit your session limit," with a fixed reset time) — the
forks had made partial progress (some real Edit calls landed, one had begun but not finished narrating a
fix) before the harness terminated them. Before deciding how to proceed, the coordinator ran its own
repo-wide validator (parse-check, 64-char-check, citation-check, polarity-check) to confirm the partial
work had not corrupted anything and the file count (214) hadn't drifted — it hadn't, and the one
fix a failed fork claimed to be "about to make" turned out to already be correctly present (from an
earlier pass), so nothing was lost by the interruption. Once the user asked to "run another pass" again,
the fix was to simply relaunch fresh forks for exactly the 5 families that had failed (the 2 that
completed cleanly did not need re-running) — a full uninterrupted run this time surfaced the same real
findings described above. A rate-limit failure mid-fork is not silent data loss as long as the coordinator
validates state before and after rather than assuming either "nothing happened" or "everything the fork
said it would do, happened."

**Pass five: told each fork exactly what NEW defect classes pass 4 discovered, and pointed each one at the
angle it hadn't specifically been checked for yet — this was far more productive than a generic "look
again" prompt.** Pass 4's two new classes were (a) a `button`-tagged pin dropping active-high/active-low
wording while sibling buttons in the same file kept it, and (b) a dropped disambiguation clause
distinguishing an LED/pin from a similar-looking-but-different nearby indicator (a second LED, a
wireless-chip status light, a passive power indicator). By pass 5, 2 of 7 families (arduino/avr, esp32) had
been clean for 2 straight passes and stayed clean; adafruit_nrf52/nrf52 and esp8266, also clean for 2
passes, each turned up exactly ONE more instance once explicitly pointed at the new-class angles — a
NeoPixel-vs-onboard-indicator disambiguation on `ledglasses_nrf52840`, and (for esp8266, a null result —
genuinely clean this time). The rp2040 batches, which hadn't all been checked for the new classes yet,
turned up the most: rp2040 part 2 found the button-polarity-class already-known instance had two SIBLING
files (`sparkfun_promicrorp2040`/`waveshare_rp2040_*`) with the identical disambiguation defect a DIFFERENT
rp2350 fork had already fixed on their close relatives in pass 4 — i.e. **a fix applied to one board in a
sibling pair/family is not automatically propagated to its sibling in a different chip-bucket directory**,
even when the underlying hardware and note pattern are identical; each board.json is a fully independent
file and must be checked independently even after its "twin" is confirmed fixed. rp2040 part 3 found one
more button-polarity instance on `solderparty_rp2350_stamp`/`stamp_xl` (again a sibling PAIR, both
independently missing the same fact — reinforcing that siblings should always be checked together, not
just the one that happens to get flagged first).

**Practical takeaway for future passes**: when a fork surfaces a brand-new defect class partway through a
sweep, the highest-value next step is not "run the same generic recheck again" but "explicitly name the new
class and re-run every batch (including ones already marked clean) against it specifically" — this is what
took pass 5's hit rate from "probably done" back up to 8 more real fixes across 4 of 7 batches, including
two batches that had been clean for 2 consecutive prior passes.

**Pass six found the single largest number of new defects of any pass after four (arduino/avr, esp32) or
five (adafruit_nrf52/nrf52, esp8266) consecutive clean checks — a widespread pattern the first five passes'
LED-focused polarity check structurally could not see.** Pass 6 explicitly asked every fork to cross-check
sibling boards against every already-fixed pattern, since pass 5 confirmed fixes don't auto-propagate
across sibling files. Two families stayed clean (arduino/avr: 6 straight clean passes; esp32: now 4). Four
found more: adafruit_nrf52/nrf52 and esp8266 each found exactly one more instance of an already-known
pattern (a NeoPixel disambiguation, a BOOT-button active-low drop) — small, expected tail-end catches. But
rp2040 part 1 alone found **12 new defects**, essentially all the same shape: a BOOT/user-button pin's
`chipGpios.note` dropping "active-low" while its `capabilities` array still correctly carries `button` —
repeated across 8+ different Adafruit Feather sibling boards (`adafruit_feather`, `_adalogger`, `_can`,
`_dvi`, `_prop_maker`, `_rfm`, `_scorpio`, `_thinkink`) plus `adafruit_itsybitsy` and
`cytron_maker_pi_rp2040`, plus two related dangling-truncation cases that also happened to drop an
active-low reset-line fact. **Why did four prior passes (1-5) all miss this, when pass 2 supposedly closed
the "active-high/active-low dropped" systemic bug with a scripted, repo-wide validator?** Because that
validator (see section 24/25) only checked pins whose `capabilities` array contained a suffix-pattern
capability like `led_high`/`led_r_low` — it structurally could not detect a missing polarity word on a
`button`-tagged pin, since `button` carries no `_high`/`_low` suffix to key off of. Passes 4 and 5 DID find
individual button-polarity instances (by manual diff-reading, not scripting) but never scaled that check to
a scripted, exhaustive sweep across every `button`-tagged pin in the repo the way the LED check had been
scaled — so the button variant of the bug kept surviving in unswept corners until a fork finally did a
full manual read of every Feather sibling back-to-back in one sitting.

**Standing lesson going forward**: any scripted validator built to catch "capability X implies word Y in
the note" should be written generically over EVERY capability that implies a polarity/state/value, not
just the one capability family where the bug was first noticed — `button` has no naming convention marking
it as polarity-bearing the way `led_high`/`led_low` do, so a keyword-driven script will silently skip it
unless someone deliberately adds it to the check list. When in doubt, treat "does this note contain
'active-high'/'active-low' when it plausibly should" as a question to ask about every capability tag in
the vocabulary (button, led_*, any future polarity-relevant tag), not just the one under active
investigation.

**Pass seven: had every fork write and run its OWN scripted button/LED polarity validator (not just read
diffs manually) — this is what finally closed out the class pass 6 discovered, at the cost of a very high
false-positive rate that has to be triaged by hand every time.** Every fork's script flagged double digits
of "misses" (6-28 per batch) simply because a `button`/`led_*`-tagged pin having no documented polarity in
the pre-shortening ORIGINAL is common and correct — the script has no way to distinguish "never had it" from
"had it and lost it" on its own; that distinction requires a human (or fork) to cross-check each flagged pin
against `variantsPrevious/` individually. Doing that triage across 4 of 7 batches (adafruit_nrf52/nrf52: 20
flagged, 0 real; arduino/avr: 3 flagged, 0 real; esp32: 28 flagged, 0 real; esp8266: 6 flagged, 0 real;
rp2040 part 1: 25 flagged, 0 real; rp2040 part 2: 7 flagged, 0 real) turned up only ONE new genuine
regression across the whole repo — `adafruit_fruitjam`'s three PIN_BUTTON1/2/3 pins, whose ORIGINAL notes
explicitly said "Confirmed active-low with internal pull-up via CircuitPython example code" and had lost
just that clause. Five of seven batches are now stable across 4+ consecutive passes (arduino/avr: 7 clean;
esp32: 4 clean; adafruit_nrf52/nrf52: now scripted-verified exhaustively clean; esp8266 and rp2040 part 1/2:
each found and closed their last remaining gap in passes 5-7 and came back clean here).

**Revised standing guidance**: a scripted "capability implies word" check is worth running exhaustively
once per capability family (as pass 7 finally did for `button`), but its raw hit count is not a defect
count — it is a candidate list that still needs the `variantsPrevious/` cross-check per hit before any fix
is applied. Do not skip straight from "the script found N misses" to "N regressions exist" or "0 misses
survived triage, so the class is fully closed" without doing that per-hit historical comparison; the
signal-to-noise ratio on this specific check style has consistently run under 5% across every batch in this
project (1 real defect out of ~89 total flagged misses across the 6 forks that ran the scripted check in
pass 7).

**Pass eight: switched tactics from scripted checks (exhausted) to "read the largest diffs completely
fresh" — and this found a NEW defect shape (dangling mid-sentence truncations) that the button-polarity
script could never have caught, because the flaw isn't a missing word, it's a sentence that stops before
its own noun.** Told every fork to rank files by diff size and re-read the top handful as if seeing them
for the first time, rather than re-running the by-now-exhausted scripted/checklist approach. Three families
came back clean (arduino/avr: 8 straight passes; adafruit_nrf52/nrf52: 8 straight; esp32: 6 straight —
these three have now been independently re-verified by three DIFFERENT methodologies — manual diff read,
scripted polarity sweep, and fresh largest-diff-first read — without finding anything). Four batches still
found something: esp8266 clean, but rp2040 part 1 found 5 (mostly dangling truncations on
`challenger_2040_wifi`/`wifi_ble`/`nfc`, e.g. `"...WiFi/BLE co-processor's"` with the noun missing after
the possessive — a variant of the truncation bug from section 20, but one that survived 7 prior passes
because none of those passes specifically re-scanned for sentences ending on a dangling possessive or
preposition), rp2040 part 2 found 1 (two internal SPI-link pins on `wiznet_55rp20_evb_pico` had lost their
specific role names — CS, IRQ — while sibling pins in the SAME file kept theirs, caught only by comparing
against 3 other wiznet boards in the same batch), and rp2040 part 3 found 1 more dangling truncation
(`adafruit_metro_rp2350` GPIO47's PSRAM note).

**A second scripted validator is now worth building alongside the polarity one**: a heuristic dangling-
truncation detector — flag any note line ≥~55 chars ending in a preposition/article/conjunction/possessive
("'s", "the", "a", "of", "to", "with", "and", etc.) after stripping trailing punctuation. This won't be
perfect (many legitimate 64-char notes end mid-clause by design), but as a candidate-list generator for
human triage it is cheap to run repo-wide and would likely have caught several of pass 8's finds
immediately rather than needing exhaustive manual reading. The coordinator added exactly this check to its
own post-pass validator starting after pass 8 (0 hits repo-wide once pass 8's fixes landed) — future passes
should treat "0 scripted dangling-truncation hits" the same way as "0 scripted polarity misses": necessary
but not sufficient, still worth a manual fresh read on top.

## 26. A ninth pass focused on the single worst-performing batch, combining a scripted heuristic AND fresh-eyes reading in the SAME pass, out-performed every prior single-technique pass on that batch

By pass 8, three of seven original batches (arduino/avr, adafruit_nrf52/nrf52, esp32) had been independently
confirmed clean by three different methodologies (manual diff read, scripted polarity sweep, fresh
largest-diff-first read) across 6-8 consecutive passes — a strong signal those batches were actually done.
rp2040, split across 3 forks, kept finding something on nearly every pass. When the user asked to "focus on
rp2040" for pass 9, each of the 3 rp2040 forks was told to do BOTH the dangling-truncation script from
section 25 AND an independent fresh-eyes read of the largest diffs, in the same pass rather than
alternating techniques pass-to-pass as had been done before. Result: rp2040 part 1 alone found **8 new
defects** — none of them dangling truncations (the script found 0 candidates, correctly confirming that
specific class was closed) but instead a cluster of dropped safety-critical/alt-function facts on
`bigtreetech_SKR_Pico` (a 3D-printer control board with multiple heater/MOSFET/endstop pins — the kind of
board where a dropped "safety-critical" or dropped current rating is the highest-stakes defect class in the
whole project) that had simply never been on any fork's largest-diff reading list before. rp2040 part 3
found 4 more — sub-64-char fragments cut mid-noun ("...D0+ differential" missing "pair", "...for the onboard
microSD" missing "card"/"slot") that the dangling-truncation word list didn't cover because they end on a
bare adjective or preposition-plus-article combination outside the checked word set, not a clean
preposition/article/possessive. rp2040 part 2, by contrast, came back fully clean on both the script (0
candidates) and the fresh read (12 largest diffs, nothing found) — a real, methodologically-confirmed clean
result, not just "didn't look hard enough."

**Two practical lessons**: first, a "focus on X" request from the user is a legitimate way to concentrate
review effort on the batch with the worst track record rather than re-running a uniform sweep across
everything — three families had earned a rest by pass 8, and spending that saved effort on rp2040 instead
found real defects a uniform ninth pass might have spread too thin to catch. Second, a scripted heuristic's
word list is never complete — every pass that extends it (the dangling-truncation check went from a short
list in pass 8 to an "expanded word list" in pass 9's rp2040-part-3 run, run twice as the list grew) will
eventually plateau at catching a shrinking share of the true defect population, and the fresh-eyes read
remains the backstop for whatever shape the script's word list doesn't yet cover — running both together in
the same pass, rather than choosing one, is what actually found everything pass 9 found.
