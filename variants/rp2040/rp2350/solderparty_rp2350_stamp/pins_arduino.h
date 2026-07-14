#pragma once

#define PICO_RP2350A 1

// Pin definitions taken from:
//    https://rp2xxx-stamp-carrier-xl.solder.party/

// LEDs
#define PIN_LED        (3u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

#define PIN_SERIAL2_TX (24u)
#define PIN_SERIAL2_RX (25u)

// SPI
#define PIN_SPI0_MISO  (20u)
#define PIN_SPI0_MOSI  (23u)
#define PIN_SPI0_SCK   (22u)
#define PIN_SPI0_SS    (21u)

#define PIN_SPI1_MISO  (8u)
#define PIN_SPI1_MOSI  (11u)
#define PIN_SPI1_SCK   (10u)
#define PIN_SPI1_SS    (9u)

// SD Card connector
#define PIN_CARD_DETECT  (2u)
#define PIN_SD_CLK       (10u)
#define PIN_SD_CMD_MOSI  (11u)
#define PIN_SD_DAT0_MISO (8u)
#define PIN_SD_DAT3_CS   (9u)

// Wire
#define PIN_WIRE0_SDA  (4u)
#define PIN_WIRE0_SCL  (5u)

#define SERIAL_HOWMANY (2u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (1u)

// pfodWeb NOTE (RP2040/RP2350 family button/LED/NeoPixel + dedicated-hardware
// pin-exclusion audit, 2026-07-13): GPIO2,8,9,10,11 are dedicated to the
// onboard SD card connector, not general-purpose (see board.json/notes.txt).
// The vendor-shipped `#define PIN_WIRE1_SDA (2u)` / `PIN_WIRE1_SCL (3u)` pair
// (and matching `WIRE_HOWMANY (2u)`) were removed here: GPIO2/GPIO3 already
// have dedicated roles (SD card detect / onboard LED — see below) and this
// board's own Carrier XL reference schematic labels those two header
// positions "CARD_DET"/"LED_USR", not "SDA1"/"SCL1" — there is no second,
// independently-broken-out physical I2C bus on this board. Left in place,
// build_boards.js's unconditional i2c_sda/i2c_scl bus-role auto-append would
// have silently added spurious I2C capability on top of the confirmed
// card-detect/LED chipGpios entries (the same bug class fixed this session on
// adafruit_feather_can, adafruit_feather_prop_maker, and
// adafruit_feather_thinkink — see boardsDetails notes.txt for sources).
static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D3 = (3u);
static const uint8_t D4 = (4u);
static const uint8_t D5 = (5u);
static const uint8_t D6 = (6u);
static const uint8_t D7 = (7u);
static const uint8_t D12 = (12u);
static const uint8_t D13 = (13u);
static const uint8_t D14 = (14u);
static const uint8_t D15 = (15u);
static const uint8_t D16 = (16u);
static const uint8_t D17 = (17u);
static const uint8_t D18 = (18u);
static const uint8_t D19 = (19u);
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

static const uint8_t SS = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
