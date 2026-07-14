#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 13;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t TX = 17;
static const uint8_t RX = 16;

static const uint8_t SDA = 23;
static const uint8_t SCL = 22;

// pfodWeb NOTE: SS/MOSI/MISO/SCK aliases (previously pointing at GPIO2,
// GPIO18, GPIO19 and GPIO5) deleted - dedicated-hardware pin-exclusion
// audit, 2026-07-12. These are generic ESP32 template boilerplate, never
// vendor-confirmed as a real onboard SPI bus on this board. The vendor's
// own official Arduino library source (github.com/oroca/OROCA-EduBot-
// Library) shows all four GPIOs are actually wired to fixed onboard
// hardware unrelated to SPI - see the board.json override and
// boardsDetails/esp32/esp32/oroca_edubot/notes.txt for the full mapping.
// Leaving these declared would have silently contaminated the excluded
// pins' capability lists with spi_ss/spi_mosi/spi_miso/spi_sck regardless
// of the chipGpios exclusion below, since build_boards.js appends those
// capabilities unconditionally for any GPIO matching these alias names.

static const uint8_t A0 = 34;
static const uint8_t A1 = 39;
static const uint8_t A2 = 36;
static const uint8_t A3 = 33;

static const uint8_t D0 = 4;
static const uint8_t D1 = 16;
static const uint8_t D2 = 17;
static const uint8_t D3 = 22;
static const uint8_t D4 = 23;
// pfodWeb NOTE: D5/D6/D7 aliases (previously pointing at GPIO5, GPIO18 and
// GPIO19) deleted, same audit as above - those three GPIOs are confirmed
// dedicated onboard hardware, not general-purpose pins. See the board.json
// override for what each one is actually wired to.
static const uint8_t D8 = 33;

// vbat measure
static const uint8_t VBAT = 35;
#define BAT_VOLT_PIN VBAT

static const uint8_t T0 = 4;
static const uint8_t T1 = 0;
// pfodWeb NOTE: T2/T3/T5/T6/T7/T9 touch-sensor aliases (previously pointing
// at six different GPIOs in the 2/12/14/15/27/32 range) deleted -
// dedicated-hardware pin-exclusion audit, 2026-07-12. Those six GPIOs are
// confirmed onboard stepper-motor driver control lines (enable/step/
// direction for the two wheel motors), per the vendor's own official
// Arduino library source. Leaving the touch aliases in place would have
// re-added the excluded GPIOs to the generated pin list as plain unlabeled
// pins even after removing them from board.json's chipGpios map. See
// boardsDetails/esp32/esp32/oroca_edubot/notes.txt.
static const uint8_t T4 = 13;
static const uint8_t T8 = 33;

// pfodWeb NOTE: DAC1/DAC2 aliases (previously pointing at GPIO25 and
// GPIO26) deleted - dedicated-hardware pin-exclusion audit, 2026-07-12.
// The vendor's own official Arduino library source confirms both GPIOs are
// actually wired to the onboard I2S audio amplifier chip's clock lines,
// not general-purpose DAC outputs. See the board.json override and
// boardsDetails/esp32/esp32/oroca_edubot/notes.txt.

#endif /* Pins_Arduino_h */
