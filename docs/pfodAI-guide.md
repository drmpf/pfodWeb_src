# pfodParser / pfodWeb — AI Guide to Designing, Generating and Completing a Sketch

Audience: an AI that must take a user's request ("add a menu that controls a
relay and shows a temperature gauge") all the way to a working Arduino sketch,
using **only this library and its docs** — no external pfod documentation.

Companion documents (read these for field-by-field rules — this guide does not
repeat them):

* `pfodMenu_json-format.md` — how to write/edit a `.pfodMenu_json` menu design.
* `pfodDwg_json-format.md` — how to write/edit a `.pfodDwg_json` drawing.

This guide covers the parts those two don't: the library architecture, what
happens between "design" and "code", the exact shape of the code the pfodWeb
Designer generates, and — the part with no other documentation at all — how to
correctly fill in the user-logic gaps in that generated code.

Everything here is drawn from the actual sources in this repository:
`src/`, `examples/pfodWeb/*` (real Designer output), and the two format docs.
Where an example doesn't exist in this repo for some item type, that is said
explicitly rather than invented.

---

## 1. The three-stage workflow

| Stage | You do | Output |
|---|---|---|
| **1. DESIGN** | Write/edit `.pfodMenu_json` and `.pfodDwg_json` files. The two format docs govern this stage. | The design files |
| **2. GENERATE** | In `pfodWeb.html`, connection type **Designer**: import the design, pick the board, click Generate. | A sketch `.zip` |
| **3. COMPLETE** | Write your own file(s) that subclass the generated classes and override their hooks; fill in the `.ino`'s few remaining placeholders. Never edit a generated file's body. | A working sketch |

* **Stage 1** is pure JSON authoring against the two format docs. You can do
  this stage entirely offline, with no board and no browser.
* **Stage 2** happens in a browser (`pfodWeb.html`, connection type
  **Designer** — see `pfodWeb-guide.html` §2, "Connection Setup"). This is a
  human/browser step: open pfodWeb.html, pick **Designer**, import the design
  (or build it interactively), select the target board, and generate the
  sketch. You cannot run this step yourself, but you can hand a user a
  ready-to-import `.pfodMenu_json` (plus its `dwgs/*.pfodDwg_json`) that
  generates correctly on the first try if you follow the format docs' rules.
* **Stage 3** is what this guide is mostly about: given the generated sketch,
  add the hardware/business logic the Designer cannot know (what pin does
  what, what a button press should actually do, how a label's text is
  computed).

**Generation is safe to re-run, provided your logic lives in a subclass.**
Every generated class — `pfodMainMenu` and every `Dwg_<Name>` — is reached
everywhere else in the generated code through an accessor function
(`get_pfodMainMenu()`, `get_dwg_<Name>()`) whose default body is a *weak*
symbol. You define your own subclass, your own instance, and a same-named
non-weak function returning it, all in **file(s) you create yourself** — one
file (e.g. `<SketchName>App.cpp`) is simplest, but nothing requires it; one
file per drawing works just as well and is the better choice when a drawing
is meant to be reused across sketches (§4) — and the linker silently prefers
your definition either way, no generated file needs to change at all.
Re-running Generate then only overwrites `pfodMainMenu.h/.cpp` and
`Dwg_<Name>.h/.cpp`; your own file is untouched and still compiles. See
§5.2/§5.3 for the mechanism in full (with
`examples/pfodWeb/LedOnOff_serial/LedOnOffApp.cpp` in this repo as the
worked, ground-truth example) and §7 rule 1 for the two things that *can*
still need attention after a re-generate: a structural design change renaming
or removing a virtual hook your subclass overrides, and the `.ino`'s own
placeholders (credentials, extension points) coming back blank.

---

## 2. Library map

| Path | What it is | Do you edit it? |
|---|---|---|
| `src/pfodParser.h/.cpp` | Core parser: reads `{cmd\|args}` messages, writes menu/dwg wire format, owns the list of active drawings. | No — library code. |
| `src/pfodDrawing.h/.cpp` | Base class every generated `Dwg_<Name>` inherits from. `init()`, `sendDwg()`, `processDwgCmds()`. | No — library code (your `Dwg_<Name>` subclasses it). |
| `src/pfodDwgs.h/.cpp` + `src/dwgs/*.h` | The fluent builder API (`dwgsPtr->rectangle()...send()` etc.) used inside generated dwg code. One header per item type — see §5.4. | No — library code, but you'll call it directly inside your own subclass overrides, e.g. a `sendIndexedItems()` override (§5.3). |
| `src/pfodSecurity*.h/.cpp` | Drop-in alternative to `pfodParser` adding 128-bit message security. Same menu/dwg API. | Only if the user asks for secured comms. |
| `pfodWeb/pfodWeb.html` | The browser client, including the Designer (menu/dwg editor + Arduino code generator). | No — treat as a black box; it's what performs stage 2. |
| `pfodWeb/docs/pfodMenu_json-format.md`, `pfodDwg_json-format.md` | Stage 1 references. | N/A |
| `examples/pfodWeb/Hello_World_serial/`, `LedOnOff_serial/`, `LedOnOff_ble/`, `LedOnOff_tcp/`, `LedOnOff_http/`, `Menu_1/` | **Real Designer output.** `LedOnOff_serial/` additionally ships `LedOnOffApp.cpp` — a hand-written file, *not* Designer output — that completes the whole sketch by subclassing every generated class; it's the canonical worked example for the mechanism in §5.2/§5.3/§6. `Menu_1/` is a plain menu (no dwg) with `onoff`/`pwm`/`datadisplay`/`onoffdisplay`/`chart`/`submenu` items, all generated, including a `button` item *inside* the sub-menu — the ground truth for §6.3–§6.5. | The generated files are references, not templates to overwrite; `LedOnOffApp.cpp` is the pattern to copy for your own logic file. |
| `examples/pfodWeb/*` (everything else) | Hand-written library-feature demos (not Designer output). Useful for learning the raw `pfodParser`/`pfodDwgs` API, but do not mimic their structure for a Designer-based sketch — they don't follow the generated file layout. | Reference only. |

---

## 3. Designing (stage 1) — quick decision guide

Full rules are in the two format docs. Use this table to pick the right
construct before writing JSON:

| You want... | Use |
|---|---|
| A screen of text/numeric fields and simple controls, no custom graphics | A **menu** (`.pfodMenu_json`), built from `button`/`label`/`onoff`/`onoffdisplay`/`pwm`/`datadisplay`/`submenu`/`chart` items |
| Custom graphics — shapes, gauges, custom-positioned touch buttons, live-updating drawn values | A **dwg** (`.pfodDwg_json`), referenced from the menu via a `drawing` item |
| A control that is just "on/off" or "a slider", with no custom look | `onoff` / `pwm` menu items — don't build a dwg for this, it's a lot more code for the same result |
| A gauge, custom button layout, LED indicator shape, or anything positioned/coloured precisely | A dwg — see the dwg doc's Recipes (§10), e.g. §10.4 push-button, §10.12 radial gauge |
| Nested screens | `submenu` menu items (unlimited nesting) |
| A live chart of sampled data | `chart` menu item (menu format) — up to 3 plots |
| Reusable graphics (e.g. an LED shape used twice) | One dwg, embedded into others via `insertDwg` (dwg format §"insertDwg") |

**One naming decision made at design time drives everything in stage 3:**
`autoCmd` (menu items), `cmdName` (dwg touch zones / inserted dwgs) and
`idxName` (dwg indexed items) become **literal C++ identifiers** in the
generated code:

| JSON | Becomes, in generated code |
|---|---|
| dwg `name: "LedOn"` | class `Dwg_LedOn`, global instance `dwg_LedOn`, files `Dwg_LedOn.h/.cpp` |
| dwg item `idxName: "idx_1"` | member `pfodAutoIdx idx_1;` in the `Dwg_<Name>` class |
| dwg `touchZone.cmdName: "cmd_c1"` | member `pfodAutoCmd cmd_c1;` **and** a virtual hook `bool Dwg_<Name>_cmd_c1(...)` you override in a stage-3 subclass |
| menu item `autoCmd: "button_Start_Cmd"` | the cmd variable stem `button_Start_Cmd` — no `_var`/`_pin` (a `button` carries no value), but it does still get a dedicated hook: `on<Text>Pressed(pfodParser&)` (confirmed generated shape in §6.5) |
| menu item `autoCmd: "onoff_LED_is_Cmd"` | cmd stem `onoff_LED_is_Cmd`; because this type carries a value and (optionally) a pin, also `onoff_LED_is_var` and, if a `pin` was set, `onoff_LED_is_Cmd_pin` (menu format §5.1; confirmed generated shape in §6.3) |

So: **pick short, descriptive `cmdName`/`idxName`/`autoCmd` values at design
time** — `cmd_setRelay`, `idx_tempLabel` — not the designer's auto-suggested
`cmd_c1`, `idx_1`, if you want the generated code to read sensibly. Both are
valid; only the human-readability differs.

**Keep the wire message a device sends under 1024 bytes.** A drawing with
many indexed items, several nested `insertDwg` levels, or long label/units
text all add to the size of the single `{...}` message `sendFullDrawing()`
produces — see §7 rule 11 for the exact limits and what happens if you go
over (nothing errors; the tail is silently dropped).

---

## 4. Generating (stage 2) — what comes out

For a menu with `connection: "serial"` (or ble/tcp/http) and one or more
`drawing` items, Generate produces:

```
<SketchName>/
    <SketchName>.ino          the pfod-agnostic connection setup; rarely edited now (see §5.1)
    pfodMainMenu.h
    pfodMainMenu.cpp          one pair, always — the top of the menu tree
    Dwg_<Name1>.h
    Dwg_<Name1>.cpp           one pair per drawing reachable from the menu
    Dwg_<Name2>.h
    Dwg_<Name2>.cpp
    ...
```

**Generate does not export a `data/` folder.** For an HTTP connection that
serves pfodWeb from the micro's own filesystem (`useLittleFSToServe_pfodWeb =
true` in the `.ino`), the required files come from the library's own
`pfodWeb/data/` directory — copy that in alongside the sketch yourself; it
is not part of what Generate produces per-sketch.

**`pfodMainMenu.*` and every `Dwg_<Name>.*` are identical regardless of
connection type** (serial/ble/tcp/http). All the connection-specific code (BLE GATT service,
WiFi/HTTP server, TCP socket, Serial baud) lives **only** in the `.ino`, and
you should never need to touch it beyond the placeholders in §5.1.

**Generate never creates a file for your own logic.** You add that yourself,
and there is no required layout for it. One file (e.g. `<SketchName>App.cpp`,
the pattern `LedOnOffApp.cpp` demonstrates) holding every subclass and every
`get_...()` override is the simplest option for a small sketch — note that
file needs no header of its own, since nothing outside it ever names `MyLedOn`
or `MyMainMenu` directly; every other file only ever calls the `get_...()`
accessor. Equally valid: **one `.cpp` per drawing you're subclassing** —
e.g. `Dwg_LedOnApp.cpp`, with its own `MyLedOn` class, instance, and
`get_dwg_LedOn()` override (add a header only if something else genuinely
needs to name the subclass type). Splitting this way is the better choice
once a drawing is meant to be reused across sketches: the drawing's
subclassed behaviour then travels with it as one file, and a new sketch that
wants that same behaviour just adds it (plus the generated
`Dwg_<Name>.h/.cpp`) rather than copying logic out of some other sketch's
combined file. See §5.2–§5.3 for the mechanism.

---

## 5. Anatomy of generated code

The generated-code excerpts below are real Designer output from
`examples/pfodWeb/` in this repo (`Hello_World_serial`,
`LedOnOff_serial`/`_ble`/`_tcp`/`_http`). The subclass excerpts are from
`examples/pfodWeb/LedOnOff_serial/LedOnOffApp.cpp` — hand-written, shipped
alongside the generated files as the worked example of completing them.

### 5.1 The main `.ino`

```cpp
#include <pfodParser.h>
#include "pfodMainMenu.h"

const char version[] = "V1";   // <-- bump this (or clear the pfodWeb cache) whenever
                                //     you change what any sendXxx() method transmits — §7 rule 4
pfodParser parser;
handle_mainMenuFnPtr handle_mainMenu;

void closeConnection(Stream *io) {
  (void)(io);
  // add any special code here to force connection to be dropped
}

void setup() {
  Serial.begin(115200);        // or the BLE/WiFi/TCP setup block, for other connections
  ...
  parser.setVersion(version);
  parser.connect(&Serial);     // or the connection-specific stream
  handle_mainMenu = init_pfodMainMenu(closeConnection);
  // <<<<<<<<< Your extra setup code goes here
  //   ^^^ EXTENSION POINT 1: pinMode() calls, sensor init, hardware defaults
}

void loop() {
  handle_mainMenu(parser); // handle i/o via this parser
}
```

**That's the whole `.ino` loop — there is no marked extension point in
`loop()`.** Do not confuse it with the similarly-worded
`//  <<<<<<<<<<<  Your other loop() code goes here` marker: that one is
generated *inside* `pfodMainMenu::handle()` in `pfodMainMenu.cpp` (shown in
§5.2), not here. Reaching it without editing the generated file means
overriding `handle()` in your subclass and chaining to the base — see §5.2.

Two more things to look for and fill in on **every** connection type, not
marked with `<<<<<<<<<` because they are plain declarations, not code bodies:

* **BLE**: `const char* localName = "pfod_...";` — the advertised device name.
* **HTTP/WiFi**: `const char *ssid = "xxxxxx";` / `const char *password = "xxxxxx";`
  and usually a static-IP block — these placeholder strings must be replaced
  with the user's real network credentials before the sketch is usable.

**Prefer putting hardware setup in a subclassed `init()` override, not here.**
`LedOnOffApp.cpp`'s `MyMainMenu::init()` (§5.2) calls `pinMode()` and sets the
LED's starting state, and needs no line in the `.ino` at all —
`init_pfodMainMenu()` already reaches it through `get_pfodMainMenu()`. Reserve
extension point 1 for things with no natural class home — e.g. `Serial.begin()`
on a second port, or startup work not tied to any one menu/drawing.

### 5.2 `pfodMainMenu.h` / `.cpp` — the top of the menu tree, and how to subclass it

One pair of files always, regardless of how many sub-menus/drawings exist.
Every method is `virtual`, and (as of the generator that produced
`examples/pfodWeb/LedOnOff_serial` in this repo, pfodWeb V4.1.7) the single
`mainMenu` instance is reached everywhere else through an accessor, not
directly:

```cpp
class pfodMainMenu {
  public:
    pfodMainMenu();
    virtual void init(pfodCloseConnectionPtr _closeConnectionFnPtr = NULL);
    virtual void sendMainMenu(pfodParser &parser);       // full menu, on first connect
    virtual void sendMainMenuUpdate(pfodParser &parser); // cheap refresh of a cached menu
    virtual void handle(pfodParser &parser);              // called every loop() via the fn pointer
  protected:
    pfodAutoCmd dwgMenuItem_Cmd;    // one such member per top-level drawing menu item
  ...
};

// generated in pfodMainMenu.cpp:
pfodMainMenu mainMenu;                                                     // the default instance
pfodMainMenu& __attribute__((weak)) get_pfodMainMenu() { return mainMenu; } // weak — replace THIS, not mainMenu

// and both entry points the .ino calls go through the accessor, not `mainMenu` directly:
handle_mainMenuFnPtr init_pfodMainMenu(pfodCloseConnectionPtr p) { get_pfodMainMenu().init(p); return handle_pfodMainMenu; }
void handle_pfodMainMenu(pfodParser& parser) { get_pfodMainMenu().handle(parser); }
```

**This is the mechanism the whole of stage 3 now runs on — read it once here,
it applies identically to every `Dwg_<Name>` in §5.3 and every `SubMenu_<Name>`
in §6.5.** `get_pfodMainMenu()`
is a C/C++ *weak symbol*: the generated `.cpp` supplies a default definition,
but if your own `.cpp` defines a function with the exact same name and
signature, the linker silently uses **yours** instead — no generated file has
to change. To take over:

```cpp
// in YOUR OWN new file, e.g. LedOnOffApp.cpp — nothing here touches a generated file
class MyMainMenu : public pfodMainMenu {
  public:
    virtual void init(pfodCloseConnectionPtr _closeConnectionFnPtr = NULL);  // override only what you need
};
void MyMainMenu::init(pfodCloseConnectionPtr _closeConnectionFnPtr) {
  pfodMainMenu::init(_closeConnectionFnPtr);   // ALWAYS chain to the base first — it registers the drawing tree
  pinMode(ledPin, OUTPUT);
  turnLedOff();
}
MyMainMenu myMainMenu;
pfodMainMenu& get_pfodMainMenu() { return myMainMenu; }   // replaces the weak default sketch-wide
```

This is `examples/pfodWeb/LedOnOff_serial/LedOnOffApp.cpp`, verbatim in
substance (its own comment: *"Re-generating from the pfodWeb Designer
overwrites `pfodMainMenu.*` and `Dwg_*.*` and leaves this file alone."*).
Because `init_pfodMainMenu()` — called from the `.ino` — itself goes through
`get_pfodMainMenu()`, this is the **entire** change required: the `.ino`,
`pfodMainMenu.h` and `pfodMainMenu.cpp` are not edited at all, and re-running
Generate is safe (§7 rule 1).

`handle()` is the dispatcher; its shape (from `LedOnOff_serial`, unedited
generated code):

```cpp
void pfodMainMenu::handle(pfodParser& parser) {
  uint8_t cmd = parser.parse();      // 0 until a full { ... } message has arrived
  if (cmd != 0) {
    if ('.' == cmd) {                // pfodApp/pfodWeb asking for the menu
      if (!parser.isRefresh()) sendMainMenu(parser); else sendMainMenuUpdate(parser);
    } else if ('@' == cmd) {         // standard chart/time-sync handshake — leave as generated
      plot_msOffset = millis(); clearPlot = true;
      parser.print(F("{@`0}"));
    } else if (parser.cmdEquals(dwgMenuItem_Cmd)) {
      // a touch INSIDE this drawing that no dwg's processDwgCmds() claimed (returned false) —
      // see the return-value contract in §6.1. Generic fallback: refresh the drawing.
      sendMainMenuUpdate(parser);
    } else if ('!' == cmd) {
      if (closeConnectionFnPtr) closeConnectionFnPtr(parser.getPfodAppStream());
    } else {
      parser.print(F("{}"));         // MUST always reply something, or the app disconnects
    }
  }
  //  <<<<<<<<<<<  Your other loop() code goes here
}
```

**This trailing marker is the real "runs every `loop()`" extension point — and
it's inside a generated file.** (`Menu_1`'s own `handle()` — not reproduced
here, see §6.3 for its `onoff` branch — also calls
`onoff_LED_is_Cmd_checkPulse()`, an ADC poll and `tickCharts()` right before
this same marker, unconditionally, every loop; this is where per-loop
servicing that isn't any one item's job already lives.) Don't hand-edit it in
place; reach it the same regeneration-safe way as everything else — override
`handle()` in your subclass and chain to the base first, then add your own
code after:

```cpp
class MyMainMenu : public pfodMainMenu {
  public:
    virtual void handle(pfodParser &parser);
};
void MyMainMenu::handle(pfodParser &parser) {
  pfodMainMenu::handle(parser);   // runs everything above, including the marked spot
  // your own "every loop()" code here
}
```

For each additional top-level menu item type, expect one more `else if`
branch here following the same `parser.cmdEquals(<autoCmd member>)` pattern.
For an `onoff`/`pwm` item this branch already calls a **named protected
virtual hook** (`onLedIsChanged(value)`, `onPwmSettingChanged(value)`, ...) —
see §6.3, that's the hook you override, not `handle()` itself. A `submenu`
branch opens a separate `SubMenu_<Name>` object (its own class, own weak
accessor, own `sendMenu()`/`sendMenuUpdate()` pair) — see §6.5 for the full
mechanism, which also adds one more `else if`, after every item branch,
delegating unclaimed commands to that sub-menu.

**Version/cache rule** (generated comment, verbatim):
> `!! Remember to change the parser version string OR Clear the cache every
> time you edit this method`

This applies whenever *you* change what `sendMainMenu()` or any
`Dwg_<Name>::sendFullDrawing()` transmits — including from inside an override
— see §7 rule 4.

### 5.3 `Dwg_<Name>.h` / `.cpp` — one pair per drawing, subclassed the same way

```cpp
class Dwg_LedOn : public pfodDrawing {
  public:
    Dwg_LedOn();
    virtual void init();          // idempotent; registers with pfodParser's drawing list
    bool sendDwg();                // true if this dwg answered the current message
    bool processDwgCmds();         // true if a touch on this dwg was fully handled
    void sendFullDrawing();        // whole drawing, sent on first load
    void sendUpdate();             // indexed items only, sent on refresh
    unsigned long dwgRefresh_ms;   // public — safe to set from a subclass's init(), e.g.
                                    //   dwgRefresh_ms = 5000;
  protected:
    virtual void sendIndexedItems();                                 // ALWAYS present — override this
    virtual bool Dwg_LedOn_cmd_c1(int row, int col,                  // ONE per touchZone — override this
                                   uint8_t touchType,
                                   const byte* editedText);
    pfodAutoIdx idx_1, idx_2;      // protected: one per idxName in the dwg json — a
                                    //   subclass can name these to re-send them
    pfodAutoCmd cmd_c1;             // protected: one per touchZone/insertDwg cmdName
  private:
    bool initialized;
};

// generated in Dwg_LedOn.cpp:
Dwg_LedOn dwg_LedOn;                                                    // the default instance
Dwg_LedOn& __attribute__((weak)) get_dwg_LedOn() { return dwg_LedOn; }   // weak — replace THIS, not dwg_LedOn
```

Exactly the same weak-factory mechanism as `pfodMainMenu` (§5.2): every other
generated file that needs this drawing calls `get_dwg_LedOn()`, **never**
`dwg_LedOn` directly — including an `insertDwg` reference from a parent
drawing (`dwgsPtr->insertDwg().loadCmd(get_dwg_LedOn())...`) and the menu item
that loads it from `pfodMainMenu` (`parser.print(get_dwg_LedOnOff());`).
Define your own subclass + instance + a same-named non-weak `get_dwg_LedOn()`
in your own file, and every one of those call sites picks it up with no
generated file touched:

```cpp
// in YOUR OWN file
class MyLedOn : public Dwg_LedOn {
  protected:
    virtual bool Dwg_LedOn_cmd_c1(int row, int col, uint8_t touchType, const byte* editedText);
};
bool MyLedOn::Dwg_LedOn_cmd_c1(int row, int col, uint8_t touchType, const byte* editedText) {
  (void)row; (void)col; (void)touchType; (void)editedText;
  turnLedOn();
  get_dwg_LedOnOff().sendUpdate();   // a sibling drawing shows the state — see §6.1
  return true;
}
MyLedOn myLedOn;
Dwg_LedOn& get_dwg_LedOn() { return myLedOn; }
```

`init()` chains **downward** and is virtual at this level: a drawing that
embeds others (via `insertDwg`) calls their `init()` **through their own
accessor** — `Dwg_LedOnOff::init()` calls `get_dwg_LedOn().init();
get_dwg_LedOff().init();`, *not* `dwg_LedOn.init()` — so a subclassed child is
initialised too, automatically. `pfodMainMenu::init()` calls the top-level
drawing's `init()` the same indirect way. If you override `init()` yourself,
**always chain to the base class's `init()` first**
(`Dwg_LedOn::init();`) — it is what registers the drawing with the parser and
allocates its `pfodDwgs`; skip it and the drawing is never sent and never
receives touches (`pfodDrawing.h`'s own warning: *"using it before init()
dereferences NULL"*).

`sendFullDrawing()` vs `sendIndexedItems()`/`sendUpdate()` — **the split that
matters most when you override a drawing's live content** (unedited generated
code, `Dwg_LedOn.cpp`):

```cpp
void Dwg_LedOn::sendIndexedItems() {   // <-- override this to reflect live state
    dwgsPtr->rectangle().filled().centered().rounded().idx(idx_1)
        .color(dwgsPtr->LIME).size(18,7).offset(25,12.5).send();
    dwgsPtr->label().idx(idx_2).color(dwgsPtr->RED)
        .text("Turn Led On").bold().offset(25,12.5).center().decimals(2).send();
}
void Dwg_LedOn::sendFullDrawing() {
    dwgsPtr->start(50, 25, dwgsPtr->BLUE);
    parserPtr->sendRefreshAndVersion(dwgRefresh_ms);
    dwgsPtr->index().idx(idx_1).send();   // placeholder — geometry/text sent later, above
    dwgsPtr->index().idx(idx_2).send();
    dwgsPtr->touchZone().cmd(cmd_c1).centered().size(18,7).offset(25,12.5).send();
    dwgsPtr->touchAction().cmd(cmd_c1)
        .action(dwgsPtr->rectangle().filled().centered().idx(idx_1)
                .color(dwgsPtr->SILVER).size(18,7).offset(25,12.5)).send();
    sendIndexedItems();                   // real content, once, at the end
    dwgsPtr->end();
}
void Dwg_LedOn::sendUpdate() {            // called on every refresh — indexed items ONLY
    dwgsPtr->startUpdate();
    sendIndexedItems();
    dwgsPtr->end();
}
```

**`sendIndexedItems()` is the one method you will override most often.** It
is called from both `sendFullDrawing()` (first load) and `sendUpdate()`
(refresh/after a touch), so putting your "what does the current state look
like" logic there — one place — keeps both in sync automatically. This is
exactly what `LedOnOffApp.cpp`'s `MyLedOnOff` does, overriding the sibling
drawing that shows the LED's state:

```cpp
class MyLedOnOff : public Dwg_LedOnOff {
  protected:
    virtual void sendIndexedItems();
};
void MyLedOnOff::sendIndexedItems() {
  if (isLedOn()) {
    dwgsPtr->label().idx(idx_1).color(dwgsPtr->RED).text("Led is ON")
      .bold().offset(20, 11.5).center().decimals(2).send();
  } else {
    dwgsPtr->label().idx(idx_1).color(dwgsPtr->BLACK).text("Led is Off")
      .bold().offset(20, 11.5).center().decimals(2).send();
  }
}
MyLedOnOff myLedOnOff;
Dwg_LedOnOff& get_dwg_LedOnOff() { return myLedOnOff; }
```

`idx_1` is accessible here only because the generated header declares it
`protected`, not `private` — every `pfodAutoIdx`/`pfodAutoCmd` member is, for
exactly this reason.

### 5.4 The `dwgsPtr` fluent builder — JSON item type → C++ call

Every field in a `.pfodDwg_json` item maps directly onto a chained call on the
object `dwgsPtr->` returns. Use this to translate between the JSON you wrote
and the generated/hand-edited C++, in either direction:

| dwg JSON `type` | Builder call | Header |
|---|---|---|
| `rectangle` | `dwgsPtr->rectangle().size(w,h).offset(x,y).color(c).filled().centered().rounded().idx(idxVar).send();` | `src/dwgs/pfodRectangle.h` |
| `circle` | `dwgsPtr->circle().radius(r).offset(x,y).color(c).filled().idx(idxVar).send();` | `pfodCircle.h` |
| `line` | `dwgsPtr->line().size(dx,dy).offset(x,y).color(c).idx(idxVar).send();` | `pfodLine.h` |
| `arc` | `dwgsPtr->arc().radius(r).start(a).angle(sweep).offset(x,y).color(c).filled().idx(idxVar).send();` | `pfodArc.h` |
| `label` | `dwgsPtr->label().text("...").fontSize(n).bold()/.italic()/.underline().align via .center()/.left()/.right().color(c).offset(x,y).idx(idxVar).send();` | `pfodLabel.h` |
| `value` | same `pfodLabel`, plus `.intValue(v).minValue(mn).maxValue(mx).displayMin(dmn).displayMax(dmx).decimals(n).units("...")` | `pfodLabel.h` |
| `touchZone` | `dwgsPtr->touchZone().cmd(cmdVar).size(w,h).offset(x,y).centered().filter(f).idx(idxVar).send();` | `pfodTouchZone.h` |
| `touchAction` | `dwgsPtr->touchAction().cmd(cmdVar).action(<one builder object, unsent>).send();` | `pfodTouchAction.h` |
| `touchActionInput` | `dwgsPtr->touchActionInput().cmd(cmdVar).prompt("...").textIdx(idxVar).color(c).backgroundColor(c).fontSize(n).send();` | `pfodTouchActionInput.h` |
| `insertDwg` | `dwgsPtr->insertDwg().loadCmd(get_dwg_Child()).offset(x,y).send();` — via the accessor, never the raw instance (§5.3) (pan/scale via `pushZero`/`popZero` around it, not the offsets — dwg doc §10.6) | `pfodInsertDwg.h` |
| `index` | `dwgsPtr->index().idx(idxVar).send();` | `pfodIndex.h` |
| `hide` / `unhide` / `erase` | `dwgsPtr->hide().idx(idxVar).send();` — or `.cmd(cmdVar)` for a touchZone target, or `.loadCmd(get_dwg_Child())` (via the accessor, same as `insertDwg` above) for an inserted-drawing target | `pfodHide.h`/`pfodUnhide.h`/`pfodErase.h` |
| `pushZero` / `popZero` | `dwgsPtr->pushZero(x, y, scale); ... dwgsPtr->popZero();` | `pfodDwgsBase.h` |
| (canvas) | `dwgsPtr->start(x, y, backgroundColor);` ... `dwgsPtr->end();` / `dwgsPtr->startUpdate(); ... dwgsPtr->end();` | `pfodDwgs.h` |

`idxVar`/`cmdVar` above are the `pfodAutoIdx`/`pfodAutoCmd` **member
variables** named after the JSON `idxName`/`cmdName` (§3). **Never pass a
literal number** to `.idx()`/`.cmd()` in hand-written code — always pass the
member variable, exactly as the generated code does; the library mints the
real wire value from it on first use (see §5.6).

### 5.5 Colour constants

The dwg JSON format uses plain integers 0–255 for `color` (dwg format §3);
generated/hand-written C++ uses named constants for the first 16
(`src/dwgs/pfodDwgsBase.h`), identical mapping:

| # | Name | # | Name | # | Name | # | Name |
|---|---|---|---|---|---|---|---|
| −1 | `BLACK_WHITE` (auto contrast) | 4 | `NAVY` | 8 | `GREY` | 12 | `BLUE` |
| 0 | `BLACK` | 5 | `PURPLE` | 9 | `RED` | 13 | `FUCHSIA` (= `MAGENTA`) |
| 1 | `MAROON` | 6 | `TEAL` | 10 | `LIME` | 14 | `AQUA` |
| 2 | `GREEN` | 7 | `SILVER` | 11 | `YELLOW` | 15 | `WHITE` |
| 3 | `OLIVE` | | | | | | |

16–255 (the colour cube / greyscale ramp) have no named constant — pass the
integer directly, e.g. `.color(200)`.

### 5.6 `pfodAutoCmd` / `pfodAutoIdx` — never hand-assign

```cpp
class pfodAutoCmd : public Printable { public: char cmd[5] = ""; ... };  // mints "c1","c2",... on first use
class pfodAutoIdx                    { public: uint16_t idx;   ... };    // mints 1,2,... on first use
```

These are the C++ side of the "write the name, not the wire value" rule in
the dwg format doc (§5). A `pfodAutoCmd`/`pfodAutoIdx` member auto-assigns its
real wire value the first time `.cmd(member)` / `.idx(member)` is sent; you
address it everywhere else by the same C++ variable, never by a literal
number/string.

---

## 6. Completing the generated code — recipes

### 6.1 A touch zone should do something (button press, toggle, etc.)

This is the pattern demonstrated end-to-end by
`examples/pfodWeb/LedOnOff_serial/LedOnOffApp.cpp` in this repo. The
generated stub for a `touchZone` with `cmdName: "cmd_c1"`
(`Dwg_LedOn.cpp`, unedited) already sends a reply by default:

```cpp
bool Dwg_LedOn::Dwg_LedOn_cmd_c1(int row, int col, uint8_t touchType, const byte* editedText) {
  (void)row; (void)col; (void)touchType; (void)editedText; // suppress warnings
  // sendUpdate from here
  // and return true,  if only this dwg needs updating
  sendUpdate();
  return true;
  // else return false to propagate upto the mainmenu to let it send the response.
}
```

**The return value is a real contract, not a suggestion — get it right.**
`LedOnOffApp.cpp` states it precisely:

> Returning `true` means "handled, and already replied": `pfodParser.cpp`'s
> own dispatch loop sets `rtn = 0` when `processDwgCmds()` returns `true`, so
> `pfodMainMenu::handle()` never sees the cmd and cannot send a second reply.
> Returning `false` instead would propagate up to the main menu, which would
> then have to know which drawing to refresh.

So:

* Return **`true`** once you have sent some reply yourself — `sendUpdate()`,
  on this drawing or on whichever drawing actually needs refreshing.
  `pfodParser`'s internal loop over every registered drawing
  (`sendDwg()`/`processDwgCmds()`, documented in
  [`pfodDrawing.h`](../../src/pfodDrawing.h)) stops there; the message is
  fully handled.
* Return **`false`** only if you have *not* replied, to let the message
  propagate up to `pfodMainMenu::handle()`'s fallback branch
  (`parser.cmdEquals(dwgMenuItem_Cmd)`, §5.2), which sends a generic
  `sendMainMenuUpdate()`. pfod requires **every** message to get exactly one
  reply, or the app disconnects — the fallback exists for cases where no
  single drawing knows what to refresh.

To wire in real behaviour, override the hook in your own subclass (§5.3) —
never edit the stub above in place. The two button drawings in
`LedOnOffApp.cpp` both return `true`, because each already knows exactly
which *sibling* drawing needs refreshing (not itself — `Dwg_LedOn`'s and
`Dwg_LedOff`'s own indexed content is just their static button caption and
highlight colour, neither of which changes when the LED toggles; the label
that shows the LED's actual state lives on `Dwg_LedOnOff`, the parent):

```cpp
class MyLedOn : public Dwg_LedOn {
  protected:
    virtual bool Dwg_LedOn_cmd_c1(int row, int col, uint8_t touchType, const byte* editedText);
};
bool MyLedOn::Dwg_LedOn_cmd_c1(int row, int col, uint8_t touchType, const byte* editedText) {
  (void)row; (void)col; (void)touchType; (void)editedText;
  turnLedOn();
  get_dwg_LedOnOff().sendUpdate();   // refresh the PARENT — its label is what shows the state
  return true;
}
MyLedOn myLedOn;
Dwg_LedOn& get_dwg_LedOn() { return myLedOn; }
```

If a handler only affects its *own* drawing's indexed items, the pattern is
identical, just call `sendUpdate()` (unqualified — `this` drawing) instead of
reaching for a sibling via its accessor:

```cpp
class MyGauge : public Dwg_Gauge {
  protected:
    virtual bool Dwg_Gauge_cmd_reset(int row, int col, uint8_t touchType, const byte* editedText);
};
bool MyGauge::Dwg_Gauge_cmd_reset(int row, int col, uint8_t touchType, const byte* editedText) {
  (void)row; (void)col; (void)touchType; (void)editedText;
  resetGaugeReading();
  sendUpdate();   // this drawing's sendIndexedItems() picks up the new value
  return true;
}
```

### 6.2 Reflecting live device state in a drawing

Put the "what does this look like right now" logic in an override of
`sendIndexedItems()` (§5.3) — it is the single method both the initial send
and every refresh call through, so this is the one place both stay in sync.
Feed it from small getter functions (`isLedOn()`, `readTempC()`, ...) defined
alongside the subclass in your own `<SketchName>App.cpp`, exactly as
`LedOnOffApp.cpp`'s `isLedOn()`/`MyLedOnOff::sendIndexedItems()` pair does
(§5.3).

**Never call `sendUpdate()` from `loop()` on its own initiative.** The `{...}`
pfod menu/dwg protocol is strictly request/response: every `sendUpdate()` in
this guide so far has run *inside* the handling of an incoming message (a
touch, or a client-initiated refresh request) — it is the reply. pfodWeb/
pfodApp is not listening for anything else on this channel; a `{...}` message
sent without a matching request pending is unsolicited and the client simply
drops it. So a sensor changing in the background does not, by itself, get a
menu or dwg update sent anywhere. (Chart CSV sampling in §6.4 is the one
deliberate exception to this — it is a separate, always-on stream, not a
`{...}` message — don't take it as licence to push a dwg/menu update the same
way.)

What actually keeps a drawing showing live data is the *client* re-asking for
it, on a timer it controls — `dwgRefresh_ms` (or the menu's own `refresh_ms`
for a plain menu item). Set that once, from your subclass's overridden
`init()`:

```cpp
void MyGauge::init() {
  Dwg_Gauge::init();     // chain to the base first — see §7 rule 3
  dwgRefresh_ms = 1000;  // client re-requests this drawing every second
}
```

Your `loop()`'s job is only to keep the underlying state up to date (e.g.
`readTempC()` into a variable, or read it live on demand) — **not** to decide
when to tell the client. When the client's next scheduled request arrives
(handled automatically, same as any other incoming message — §5.2/§5.3),
`sendIndexedItems()` runs and picks up whatever the state is *at that moment*.
So the loop-side and drawing-side halves stay separate: `loop()` (or a sensor
ISR/library) owns freshness of the data, `sendIndexedItems()` (§5.3) owns
turning it into wire content, and the client's `dwgRefresh_ms` timer is what
actually triggers a send — never your own code.

### 6.3 `onoff` / `pwm` / `datadisplay` menu items (not dwgs)

`examples/pfodWeb/Menu_1/` in this repo is a plain menu (no dwg), with one of each:
`datadisplay`, `onoffdisplay`, `pwm`, `onoff` and `chart` (§6.4) — real,
current, ground-truth evidence for both *which hooks exist* and *how you
reach them* (the same `get_pfodMainMenu()` subclass mechanism as §5.2).

For a pin-bound item, generated code already does more than you'd expect —
for `autoCmd: "onoff_LED_is_Cmd"` on pin D13 with `pulse: "high"`,
`pulse_ms: 10000` in the JSON:

```cpp
// generated in pfodMainMenu.cpp — pin wiring, already complete, needs no edit:
const int onoff_LED_is_Cmd_pin = 13;
int onoff_LED_is_var = 0;
static unsigned long onoff_LED_is_Cmd_pulseStartTime = 0;
static bool onoff_LED_is_Cmd_pulseRunning = false;
static unsigned long onoff_LED_is_Cmd_PULSE_LENGTH = 10000;
static void onoff_LED_is_Cmd_checkPulse();   // called every handle(), auto-reverts the pin after PULSE_LENGTH

void pfodMainMenu::init(...) {
  ...
  pinMode(onoff_LED_is_Cmd_pin, OUTPUT);
  digitalWrite(onoff_LED_is_Cmd_pin, onoff_LED_is_var);
}

// the ONE hook meant for your logic — a protected virtual, same as any Dwg_<Name> hook:
void pfodMainMenu::onLedIsChanged(int value) {
  digitalWrite(onoff_LED_is_Cmd_pin, value);   // the default already drives the pin correctly
  if (value == 1) { onoff_LED_is_Cmd_pulseStartTime = millis(); onoff_LED_is_Cmd_pulseRunning = true; }
  else             { onoff_LED_is_Cmd_pulseRunning = false; }
}
```

...and the `handle()` branch that calls it is already correct, unedited:

```cpp
} else if (parser.cmdEquals(onoff_LED_is_Cmd)) {
  parser.parseLong(pfodFirstArg, &pfodLongRtn);
  onoff_LED_is_var = (int)pfodLongRtn;
  onLedIsChanged(onoff_LED_is_var);   // virtual hook
  sendMainMenuUpdate(parser);
}
```

A `pwm` item follows the same shape (`onPwmSettingChanged(int value)` calling
`analogWrite(...)`). A `datadisplay`/`onoffdisplay` item polls its pin every
`handle()` (or on its own timer, for an ADC) straight into its `_var`, no hook
needed at all — there's nothing to decide, only a pin to read.

**So for a plain pin-bound control, the generated default may already be
everything you need** — pin control, pulse timing, and ADC polling are
generated, not left for you. You only need to act when the request is *more*
than "drive this pin": an actuator behind an I²C expander instead of a raw
pin, validation, or a side effect beyond the pin write. Do that the same way
as every other hook in this guide — **override it in your `pfodMainMenu`
subclass** (§5.2), never edit the generated body in place:

```cpp
// in YOUR OWN file
class MyMainMenu : public pfodMainMenu {
  protected:
    virtual void onLedIsChanged(int value);
};
void MyMainMenu::onLedIsChanged(int value) {
  pfodMainMenu::onLedIsChanged(value);   // keep the generated pin/pulse handling
  logRelayEvent(value);                  // then add whatever extra behaviour was asked for
}
```

**Always locate the actual generated hook name and pin/var identifiers in the
file you were given before writing code** — they are stemmed from that item's
`autoCmd` (`pfodMenu_json-format.md` §5.1: `<autoCmd>` → cmd variable,
`<autoCmd minus _Cmd>_var` → value variable, `<autoCmd>_pin` → pin constant),
so they are predictable, but the exact hook method name (`onLedIsChanged`,
`onPwmSettingChanged`, ...) should be read from the generated header, not
guessed.

### 6.4 Charts

Every generated `pfodMainMenu::handle()` includes this unconditionally (seen
verbatim in every example in this repo, chart or not):

```cpp
} else if('@'==cmd) { // pfodApp requested 'current' time
  plot_msOffset = millis();
  clearPlot = true;
  parser.print(F("{@`0}"));
}
```

This is the chart time-sync handshake — leave it as generated.

For a `chart` menu item,
sampling gets exactly one hook, again a protected virtual named from the
chart's `text`, e.g. `chart_Voltage_Plot_readPlotData()` for a chart labelled
"Voltage Plot":

```cpp
// generated — CSV framing, scaling and the send timer are already complete:
void pfodMainMenu::chart_Voltage_Plot_sendData(pfodParser &parser) {
  if (chart_Voltage_Plot_plotDataTimer.justFinished()) {
    chart_Voltage_Plot_plotDataTimer.repeat();
    chart_Voltage_Plot_readPlotData();   // virtual hook — assigns the plot_N_var's, nothing else
    parser.print(millis() - plot_msOffset);
    parser.print(','); parser.print(((float)(chart_Voltage_Plot_plot_1_var - chart_Voltage_Plot_plot_1_varMin))
                                     * chart_Voltage_Plot_plot_1_scaling + chart_Voltage_Plot_plot_1_varDisplayMin);
    // ...one more parser.print(',') pair per active plot...
    parser.println();
  }
}

// the ONE hook meant for your logic:
void pfodMainMenu::chart_Voltage_Plot_readPlotData() {
  chart_Voltage_Plot_plot_1_var = analogRead(chart_Voltage_Plot_plot_1_pin);   // this plot HAD a pin in the JSON
  chart_Voltage_Plot_plot_2_var = chart_Voltage_Plot_plot_2_varMin; //<<< replace this Min value with your actual data
  chart_Voltage_Plot_plot_3_var = chart_Voltage_Plot_plot_3_varMin; //<<< replace this Min value with your actual data
}
```

**This is the one place in the whole sketch that genuinely pushes data
unprompted, and it's deliberate.** `chart_Voltage_Plot_sendData()` is *called*
every `handle()`, unconditionally — not from inside the `if (cmd != 0)` block,
so it runs whether or not a message just arrived — but it only actually
*writes* anything when its own `plotDataTimer.justFinished()` gate passes,
i.e. once per `chart_Voltage_Plot_PLOT_DATA_INTERVAL` (1 second here), not
every `loop()`. What it writes, on that timer, is plain CSV text, not a
`{...}` pfod message. That's a second, always-on channel specific to charts,
separate from the request/response menu/dwg protocol described in §6.2; it's
what lets the Raw Message Viewer and saved `.csv` files (`pfodWeb-guide.html`
§6) capture samples whether or not a chart view is even open, and — because it
isn't a `{...}` message — it isn't subject to either byte limit in §7 rule 11
either; stream as much CSV as you want. Don't generalise from this to menus
or dwgs — §6.2's "never push a `sendUpdate()` from `loop()`" rule, and the
1024-byte cap on whatever it does send, still apply to those, timer-gated or
not.

Note the `//<<<` inline marker — a narrower marker style alongside the
`.ino`'s `<<<<<<<<<` (§5.1): it flags one line inside an otherwise-complete
generated method, for a plot whose JSON carried no `pin`, so there was nothing
for the generator to wire up. There are further, differently-sized versions
of this same marker elsewhere — see §6.5 for the full list and consolidated
advice on finding all of them.

Override the hook the same way as any other (§5.2/§6.3) — subclass
`pfodMainMenu`, override `chart_Voltage_Plot_readPlotData()`, define
`get_pfodMainMenu()` — do not edit `chart_Voltage_Plot_sendData()`.

### 6.5 Sub-menus / multiple screens

A `submenu` item gets its own class, its own file pair, and its own
weak-factory accessor — the exact same pattern as a `Dwg_<Name>`, just for a
menu instead of a drawing. Evidence: `examples/pfodWeb/Menu_1/`'s `submenu`
item, `text: "Submenu"`, containing one `button` item, `text: "Submenu Button"`,
generates `SubMenu_Submenu.h`/`.cpp` (class name stemmed from the item text,
same idea as a dwg's `name`):

```cpp
class SubMenu_Submenu {
  public:
    SubMenu_Submenu();
    virtual void init();
    virtual void sendMenu(pfodParser &parser);         // fresh, on first open
    virtual void sendMenuUpdate(pfodParser &parser);   // cached refresh
    virtual bool handleCmd(pfodParser &parser, uint8_t cmd,
                            uint8_t *pfodFirstArg, long *pfodLongRtn);  // true = this sub-menu handled it
  protected:
    virtual void onSubmenuButtonPressed(pfodParser &parser); // must send a pfod response
    pfodAutoCmd button_Submenu_Button_Cmd; // button -- 'Submenu Button'
  private:
    bool initialized;
};

// generated in SubMenu_Submenu.cpp:
SubMenu_Submenu subMenu_Submenu;
SubMenu_Submenu& __attribute__((weak)) get_subMenu_Submenu() { return subMenu_Submenu; }
```

The **parent** (`pfodMainMenu`, or another `SubMenu_<Name>` for a nested
sub-menu — untested in this repo, but the same pattern) wires it in at three
points, all via the accessor, all in code you never touch — from
`pfodMainMenu.cpp`, unedited:

```cpp
void pfodMainMenu::init(pfodCloseConnectionPtr _closeConnectionFnPtr) {
  ...
  get_subMenu_Submenu().init();   // 1. chained into the parent's own init(), like an inserted dwg
}

void pfodMainMenu::handle(pfodParser& parser) {
  ...
    } else if(parser.cmdEquals(submenu_Submenu_Cmd)) {   // 2. the button that opens it
      if (!parser.isRefresh()) {
        get_subMenu_Submenu().sendMenu(parser);
      } else {
        get_subMenu_Submenu().sendMenuUpdate(parser);
      }
    } else if (get_subMenu_Submenu().handleCmd(parser, cmd, pfodFirstArg, &pfodLongRtn)) {
      // 3. catch-all AFTER every one of the parent's own item branches —
      //    delegates to the sub-menu's own items
  ...
}
```

Point 3 is the one genuine difference from how a `Dwg_<Name>` gets dispatched
(§6.1): a dwg touch is found automatically, by `pfodParser`'s own internal
loop over every registered drawing; a sub-menu's items are found by this
explicit, generated `else if` chain instead. There's no priority question
to resolve here: `autoCmd` must be unique across the *entire* design,
parent and every sub-menu alike (§3, §7 rule 10), so a name/cmd clash between
a parent item and a sub-menu item is rejected at design time and can't reach
this dispatch at all — the Designer won't produce it. Inside the sub-menu,
its own `handleCmd()` does the same kind of dispatch as the parent's
`handle()`, one `else if` per item — unedited
generated code:

```cpp
bool SubMenu_Submenu::handleCmd(pfodParser &parser, uint8_t cmd, uint8_t *pfodFirstArg, long *pfodLongRtn) {
  (void)cmd;
  if (false) {
    // never taken -- keeps every real branch below in a uniform "} else if" shape
  } else if(parser.cmdEquals(button_Submenu_Button_Cmd)) { // user pressed -- 'Submenu Button'
    onSubmenuButtonPressed(parser); // virtual hook -- must send a pfod response
    return true;
  }
  return false;
}
```

**A `button` item's hook is really the same "you must reply yourself"
contract as a dwg touch handler's `true` path (§6.1), just wired so that
path is the only one.** In §6.1, the hook signals which case applies by
returning `true` (already replied — go send it) or `false` (propagate,
someone else replies). Here, `handleCmd()` has already matched the cmd and
always treats it as handled — there's no `false`/propagate case for a button
— so the hook itself has nothing to signal; it just needs to do what a `true`
dwg handler does: **send the reply itself**, since nothing does it for you
afterwards. Contrast with an `onoff`/`pwm` hook (§6.3), which takes just the
changed value and returns `void` — there, the *generated* code sends
`sendMainMenuUpdate()` after the hook returns, so the hook itself never
touches `parser`. The generated default here, unedited:

```cpp
void SubMenu_Submenu::onSubmenuButtonPressed(pfodParser &parser) {
  // << add your action code here for this button
  parser.print(F("{}")); // change this return as needed.
}
```

That default satisfies §7 rule 5 (every message needs exactly one reply) with
a no-op `{}`, but does nothing else — a `button` press with no override is a
correctly-behaved dead button. To wire in real behaviour, override the hook
in your own subclass (§5.2/§5.3 mechanism, applied to `SubMenu_Submenu`) and
**make sure your override still sends something**:

```cpp
class MySubMenu_Submenu : public SubMenu_Submenu {
  protected:
    virtual void onSubmenuButtonPressed(pfodParser &parser);
};
void MySubMenu_Submenu::onSubmenuButtonPressed(pfodParser &parser) {
  doTheAction();
  parser.print(F("{}"));   // still required — this hook owns the reply, nothing else sends one
}
MySubMenu_Submenu mySubMenu_Submenu;
SubMenu_Submenu& get_subMenu_Submenu() { return mySubMenu_Submenu; }
```

The hook name follows a `on<ItemText>Pressed(pfodParser&)` pattern (button
text `"Submenu Button"` → `onSubmenuButtonPressed`) — visibly different from
`onoff`/`pwm`'s `on<ItemText>Changed(value)` (§6.3), since a button carries no
value to pass, only the fact that it was pressed. This is evidenced here for
a `button` *inside* a sub-menu; a top-level `button` item on `pfodMainMenu`
itself would very likely follow the identical pattern (same generator, same
per-item-type template), but that specific case isn't directly evidenced in
this repo — read the actual generated header you're given rather than
assuming the exact name.

Also note the `// <<` marker on the hook's placeholder line. Across this
guide the same idea appears with a different exact run of `<` characters each
time — the `.ino`'s setup marker uses nine (`<<<<<<<<<`, §5.1), the trailing
marker inside `pfodMainMenu::handle()` uses eleven (`<<<<<<<<<<<`, §5.2), the
chart plot placeholder uses three (`//<<<`, §6.4), and this one uses two.
Don't match on one exact string — search for a run of two or more `<`
characters in a comment.

**Subclassing otherwise follows §5.2/§5.3 exactly** — subclass
`SubMenu_Submenu`, override whichever hooks you need (`onSubmenuButtonPressed`
here; a data-carrying item inside a sub-menu would presumably get an
`on...Changed`-style hook the same way it does on `pfodMainMenu`, per §6.3),
instantiate it, and replace `get_subMenu_Submenu()` in your own file.

### 6.6 Setup/init ordering

Prefer doing hardware init inside your subclass's own overridden `init()`
(§5.2/§5.3), chaining to the base first — that is what `LedOnOffApp.cpp`'s
`MyMainMenu::init()` does, and it needs no `.ino` edit at all. If something
truly has no natural class home, extension point 1 in the `.ino` (§5.1) still
works, but it must still run **after** `init_pfodMainMenu(...)` — that call is
what walks the drawing tree and allocates each `pfodDwgs`; a drawing used
before its chain's `init()` has run has a null internal pointer
(`pfodDrawing.h`'s own warning: *"using it before init() dereferences
NULL"*).

---

## 7. Critical rules — checklist before you call it done

1. **Never edit a generated file's body to add logic — subclass instead
   (§5.2/§5.3).** Re-generating overwrites `pfodMainMenu.*` and every
   `Dwg_<Name>.*` wholesale; logic you added inside those files is gone. Logic
   placed in your own `<SketchName>App.cpp` (subclasses + `get_...()`
   overrides) survives a re-generate untouched, because nothing generated
   ever names your subclass — it only ever calls the accessor function. Two
   things can still break across a re-generate, and both are yours to fix,
   not avoid: (a) a **structural** design change (an item/touchZone/idxName
   added, removed or renamed) changes which virtual hooks exist, so your
   override's signature may no longer match anything to override — the
   compiler will tell you, loudly, rather than silently ignoring it; (b) the
   `.ino`'s own placeholders (credentials, extension points, rule 9 below) are
   regenerated too and need re-filling if you used them instead of a
   subclass.
2. **Define each `get_...()` accessor exactly once across the whole
   sketch, no matter how many files your logic is split across.** It is a
   plain (non-weak) function once you define it — a second definition
   anywhere, generated or not, is a duplicate-symbol link error, not a silent
   override of an override. This applies uniformly to `get_pfodMainMenu()`,
   every `get_dwg_<Name>()`, and every `get_subMenu_<Name>()` (§6.5). One
   combined file (`LedOnOffApp.cpp`) or one file per drawing (§4) are both
   fine; just don't define the same one's accessor in more than one of them.
3. **An override must chain to its base class method first**, not skip it —
   `pfodMainMenu::init(...)` / `Dwg_<Name>::init()` register the object with
   the parser and allocate its `pfodDwgs`; a full re-implementation instead of
   a call-through silently breaks that registration (§5.2/§5.3).
4. **Bump the `.ino`'s `version` string whenever you change what any
   `sendMainMenu()` / `sendFullDrawing()` transmits** (added/removed/reordered
   items, changed text/colour of anything not routed through
   `sendIndexedItems()`) — including a change made from inside an override.
   pfodWeb/pfodApp cache the menu/dwg keyed by this version; stale content
   otherwise sticks in the client until "Clear Dwg Cache" is used
   (`pfodWeb-guide.html` §2). Content sent from `sendIndexedItems()` alone
   does *not* need a version bump — that's the whole point of the
   indexed-item/update split (§5.3).
5. **Every parsed message must get exactly one reply**, or the app
   disconnects — this is why every generated `handle()` ends with a
   catch-all `parser.print(F("{}"))` and why a touch handler returning
   `false` still results in a reply via the fallback (§6.1). Never add a
   branch, or an override, that silently drops a message.
6. **Don't hand-assign `idx`/`cmd`/wire values.** Always address items via
   their `pfodAutoIdx`/`pfodAutoCmd` member (§5.6) — exactly mirroring the
   "write `idxName`/`cmdName`, never `idx`/`cmd`" rule in the dwg format doc.
7. **A drawing must have `init()` called (via its parent's `init()` chain,
   ultimately from `init_pfodMainMenu()`) before anything uses it.** Put your
   hardware setup after that call, not before (§6.6).
8. **Don't block in `loop()`.** `handle_mainMenu(parser)` must run every
   iteration for the connection to stay responsive; do timed/staged work with
   the library's own `pfodDelay` (`src/pfodDelay.h`), not raw `millis()`
   comparisons or `delay()`. This is what the generated code itself already
   uses for exactly this — `datadisplay_A0_Cmd_adcTimer` in §6.3,
   `chart_Voltage_Plot_plotDataTimer` in §6.4: `.start(ms)` once, then each
   `loop()` check `.justFinished()` and call `.repeat()` inside it to restart
   without drift (`.restart()` restarts from *now* instead — use that only for
   a one-shot, non-repeating delay).
9. **Replace every placeholder credential/name** (`ssid`/`password` for
   WiFi/HTTP, the BLE `localName`, any static IP) with real values before
   telling the user the sketch is ready — these are not marked with
   `<<<<<<<<<` but are just as much a required edit.
10. **When authoring or editing the JSON (stage 1), obey the two format docs'
    own numbered rule lists** (`pfodMenu_json-format.md` §7,
    `pfodDwg_json-format.md` §8) — most importantly: unique `autoCmd`
    across the whole menu design, unique `cmdName`/`idxName` per the sharing
    rules in the dwg doc §5.2, real JSON booleans, and colours in the format
    each file expects (menu = 16 short codes as strings; dwg = `-1`/0–255 as a
    number).
11. **A `{...}` message has a hard byte limit, and it's different in each
    direction.** Incoming — anything `pfodParser` on the device receives
    (a touch cmd, a `touchActionInput`'s typed text) — is capped at 255 bytes
    including the terminating null (`pfodMaxMsgLen` in `src/pfodParser.h`).
    Outgoing — anything pfodWeb/pfodApp receives from the device
    (`sendMainMenu()`, `sendFullDrawing()`, any `sendXxxUpdate()`) — is capped
    at 1024 bytes including the null. Neither limit fails loudly: a `{...}`
    message that runs over is automatically closed at the limit and parsed as
    far as it got, silently discarding everything after — content near the
    end of an oversized message doesn't error, it just never arrives. This
    matters most for `sendFullDrawing()` on a drawing with many indexed items
    or long label text, and for a `sendMainMenu()`/`sendMainMenuUpdate()` with
    many items — keep an eye on total size as a design grows, especially
    across several `insertDwg` levels. **Raw CSV chart data (§6.4) is exempt**
    — it's deliberately not sent as a `{...}` message, precisely so it isn't
    subject to either limit.

---

## 8. End-to-end checklist for AI to complete a new feature request

1. Read the request; decide menu items vs. dwg(s) using §3.
2. Write/edit the `.pfodMenu_json` (and any `.pfodDwg_json`) per the two
   format docs, choosing readable `autoCmd`/`cmdName`/`idxName` values (§3).
3. Validate mentally against each doc's "Rules an editor must obey" section
   and "What the loader does with bad data" section — fix anything that would
   be silently repaired or dropped on load.
4. Hand the file(s) to the user to import via pfodWeb.html → Designer →
   select board → Generate (stage 2 — you cannot perform this step).
5. In the generated output, read (never edit) every `Dwg_<Name>.h`,
   `SubMenu_<Name>.h` and `pfodMainMenu.h` for the `virtual` hooks and the
   `get_...()` accessor each offers (§5.2/§5.3/§6.5) — that is the complete
   list of extension points for this sketch.
6. Create the file(s) for your own logic (§4) — one combined
   `<SketchName>App.cpp`, or one file per drawing if it should be reusable
   across sketches. For each generated class you need to customise: a small
   subclass overriding only the hooks it needs and chaining to the base first
   (§7 rule 3), one instance, and one `get_...()` override replacing the weak
   default (§5.2/§5.3). These are the only files you write.
7. Implement the hardware/business logic inside those overrides only — touch
   handlers per §6.1, live state via `sendIndexedItems()` per §6.2,
   `onoff`/`pwm`/`datadisplay`/chart hooks per §6.3/§6.4, `button`/sub-menu
   hooks per §6.5 (note its different reply contract — the hook must send the
   reply itself, nothing does it for you afterwards). Fill in any placeholder
   credentials in the `.ino` (§7 rule 9) — that file is still edited directly,
   it just needs no logic added.
8. Bump `version` in the `.ino` if you changed anything a `sendFullDrawing()`/
   `sendMainMenu()` transmits outside of `sendIndexedItems()` (§7 rule 4).
9. Tell the user what you changed and why. Re-running Generate afterwards is
   safe (§1, §7 rule 1) — it only touches files you didn't write — but flag
   the two things worth re-checking after: whether the design change was
   structural enough to need an override's signature updated, and that the
   regenerated `.ino`'s placeholders (credentials, extension points) get
   re-filled if that's where they were put.

---

*(c)2026 Forward Computing and Control Pty. Ltd.*
