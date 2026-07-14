#pragma once

#define PICO_RP2350A 1

// LEDs
#define PIN_LED        (7u)

#define PIN_NEOPIXEL   (21u)
#define NUM_NEOPIXEL   (1)

// SD Card connector
#define PIN_CARD_DETECT (13u)
#define PIN_SD_CLK (14u)
#define PIN_SD_CMD_MOSI (15u)
#define PIN_SD_DAT0_MISO (16u)
#define PIN_SD_DAT1 (17u)
#define PIN_SD_DAT2 (18u)
#define PIN_SD_DAT3_CS (19u)

// UARTs
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)
#define PIN_SERIAL2_TX (99u) // not pinned out
#define PIN_SERIAL2_RX (99u)

// SPI
#define PIN_SPI0_MISO  (20u)
#define PIN_SPI0_MOSI  (23u)
#define PIN_SPI0_SCK   (22u)
// pfodWeb NOTE: vendor's default `PIN_SPI0_SS (13u)` alias removed (2026-07-13) — GPIO13 is
// PIN_CARD_DETECT (the onboard microSD card-presence switch), not a general-purpose/dedicated
// SPI0 CS pin. The RP2040 (non-"2350") sibling board has the identical arbitrary vendor default
// (also 13u) which there collided with PIN_LED instead; Adafruit's own Feather RP2040 Adalogger
// pinouts guide confirms this SPI0/SPI1 header has no fixed dedicated CS pin at all (any GPIO
// can be software-selected as CS), so this alias was never real dedicated wiring. Left in place
// it would have caused build_boards.js's unconditional SS-alias auto-append to contaminate the
// confirmed PIN_CARD_DETECT chipGpios entry with a spurious spi_ss capability. See
// boardsDetails/rp2040/rp2350/adafruit_feather_rp2350_adalogger/notes.txt.
#define __SPI0_DEVICE  spi0

// SPI1 for SD card
#define PIN_SPI1_MISO  PIN_SD_DAT0_MISO
#define PIN_SPI1_MOSI  PIN_SD_CMD_MOSI
#define PIN_SPI1_SCK   PIN_SD_CLK
#define PIN_SPI1_SS    PIN_SD_DAT3_CS
#define __SPI1_DEVICE  spi1

// Wire
#define __WIRE0_DEVICE i2c0
#define PIN_WIRE0_SDA  (2u)
#define PIN_WIRE0_SCL  (3u)

#define __WIRE1_DEVICE i2c1
#define PIN_WIRE1_SDA  (31u) // not pinned out
#define PIN_WIRE1_SCL  (31u)

#define SERIAL_HOWMANY (1u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (1u)

// pfodWeb NOTE: bespoke pin set (not ../generic_full/common.h) — GPIO13,14,15,16,17,18,19 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
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
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);
static const uint8_t D23 = (23u);
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
