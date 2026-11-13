# pfodParser — AI Guide to Utility Classes (`pfodDelay`/`millisDelay`, `pfodCircularLineBuffer`)

Audience: an AI writing or reviewing Arduino/C++ sketch code against this
library, that needs either of two small, general-purpose utility classes
this library bundles: a non-blocking "is it time yet?" timer (§1-5), or a
rolling/line-aware byte buffer with a `Stream`/`Print` interface (§6).

**This is not the library's design/generate/complete guide.** For building
a pfod menu/dwg design, running the pfodWeb Designer, and completing the
generated `pfodMainMenu`/`Dwg_<Name>` code, read
[`pfodWeb/docs/pfodAI-guide.md`](pfodWeb/docs/pfodAI-guide.md) instead —
that document covers the whole three-stage workflow and its own rules
(never modify library code, ask before adding a dependency, build only what
was asked). This guide covers two narrow, frequently-needed pieces that
document doesn't: **timing** (§1-5) and **rolling/streamed byte buffering**
(§6). The same "never modify library code" rule applies to both — see §7.

§1-5 are drawn from `src/pfodDelay.h/.cpp` and the four worked sketches in
`examples/pfodDelay_Examples/`. The canonical write-up, with more worked
examples than either of those, is Forward Computing's own tutorial:
<https://www.forward.com.au/pfod/ArduinoProgramming/TimingDelaysInArduino.html>
— read it if anything here is ambiguous; this guide's API and idiom follow
it exactly. §6 is drawn from `src/pfodCircularLineBuffer.h/.cpp` and a real
worked consumer, `BatterySolarMonitor/DebugLogBuffer.h/.cpp` (a separate
project in this same workspace, not part of this library, but the concrete
case the resumable-cursor API in §6.5 was built to solve). §6.8 covers the
same class in pfodParserCPP, the plain C++ (non-Arduino) port of this library.

---

## 1. Why not a plain `millis()` comparison

The obvious hand-rolled version looks like this, and it is a real, common
bug, not a style nitpick:

```cpp
unsigned long nextDueMs = 0;
...
void loop() {
  if (millis() < nextDueMs) {
    return; // not due yet
  }
  ... do the thing ...
  nextDueMs = millis() + INTERVAL_MS;
}
```

`millis()` **overflows** (wraps back to 0) after roughly 49.7 days of
continuous uptime. `nextDueMs` is a stored target that stays a large
pre-wrap value while `millis()` itself resets near 0 — so `millis() <
nextDueMs` reads "not due yet" for a long stretch after the wrap, silently
stalling whatever this timer drives for potentially weeks, with no crash
and no error to notice it by. It is exactly the kind of bug that never
shows up on the bench (nobody soak-tests for 49 days before shipping) and
only shows up on a device that has been running unattended for a long
time — which, for anything solar/battery/home-automation related, is
every device, always.

`pfodDelay`/`millisDelay` exist specifically to make this class of bug
impossible: internally they compare via **subtraction** —
`(millis() - startTime) >= mS_delay` — which is wraparound-safe by the
unsigned-arithmetic identity that makes `(a - b)` come out correct even
when `a` has wrapped past `b`. You never need to reason about the wrap
yourself; use the class and it's handled.

**Use `pfodDelay`/`millisDelay` for every recurring "is it due yet?"
timer.** The only comparisons that may stay as plain `millis()` are
one-time, first-`N`-seconds-of-uptime boot gates that latch permanently
true via their own flag before 49.7 days could ever be reached (e.g. "wait
20s after boot before the first NTP-dependent fetch") — those are
structurally unreachable to the wraparound bug, not exceptions to the
rule.

---

## 2. Two names, one class — which header to include

| Class | Header | Library | When to use it |
|---|---|---|---|
| `pfodDelay` | `<pfodDelay.h>` | **This library** (`src/pfodDelay.h/.cpp`) | Default choice in any sketch that already depends on `pfodParser` — no extra library to add. |
| `millisDelay` | `<millisDelay.h>` | Forward Computing's separate **SafeString** library | Only if the sketch already depends on SafeString for something else, or isn't using pfodParser at all. |

They are **the same class under two names** — identical public API, same
private fields (`pfodDelay` even keeps SafeString's field-naming style),
same semantics, both implement the same tutorial. `pfodDelay` is this
library's own bundled copy, provided so a pfodParser sketch gets a
wraparound-safe timer without pulling in SafeString as a second
dependency. **Do not add SafeString to a pfodParser sketch just to get
`millisDelay` — use `pfodDelay`, it is already there.** If you are ever
reading or writing code against SafeString directly, the exact same
guidance in this document applies to `millisDelay`; just substitute the
class name and header.

---

## 3. API reference

```cpp
#include <pfodDelay.h>
pfodDelay myTimer; // one instance per independent timer, usually a static/global
```

| Method | Does |
|---|---|
| `start(unsigned long delay)` | Arms the timer for `delay` ms from **now**. `delay == 0` is a documented special case: `justFinished()` returns `true` the very next time it's called — see §5's "fire immediately" idiom. |
| `stop()` | Disarms it. `justFinished()` will never return `true` again until `start()`, `restart()` or `repeat()` is called. |
| `repeat()` | Re-arms for the *same* delay, but from the timer's **previous target** (`startTime += mS_delay`), not from now. Use this to re-arm a regular repeating timer right after `justFinished()` returns `true` — see §5's drift note. |
| `restart()` | Re-arms for the same delay, starting from **now** (`start(delay())`). Use when the delay should reset relative to some fresh event, not the old schedule. |
| `finish()` | Forces the timer to end **early** — the *next* `justFinished()` call returns `true` regardless of elapsed time. |
| `justFinished()` | **The one you check every call.** Returns `true` exactly once, the first time it's called after the delay has elapsed (or after `finish()`). Calling it also stops the timer (`isRunning()` becomes `false` after a `true` return) — that's what makes `repeat()`/`restart()` necessary to keep a recurring timer going. |
| `isRunning()` | `true` if the timer is currently armed and will (eventually) make `justFinished()` return `true`. **Query only — see §4 for why this must never gate `justFinished()`.** |
| `getStartTime()` | The `millis()` value at the last `start()`/`repeat()`/`restart()`. `0` if never started. |
| `remaining()` | ms left until due; `0` if already finished or stopped. Doesn't mutate state — safe to call for a progress readout without disturbing `justFinished()`'s own bookkeeping. |
| `delay()` | The delay value last passed to `start()` (or carried forward by `repeat()`/`restart()`). |

---

## 4. The one rule that matters: how `justFinished()` must be called

> **`justFinished()` must be checked unconditionally, at the outermost
> level, on every single pass of `loop()` (or whatever task loop owns this
> timer) — never folded into a compound condition, and never nested inside
> other gating logic that could skip calling it on some passes.**

This is the single most common mistake, and it looks harmless because it
often still *works* in testing. The wrong shape:

```cpp
// WRONG — do not write this
if (myTimer.isRunning() && !myTimer.justFinished()) {
  return;
}
```

Why it's wrong, beyond "it's not the documented idiom": `justFinished()`
is **edge-triggered and stateful** — it returns `true` exactly once, and
that one call is also what stops the timer. Burying it inside a
short-circuiting `&&` means there exist code paths where `isRunning()` is
`false` and `justFinished()` is never evaluated at all on that pass — for
a one-shot timer that's usually harmless, but the pattern trains you to
write the same thing for cases where it isn't (a timer another branch
might stop, or one whose "just expired" edge you need to react to exactly
once). The tutorial's own wording: `justFinished()` "must be called every
loop and ... at the outer most level ... not inside another `if()` `while()`
`case()` etc statement. It can be inside a method call as long as that
method is called every loop."

The correct shapes, straight from the tutorial and from every example in
`examples/pfodDelay_Examples/`:

```cpp
// Reacting to expiry — outermost, unconditional:
if (myTimer.justFinished()) {
  // do the thing
}
```

```cpp
// Bailing out until due — same check, inverted, still outermost:
if (!myTimer.justFinished()) {
  return;
}
// do the thing
```

**Arming a timer is a separate, unconditional check of its own — never
combined with the `justFinished()` check above:**

```cpp
if (!myTimer.isRunning()) {
  myTimer.start(INTERVAL_MS); // (or start(0) -- see §5)
}
if (!myTimer.justFinished()) {
  return;
}
```

`isRunning()` is for questions like "should I print a different message
depending on whether this is still counting down" (see
`SingleDelay.ino`'s `F` branch, which checks `isRunning()` purely to
choose a log line — it never touches `justFinished()`'s own control flow)
— not for deciding whether to evaluate `justFinished()`.

---

## 5. Recipes

### 5.1 One-shot delay (do X, then Y once some time later)

```cpp
static pfodDelay ledDelay;

void onSomeEvent() {
  digitalWrite(LED_PIN, HIGH);
  ledDelay.start(10000); // 10s from now
}

void loop() {
  if (ledDelay.justFinished()) {
    digitalWrite(LED_PIN, LOW);
  }
}
```

Ground truth: `examples/pfodDelay_Examples/SingleDelay/SingleDelay.ino`.
Nothing arms this timer up front — it only starts in response to an
external trigger (there, a serial command). `justFinished()` is still
checked unconditionally every `loop()`, and simply never fires until
something has called `start()`.

### 5.2 Poll every N ms, first check fires immediately

The common shape for a background poll job (fetch a sensor, hit an API)
that should run once as soon as it's first ticked, then on a fixed
interval after that — no separate "has this ever run" flag needed:

```cpp
static pfodDelay pollTimer;

void checkPoll() {
  if (!pollTimer.isRunning()) {
    pollTimer.start(0); // 0 => justFinished() reads true on the very next check
  }
  if (!pollTimer.justFinished()) {
    return;
  }

  bool ok = doTheFetch();

  unsigned long nextDelay = ok ? POLL_INTERVAL_MS : RETRY_DELAY_MS;
  pollTimer.start(nextDelay); // re-arm for the next cycle
}
```

Why `start(0)` and not some other bootstrap trick: it's a documented
special case (`start()`'s own doc comment: `delay == 0 means
justFinished() returns true on first call`), so the very first call to
`checkPoll()` fires the fetch immediately, and every call after that
follows the real interval. 

### 5.3 Regular repeating timer, no drift (`repeat()`)

`RepeatingDelay.ino` flashes an LED on a fixed period. The key call is
`repeat()`, not `start()` again:

```cpp
static pfodDelay ledDelay;
static bool ledOn = false;

void startFlashing() {
  ledDelay.start(FLASH_TIME);
  ledOn = true;
  digitalWrite(LED_PIN, HIGH);
}

void loop() {
  if (ledDelay.justFinished()) {
    ledDelay.repeat(); // NOT start(FLASH_TIME) again -- see below
    ledOn = !ledOn;
    digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
  }
}
```

`repeat()` re-arms from the **previous target time**
(`startTime = startTime + mS_delay`), not from whatever `millis()` happens
to be when `repeat()` is actually called. If `loop()` gets delayed a few ms
by other work before it gets around to checking `justFinished()`, that
delay does not accumulate cycle over cycle — the schedule stays locked to
the original period. Calling `start(FLASH_TIME)` again instead would
re-arm from "now", and now silently drifts later by however late each
`loop()` pass happened to be, cycle after cycle. Use `repeat()` for
anything that should tick on a steady clock (a metronome, a fixed sample
rate); use `restart()` (or a fresh `start()`) when the delay is meant to
reset relative to a real external event instead (e.g. re-arming a
"user has been idle for N seconds" timer every time real activity is
seen — there is no "previous schedule" worth preserving).

### 5.4 Force an early finish (`finish()`)

```cpp
if (userCancelled) {
  ledDelay.finish(); // next justFinished() call returns true right away
}
```

`finish()` doesn't itself make `justFinished()` return `true` — it flags
that the *next* call should. `PrintDelay.ino` and `SingleDelay.ino`'s `F`
command both demonstrate this: calling `finish()` while a delay is not
even running is harmless (there's nothing to finish early), and calling it
while running lets the very next unconditional `justFinished()` check pick
it up exactly like a natural expiry — no separate "was it cancelled"
branch needed at the call site that reacts to it.

---

## 6. `pfodCircularLineBuffer` — a rolling, line-aware byte buffer

### 6.1 What it's for

`pfodCircularLineBuffer` (`src/pfodCircularLineBuffer.h/.cpp`) is a
fixed-size ring buffer, allocated once at construction
(`new uint8_t[bufferSize]`, freed only in the destructor — never resized),
that implements Arduino's `Stream` **and** `Print` interfaces. Two things
make it more than a plain byte ring:

- **Complete lines only.** It was written to serve CSV lines, where a
  partial line is wrong data, so a reader never sees a partial line:
  - a line is only available to read once it is complete (its `\n` has
    been written) — readers only see data up to the end of the last
    complete line;
  - when it's full and a new byte needs room, it discards the oldest
    complete line as a whole (up to and including its `\n`), so a reader
    never sees a line missing its first few characters;
  - a line too long for the buffer (more than `bufferSize - 1` bytes,
    including its `\n`) is never served: once it fills the buffer by
    itself its bytes are discarded, and the rest of it, up to and
    including its `\n`, is ignored. The line `PFOD_LINE_DROPPED_MARKER`
    (`**line_dropped**\r\n`, 18 bytes) is stored in its place, so readers
    can see a line was lost. Older lines discarded to make room for it
    while it was being written are not restored. Size the buffer larger
    than the longest line. The buffer size is at least
    `PFOD_CIRCULAR_LINE_BUFFER_MIN_SIZE` (20), smaller sizes are increased
    to that, so the marker always fits.
- **Whole-line reads.** `nextLineLength()` gives the length of the next
  complete line before reading it, `readLine(out)` reads it whole, and
  `skipLine()` steps over it. A reader with limited room of its own should
  only read a line if all of it fits, and if a line can *never* fit (longer
  than the reader's whole capacity) it should `skipLine()` it and write
  `PFOD_LINE_DROPPED_MARKER` instead (§6.6, §6.7). So the reader's capacity
  must be at least `PFOD_LINE_DROPPED_MARKER_LEN` (18) bytes, otherwise it
  can never write the marker and stays stuck on that line.
  `ESP_PicoW_pfodWebServer.cpp`'s per-response raw-data drain does exactly
  this (whole lines up to `MAX_RAW_DATA_PER_RESPONSE`, 2048 bytes). The
  `Stream` methods `available()`/`read()`/`peek()` still read byte by
  byte; they can't be stopped from reading part of a line, so use the line
  methods wherever the reader has limited room.


- **Two independent ways to read it** (§6.3): a one-shot "give me
  everything currently held" snapshot, and a genuinely resumable cursor
  that can come back later, across arbitrarily many separate calls over
  time, and continue exactly where it left off.

Real uses in this workspace: `pfodParser/src/ESP_PicoW_pfodWebServer.cpp`'s
`httpRawData` (a 4K instance, the live "raw data" relay pfodWeb screens
poll) and `BatterySolarMonitor/DebugLogBuffer.cpp`'s `debugLogBuffer` (a
16K instance capturing every debug line the sketch logs, drained into the
smaller relay above via the resumable cursor — §6.7 walks through this
exact pattern (§6.6 has a simpler, single-task version first).

### 6.2 Writing: `write()`/`addLine()`, and what counts as a line ending

```cpp
#include <pfodCircularLineBuffer.h>
pfodCircularLineBuffer myBuffer(8192); // size fixed at construction, default 4096
```

Being a `Print`, anything that writes text can target it directly —
`myBuffer.print(...)`, `myBuffer.println(...)`, or plain
`myBuffer.write(uint8_t)`/`write(buffer, size)` — as well as the two
`addLine()` overloads (`const char*`/`const String&`), which are just a
`print()` call under another name.

**A line ends on `\n`** — bare, or as the second byte of a `\r\n` pair
(either way counted as exactly one line, never two). **A lone `\r`, not
immediately followed by `\n`, is not treated as a line ending at all** —
it's just an ordinary byte. This covers both Unix/macOS-style bare `\n`
text and Windows/network-protocol-style `\r\n` text identically; it does
not support the old Classic-Mac-OS convention of a lone `\r` as its own
line ending, since that convention is legacy-only today
.

Bytes written after the last `\n` are a partial line: they are stored but
not readable until the `\n` arrives. So text that never ends in `\n` (a
final `print()` without `println()`) is never served.

### 6.3 Two ways to read

**A. One-shot: read everything currently held, right now.**

```cpp
myBuffer.resetForRead();          // read range = [oldest held byte, end of newest complete line]
while (myBuffer.available()) {
  out.write((uint8_t)myBuffer.read());
}
```

`resetForRead()` is `getAllRange(range); setReadRange(range);` under the
hood — it always starts from the buffer's current oldest byte. Calling it
again later does **not** mean "give me what's new since last time" — it
means "start over from the oldest byte still held," which on a buffer
that's been running long enough to be full again will re-deliver almost
everything, not just the new part. Use this mode only for a genuine
one-off "dump everything, once" (e.g. `httpRawData`'s own per-poll drain in
`ESP_PicoW_pfodWebServer.cpp`, which reads it all and immediately
`clear()`s it every time).

**B. Resumable: come back later and continue exactly where you left off.**

```cpp
static pfodReadCursor myCursor = PFOD_CURSOR_START; // persisted across calls

myBuffer.setReadCursor(myCursor);          // resume from myCursor, to the end of the newest complete line
size_t len;
while ((len = myBuffer.nextLineLength()) > 0 /* && whatever other budget applies, by whole lines */) {
  myBuffer.readLine(out);                  // one whole line
}
myCursor = myBuffer.getReadCursor();       // save progress for next time -- ALWAYS, even if you read 0 bytes
```

`pfodReadCursor` is an opaque value (internally an absolute write-count,
not a raw buffer index, added 2026-09-21 specifically so a stale cursor
can be told apart from a fresh one *exactly*, not by guessing from wrapped
positions). `PFOD_CURSOR_START` is the sentinel for "nothing read yet" —
pass it the first time, or any time you want to force a restart from the
oldest held byte (see §6.7's button-press example). If the data at a
remembered cursor has genuinely been evicted since it was captured,
`setReadCursor()` falls back to the oldest still-held byte automatically —
it never reads stale or out-of-range memory.

### 6.4 API reference

| Method | Does |
|---|---|
| `write(uint8_t)` / `write(buf, size)` / `print(...)` family | Appends bytes (`Print` interface); a line becomes readable at its `\n`; evicts the oldest complete line to make room when full; discards a line too long for the buffer (§6.1). |
| `addLine(const char*)` / `addLine(const String&)` | `print()` under another name — line must include its own terminator. |
| `nextLineLength()` / `readLine(Print& out)` / `skipLine()` | Whole-line reads from the current read range: length of the next complete line (incl. its `\n`, 0 if none), read it whole into `out`, or step over it. Use these when the reader has limited room (§6.1). |
| `available()` / `read()` / `peek()` | `Stream` interface — byte by byte, operate on whatever the *current read range* is, set by whichever of §6.3's two modes you last called. |
| `PFOD_LINE_DROPPED_MARKER` / `PFOD_LINE_DROPPED_MARKER_LEN` / `PFOD_CIRCULAR_LINE_BUFFER_MIN_SIZE` | `**line_dropped**\r\n` (18 bytes), stored or written in place of a line too long for its buffer; the minimum buffer size (20). |
| `resetForRead()` | One-shot: read range = all the complete lines currently held, starting from the oldest byte. See §6.3A. |
| `getAllRange(range)` / `setReadRange(range)` | Lower-level range primitives `resetForRead()` builds on; `BufferRange` is just `startPos`/`endPos`. |
| `setReadCursor(cursor)` / `getReadCursor()` | Resumable read pair. See §6.3B and the contract in §6.5. |
| `getUsedBytes()` / `getAvailableBytes()` / `getBufferSize()` | Capacity queries, counting any partial line being written — none of these mutate state. |
| `isEmpty()` | `true` if there are no complete lines to read. |
| `clear()` | Resets to empty, including any partial line. Does not free/reallocate memory. |
| `debugBufferRange(Print*)` | Dumps internal head/tail/lineEndPos/read-position state for debugging — pass `nullptr` to no-op. |

### 6.5 The cursor contract (§6.3B) — get this wrong and it silently misbehaves

> **Every `setReadCursor()` call must be followed by a `getReadCursor()`
> call before you do anything else with that cursor variable — even if you
> read zero bytes that round.** Never mix cursor-based reads (§6.3B) with
> `resetForRead()`/`setReadRange()` (§6.3A) on the *same instance* for two
> different logical read sequences — both write the same internal
> position fields, and whichever call happened most recently wins.

Why the pairing matters: `setReadCursor()` keeps its own internal
bookkeeping bounded by periodically rebasing it (see the class's own doc
comment on `pfodReadCursor` for the exact mechanism) — that rebase is only
ever transparent to a caller that refreshes its stored cursor every single
round-trip. A cursor value held across many `setReadCursor()` calls without
an intervening `getReadCursor()` isn't a supported usage pattern.

Also: like every class in this library, **there is no internal locking**.
If more than one task can touch the same instance — writing from a
background task while another task reads it, say — you must serialize
that access yourself (a mutex around every `write()` and every
`setReadCursor()`/`read()`/`getReadCursor()` sequence). `debugLogLineMutex()`
in `BatterySolarMonitor/DebugLogBuffer.cpp` is a worked example of exactly
this.

### 6.6 Recipe: a minimal resumable log drain (the typical case)

The simplest realistic use of §6.3B, with no locking or second buffer
involved — one task both writes and reads, and just wants a rolling log it
can drain incrementally instead of re-reading the whole thing every time:

```cpp
#include <pfodCircularLineBuffer.h>

// 8K rolling buffer capturing everything logged via logLine() below.
static pfodCircularLineBuffer logBuffer(8192);

// Persisted across calls -- this is the whole trick. Starts at the
// sentinel so the very first drain reads from the oldest held byte.
static pfodReadCursor cursor = PFOD_CURSOR_START;

// Call this instead of Serial.println() for anything you want captured.
// println() (Print's own default) appends '\r\n' -- fine here, §6.2's
// fix means the class treats that exactly the same as a bare '\n'.
void logLine(const String &line) {
  logBuffer.println(line);
}

// Call this every loop() -- delivers whatever's newly available in
// logBuffer to Serial, picking up exactly where it left off last time.
void drainNewLogLines() {
  logBuffer.setReadCursor(cursor);
  while (logBuffer.readLine(Serial) > 0) {
    // one whole line per call, Serial has no room limit so no length check needed
  }
  cursor = logBuffer.getReadCursor(); // ALWAYS save progress, even if nothing was read
}

void setup() {
  Serial.begin(115200);
}

void loop() {
  static unsigned long lastLog = 0;
  if (millis() - lastLog >= 1000) {
    lastLog = millis();
    logLine("tick at " + String(millis()));
  }
  drainNewLogLines();
}
```

`logLine()` is the producer — called at whatever rate, from wherever,
accumulating in `logBuffer`. `drainNewLogLines()` is the consumer, called
unconditionally every `loop()`: the `setReadCursor(cursor)`/
`getReadCursor()` pair means each call only sees bytes written since the
*last* call, forever, without re-reading the whole buffer each time. To
force a full re-show of the backlog (e.g. a client just connected and
wants history, not just new lines from now on), reset
`cursor = PFOD_CURSOR_START;` once, right before the next
`drainNewLogLines()` call — that's the only other thing ever done with the
cursor. No locking needed here specifically because one single task does
both the writing and the reading — see §6.7 for the case where that's not
true.

### 6.7 Recipe: draining a big rolling buffer into a small relay, forever

The concrete problem `pfodReadCursor` exists for: you have a big rolling
buffer (say 16K of captured history) that needs to reach a client through
a much smaller live relay buffer (say 4K), and delivery needs to keep
working indefinitely — not just once — as new data keeps arriving, and
(unlike §6.6) the writer and the reader are on different tasks. Ground
truth: `BatterySolarMonitor/DebugLogBuffer.cpp`.

```cpp
static pfodCircularLineBuffer bigBuffer(16384);
static pfodReadCursor cursor = PFOD_CURSOR_START;
static const size_t HEADROOM = 100; // leave this much room in the relay for OTHER writers, if any

// Call every loop(), unconditionally, forever -- not just until some
// initial delivery finishes. A no-op call (nothing new, or the relay's
// already full up to the headroom) costs almost nothing.
void pump(pfodCircularLineBuffer &relay) {
  bigBuffer.setReadCursor(cursor);
  size_t len;
  while ((len = bigBuffer.nextLineLength()) > 0) {
    size_t room = relay.getAvailableBytes();
    room = (room > HEADROOM) ? room - HEADROOM : 0;
    if (len > relay.getBufferSize() - 1 - HEADROOM) { // can never fit in the relay
      if (room < PFOD_LINE_DROPPED_MARKER_LEN) break; // no room for the marker yet
      bigBuffer.skipLine();
      relay.print(PFOD_LINE_DROPPED_MARKER);
      continue;
    }
    if (len > room) break;                // whole line doesn't fit yet, next call
    bigBuffer.readLine(relay);            // whole line
  }
  cursor = bigBuffer.getReadCursor(); // ALWAYS, even if the while loop above did nothing
}

// Call when a client explicitly asks to see the full history again
// (e.g. a button press opening a fresh view) -- forces a restart instead
// of "only what's new since last time":
void onViewerOpened() {
  cursor = PFOD_CURSOR_START;
  pump(relay);
}
```

Copying whole lines only also stops another writer's bytes
landing in the middle of a line this pump only half copied. The relay must
be bigger than `HEADROOM + PFOD_LINE_DROPPED_MARKER_LEN`, so the marker can
always eventually be written.

The `HEADROOM` margin matters if the relay could ever have more than one
writer: `pfodCircularLineBuffer::write()`, asked to write into an
already-full buffer, evicts the oldest complete line to make room —
if this pump filled the relay to 0 available bytes, ANY other writer
landing before the relay is next drained would evict this pump's own
just-written, not-yet-delivered bytes. Leaving headroom means another
writer always has somewhere to go without clawing back space from data
that hasn't reached its destination yet. If the relay genuinely has only
one writer (this pump), the margin is just cheap insurance, not an active
requirement.

### 6.8 The same class in pfodParserCPP (plain C++, non-Arduino)

pfodParserCPP, the plain C++ port of this library for non-Arduino micros
(ESP-IDF, STM32Cube, nRF5 SDK, Zephyr, Pico SDK, ...), has the same
`pfodCircularLineBuffer` (`pfodParserCPP/src/pfodCircularLineBuffer.h/.cpp`)
with the same behaviour and API: complete lines only, whole-line eviction,
the `**line_dropped**` marker and minimum size (§6.1), `\n` / `\r\n` line
endings (§6.2), both ways to read including the resumable cursor
(§6.3 — `pfodReadCursor`, `PFOD_CURSOR_START`, `setReadCursor()`,
`getReadCursor()`), the whole-line reads `nextLineLength()` / `readLine()` /
`skipLine()`, and the same cursor contract (§6.5). Everything in §6.1-6.7
applies, with these differences:

| Arduino pfodParser | pfodParserCPP |
|---|---|
| `#include <pfodCircularLineBuffer.h>` | `#include "pfodCircularLineBuffer.h"`, with pfodParserCPP's `src/` on the include path |
| implements Arduino `Stream` / `Print` | implements `pfodStream` / `pfodPrint` (pfodParserCPP's own plain C++ equivalents) |
| `readLine(Print& out)`, `debugBufferRange(Print*)` | `readLine(pfodPrint& out)`, `debugBufferRange(pfodPrint*)` |
| `addLine(const char*)` and `addLine(const String&)` | `addLine(const char*)` only (no Arduino `String`); `print()`/`println()` also work |
| `Serial` etc. as the reader's output | your board's `pfodStream`, e.g. the examples' `target_Stream`, or a `pfodStreamString` |

§6.6's drain, in pfodParserCPP (`serialStream` being the board's
`target_Stream`, as in the pfodParserCPP examples' `main.cpp`):

```cpp
#include "pfodCircularLineBuffer.h"

static pfodCircularLineBuffer logBuffer(8192);
static pfodReadCursor cursor = PFOD_CURSOR_START;

void logLine(const char* line) {   // line without its line ending
  logBuffer.print(line);
  logBuffer.println();             // "\r\n", one line ending (§6.2)
}

void drainNewLogLines() {          // call every loop()
  logBuffer.setReadCursor(cursor);
  while (logBuffer.readLine(serialStream) > 0) {
    // one whole line per call
  }
  cursor = logBuffer.getReadCursor(); // ALWAYS save progress, even if nothing was read
}
```

As in the Arduino library there is no internal locking (§6.5): on an RTOS
(ESP-IDF, Zephyr, ...), if one task writes while another reads, guard every
`write()`/`print()` and every `setReadCursor()`...`getReadCursor()` sequence
with your own mutex.

---

## 7. Never modify library source files

Same rule for both classes in this guide, and every other file under
`src/` in this library (see `pfodWeb/docs/pfodAI-guide.md` §"Both: never
modify the pfodParser library"): `pfodDelay.h/.cpp` and
`pfodCircularLineBuffer.h/.cpp` are shared across every sketch on the
machine, get overwritten by the next library update, and a sketch that
depends on a locally-patched copy is not portable. If either class is
genuinely missing something, use it as-is and build the missing behaviour
in your own code (a wrapper, an extra field beside your instance), or
report the gap rather than patching the library file.
