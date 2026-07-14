#pragma once

// Pin definitions taken from:
//    https://datasheets.raspberrypi.org/pico/pico-datasheet.pdf

#include <cyw43_wrappers.h>

/*
 * pfodWeb NOTE: this file is deliberately self-contained (does NOT pull
 * in the shared generic/common.h the way the stock rpipico2w variant does)
 * because Pico 2 W wires GPIO23/24/25/29 internally to the onboard CYW43
 * WiFi/BLE chip's SPI-ish control interface — they are NOT available as
 * general-purpose GPIOs on this board, even though the RP2350 silicon has
 * them. common.h's blanket D0-D29 declarations don't know about this
 * board-specific restriction and would wrongly expose all four as plain
 * digital I/O. GPIO29 doubles as ADC3 (A3) but is only safely readable
 * when the WiFi SPI bus is idle, so it's omitted entirely rather than
 * offered with a caveat. Confirmed against the Pico 2 W schematic and the
 * arduino-pico core's cyw43_wrappers.h — same CYW43439 wiring as Pico W.
 */

// LEDs — LED_BUILTIN lives on the WiFi chip (cyw43_wrappers.h intercepts
// pin 64 specially), not a real RP2350 GPIO; not parsed as a pin here.
#define PIN_LED        (64u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

#define PIN_SERIAL2_TX (8u)
#define PIN_SERIAL2_RX (9u)

// SPI0 (the only user-accessible SPI bus on this board — SPI1 pins 12-15
// remain general GPIOs and are covered by the D<n> aliases below)
#define PIN_SPI0_MISO  (16u)
#define PIN_SPI0_MOSI  (19u)
#define PIN_SPI0_SCK   (18u)
#define PIN_SPI0_SS    (17u)

// Wire0
#define PIN_WIRE0_SDA  (4u)
#define PIN_WIRE0_SCL  (5u)

#define SERIAL_HOWMANY (3u)
#define SPI_HOWMANY    (1u)
#define WIRE_HOWMANY   (1u)

#define PINS_COUNT          (26u)
#define NUM_DIGITAL_PINS    (26u)
#define NUM_ANALOG_INPUTS   (3u)
#define NUM_ANALOG_OUTPUTS  (0u)
#define ADC_RESOLUTION      (12u)

// Digital pins — GPIO23/24/25 (WiFi chip enable/data/select) omitted.
static const uint8_t D0  = (0u);
static const uint8_t D1  = (1u);
static const uint8_t D2  = (2u);
static const uint8_t D3  = (3u);
static const uint8_t D4  = (4u);
static const uint8_t D5  = (5u);
static const uint8_t D6  = (6u);
static const uint8_t D7  = (7u);
static const uint8_t D8  = (8u);
static const uint8_t D9  = (9u);
static const uint8_t D10 = (10u);
static const uint8_t D11 = (11u);
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
static const uint8_t D26 = (26u);
static const uint8_t D27 = (27u);
static const uint8_t D28 = (28u);

// Analog — A3/GPIO29 (WiFi chip clock line, only safely readable when the
// WiFi SPI bus is idle) is intentionally not offered.
static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);

static const uint8_t SS   = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK  = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
