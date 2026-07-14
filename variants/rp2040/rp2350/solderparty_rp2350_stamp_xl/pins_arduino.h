#pragma once

// Pin definitions taken from:
//    https://rp2xxx-stamp-carrier-xl.solder.party/
//    https://www.solder.party/docs/rp2xxx-stamp-related/rp2350-stamp-xl/downloads/

#define PICO_RP2350A 0 // RP2350B
#define RP2350_PSRAM_CS (8u)

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

// pfodWeb NOTE (RP2040/RP2350 family button/LED/NeoPixel + dedicated-hardware
// pin-exclusion audit, 2026-07-13): the vendor-shipped `#define PIN_WIRE1_SDA
// (2u)` / `PIN_WIRE1_SCL (3u)` pair (and matching `WIRE_HOWMANY (2u)`) were
// removed here — see boardsDetails/rp2040/rp2350/solderparty_rp2350_stamp_xl/
// notes.txt. GPIO2/GPIO3 already have dedicated roles on this board (SD card
// detect / onboard LED_USR — see board.json chipGpios below) and the Carrier
// XL breakout this board's pin definitions are based on labels those two
// header positions "CARD_DET"/"LED_USR", not "SDA1"/"SCL1" — there is no
// second, independently-broken-out physical I2C bus at those two positions.
// Same fix already applied to the sibling solderparty_rp2350_stamp board.
#define SERIAL_HOWMANY (2u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (1u)

// DVI connector
#define PIN_CKN (15u)
#define PIN_CKP (14u)
#define PIN_D0N (13u)
#define PIN_D0P (12u)
#define PIN_D1N (19u)
#define PIN_D1P (18u)
#define PIN_D2N (17u)
#define PIN_D2P (16u)

// pfodWeb NOTE: bespoke, fully self-contained pin set (not
// ../generic_full/common.h — that's 30-pin RP2040/RP2350A only, but this
// board is genuinely RP2350B / 48-pin per its own `PICO_RP2350A 0` above).
// GPIO2/8/9/10/11 (SD card connector + PSRAM CS) and GPIO12-19 (DVI
// connector) are dedicated to onboard peripherals, not general-purpose.
static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D3 = (3u);
static const uint8_t D4 = (4u);
static const uint8_t D5 = (5u);
static const uint8_t D6 = (6u);
static const uint8_t D7 = (7u);
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
static const uint8_t D30 = (30u);
static const uint8_t D31 = (31u);
static const uint8_t D32 = (32u);
static const uint8_t D33 = (33u);
static const uint8_t D34 = (34u);
static const uint8_t D35 = (35u);
static const uint8_t D36 = (36u);
static const uint8_t D37 = (37u);
static const uint8_t D38 = (38u);
static const uint8_t D39 = (39u);

static const uint8_t A0 = (40u);
static const uint8_t A1 = (41u);
static const uint8_t A2 = (42u);
static const uint8_t A3 = (43u);
static const uint8_t A4 = (44u);
static const uint8_t A5 = (45u);
static const uint8_t A6 = (46u);
static const uint8_t A7 = (47u);

static const uint8_t SS = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
