#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID 0x303a
#define USB_PID 0x1001

// The board RGB led is connected to GPIO #35
#define PIN_RGB_LED 35
// BUILTIN_LED can be used in new Arduino API digitalWrite() like in Blink.ino
static const uint8_t LED_BUILTIN = SOC_GPIO_PIN_COUNT + PIN_RGB_LED;
#define BUILTIN_LED    LED_BUILTIN  // backward compatibility
#define LED_BUILTIN    LED_BUILTIN
#define RGB_BUILTIN    LED_BUILTIN
#define RGB_BRIGHTNESS 64

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t TXD2 = 1;
static const uint8_t RXD2 = 2;

static const uint8_t SDA = 38;
static const uint8_t SCL = 39;

// pfodWeb NOTE: SS/MOSI/SCK deliberately NOT declared - dedicated
// onboard LCD SPI bus (confirmed via M5Stack AtomS3 docs: CS=15/
// MOSI=21/SCK=17 exact match). MISO deliberately NOT declared either -
// upstream declares it as -1, which wraps to 255 as a uint8_t and would
// otherwise leak a phantom "GPIO255" pin.

static const uint8_t G0 = 0;
static const uint8_t G1 = 1;
static const uint8_t G2 = 2;
static const uint8_t G3 = 3;
// pfodWeb NOTE: G4 deliberately NOT declared - dedicated onboard IR
// transmitter, not general-purpose.
static const uint8_t G5 = 5;
static const uint8_t G6 = 6;
static const uint8_t G7 = 7;
static const uint8_t G8 = 8;
static const uint8_t G36 = 36;
static const uint8_t G37 = 37;
static const uint8_t G38 = 38;
static const uint8_t G39 = 39;
static const uint8_t G40 = 40;
static const uint8_t G42 = 42;

static const uint8_t ADC1 = 7;
static const uint8_t ADC2 = 8;

#endif /* Pins_Arduino_h */
