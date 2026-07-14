#pragma once

// Pin definitions taken from:
// https://github.com/rp-rs/rp-hal-boards/blob/main/boards/pimoroni-plasma-2040/src/lib.rs

// LEDs
#define PIN_LED        (16u)
#define PIN_LED_R      (16u)
#define PIN_LED_G      (17u)
#define PIN_LED_B      (18u)
#define LED_BUILTIN    PIN_LED

// Digital pins
// pfodWeb NOTE (2026-07-13): the vendor's "#if 0 ... #endif"-disabled D0-D10
// block (declaring GPIO26-29,6,7,0,1,2,4,3 as plain digital pins, including
// GPIO29 - a current-sense ADC pin, and several of the onboard LED-strip
// header/button GPIOs already tagged elsewhere in this file) was removed
// entirely rather than left disabled. This project's .h parser is a plain
// regex scan with no C-preprocessor awareness, so "#if 0" has no effect on
// it - the block's static-const declarations were still being picked up as
// real pin aliases, silently re-exposing GPIO29 and other already-handled
// pins as plain general-purpose "Dn" pins. Same class of fix as the
// SS/MOSI/MISO/SCK comment-removal below.

// Analog pins
static const uint8_t A0  = (26u);
static const uint8_t A1  = (27u);
static const uint8_t A2  = (28u);
// pfodWeb NOTE: A3 deliberately NOT declared here — the vendor value
// (31u) is the "not pinned out" sentinel (GPIO31 does not physically
// exist on this chip); declaring it leaked a phantom "A3 (GPIO31)" pin.
#define ADC_RESOLUTION 12

// NeoPixel
#define PIN_NEOPIXEL   (15u)
//#define NEOPIXEL_POWER (11u)

// Serial1
#define PIN_SERIAL1_TX (31u)
#define PIN_SERIAL1_RX (31u)

// Serial2 not pinned out
#define PIN_SERIAL2_TX (31u)
#define PIN_SERIAL2_RX (31u)

// SPI
#define PIN_SPI0_MISO  (31u)
#define PIN_SPI0_MOSI  (31u)
#define PIN_SPI0_SCK   (31u)
#define PIN_SPI0_SS    (31u) // not pinned out
// pfodWeb NOTE: SS/MOSI/MISO/SCK reference comments removed entirely
// (not just commented out) — this project's .h parser is a plain regex
// scan with no comment-awareness, so a "//static const..." line still
// matched and leaked a phantom "SS (GPIO31)" pin (PIN_SPI0_SS is the
// vendor's 31u "not pinned out" sentinel).

// Not pinned out
#define PIN_SPI1_MISO  (31u)
#define PIN_SPI1_MOSI  (31u)
#define PIN_SPI1_SCK   (31u)
#define PIN_SPI1_SS    (31u)
//#define SPI_MISO       (PIN_SPI1_MISO)
//#define SPI_MOSI       (PIN_SPI1_MOSI)
//#define SPI_SCK        (PIN_SPI1_SCK)

// Wire
#define __WIRE0_DEVICE (i2c0)
#define PIN_WIRE0_SDA  (20u)
#define PIN_WIRE0_SCL  (21u)
#define SDA            PIN_WIRE0_SDA
#define SCL            PIN_WIRE0_SCL
#define I2C_SDA        (SDA)
#define I2C_SCL        (SCL)

// Wire1 not pinned out
#define __WIRE1_DEVICE (i2c1)
#define PIN_WIRE1_SDA  (31u)
#define PIN_WIRE1_SCL  (31u)

#define SERIAL_HOWMANY (0u)
#define SPI_HOWMANY    (0u)
#define WIRE_HOWMANY   (1u)
