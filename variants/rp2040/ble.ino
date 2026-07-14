/*
 * (c)2014-2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

/**
   TODO — placeholder BLE template for RP2040/RP2350 (Pico W / Pico 2 W).

   This is a dummy stand-in, not a working pfodMainMenu-integrated sketch —
   it deliberately fails to compile (see #error below) so it can't be
   mistaken for real generated code. Replace with a real implementation
   once a pfodMainMenu-integrated BLE library for arduino-pico is
   available (matching the pattern variants/esp32/ble.ino uses with
   pfodBLEBufferedSerial): include the library, call
   init_pfodMainMenu(closeConnection) in setup(), and drive the parser
   from loop() the same way variants/serial.ino and variants/esp32/ble.ino
   do.

   See docs/pfodWeb-variants-guide.html section 6 for how to replace this
   file — no code changes needed elsewhere, just edit this .ino and
   re-run build_boards.js.
*/

#error "BLE support for RP2040/RP2350 (Pico W / Pico 2 W) is not implemented yet — see the comment at the top of this file."

#include "pfodMainMenu.h"

const char version[] = "V1";

void closeConnection(Stream *io) {
  (void)(io);
}

void setup() {
  Serial.begin(115200);
  // TODO: initialize BLE and connect it to a Stream the pfodParser can use,
  // then call init_pfodMainMenu(closeConnection) and start the parser —
  // see variants/esp32/ble.ino for the pattern to follow.
}

void loop() {
  // TODO
}
