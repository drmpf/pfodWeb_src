/*
  pins_arduino.h - Pin definition functions for Arduino
  Part of Arduino - http://www.arduino.cc/

  Copyright (c) 2007 David A. Mellis
  Modified for ESP8266 platform by Ivan Grokhotkov, 2014-2015.

  This library is free software; you can redistribute it and/or
  modify it under the terms of the GNU Lesser General Public
  License as published by the Free Software Foundation; either
  version 2.1 of the License, or (at your option) any later version.

  This library is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
  Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General
  Public License along with this library; if not, write to the
  Free Software Foundation, Inc., 59 Temple Place, Suite 330,
  Boston, MA  02111-1307  USA

  $Id: wiring.h 249 2007-02-03 16:52:51Z mellis $
*/

#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#define PIN_WIRE_SDA (4)
#define PIN_WIRE_SCL (5)

// pfodWeb: PIN_WIRE_SDA/PIN_WIRE_SCL above alias the default Wire pins to
// the same two GPIOs as this board's onboard discrete RGB LED (GPIO4 =
// Green channel, GPIO5 = Blue channel — see LED_BUILTIN_G/LED_BUILTIN_B
// below and boardsDetails/esp8266/esp8266/espino/notes.txt for sources).
// Set below to -1 (no default Wire pin) rather than those GPIO numbers so
// build_boards.js doesn't auto-append i2c_sda/i2c_scl capabilities onto
// pins that are electrically committed to driving the LED. See board.json's
// pfodWeb NOTE for the full writeup.
// NOTE TO FUTURE EDITORS: do not write the original declaration's literal
// identifier/value text as a parseable "static const uint8_t <name> = <value>;"
// shape anywhere in this comment — the parser in build_boards.js is
// comment-blind (plain regex scan) and will match ANY text of that exact
// shape, even inside a // comment, silently reintroducing the exact bug
// this fix prevents.
static const uint8_t SDA = -1;
static const uint8_t SCL = -1;

#define LED_BUILTIN 2
static const uint8_t LED_BUILTIN_R = 2;
static const uint8_t LED_BUILTIN_G = 4;
static const uint8_t LED_BUILTIN_B = 5;
static const uint8_t BUTTON_BUILTIN = 0;

#include "../generic/common.h"

#endif /* Pins_Arduino_h */
