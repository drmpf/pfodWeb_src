#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t TX = 1;
static const uint8_t RX = 3;

// pfodWeb NOTE: SDA/SCL deliberately NOT declared - confirmed via
// M5Stack Fire docs as the fully internal IMU (MPU6886+BMM150) + power-
// management (IP5306) I2C bus, not a free Grove port (unlike M5Stack
// Core Basic, where the same GPIOs are genuinely shared/general).

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard microSD card SPI bus (confirmed via M5Stack Fire docs).

// pfodWeb NOTE: G4/G18/G19/G21-G23/G25/G34 deliberately NOT declared -
// dedicated onboard microSD SPI bus, internal I2C bus, DAC/speaker, and
// mic pins. G16/G17 deliberately NOT declared - internally wired to
// PSRAM on this WROVER-based module, not safely repurposable (confirmed
// via M5Stack Fire docs) - see board.json chipGpios override. G15
// (onboard NeoPixel strip) stays kept per policy.
static const uint8_t G3 = 3;
static const uint8_t G2 = 2;
static const uint8_t G12 = 12;
static const uint8_t G15 = 15;
static const uint8_t G35 = 35;
static const uint8_t G36 = 36;
static const uint8_t G26 = 26;
static const uint8_t G1 = 1;
static const uint8_t G5 = 5;
static const uint8_t G13 = 13;
static const uint8_t G0 = 0;

static const uint8_t DAC2 = 26;

static const uint8_t ADC1 = 35;
static const uint8_t ADC2 = 36;

#endif /* Pins_Arduino_h */
