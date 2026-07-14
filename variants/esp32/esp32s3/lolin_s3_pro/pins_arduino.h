#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID 0x303a
#define USB_PID 0x8161

static const uint8_t LED_BUILTIN = 38 + SOC_GPIO_PIN_COUNT;
#define BUILTIN_LED    LED_BUILTIN  // backward compatibility
#define LED_BUILTIN    LED_BUILTIN  // allow testing #ifdef LED_BUILTIN
#define RGB_BUILTIN    LED_BUILTIN
#define RGB_BRIGHTNESS 64

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 9;
static const uint8_t SCL = 10;

// pfodWeb NOTE: the default SS alias was deleted - it pointed at the
// same GPIO as this board's confirmed onboard button, and
// build_boards.js unconditionally attaches an spi_ss capability to any
// GPIO matching the SS alias, which was silently contaminating the
// button's capability list.
static const uint8_t MOSI = 11;
static const uint8_t MISO = 13;
static const uint8_t SCK = 12;

// pfodWeb NOTE: TF_CS/TS_CS/TFT_CS/DC/RST/LED deliberately NOT declared
// - dedicated onboard microSD + touch + TFT display pins (see board.json).

static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A7 = 8;
static const uint8_t A8 = 9;
static const uint8_t A9 = 10;
static const uint8_t A10 = 11;
static const uint8_t A11 = 12;
static const uint8_t A12 = 13;
// pfodWeb NOTE: A13 (GPIO14) deliberately NOT declared - same as TFT_LED above.
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
static const uint8_t T7 = 7;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;
static const uint8_t T10 = 10;
static const uint8_t T11 = 11;
static const uint8_t T12 = 12;
static const uint8_t T13 = 13;
// pfodWeb NOTE: T14 (GPIO14) deliberately NOT declared - same as TFT_LED above.

#endif /* Pins_Arduino_h */
