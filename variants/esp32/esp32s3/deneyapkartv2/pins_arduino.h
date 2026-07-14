#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID          0x303A
#define USB_PID          0x82EB
#define USB_MANUFACTURER "Turkish Technology Team Foundation (T3)"
#define USB_PRODUCT      "DENEYAP KART v2"
#define USB_SERIAL       ""  // Empty string for MAC address

static const uint8_t LED_BUILTIN = SOC_GPIO_PIN_COUNT + 46;
#define BUILTIN_LED    LED_BUILTIN  // backward compatibility
#define LED_BUILTIN    LED_BUILTIN  // allow testing #ifdef LED_BUILTIN
#define RGB_BUILTIN    LED_BUILTIN
#define RGBLED         LED_BUILTIN
#define RGB_BRIGHTNESS 64

static const uint8_t GPKEY = 0;
#define KEY_BUILTIN GPKEY
#define BUILTIN_KEY GPKEY

static const uint8_t TX = 43;
static const uint8_t RX = 44;
#define TX1 TX
#define RX1 RX

static const uint8_t SDA = 47;
static const uint8_t SCL = 21;

// pfodWeb NOTE: SS/MOSI/MISO/SCK not declared - same GPIO42/39/40/41 as
// CAMD5/CAMPC/CAMD6/CAMD2 below, the onboard camera's data bus.

// pfodWeb NOTE: A0-A6/A12-A17 deliberately NOT declared - dedicated
// onboard camera (see CAMSD/CAMSC/CAMD2-9/CAMPC/CAMXC/CAMH/CAMV below)
// or SD card pins (see SDCM/SDCK/SDDA below).
static const uint8_t A7 = 18;
static const uint8_t A8 = 8;
static const uint8_t A9 = 9;
static const uint8_t A10 = 10;
static const uint8_t A11 = 11;

// pfodWeb NOTE: T0-T3/T8-T13 deliberately NOT declared - same camera/SD pins
static const uint8_t T4 = 8;
static const uint8_t T5 = 9;
static const uint8_t T6 = 10;
static const uint8_t T7 = 11;

// pfodWeb NOTE: D0/D1/D4-D8/D17-D23/D27-D29 deliberately NOT declared -
// same dedicated onboard camera and SD card pins as above
static const uint8_t D2 = 43;
static const uint8_t D3 = 44;
static const uint8_t D9 = 48;
static const uint8_t D10 = 47;
static const uint8_t D11 = 21;
static const uint8_t D12 = 11;
static const uint8_t D13 = 10;
static const uint8_t D14 = 9;
static const uint8_t D15 = 8;
static const uint8_t D16 = 18;
static const uint8_t D24 = 46;
static const uint8_t D25 = 0;
static const uint8_t D26 = 3;

// pfodWeb NOTE: fixed onboard camera - every CAM* line is dedicated,
// not general-purpose (see board.json chipGpios override)

// pfodWeb NOTE: fixed onboard microSD card - every SD* line is
// dedicated, not general-purpose (see board.json chipGpios override)

static const uint8_t BAT = 3;
#define BAT_VOLT_PIN BAT

#endif /* Pins_Arduino_h */
