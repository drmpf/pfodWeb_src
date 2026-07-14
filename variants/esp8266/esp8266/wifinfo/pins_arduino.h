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

  Changed : 20 Nov 2015 Charles-Henri Hallard
            Definition for WifInfo boards
            see https://github.com/hallard/LibTeleinfo/tree/master/examples/ESP8266_WifInfo
            see https://hallard.me/wifinfo/

  $Id: wiring.h 249 2007-02-03 16:52:51Z mellis $
*/

#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#define PIN_WIRE_SDA (4)
#define PIN_WIRE_SCL (5)

static const uint8_t SDA = PIN_WIRE_SDA;
static const uint8_t SCL = PIN_WIRE_SCL;

#define LED_BUILTIN 12

static const uint8_t D0   = 16;
static const uint8_t D1   = 5;
static const uint8_t D2   = 4;
static const uint8_t D3   = 0;
static const uint8_t D4   = 2;
static const uint8_t D5   = 14;
static const uint8_t D6   = 12;
static const uint8_t D8   = 15;
static const uint8_t D9   = 3;
static const uint8_t D10  = 1;

// pfodWeb NOTE: D7 (GPIO13) deliberately NOT declared as a pin alias.
// GPIO13 is this board's dedicated teleinfo (utility-meter) opto-isolated
// serial receive input - the vendor firmware swaps hardware UART0 onto
// GPIO13/15 specifically to read it, so it is not a free general-purpose
// GPIO. See board.json chipGpios override and
// boardsDetails/esp8266/esp8266/wifinfo/notes.txt for the full research.
//
// pfodWeb: this file used to include ../generic/common.h for its SPI/A0
// boilerplate, but that shared file's default MISO/SCK aliases point at
// the exact same GPIOs as this board's confirmed LED (12, led_high) and
// NeoPixel (14, led_neopixel) - build_boards.js unconditionally attaches
// spi_miso/spi_sck capabilities to any GPIO matching those aliases,
// which was silently contaminating both LEDs' capability lists. The
// shared file's default MOSI alias also pointed at GPIO13, which is
// separately excluded above for the teleinfo reason, so MOSI is also
// omitted now rather than reproduced. Converted to self-contained: only
// SS and A0 (which do not collide with anything on this board) are
// reproduced directly below.
static const uint8_t SS   = 15;
static const uint8_t A0   = 17;

#endif /* Pins_Arduino_h */
