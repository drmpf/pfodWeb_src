// pfodWeb NOTE: imported from Adafruit's own Adafruit_nrf52 BSP at
// Adafruit_nrf52/variants/itsybitsy_nrf52840_express/variant.h, filename
// changed to pins_arduino.h per this repo's convention, with ONE
// deliberate deviation: the vendor source's `static const uint8_t A7 =
// PIN_A7;` line has been deleted outright (not commented out — this
// parser has no C-comment awareness). PIN_A7 is `(0xff)` here — a
// sentinel the vendor uses to mean "this analog channel doesn't
// physically exist on this board" (see the line's own "to compile with
// Firmata library" comment) — but build_boards.js's alias-scanning
// regex only understands DECIMAL numeric literals, not hex: it
// misreads "0xff" as decimal "0", so the alias would have silently
// resolved to a phantom "A7 (GPIO0)" pin instead of correctly
// disappearing or erroring. Deleting the alias line means this board
// correctly has no A7 pin at all, matching physical reality. See
// boardsDetails/adafruit_nrf52/nrf52840/itsybitsy_nrf52840_express/notes.txt.
 /*
  Copyright (c) 2014-2015 Arduino LLC.  All right reserved.
  Copyright (c) 2016 Sandeep Mistry All right reserved.
  Copyright (c) 2018, Adafruit Industries (adafruit.com)

  This library is free software; you can redistribute it and/or
  modify it under the terms of the GNU Lesser General Public
  License as published by the Free Software Foundation; either
  version 2.1 of the License, or (at your option) any later version.
  This library is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Lesser General Public License for more details.
  You should have received a copy of the GNU Lesser General Public
  License along with this library; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
*/

#ifndef _VARIANT_ITSY52840_
#define _VARIANT_ITSY52840_

/** Master clock frequency */
#define VARIANT_MCK       (64000000ul)

#define USE_LFXO      // Board uses 32khz crystal for LF
// define USE_LFRC    // Board uses RC for LF

/*----------------------------------------------------------------------------
 *        Headers
 *----------------------------------------------------------------------------*/

#include "WVariant.h"

#ifdef __cplusplus
extern "C"
{
#endif // __cplusplus

// Number of pins defined in PinDescription array
#define PINS_COUNT           (32)
#define NUM_DIGITAL_PINS     (32)
#define NUM_ANALOG_INPUTS    (7)
#define NUM_ANALOG_OUTPUTS   (0)

// LEDs
#define PIN_LED1             (3)
#define PIN_DOTSTAR_DATA     (8)
#define PIN_DOTSTAR_CLOCK    (6)

#define LED_BUILTIN          PIN_LED1
#define LED_CONN             PIN_LED1

#define LED_RED              PIN_LED1
#define LED_BLUE             PIN_LED1

#define LED_STATE_ON         1         // State when LED is litted

// Buttons
#define PIN_BUTTON1             (4)
/*
#define PIN_BUTTON2             (3)
#define PIN_BUTTON3             (4)
#define PIN_BUTTON4             (5)
*/

/*
 * Analog pins
 */
#define PIN_A0               (14)
#define PIN_A1               (15)
#define PIN_A2               (16)
#define PIN_A3               (17)
#define PIN_A4               (18)
#define PIN_A5               (19)
#define PIN_A6               (20)
#define PIN_A7               (0xff) // to compile with Firmata library

static const uint8_t A0  = PIN_A0 ;
static const uint8_t A1  = PIN_A1 ;
static const uint8_t A2  = PIN_A2 ;
static const uint8_t A3  = PIN_A3 ;
static const uint8_t A4  = PIN_A4 ;
static const uint8_t A5  = PIN_A5 ;
static const uint8_t A6  = PIN_A6 ;
#define ADC_RESOLUTION    14

//static const uint8_t AREF = PIN_AREF;

/*
 * Serial interfaces
 */
#define PIN_SERIAL1_RX       (0)
#define PIN_SERIAL1_TX       (1)

/*
 * SPI Interfaces
 */
#define SPI_INTERFACES_COUNT 1

#define PIN_SPI_MISO         (23)
#define PIN_SPI_MOSI         (24)
#define PIN_SPI_SCK          (25)

static const uint8_t SS   = (5);
static const uint8_t MOSI = PIN_SPI_MOSI ;
static const uint8_t MISO = PIN_SPI_MISO ;
static const uint8_t SCK  = PIN_SPI_SCK ;

/*
 * Wire Interfaces
 */
#define WIRE_INTERFACES_COUNT 1

#define PIN_WIRE_SDA         (21)
#define PIN_WIRE_SCL         (22)

// pfodWeb NOTE: this vendor file never declares a bare `static const
// uint8_t SDA/SCL` alias for its Wire pins (unlike Seeed's XIAO nRF52840
// core) -- added here so build_boards.js's parser (which only scans for
// `static const` aliases, not #define) can see this bus and tag it
// correctly (i2c_sda/i2c_scl) instead of it being entirely invisible.
// These are exactly the pins Wire.begin() already uses internally via
// PIN_WIRE_SDA/PIN_WIRE_SCL above -- this only adds the standard
// Arduino alias name, not a new pin assignment.
static const uint8_t SDA = PIN_WIRE_SDA;
static const uint8_t SCL = PIN_WIRE_SCL;

// QSPI Pins
#define PIN_QSPI_SCK         26
#define PIN_QSPI_CS          27
#define PIN_QSPI_IO0         28
#define PIN_QSPI_IO1         29
#define PIN_QSPI_IO2         30
#define PIN_QSPI_IO3         31

// On-board QSPI Flash
#define EXTERNAL_FLASH_DEVICES   GD25Q16C
#define EXTERNAL_FLASH_USE_QSPI

#ifdef __cplusplus
}
#endif

/*----------------------------------------------------------------------------
 *        Arduino objects - C++ only
 *----------------------------------------------------------------------------*/

#endif
