#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID 0x303a
#define USB_PID 0x8216

static const uint8_t LED_BUILTIN = 8 + SOC_GPIO_PIN_COUNT;
;
#define BUILTIN_LED    LED_BUILTIN  // backward compatibility
#define LED_BUILTIN    LED_BUILTIN  // allow testing #ifdef LED_BUILTIN
#define RGB_BUILTIN    LED_BUILTIN
#define RGB_BRIGHTNESS 5
// pfodWeb NOTE: RGB_POWER (GPIO7) - internal power-gate for the onboard
// RGB LED, not general-purpose (see board.json chipGpios override).

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 12;
static const uint8_t SCL = 11;

static const uint8_t SS = 37;
static const uint8_t MOSI = 38;
static const uint8_t MISO = 39;
static const uint8_t SCK = 40;

// pfodWeb NOTE: TFT_BL/DC/CS/RST deliberately NOT declared - dedicated
// onboard TFT display control lines (see board.json).

// pfodWeb NOTE: PIN_IR (GPIO9) deliberately NOT declared - dedicated
// onboard IR blaster/receiver, not general-purpose.

//BUTTON
static const uint8_t BUTTON_LEFT = 0;
static const uint8_t BUTTON_OK = 47;
static const uint8_t BUTTON_RIGHT = 48;

static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
// pfodWeb NOTE: A6/A8 (GPIO7/9) deliberately NOT declared - same as
// RGB_POWER/PIN_IR above.
static const uint8_t A7 = 8;
static const uint8_t A9 = 10;
static const uint8_t A10 = 11;
static const uint8_t A11 = 12;
static const uint8_t A12 = 13;
static const uint8_t A13 = 14;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
static const uint8_t A16 = 17;
static const uint8_t A17 = 18;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
// pfodWeb NOTE: T7/T9 (GPIO7/9) deliberately NOT declared - same as
// RGB_POWER/PIN_IR above.
static const uint8_t T8 = 8;
static const uint8_t T10 = 10;
static const uint8_t T11 = 11;
static const uint8_t T12 = 12;
static const uint8_t T13 = 13;
static const uint8_t T14 = 14;

#endif /* Pins_Arduino_h */
