#pragma once


// LEDs
#define PIN_LED        (13u)

// Extra hardware!
#define PIN_SWITCH            0
#define PIN_SPEAKER_ENABLE   14
#define PIN_SPEAKER          16
#define PIN_ROTB             17
#define PIN_ROTA             18
#define OLED_CS              22
#define OLED_RST             23
#define OLED_DC              24

#define PIN_NEOPIXEL         19
#define NUM_NEOPIXEL         12

// Not pinned out
#define PIN_SERIAL1_TX (31u)
#define PIN_SERIAL1_RX (31u)

// Not pinned out
#define PIN_SERIAL2_TX (31u)
#define PIN_SERIAL2_RX (31u)

// SPI
#define PIN_SPI1_MISO  (28u)
#define PIN_SPI1_MOSI  (27u)
#define PIN_SPI1_SCK   (26u)
#define PIN_SPI1_SS    (31u) // not pinned out

// Not pinned out
#define PIN_SPI0_MISO  (31u)
#define PIN_SPI0_MOSI  (31u)
#define PIN_SPI0_SCK   (31u)
#define PIN_SPI0_SS    (31u)

// Wire
#define PIN_WIRE0_SDA  (20u)
#define PIN_WIRE0_SCL  (21u)

// Not pinned out
#define PIN_WIRE1_SDA  (31u)
#define PIN_WIRE1_SCL  (31u)

#define SERIAL_HOWMANY (1u)
#define SPI_HOWMANY    (1u)
#define WIRE_HOWMANY   (1u)

// pfodWeb NOTE: bespoke pin set (not ../generic_full/common.h) — GPIO0,14,16,17,18,22,23,24 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
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
static const uint8_t D15 = (15u);
static const uint8_t D19 = (19u);
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D25 = (25u);
static const uint8_t D26 = (26u);
static const uint8_t D27 = (27u);
static const uint8_t D28 = (28u);
static const uint8_t D29 = (29u);

static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);
static const uint8_t A3 = (29u);

// pfodWeb NOTE: SS/MOSI/MISO/SCK not declared — PIN_SPI0_x is (31u)
// ("not pinned out"; GPIO31 does not physically exist), which
// otherwise leaked through as a phantom "SS (GPIO31)" pin.
// PIN_WIRE0_SDA/SCL are also (31u) on this board, so SDA/SCL are
// not declared either.
