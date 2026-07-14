#pragma once

// Pin definitions taken from:
//    https://learn.adafruit.com/assets/100337

// LEDs
#define PIN_LED                     (13u)

// NeoPixel
#define PIN_NEOPIXEL                (4u)

// 'Boot0' button also on GPIO #7
#define PIN_BUTTON                  (7u)

// Prop-Maker features
#define PIN_I2S_DATA                (16u)
#define PIN_I2S_BIT_CLOCK           (17u)
#define PIN_I2S_WORD_SELECT         (18u)
#define PIN_EXTERNAL_BUTTON         (19u)
#define PIN_EXTERNAL_SERVO          (20u)
#define PIN_EXTERNAL_NEOPIXELS      (21u)
#define PIN_ACCELEROMETER_INTERRUPT (22u)
#define PIN_EXTERNAL_POWER          (23u)

// Serial
#define PIN_SERIAL1_TX              (0u)
#define PIN_SERIAL1_RX              (1u)

// Not pinned out
#define PIN_SERIAL2_TX              (31u)
#define PIN_SERIAL2_RX              (31u)

// SPI
// pfodWeb NOTE (2026-07-13): the vendor default PIN_SPI0_SS value (13u)
// is omitted here - GPIO13 is this board's confirmed onboard status LED
// (see board.json chipGpios), and there is no onboard SPI device using
// this default SS assignment (the onboard audio amp uses I2S, the
// onboard accelerometer uses I2C), so leaving it declared would wrongly
// tag the confirmed LED pin with a spurious spi_ss capability (see
// build_boards.js's unconditional SS-alias auto-append), matching the
// adafruit_feather_scorpio precedent for this exact bug class. MISO/
// MOSI/SCK are left as-is; a user wiring up their own external SPI
// device to this board's default header pins would still need to pick
// their own SS pin manually, same as any board with no onboard SPI
// peripheral.
#define PIN_SPI0_MISO               (8u)
#define PIN_SPI0_MOSI               (15u)
#define PIN_SPI0_SCK                (14u)
#define __SPI0_DEVICE               spi1

// Not pinned out
#define PIN_SPI1_MISO               (31u)
#define PIN_SPI1_MOSI               (31u)
#define PIN_SPI1_SCK                (31u)
#define PIN_SPI1_SS                 (31u)
#define __SPI1_DEVICE               spi0

// Wire
#define PIN_WIRE0_SDA               (2u)
#define PIN_WIRE0_SCL               (3u)
#define __WIRE0_DEVICE              i2c1

#define PIN_WIRE1_SDA               (31u)
#define PIN_WIRE1_SCL               (31u)
#define __WIRE1_DEVICE              i2c0

#define SERIAL_HOWMANY              (2u)
#define SPI_HOWMANY                 (1u)
#define WIRE_HOWMANY                (1u)

// pfodWeb NOTE: bespoke pin set (not ../generic_full/common.h) — GPIO16,17,18,19,20,21,22,23 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D2 = (2u);
static const uint8_t D3 = (3u);
static const uint8_t D4 = (4u);
static const uint8_t D5 = (5u);
static const uint8_t D6 = (6u);
static const uint8_t D7 = (7u);
static const uint8_t D8 = (8u);
static const uint8_t D9 = (9u);
static const uint8_t D10 = (10u);
static const uint8_t D11 = (11u);
static const uint8_t D12 = (12u);
static const uint8_t D13 = (13u);
static const uint8_t D14 = (14u);
static const uint8_t D15 = (15u);
static const uint8_t D24 = (24u);
static const uint8_t D25 = (25u);
static const uint8_t D26 = (26u);
static const uint8_t D27 = (27u);
static const uint8_t D28 = (28u);
static const uint8_t D29 = (29u);

static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);
static const uint8_t A3 = (29u);

static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
