#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define HT_DE01 true

static const uint8_t LED_BUILTIN = 35;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN

static const uint8_t KEY_BUILTIN = 0;

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

static const uint8_t SS = 8;
static const uint8_t MOSI = 10;
static const uint8_t MISO = 11;
static const uint8_t SCK = 9;

// pfodWeb NOTE: A1-A6 deliberately NOT declared - dedicated onboard
// E-ink display pins (see RST_EINK/BUSY_EINK/CLK_EINK/CS_EINK/DC_EINK/
// SDI_EINK below).
static const uint8_t A0 = 1;
static const uint8_t A7 = 8;
static const uint8_t A8 = 9;
static const uint8_t A9 = 10;
static const uint8_t A10 = 11;
static const uint8_t A11 = 12;
static const uint8_t A12 = 13;
static const uint8_t A13 = 14;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
static const uint8_t A16 = 17;
static const uint8_t A17 = 18;
static const uint8_t A18 = 19;
static const uint8_t A19 = 20;

static const uint8_t T1 = 1;
// pfodWeb NOTE: T2-T7 deliberately NOT declared - same dedicated E-ink
// display pins as above.
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;
static const uint8_t T10 = 10;
static const uint8_t T11 = 11;
static const uint8_t T12 = 12;
static const uint8_t T13 = 13;
static const uint8_t T14 = 14;

static const uint8_t LED = 18;
// pfodWeb NOTE: Vext (power-gate) and RST_EINK/BUSY_EINK/CLK_EINK/
// CS_EINK/DC_EINK/SDI_EINK deliberately NOT declared - internal control
// line and dedicated onboard E-ink display SPI bus.

#endif /* Pins_Arduino_h */
