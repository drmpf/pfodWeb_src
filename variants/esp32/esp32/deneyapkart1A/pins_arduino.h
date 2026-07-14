#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

static const uint8_t LED_BUILTIN = SOC_GPIO_PIN_COUNT + 13;  //D12
#define BUILTIN_LED    LED_BUILTIN                           // backward compatibility
#define LED_BUILTIN    LED_BUILTIN                           // allow testing #ifdef LED_BUILTIN
#define RGB_BUILTIN    LED_BUILTIN
#define RGBLED         LED_BUILTIN
#define RGB_BRIGHTNESS 64

static const uint8_t GPKEY = 0;
#define KEY_BUILTIN GPKEY
#define BUILTIN_KEY GPKEY
#define BOOT        GPKEY

static const uint8_t TX = 1;
static const uint8_t RX = 3;
#define TX1 TX
#define RX1 RX

static const uint8_t SDA = 4;
static const uint8_t SCL = 15;

// pfodWeb NOTE: SS/MOSI/MISO/SCK not declared - same GPIO21/5/18/19 as
// CAMD5/CAMPC/CAMD6/CAMD2 below, the onboard camera's data bus.

// pfodWeb NOTE: A0-A5 deliberately NOT declared - all fall on dedicated
// onboard camera pins (see CAMSD/CAMXC/CAMD8/CAMD9/CAMV/CAMH below).

// pfodWeb NOTE: T0-T4 deliberately NOT declared - dedicated onboard
// camera (CAMXC/CAMSD) and microSD (SDCK/SDMO/SDCS) pins.
static const uint8_t T5 = 13;

// pfodWeb NOTE: D0/D1/D4-D7/D9/D13-D15 deliberately NOT declared -
// dedicated onboard camera and microSD pins (see below).
static const uint8_t D2 = 1;
static const uint8_t D3 = 3;
static const uint8_t D8 = 0;
static const uint8_t D10 = 4;
static const uint8_t D11 = 15;
static const uint8_t D12 = 13;

// pfodWeb NOTE: DAC1/DAC2 and PWM0/PWM1 deliberately NOT declared - same
// dedicated onboard camera pins as CAMSC/CAMD7/CAMD4/CAMD3 below.

static const uint8_t CAMSD = 33;
static const uint8_t CAMSC = 25;
static const uint8_t CAMD2 = 19;
static const uint8_t CAMD3 = 22;
static const uint8_t CAMD4 = 23;
static const uint8_t CAMD5 = 21;
static const uint8_t CAMD6 = 18;
static const uint8_t CAMD7 = 26;
static const uint8_t CAMD8 = 35;
static const uint8_t CAMD9 = 34;
static const uint8_t CAMPC = 5;
static const uint8_t CAMXC = 32;
static const uint8_t CAMH = 39;
static const uint8_t CAMV = 36;

// pfodWeb NOTE: SDMI/SDMO/SDCS/SDCK (GPIO2/14/12/27) deliberately NOT
// declared - dedicated onboard microSD card SPI bus, not general-purpose.

#endif /* Pins_Arduino_h */
