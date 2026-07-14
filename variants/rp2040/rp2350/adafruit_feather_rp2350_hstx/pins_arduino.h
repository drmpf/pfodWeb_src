#pragma once

#define PICO_RP2350A 1

// LEDs
#define PIN_LED        (7u)

#define PIN_NEOPIXEL   (21)
#define NUM_NEOPIXEL   (1)

// UARTs
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)
#define PIN_SERIAL2_TX (31u) // not pinned out
#define PIN_SERIAL2_RX (31u)

// SPI
// pfodWeb NOTE (2026-07-13): the vendor default PIN_SPI0_SS value (21u) is
// omitted here - GPIO21 is this board's confirmed onboard status NeoPixel
// (see board.json chipGpios), and there is no onboard SPI device using
// this default SS assignment (CircuitPython's own DEFAULT_SPI_BUS for this
// board defines only SCK/MOSI/MISO, no CS/SS), so leaving it declared would
// wrongly tag the confirmed NeoPixel pin with a spurious spi_ss capability
// (see build_boards.js's unconditional SS-alias auto-append). MISO/MOSI/SCK
// are left as-is; a user wiring up their own external SPI device to this
// board's default header pins would still need to pick their own SS pin
// manually, same as any board with no onboard SPI peripheral. Matches the
// identical fix applied to the sibling adafruit_feather_dvi/
// adafruit_feather_scorpio boards' pins_arduino.h.
#define PIN_SPI0_MISO  (20u)
#define PIN_SPI0_MOSI  (23u)
#define PIN_SPI0_SCK   (22u)
#define PIN_SPI1_MISO  (31u) // not pinned out
#define PIN_SPI1_MOSI  (31u)
#define PIN_SPI1_SCK   (31u)
#define PIN_SPI1_SS    (31u)

// Wire
#define __WIRE0_DEVICE i2c1
#define PIN_WIRE0_SDA  (2u)
#define PIN_WIRE0_SCL  (3u)

#define __WIRE1_DEVICE i2c0
#define PIN_WIRE1_SDA  (31u) // not pinned out
#define PIN_WIRE1_SCL  (31u)

#define SERIAL_HOWMANY (1u)
#define SPI_HOWMANY    (1u)
#define WIRE_HOWMANY   (1u)

// PSRAM
#define RP2350_PSRAM_CS         (8u)
#define RP2350_PSRAM_MAX_SCK_HZ (109*1000*1000)

// DVI connector
#define PIN_CKN (15u)
#define PIN_CKP (14u)
#define PIN_D0N (19u)
#define PIN_D0P (18u)
#define PIN_D1N (17u)
#define PIN_D1P (16u)
#define PIN_D2N (13u)
#define PIN_D2P (12u)

// pfodWeb NOTE: bespoke pin set (not ../generic_full/common.h) — GPIO8,12,13,14,15,16,17,18,19 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D2 = (2u);
static const uint8_t D3 = (3u);
static const uint8_t D4 = (4u);
static const uint8_t D5 = (5u);
static const uint8_t D6 = (6u);
static const uint8_t D7 = (7u);
static const uint8_t D9 = (9u);
static const uint8_t D10 = (10u);
static const uint8_t D11 = (11u);
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

// SS omitted - see pfodWeb NOTE above the PIN_SPI0_MISO/MOSI/SCK defines.
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
