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

#define PIN_WIRE_SDA (2)
#define PIN_WIRE_SCL (14)

static const uint8_t SDA = PIN_WIRE_SDA;
static const uint8_t SCL = PIN_WIRE_SCL;

#define LED_BUILTIN 2

static const uint8_t D1   = 15;
static const uint8_t D2   = 0;
static const uint8_t D3   = 14;
static const uint8_t D4   = 2;
static const uint8_t D5   = 5;
static const uint8_t D6   = 4;
static const uint8_t D7   = 13;
static const uint8_t D8   = 12;
static const uint8_t D9   = 16;
static const uint8_t RX  = 3;
static const uint8_t TX = 1;

// pfodWeb NOTE: PIN_A0/A1-A4 deliberately NOT declared — "Analog pins for
// Onboard ADC" (per the vendor's original comment) refers to channels of
// an onboard external ADC chip (community sources point to a PCF8591),
// not real per-GPIO ESP8266 analog inputs. The values (0-4) are that
// chip's channel indices, not GPIO numbers — declaring them as
// static const A1-A4 would have wrongly aliased GPIO1-4 (already TX/D6/
// etc. above) as if they had independent analog_input capability, which
// they don't on real ESP8266 hardware (only GPIO17/A0 does).

#include "../generic/common.h"

#endif /* Pins_Arduino_h */
