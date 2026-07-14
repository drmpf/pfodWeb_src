#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 2;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 4;
static const uint8_t SCL = 13;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard OV2640 camera data/control pins (confirmed via M5Stack
// TimerCam docs: XCLK/PCLK/HREF/VSYNC/RESET/SIOC/SIOD/D0-D7).

// pfodWeb NOTE: G5/G15/G18/G19/G21/G22/G23/G25/G26/G27/G32/G34/G35/G36/
// G39 deliberately NOT declared - dedicated onboard OV2640 camera pins.
// G33 deliberately NOT declared - dedicated battery-hold pin on this
// board (differs from sibling UnitCam, where it's free) - see
// board.json chipGpios override. G2 stays kept as the status LED;
// SDA/SCL (GPIO4/13) stay kept as the general Grove connector.
static const uint8_t G2 = 2;

static const uint8_t G13 = 13;
static const uint8_t G4 = 4;

static const uint8_t G0 = 0;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

static const uint8_t ADC1 = 35;
static const uint8_t ADC2 = 36;

#endif /* Pins_Arduino_h */
