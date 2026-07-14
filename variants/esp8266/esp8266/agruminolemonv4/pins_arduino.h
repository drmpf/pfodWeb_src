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

#define LED_BUILTIN 2

// PINOUT Agrumino Implemented
#define PIN_SDA 2 // [X] BOOT: Must be HIGH at boot
#define PIN_SCL 14 // [X]
#define PIN_PUMP 12 // [X]
#define PIN_BTN_S1 4 // [X] Same as Internal WT8266 LED
#define PIN_USB_DETECT 5 // [X]
#define PIN_MOSFET 15 // [X] BOOT: Must be LOW at boot
#define PIN_BATT_STAT 13 // [X]
#define PIN_LEVEL 0 // [ ] BOOT: HIGH for Running and LOW for Program

static constexpr uint8_t D0   = 16;
static constexpr uint8_t RX   = 3;
static constexpr uint8_t TX   = 1;

#define PIN_WIRE_SDA PIN_SDA
#define PIN_WIRE_SCL PIN_SCL

// pfodWeb NOTE: written as direct numeric literals, not
// `= PIN_WIRE_SDA`/`= PIN_WIRE_SCL` — this project's parser only
// resolves one level of #define indirection, and PIN_WIRE_SDA/SCL are
// themselves aliases to PIN_SDA/PIN_SCL (a second hop), which silently
// failed to resolve and dropped SDA/SCL from the pin list entirely.
static constexpr uint8_t SDA = 2;  // PIN_WIRE_SDA -> PIN_SDA
static constexpr uint8_t SCL = 14; // PIN_WIRE_SCL -> PIN_SCL

// pfodWeb NOTE: does NOT include ../generic/common.h — that shared file
// unconditionally declares SS/MOSI/MISO/SCK aliasing GPIO15/13/12/14, but
// GPIO12/15 on this board (Agrumino Lemon v4) are the dedicated
// PIN_PUMP/PIN_MOSFET actuator outputs, not a general-purpose SPI bus
// (see this board's own board.json chipGpios override). Only the real
// ADC pin is pulled in directly instead.
static constexpr uint8_t A0 = 17;

#endif /* Pins_Arduino_h */
