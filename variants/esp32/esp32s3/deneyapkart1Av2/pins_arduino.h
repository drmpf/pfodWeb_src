#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID          0x303A
#define USB_PID          0x8147
#define USB_MANUFACTURER "Turkish Technology Team Foundation (T3)"
#define USB_PRODUCT      "DENEYAP KART 1A v2"
#define USB_SERIAL       ""  // Empty string for MAC address

static const uint8_t LED_BUILTIN = SOC_GPIO_PIN_COUNT + 48;  //D9
#define BUILTIN_LED    LED_BUILTIN                           // backward compatibility
#define LED_BUILTIN    LED_BUILTIN                           // allow testing #ifdef LED_BUILTIN
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

// pfodWeb NOTE: SS/MOSI/MISO/SCK not declared — this whole bus is the
// onboard camera's data lines (CAMD5/CAMPC/CAMD6/CAMD2 below), not
// general-purpose (see board.json).

// pfodWeb NOTE: A0-A6 deliberately NOT declared — dedicated onboard
// camera pins (see CAMSD/CAMSC/CAMV/CAMH/CAMD9/CAMXC/CAMD8 below)
static const uint8_t A7 = 18;
static const uint8_t A8 = 9;

// pfodWeb NOTE: T0-T3/T7/T8 deliberately NOT declared — same camera pins
static const uint8_t T4 = 8;
static const uint8_t T5 = 3;
static const uint8_t T6 = 10;

// pfodWeb NOTE: D0/D1/D4-D8 deliberately NOT declared — same camera
// pins; D16-D19 deliberately NOT declared — dedicated onboard SD card
// pins (see SDCK/SDMO/SDCS/SDMI below)
static const uint8_t D2 = 43;
static const uint8_t D3 = 44;
static const uint8_t D9 = 48;
static const uint8_t D10 = 47;
static const uint8_t D11 = 21;
static const uint8_t D12 = 10;
static const uint8_t D13 = 3;
static const uint8_t D14 = 8;
static const uint8_t D15 = 0;

// pfodWeb NOTE: PWM0/1/2/4 deliberately NOT declared — same dedicated
// camera pins (GPIO15/16/17/38); PWM3 (GPIO18) is genuinely free
static const uint8_t PWM3 = 18;

// pfodWeb NOTE: fixed onboard camera — every CAM* line is dedicated,
// not general-purpose (see board.json chipGpios override)

// pfodWeb NOTE: fixed onboard microSD card — every SD* line is
// dedicated, not general-purpose (see board.json chipGpios override)

static const uint8_t BAT = 9;
#define BAT_VOLT_PIN BAT

#endif /* Pins_Arduino_h */
