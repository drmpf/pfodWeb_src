# pfodWeb Arduino Example Sketches

The `examples/` directory contains eight Arduino sketches that act as **pfodDevices** for
[pfodWeb](../README.md). Each one demonstrates a different connection type (Serial, BLE, TCP/IP,
HTTP) and a different level of complexity, from a single "Hello World" drawing up to a full
multi-screen demo of different pfod menu items.

The BLE and TCP/IP versions also work unchanged with the Android **pfodApp**, since both clients speak the same
[pfod protocol](https://www.pfod.com.au/).

---

## Quick reference — sketches and the micros they compile for

| Sketch | Connection | Compiles for | Notes |
|---|---|---|---|
| `demoScreens_serial` | Serial @ 115200 | Any board with `Serial` | Uno or higher - Full demo over Serial |
| `demoScreens_tcpip` | TCP/IP, port 4989 | **ESP8266, Pi Pico W, Pi Pico 2W, ESP32, ESP32-C3** | Full demo over WiFi Needs WiFi credentials. Connects to pfodApp as well |
| `demoScreens_http` | HTTP (port 80) **and** TCP/IP (port 4989) at the same time | **ESP8266, Pi Pico W, Pi Pico 2W, ESP32, ESP32-C3** | Full demo, Needs WiFi credentials. Can optionally serve pfodWeb itself from LittleFS |
| `Hello_World_serial` | Serial @ 115200 | Any Arduino board with a `Serial` port | Trivial Display |
| `LedOnOff_serial` | Serial @ 115200 | Any board with `Serial` and `LED_BUILTIN` | Has an `#ifdef ESP8266` LED-polarity switch |
| `LedOnOff_ble` | BLE (Nordic UART service) | **ESP32, ESP32-C3** | Needs ≥2 MB APP partition. Connects to pfodApp as well |
| `LedOnOff_tcp` | TCP/IP, port 4989 | **ESP8266, Pi Pico W, Pi Pico 2W, ESP32, ESP32-C3** | Needs WiFi credentials |
| `LedOnOff_http` | HTTP, port 80 | **ESP8266, Pi Pico W, Pi Pico 2W, ESP32, ESP32-C3** | Can optionally serve pfodWeb itself from LittleFS |


### "Compiles for" in more detail

* **Serial examples** (`Hello_World_serial`, `LedOnOff_serial`, `demoScreens_serial`) contain no
  processor-specific code beyond `LED_BUILTIN`, so they build for AVR (UNO/Nano/Mega), ESP32,
  ESP8266, Pi Pico and anything else with a `Serial` stream. The `// Board:` comment at the top of
  a generated sketch only records which board was selected in the pfodWeb Designer when the code
  was generated — it is not a restriction.
* **WiFi examples** need a networked core, so they are limited to ESP8266, ESP32/ESP32-C3 and the
  WiFi-capable Raspberry Pi Pico W / Pico 2W. They rely on `ESP_PicoW_pfodWebServer.h` /
  `ESP_PicoW_pfodAppServer.h` from the pfodParser library, which cover exactly those families.
* **The BLE example** is ESP32-only: it uses `BLEDevice.h`/`BLEServer.h`/`BLE2902.h` and FreeRTOS
  semaphores from the ESP32 core.

---

## Required libraries

Install from the Arduino Library Manager, or from
<http://www.forward.com.au/pfod/pfodParserLibraries/index.html>.

| Library | Used by | Provides |
|---|---|---|
| **pfodParser** V5.1.0+ | all sketches | `pfodParser.h`, `pfodDwgs.h`, `pfodDrawing.h`, `pfodDebugPtr.h`, `pfodBLEBufferedSerial.h`, `ESP_PicoW_pfodWebServer.h`, `ESP_PicoW_pfodAppServer.h`, `pfodDelay.h` |

---

## Connecting from pfodWeb

Open `pfodWeb.html` in a browser (from the `pfodWeb/` directory of this repo, or from the
`pfodWeb` sub-directory of the pfodParser library), then:

| Connection | Steps |
|---|---|
| **Serial** | Select *Serial*, follow the on-screen instructions to start **pfodProxy**, click *Select COM Port*, then *Connect via pfodProxy* |
| **BLE** | Select *BLE*, start pfodProxy, click *Select BLE* and choose the device (advertised as `pfod_LedOnOff`), then *Connect via pfodProxy* |
| **TCP/IP** | Select *TCP/IP*, start pfodProxy, enter the board's IP, then *Connect via pfodProxy* |
| **HTTP** | Select *HTTP*, enter the board's IP, click *Connect*. No pfodProxy needed |

Only HTTP talks to the board directly from the browser; Serial, BLE and TCP/IP go through the
pfodProxy bridge.  If the browser supports Serial or BLE connections itself, then you can optionally use the browser native connection, but pfodProxy provides a richer experience and
 also remembers your selected serial/ble connection allows it to be bookmarked.

---

## The sketches

### 1. `demoScreens_serial` — the full pfod demo, over Serial

**Connection:** Serial @ 115200 · **Header board:** Arduino Uno, Mega, etc.

A single-file Arduino port of the `V3_DemoMsgProcessor.java` pfodApp demo, mirroring its command
hierarchy.

It also streams **raw data**: *outside* any `{…}` message so that
pfodWeb treats it as CSV plot data.

### 2. `demoScreens_tcpip` — the full demo over TCP/IP

**Connection:** TCP/IP port 4989 · **Compiles for:** ESP8266, Pi Pico W, Pi Pico 2W, ESP32, ESP32-C3

Same screens as `demoScreens_serial`

```cpp
const int portNo = 4989;
const char staticIP[] = "10.1.1.100";  // set to "" for DHCP (not recommended)
```

### 3. `demoScreens_http` — the full demo over HTTP *and* TCP/IP together

**Connection:** HTTP port 80 + TCP/IP port 4989 · **Compiles for:** ESP8266, Pi Pico W, Pi Pico 2W, ESP32, ESP32-C3

The most complete example. It starts both servers in `setup()` so a browser running pfodWeb and an Android pfodApp can be connected at the same time. 

It also ships a `data/` sub-directory containing the gzipped pfodWeb bundle, so the board can serve
the whole web GUI itself for a stand-alone, off-line installation:

```cpp
static bool useLittleFSToServe_pfodWeb = false;   // set true to serve pfodWeb from LittleFS
static uint32_t cacheSec = 10*60;                 // browser cache timeout, used only when the above is true
```

To use it:

1. Set the Tools menu flash size to give a **1 MB LittleFS** file system.
2. Set `useLittleFSToServe_pfodWeb = true`, set the SSID/password and static IP.
3. Upload the sketch, **close the Serial Monitor**, then `Ctrl+Shift+P` →
   *Upload LittleFS to Pico/ESP8266/ESP32* to upload the `data/` directory.
   This needs the [arduino-littlefs-upload](https://github.com/earlephilhower/arduino-littlefs-upload)
   V0.2.0 plugin for Arduino IDE V2.
4. Browse to `http://<board-ip>` — note **http://**, not https://.

### 4. `Hello_World_serial` — simplest GUI example

**Connection:** Serial @ 115200 · **Header board:** Arduino UNO

The minimal generated project. The main menu holds a single drawing menu item, `HelloWorld`, which is a
50 × 50 blue canvas with the red bold text "Hello World" centred in it. Nothing is updated and no
pins are touched, so it is the easiest sketch to confirm that the toolchain, the pfodParser
library and pfodProxy are all working.

```
Hello_World_serial.ino     setup()/loop(), Serial.begin(115200), parser.connect(&Serial)
pfodMainMenu.cpp/.h        generated menu handler — sends the menu containing the drawing
Dwg_HelloWorld.cpp/.h      the drawing itself
json/                      pfodWeb Designer source files (see "The json folders" below)
```

### 5. `LedOnOff_serial` — LED control over Serial

**Connection:** Serial @ 115200 · 

Adds interaction to the GUI. The main-menu drawing `LedOnOff` inserts two sub-drawings — `LedOn` and
`LedOff` — that act as touch buttons, plus an indexed label that reads *"Led is ON"* in red or
*"Led is Off"* in black. The drawing refreshes every 2000 ms, and touches call `turnLedOn()` /
`turnLedOff()` in the .ino, which drive `LED_BUILTIN`.

### 6. `LedOnOff_ble` — the same GUI over Bluetooth Low Energy

**Connection:** BLE · **Compiles for:** ESP32, ESP32-C3

Identical menu and drawings to `LedOnOff_serial`, but the parser is connected to a BLE stream
instead of `Serial`. The sketch contains a complete `pfodBLESerial` class implementing the
Nordic UART service:

Sends are buffered through `pfodBLEBufferedSerial` to avoid flooding the BLE link.

* Choose a partition scheme with **at least 2 MB APP**, e.g. *NO OTA (2M APP/2M SPIFFS)*.
* The advertised name is set by `const char* localName = "pfod_LedOnOff";` — change it to
  customise what appears in the BLE device list.
* `Serial` remains free and is used for debug output at 115200.

### 7. `LedOnOff_tcp` — the same GUI over TCP/IP

**Connection:** TCP/IP port 4989 · **Compiles for:** ESP8266, Pi Pico W, Pi Pico 2W, ESP32, ESP32-C3

Uses `ESP_PicoW_pfodAppServer.h`

Before uploading:

```cpp
const char *ssid = "xxxxxx";        // your router's SSID
const char *password = "xxxxxx";    // your router's password
//IPAddress staticIP(10, 1, 1, 100);  // uncomment and set an unused IP (recommended)
IPAddress staticIP;                   // or leave blank for DHCP and read the IP from the Serial Monitor
```

If you are debugging a Pi Pico with a PicoProbe, uncomment `#define PICO_PROBE` to move `Serial`
to `Serial1`.

### 8. `LedOnOff_http` — the same GUI over HTTP

**Connection:** HTTP port 80 · **Compiles for:** ESP8266, Pi Pico W, Pi Pico 2W, ESP32, ESP32-C3

Uses `ESP_PicoW_pfodWebServer.h`. This is the only connection type that needs no pfodProxy — the
browser talks to the board directly.

It also ships a `data/` sub-directory containing the gzipped pfodWeb bundle, so the board can serve
the whole web GUI itself for a stand-alone, off-line installation:

```cpp
static bool useLittleFSToServe_pfodWeb = false;   // set true to serve pfodWeb from LittleFS
static uint32_t cacheSec = 10*60;                 // browser cache timeout, used only when the above is true
```

To use it:

1. Set the Tools menu flash size to give a **1 MB LittleFS** file system.
2. Set `useLittleFSToServe_pfodWeb = true`, set the SSID/password and static IP.
3. Upload the sketch, **close the Serial Monitor**, then `Ctrl+Shift+P` →
   *Upload LittleFS to Pico/ESP8266/ESP32* to upload the `data/` directory.
   This needs the [arduino-littlefs-upload](https://github.com/earlephilhower/arduino-littlefs-upload)
   V0.2.0 plugin for Arduino IDE V2.
4. Browse to `http://<board-ip>` — note **http://**, not https://.

---

## Common details

### The `json` folders

`Hello_World_serial` and the four `LedOnOff_*` examples were produced by the **pfodWeb Designer**
and keep their design source alongside the code:

* `*.pfodMenu_json` — the menu design, loadable in the pfodWeb Designer
* `*.pfodDwg_json` — one file per drawing (`LedOnOff`, `LedOn`, `LedOff`, `HelloWorld`)

Load these back into the Designer to modify the GUI and re-generate `pfodMainMenu.*` and
`Dwg_*.*`. The `demoScreens_*` sketches are hand-written and have no json.

### The `data` folders

`LedOnOff_http/data` and `demoScreens_http/data` hold the gzipped pfodWeb bundle
(`pfodWeb.html.gz`, `pfodweb-00N-*.js.gz`, `favicon.ico`, `version.js`) plus an `extraFonts`
sub-directory with Cyrillic/Greek Roboto subsets. Upload them to LittleFS only if you set
`useLittleFSToServe_pfodWeb = true`; about 1 MB of file system is needed.

### Menu version and caching

Every sketch sets `const char version[] = "V1";`. pfodWeb and pfodApp cache a menu against this
version string, so **change the version (or clear the cache) each time you edit a menu**,
otherwise the client will keep displaying the old cached screen.

### Editing generated code

Regenerating from the Designer overwrites `pfodMainMenu.*` and `Dwg_*.*`, so keep application
logic in sub-classes and the .ino.

### Debug output

Most sketches call `setDebugPtr(&Serial)` and have a commented-out `// #define DEBUG` in
`pfodMainMenu.cpp` and each `Dwg_*.cpp`. Uncomment it in a file to get that file's debug tracing
on `Serial`. In the WiFi sketches the startup countdown and the assigned IP address are printed to `Serial` at 115200.

---

## Further reading

* pfodWeb tutorial — <https://www.forward.com.au/pfod/pfodWeb/index.html>
* pfodWeb Designer — <https://www.forward.com.au/pfod/pfodWeb/Designer/index.html>
* Getting started with pfodApp for Android —
  <https://www.forward.com.au/pfod/Android_pfodApp/pfodAppForAndroidGettingStarted.pdf>
* pfodParser libraries — <http://www.forward.com.au/pfod/pfodParserLibraries/index.html>

(c) Forward Computing and Control Pty. Ltd. — see [../docs/pfodWeb_pfodProxy_License.html](../docs/pfodWeb_pfodProxy_License.html).
