#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 4;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN
#define LEDB        LED_BUILTIN
#define LEDR        3
#define LEDG        1

static const uint8_t GPKEY = 0;
#define KEY_BUILTIN GPKEY
#define BUILTIN_KEY GPKEY
#define BOOT        GPKEY

static const uint8_t TX = 1;
static const uint8_t RX = 3;
#define TX1 TX
#define RX1 RX

// pfodWeb NOTE: SDA/SCL not declared - same GPIO4/15 as IMUSD/IMUSC below,
// the dedicated onboard IMU I2C bus (vendor names it as such, not general
// purpose). SS/MOSI/MISO/SCK not declared - same GPIO21/5/18/19 as
// CAMD5/CAMPC/CAMD6/CAMD2 below, the onboard camera's data bus.

// pfodWeb NOTE: A0-A5 deliberately NOT declared - all fall on dedicated
// onboard camera/IMU pins (see CAMSD/CAMXC/CAMD8/CAMD9/CAMV/CAMH below).

// pfodWeb NOTE: T0/T1/T4/T5 deliberately NOT declared - dedicated onboard
// camera (CAMXC/CAMSD) and mic (MICD/MICC) pins.
static const uint8_t T2 = 27;
static const uint8_t T3 = 14;

// pfodWeb NOTE: D0/D1/D4-D7/D10-D13 deliberately NOT declared - dedicated
// onboard camera, IMU, and mic pins (see below).
static const uint8_t D2 = 1;
static const uint8_t D3 = 3;
static const uint8_t D8 = 0;
static const uint8_t D9 = 2;
static const uint8_t D14 = 14;
static const uint8_t D15 = 27;

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

static const uint8_t MICD = 12;
static const uint8_t MICC = 13;

static const uint8_t IMUSD = 4;
static const uint8_t IMUSC = 15;

#endif /* Pins_Arduino_h */
