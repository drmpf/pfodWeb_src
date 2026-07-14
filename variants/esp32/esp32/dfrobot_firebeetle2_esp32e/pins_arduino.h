#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

typedef unsigned char uint8_t;

static const uint8_t LED_BUILTIN = 2;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t TX = 1;
static const uint8_t RX = 3;

// pfodWeb NOTE: TX2/RX2 (GPIO17/16) KEPT. This board (DFR0654, 4MB flash)
// uses a plain ESP-WROOM-32E module with no PSRAM (DFRobot product page
// confirms "Flash Memory - 4 MB", no PSRAM listed, distinct from the
// N16R2/PSRAM variant DFR1139), so GPIO16/17 are not consumed by PSRAM.
// DFRobot's own product page lists "Digital Pins x 18" including
// "IO16, IO17" among the board's user-accessible GPIOs. See board.json.
static const uint8_t TX2 = 17;
static const uint8_t RX2 = 16;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

// pfodWeb NOTE: SS=5 boilerplate alias deleted - GPIO5/D8 is the vendor-
// confirmed onboard WS2812 RGB LED data line (wiki.dfrobot.com/dfr0654/:
// "Onboard RGB Light - WS2812 RGB LED, controlled by pin IO5/D8"), not a
// real SPI chip-select on this board. Left in place it would let
// build_boards.js unconditionally tag GPIO5 with spi_ss. See board.json.
static const uint8_t MOSI = 23;
static const uint8_t MISO = 19;
static const uint8_t SCK = 18;

static const uint8_t D0 = 3;
static const uint8_t D1 = 1;
static const uint8_t D2 = 25;
static const uint8_t D3 = 26;
static const uint8_t D4 = 27;
static const uint8_t D5 = 0;
static const uint8_t D6 = 14;
static const uint8_t D7 = 13;
static const uint8_t D8 = 5;
static const uint8_t D9 = 2;
static const uint8_t D10 = 17;
static const uint8_t D11 = 16;
static const uint8_t D12 = 4;
static const uint8_t D13 = 12;

static const uint8_t A0 = 36;
static const uint8_t A1 = 39;
static const uint8_t A2 = 34;
static const uint8_t A3 = 35;
static const uint8_t A4 = 15;
static const uint8_t A5 = 35;
static const uint8_t A6 = 4;
static const uint8_t A7 = 0;
static const uint8_t A8 = 2;
static const uint8_t A9 = 13;
static const uint8_t A10 = 12;
static const uint8_t A11 = 14;
static const uint8_t A12 = 27;
static const uint8_t A13 = 25;
static const uint8_t A14 = 26;

static const uint8_t T0 = 4;
static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T3 = 15;
static const uint8_t T4 = 13;
static const uint8_t T5 = 12;
static const uint8_t T6 = 14;
static const uint8_t T7 = 27;
static const uint8_t T8 = 33;
static const uint8_t T9 = 32;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

#endif /* Pins_Arduino_h */
