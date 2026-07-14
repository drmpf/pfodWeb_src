#pragma once

// Pin definitions taken from:
// https://github.com/rp-rs/rp-hal-boards/blob/main/boards/pimoroni-servo2040/src/lib.rs

// LEDs
#define PIN_LED        (18u)
#define LED_BUILTIN    PIN_LED

// Digital pins
#define SERVO1  (0u)
#define SERVO2  (1u)
#define SERVO3  (2u)
#define SERVO4  (3u)
#define SERVO5  (4u)
#define SERVO6  (5u)
#define SERVO7  (6u)
#define SERVO8  (7u)
#define SERVO9  (8u)
#define SERVO10 (9u)
#define SERVO11 (10u)
#define SERVO12 (11u)
#define SERVO13 (12u)
#define SERVO14 (13u)
#define SERVO15 (14u)
#define SERVO16 (15u)
#define SERVO17 (16u)
#define SERVO18 (17u)
#define USER_SW (22u)

// pfodWeb NOTE: SERVO1-18 above are #define-only in the vendor file, so
// this project's parser (which only recognizes static const uint8_t
// pin aliases) never picked them up — meaning this board's entire
// purpose (18 servo output channels) was invisible in the Designer.
// Declared directly here so they show up as D0-D17.
static const uint8_t D0  = SERVO1;
static const uint8_t D1  = SERVO2;
static const uint8_t D2  = SERVO3;
static const uint8_t D3  = SERVO4;
static const uint8_t D4  = SERVO5;
static const uint8_t D5  = SERVO6;
static const uint8_t D6  = SERVO7;
static const uint8_t D7  = SERVO8;
static const uint8_t D8  = SERVO9;
static const uint8_t D9  = SERVO10;
static const uint8_t D10 = SERVO11;
static const uint8_t D11 = SERVO12;
static const uint8_t D12 = SERVO13;
static const uint8_t D13 = SERVO14;
static const uint8_t D14 = SERVO15;
static const uint8_t D15 = SERVO16;
static const uint8_t D16 = SERVO17;
static const uint8_t D17 = SERVO18;

// Analog pins
#define ADC_ADDR_0 (22u)
#define ADC_ADDR_1 (24u)
#define ADC_ADDR_2 (25u)
static const uint8_t A0  = (26u);
static const uint8_t A1  = (27u);
static const uint8_t A2  = (28u);
// pfodWeb NOTE: A3 deliberately NOT declared here — the vendor value
// (31u) is the "not pinned out" sentinel (GPIO31 does not physically
// exist on this chip); declaring it leaked a phantom "A3 (GPIO31)" pin.
#define ADC_SHARED A3
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
