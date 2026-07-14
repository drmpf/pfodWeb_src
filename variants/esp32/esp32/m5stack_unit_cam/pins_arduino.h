#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 4;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 17;
static const uint8_t SCL = 16;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard OV2640 camera data/control pins (confirmed via M5Stack
// UnitCam docs: XCLK/PCLK/HREF/VSYNC/RESET/SIOC/SIOD/D0-D7).

// pfodWeb NOTE: G5/G15/G18/G19/G21/G22/G23/G25/G26/G27/G32/G34/G35/G36/
// G39 deliberately NOT declared - dedicated onboard OV2640 camera pins
// (see board.json chipGpios override). G0/G2/G13/G33 confirmed
// genuinely free via M5Stack docs; SDA/SCL (GPIO17/16) stay kept as the
// general HY2.0-4P connector.
static const uint8_t G2 = 2;
static const uint8_t G33 = 33;

static const uint8_t G13 = 13;
static const uint8_t G4 = 4;

static const uint8_t G0 = 0;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

static const uint8_t ADC1 = 35;
static const uint8_t ADC2 = 36;

#endif /* Pins_Arduino_h */
