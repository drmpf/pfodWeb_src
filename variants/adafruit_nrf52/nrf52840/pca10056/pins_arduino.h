// pfodWeb NOTE: imported from Adafruit's own Adafruit_nrf52 BSP at
// Adafruit_nrf52/variants/pca10056/variant.h, filename changed to
// pins_arduino.h per this repo's convention, with ONE deliberate
// deviation: the vendor source's `static const uint8_t A6 = PIN_A6;`
// and `static const uint8_t A7 = PIN_A7;` lines have been deleted
// outright (not commented out — this parser has no C-comment
// awareness). PIN_A6/PIN_A7 are both `(0xff)` here — a sentinel meaning
// "this analog channel doesn't physically exist on this board" — but
// build_boards.js's alias-scanning regex only understands DECIMAL
// numeric literals, not hex: it misreads "0xff" as decimal "0", so both
// aliases would have silently resolved to a phantom "A6/A7 (GPIO0)" pin
// instead of correctly disappearing. Deleting both alias lines means
// this board correctly has no A6/A7 pins at all, matching physical
// reality (same fix as itsybitsy_nrf52840_express and
// feather_nrf52840_sense_tft in this family — see this board's own
// boardsDetails/adafruit_nrf52/nrf52840/pca10056/notes.txt).
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

#ifndef _VARIANT_PCA10056_
#define _VARIANT_PCA10056_

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
#define PINS_COUNT           (48)
#define NUM_DIGITAL_PINS     (48)
#define NUM_ANALOG_INPUTS    (6)
#define NUM_ANALOG_OUTPUTS   (0)

// LEDs
#define PIN_LED1             (13)
#define PIN_LED2             (14)
#define PIN_LED3             (15)
#define PIN_LED4             (16)

#define LED_BUILTIN          PIN_LED1
#define LED_CONN             PIN_LED2

#define LED_RED              PIN_LED1
#define LED_BLUE             PIN_LED2

#define LED_STATE_ON         0         // State when LED is litted

/*
 * Buttons
 */
#define PIN_BUTTON1          11
#define PIN_BUTTON2          12
#define PIN_BUTTON3          24
#define PIN_BUTTON4          25

/*
 * Analog pins
 */
#define PIN_A0               (3)
#define PIN_A1               (4)
#define PIN_A2               (28)
#define PIN_A3               (29)
#define PIN_A4               (30)
#define PIN_A5               (31)
#define PIN_A6               (0xff)
#define PIN_A7               (0xff)

static const uint8_t A0  = PIN_A0 ;
static const uint8_t A1  = PIN_A1 ;
static const uint8_t A2  = PIN_A2 ;
static const uint8_t A3  = PIN_A3 ;
static const uint8_t A4  = PIN_A4 ;
static const uint8_t A5  = PIN_A5 ;
#define ADC_RESOLUTION    14

// Other pins
#define PIN_AREF           (2)
#define PIN_NFC1           (9)
#define PIN_NFC2           (10)

static const uint8_t AREF = PIN_AREF;

/*
 * Serial interfaces
 */

// Arduino Header D0, D1
#define PIN_SERIAL1_RX      (33) // P1.01
#define PIN_SERIAL1_TX      (34) // P1.02

// Connected to Jlink CDC
#define PIN_SERIAL2_RX      (8)
#define PIN_SERIAL2_TX      (6)

/*
 * SPI Interfaces
 */
#define SPI_INTERFACES_COUNT 1

#define PIN_SPI_MISO         (46)
#define PIN_SPI_MOSI         (45)
#define PIN_SPI_SCK          (47)

static const uint8_t SS   = 44 ;
static const uint8_t MOSI = PIN_SPI_MOSI ;
static const uint8_t MISO = PIN_SPI_MISO ;
static const uint8_t SCK  = PIN_SPI_SCK ;

/*
 * Wire Interfaces
 */
#define WIRE_INTERFACES_COUNT 1

#define PIN_WIRE_SDA         (26)
#define PIN_WIRE_SCL         (27)

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
#define PIN_QSPI_SCK         19
#define PIN_QSPI_CS          17
#define PIN_QSPI_IO0         20
#define PIN_QSPI_IO1         21
#define PIN_QSPI_IO2         22
#define PIN_QSPI_IO3         23

// On-board QSPI Flash
#define EXTERNAL_FLASH_DEVICES   MX25R6435F
#define EXTERNAL_FLASH_USE_QSPI

#ifdef __cplusplus
}
#endif

/*----------------------------------------------------------------------------
 *        Arduino objects - C++ only
 *----------------------------------------------------------------------------*/

#endif
