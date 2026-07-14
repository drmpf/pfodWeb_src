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

// pfodWeb: this variant directory ("itead") is shared by three genuinely
// different physical products (Sonoff SV, Sonoff TH, Sonoff Basic),
// selected at compile time via the ARDUINO_ESP8266_SONOFF_SV/TH/BASIC
// macros. The vendor source declared a product-specific I2C SCL pin
// (different GPIO numbers for SV versus TH/Basic) and a product-specific
// SDA pin (declared for SV/TH only, not declared at all for Basic).
// build_boards.js's parser is comment-blind and ifdef-blind, so it
// cannot tell which product a user is targeting from this single shared
// "itead" entry - it would resolve SCL to whichever declaration
// appeared last in the file, silently mislabeling that GPIO as SCL for
// every product, including the one whose real SCL pin is a different
// GPIO entirely, while leaving that product's real SCL pin unlabeled.
// Both SDA and SCL are set to -1 (no default Wire pin) below so the
// designer does not auto-attach an i2c_sda/i2c_scl capability to a GPIO
// that is only correct for some of the three products this directory
// represents. See boardsDetails/esp8266/esp8266/itead/notes.txt for the
// full research and reasoning.
// NOTE TO FUTURE EDITORS: do not write the original declarations'
// identifier/value text as a parseable "static const uint8_t <name> =
// <value>;" shape anywhere in this comment - the parser is a plain
// regex scan and will match that exact shape even inside a // comment,
// silently reintroducing the ambiguity this fix removes.
static const uint8_t SDA = -1;
static const uint8_t SCL = -1;

static const uint8_t BUILTIN_BUTTON = 0;
static const uint8_t BUILTIN_RELAY = 12;

#define BUTTON_BUILTIN (0)
#define LED_BUILTIN    (13)
#define RELAY_BUILTIN  (12)

// pfodWeb: this file used to include ../generic/common.h for its SPI/A0
// boilerplate, but that shared file's default MOSI/MISO aliases point at
// the exact same GPIOs as this board's confirmed LED (13) and relay (12)
// outputs - build_boards.js unconditionally attaches spi_mosi/spi_miso
// capabilities to any GPIO matching those aliases, which was silently
// contaminating both the LED's and the relay's capability lists and
// overriding the relay's display label to "MISO (GPIO12)". Converted to
// self-contained: SS and SCK (which do not collide with anything on this
// board) are reproduced directly below; MOSI and MISO are intentionally
// omitted rather than reproduced.
static const uint8_t SS  = 15;
static const uint8_t SCK = 14;
static const uint8_t A0  = 17;

#endif /* Pins_Arduino_h */
