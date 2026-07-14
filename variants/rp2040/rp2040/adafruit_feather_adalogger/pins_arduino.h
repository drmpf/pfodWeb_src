#pragma once

// LEDs
#define PIN_LED        (13u)

// NeoPixel
#define PIN_NEOPIXEL   (17u)

// 'Boot0' button also on GPIO #7
#define PIN_BUTTON     (7u)

// SD Card connector
#define PIN_CARD_DETECT (16u)
#define PIN_SD_CLK (18u)
#define PIN_SD_CMD_MOSI (19u)
#define PIN_SD_DAT0_MISO (20u)
#define PIN_SD_DAT1 (21u)
#define PIN_SD_DAT2 (22u)
#define PIN_SD_DAT3_CS (23u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

// Not pinned out
#define PIN_SERIAL2_TX (31u)
#define PIN_SERIAL2_RX (31u)

// SPI
// pfodWeb NOTE (2026-07-13): the vendor default PIN_SPI0_SS value (13u)
// is omitted here - GPIO13 is this board's confirmed onboard D13 LED
// (see board.json chipGpios), and Adafruit's own pinouts guide confirms
// there is no dedicated CS pin on the main SPI header itself ("CS
// options are available on other pins (A3, D25, D13, D9)" - i.e. 13 is
// merely one of several arbitrary software-selectable SS choices, not
// real dedicated wiring). Leaving it declared would wrongly tag the
// confirmed LED pin with a spurious spi_ss capability (see
// build_boards.js's unconditional SS-alias auto-append), matching this
// repo's adafruit_feather_scorpio precedent. MISO/MOSI/SCK are left
// as-is (genuine header SPI pins); a user wiring up their own SPI
// device would still need to pick their own SS pin manually.
#define PIN_SPI0_MISO  (8u)
#define PIN_SPI0_MOSI  (15u)
#define PIN_SPI0_SCK   (14u)
#define __SPI0_DEVICE  spi1

// SPI1 for SD card
#define PIN_SPI1_MISO  PIN_SD_DAT0_MISO
#define PIN_SPI1_MOSI  PIN_SD_CMD_MOSI
#define PIN_SPI1_SCK   PIN_SD_CLK
#define PIN_SPI1_SS    PIN_SD_DAT3_CS
#define __SPI1_DEVICE  spi0

// Wire
#define PIN_WIRE0_SDA  (2u)
#define PIN_WIRE0_SCL  (3u)
#define __WIRE0_DEVICE i2c1

#define PIN_WIRE1_SDA  (31u)
#define PIN_WIRE1_SCL  (31u)
#define __WIRE1_DEVICE i2c0

#define SERIAL_HOWMANY (2u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (1u)

// pfodWeb NOTE: bespoke pin set (not ../generic_full/common.h) — GPIO16,18,19,20,21,22,23 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
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
static const uint8_t D17 = (17u);
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
