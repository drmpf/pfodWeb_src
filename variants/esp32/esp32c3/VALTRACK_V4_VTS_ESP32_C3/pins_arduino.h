#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t TX = 21;
static const uint8_t RX = 20;

// pfodWeb NOTE: TX1/RX1 (GPIO0/GPIO1), SDA/SCL (GPIO5/GPIO6), MOSI (GPIO10),
// A1/A2/A3 (GPIO3/GPIO4/GPIO5), D1-D5 (GPIO3/4/5/6/7), D10 (GPIO10) and the
// GPIO_IIC_DATA/GPIO_IIC_CLOCK/GPIO_PWRKEY/GPIO_GSM_ENABLE/GPIO_TPS_ENABLE/
// GPIO_INT1/GPIO_CHG_IN declarations that used to alias those same GPIO
// numbers have been deleted as part of the dedicated-hardware pin-exclusion
// audit - see board.json's header comment and
// boardsDetails/esp32/esp32c3/VALTRACK_V4_VTS_ESP32_C3/notes.txt for the
// full reasoning/sources. Deleting only the semantically-named GPIO_*
// aliases is not sufficient: the vendor file's boilerplate A<n>/D<n>/SPI
// blocks are "blanket identity" declarations that re-alias the exact same
// excluded GPIO numbers under generic names, which would otherwise silently
// re-leak them back into the Designer's pin list (see playbook section 4).

// pfodWeb NOTE: MISO (was GPIO9) and SCK (was GPIO8) deleted post-audit -
// these are generic boilerplate SPI aliases, never vendor/firmware-
// confirmed as a real SPI bus on this board, and they silently
// contaminated the confirmed GPIO_SOS button and GPIO_LED_SIGNAL
// NeoPixel's capability lists with "spi_miso"/"spi_sck"
// (build_boards.js appends these unconditionally to any GPIO matching
// the MISO/SCK alias, the same mechanism as the TX/RX hard-reservation
// bug). SS (GPIO20) left as-is - it coincides with this board's RX pin,
// which is handled specially by build_boards.js before the SPI-alias
// injection runs, so it's harmless.
static const uint8_t SS = 20;

static const uint8_t A0 = 2;

static const uint8_t D0 = 2;
static const uint8_t D6 = 21;
static const uint8_t D7 = 20;
static const uint8_t D8 = 8;
static const uint8_t D9 = 9;

static const uint8_t GPIO_ANALOG_IN = 2;
static const uint8_t GPIO_SOS = 9;
static const uint8_t GPIO_LED_SIGNAL = 8;

#endif /* Pins_Arduino_h */
