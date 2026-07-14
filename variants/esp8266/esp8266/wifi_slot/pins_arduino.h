/*
  pins_arduino.h - Pin definition functions for Arduino
  Part of Arduino - http://www.arduino.cc/

  Copyright (c) 2007 David A. Mellis
  Modified for ESP8266 WIFIO board by Ivan Grokhotkov, 2015.

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

  Changed : 24.11.2017 Vasily Basalaev
            Definition for WiFi Slot
            Amperka LLC
            http://amperka.ru

  $Id: wiring.h 249 2007-02-03 16:52:51Z mellis $
*/

#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#define PIN_WIRE_SDA (2)
#define PIN_WIRE_SCL (0)

static const uint8_t SDA = PIN_WIRE_SDA;
static const uint8_t SCL = PIN_WIRE_SCL;

#define PIN_A0 (3)
#define PIN_A1 (1)
#define PIN_A2 (16)
#define PIN_A3 (13)
#define PIN_A4 (5)
#define PIN_A5 (14)
#define PIN_A6 (4)
#define PIN_A7 (12)

// A0 will be assigned in "../generic/common.h"
// static const uint8_t A0 = PIN_A0;

// pfodWeb NOTE: A1-A7 deliberately NOT declared as static const pins —
// this board reads all 8 "analog" channels through a single onboard
// 74HC4052 multiplexer feeding the ESP8266's one real ADC pin (GPIO17).
// GPIO1/3/4/5/12/13/14/16 (PIN_A1-A7 above) are the mux's own channel
// inputs, not independently analog-capable GPIOs — declaring them as
// "A1"-"A7" would wrongly imply per-pin analog_input capability. See
// this board's own board.json chipGpios override.

#define LED_BUILTIN 2

// pfodWeb NOTE: ANALOG_INPUT_SELECTOR_PIN (GPIO15, the mux channel-select
// line) deliberately NOT declared as a pin — see board.json.

static const uint8_t analog_pin_to_mux_channel[] = {
    (uint8_t)NOT_A_PIN   // 0
  , 1                    // 1
  , (uint8_t)NOT_A_PIN   // 2
  , 0                    // 3
  , 6                    // 4
  , 4                    // 5
  , (uint8_t)NOT_A_PIN   // 6
  , (uint8_t)NOT_A_PIN   // 7
  , (uint8_t)NOT_A_PIN   // 8
  , (uint8_t)NOT_A_PIN   // 9
  , (uint8_t)NOT_A_PIN   // 10
  , (uint8_t)NOT_A_PIN   // 11
  , 7                    // 12
  , 3                    // 13
  , 5                    // 14
  , (uint8_t)NOT_A_PIN   // 15
  , 2                    // 16
};

// pfodWeb NOTE: does NOT include ../generic/common.h — that shared file
// unconditionally declares SS/MOSI/MISO/SCK aliasing GPIO15/13/12/14, all
// of which are dedicated to this board's analog mux (see above and this
// board's own board.json chipGpios override). Only the real ADC pin is
// pulled in directly instead.
static const uint8_t A0 = 17;

#endif /* Pins_Arduino_h */
