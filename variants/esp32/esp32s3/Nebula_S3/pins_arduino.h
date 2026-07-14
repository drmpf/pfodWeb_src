#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID 0x303a
#define USB_PID 0x1001

static const uint8_t LED_BUILTIN = SOC_GPIO_PIN_COUNT + 45;
#define BUILTIN_LED    LED_BUILTIN  // backward compatibility
#define LED_BUILTIN    LED_BUILTIN  // allow testing #ifdef LED_BUILTIN
#define RGB_BUILTIN    LED_BUILTIN
#define RGB_BRIGHTNESS 64

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 12;
static const uint8_t SCL = 13;

// pfodWeb NOTE: SDA1=2/SCL1=1 (secondary I2C/Wire1 bus) declarations
// removed - confirmed dedicated to the onboard MPU-6050 IMU, not a
// general-purpose bus (github.com/espressif/arduino-esp32/pull/8257,
// "Add board: Nebula S3"). Removing the static const alias here (not
// just the board.json chipGpios entry) is required per the pin-audit
// parser gotcha: build_boards.js's buildEsp32Board() unions GPIOs found
// via any pins_arduino.h alias with chipGpios keys, so leaving these
// declared here would leak GPIO1/GPIO2 back into the pin list even with
// the board.json exclusion. See board.json and notes.txt for reasoning.

static const uint8_t SS = 41;
static const uint8_t MOSI = 40;
static const uint8_t MISO = 39;
static const uint8_t SCK = 38;

// pfodWeb NOTE: D0=1/D1=2 removed - these are generic template aliases
// for the same GPIO1/GPIO2 excluded above (dedicated onboard MPU-6050
// IMU I2C bus). Left declared, they would leak GPIO1/GPIO2 back into
// the generated pin list via the D0/D1 aliases even with SDA1/SCL1
// removed. See board.json and notes.txt.
static const uint8_t D2 = 44;
static const uint8_t D3 = 43;
static const uint8_t D4 = 42;
static const uint8_t D5 = 41;
static const uint8_t D6 = 40;
static const uint8_t D7 = 39;
static const uint8_t D8 = 38;
static const uint8_t D9 = 27;
static const uint8_t D10 = 45;
static const uint8_t D11 = 4;
static const uint8_t D12 = 5;
static const uint8_t D13 = 6;
static const uint8_t D14 = 7;
static const uint8_t D15 = 15;
static const uint8_t D16 = 16;
static const uint8_t D17 = 17;
static const uint8_t D18 = 18;

static const uint8_t A0 = 4;
static const uint8_t A1 = 5;
static const uint8_t A2 = 6;
static const uint8_t A3 = 7;

// pfodWeb NOTE: A4=1/A5=2 removed - same reasoning as D0/D1 above:
// generic template aliases for GPIO1/GPIO2, excluded as the dedicated
// onboard MPU-6050 IMU I2C bus. See board.json and notes.txt.

#endif /* Pins_Arduino_h */
