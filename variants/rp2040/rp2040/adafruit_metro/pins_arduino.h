#pragma once

// LEDs
#define PIN_LED        (13u)

// NeoPixel
#define PIN_NEOPIXEL   (14u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

// Not pinned out
#define PIN_SERIAL2_TX (31u)
#define PIN_SERIAL2_RX (31u)

// SPI
#define PIN_SPI0_MISO  (20u)
#define PIN_SPI0_MOSI  (19u)
#define PIN_SPI0_SCK   (18u)
#define PIN_SPI0_SS    (23u)

// SDIO
#define PIN_SD_CLK       (18u)
#define PIN_SD_CMD_MOSI  (19u)
#define PIN_SD_DAT0_MISO (20u)
#define PIN_SD_DAT1      (21u)
#define PIN_SD_DAT2      (22u)
#define PIN_SD_DAT3_CS   (23u)
#define PIN_SD_DETECT    (15u)

// Not pinned out
#define PIN_SPI1_MISO  (31u)
#define PIN_SPI1_MOSI  (31u)
#define PIN_SPI1_SCK   (31u)
#define PIN_SPI1_SS    (31u)

// Wire
#define __WIRE0_DEVICE i2c0
#define PIN_WIRE0_SDA (16u)
#define PIN_WIRE0_SCL (17u)
#define __WIRE1_DEVICE i2c1
#define PIN_WIRE1_SDA (2u)
#define PIN_WIRE1_SCL (3u)

#define SERIAL_HOWMANY (2u)
#define SPI_HOWMANY    (1u)
#define WIRE_HOWMANY   (1u)

// pfodWeb NOTE: bespoke pin set (not ../generic_full/common.h) — GPIO15,18,19,20,21,22,23 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
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
static const uint8_t D16 = (16u);
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

static const uint8_t SS = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
