#pragma once

// Pin definitions taken from:
//    https://datasheets.raspberrypi.org/pico/pico-datasheet.pdf


// LEDs
#define PIN_LED        (25u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

#define PIN_SERIAL2_TX (8u)
#define PIN_SERIAL2_RX (9u)

// SPI
#define PIN_SPI0_MISO  (20u)
#define PIN_SPI0_MOSI  (19u)
#define PIN_SPI0_SCK   (18u)
#define PIN_SPI0_SS    (1u)

// pfodWeb NOTE (2026-07-13): the vendor default PIN_SPI1_SS value (13u) is
// omitted here - GPIO13 is this board's confirmed onboard green user LED
// (see board.json chipGpios), and the official CircuitPython/pico-sdk board
// definitions for this exact board expose only ONE SPI bus (SPI0: SCK18/
// MOSI19/MISO20/CSN1) with no second SPI bus documented at all, so this
// SPI1 block is a spare/unused Feather-template default (same rationale as
// adafruit_feather_scorpio's PIN_SPI0_SS removal). Leaving PIN_SPI1_SS
// declared would wrongly tag the confirmed LED pin with a spurious spi_ss
// capability (see build_boards.js's unconditional SS-alias auto-append).
// MISO/MOSI/SCK are left as-is; a user wiring up their own external SPI1
// device would still need to pick their own SS pin manually, same as any
// board with no onboard SPI1 peripheral.
#define PIN_SPI1_MISO  (12u)
#define PIN_SPI1_MOSI  (11u)
#define PIN_SPI1_SCK   (10u)

// Wire
#define PIN_WIRE0_SDA  (8u)
#define PIN_WIRE0_SCL  (9u)

#define PIN_WIRE1_SDA  (2u)
#define PIN_WIRE1_SCL  (3u)

#define SERIAL_HOWMANY (3u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (2u)

#include "../generic/common.h"
