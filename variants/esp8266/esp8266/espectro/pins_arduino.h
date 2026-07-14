
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

#ifndef ESPECTRO_CORE_VERSION
#define ESPECTRO_CORE_VERSION   3
#endif

static const uint8_t SDA = 4;
static const uint8_t SCL = 5;

// pfodWeb: this file used to include ../generic/common.h for its SPI/A0
// boilerplate, but that shared file's default SS alias points at the
// exact same GPIO as this board's confirmed LED (15, led_high) -
// build_boards.js unconditionally attaches an spi_ss capability to any
// GPIO matching the SS alias, which was silently contaminating the LED's
// capability list (a plain "= -1;" override does not work here, since a
// non-numeric override line simply fails to parse and leaves the
// included common.h's own real alias declaration to resolve unopposed).
// Converted to self-contained: MOSI, MISO, and SCK (which do not
// collide with anything on this board) are reproduced directly below;
// SS is intentionally omitted rather than reproduced.
static const uint8_t MOSI = 13;
static const uint8_t MISO = 12;
static const uint8_t SCK  = 14;
static const uint8_t A0   = 17;

#define LED_BUILTIN 15

static const uint8_t BUTTON_BUILTIN = 0;
static const uint8_t BUILTIN_BUTTON = 0;

static const uint8_t RX   	= 3;
static const uint8_t TX   	= 1;
static const uint8_t RX0   	= 3;
static const uint8_t TX0   	= 1;
static const uint8_t TX1   	= 2;

#endif /* Pins_Arduino_h */