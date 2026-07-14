#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define WIFI_Kit_32    true
#define DISPLAY_HEIGHT 64
#define DISPLAY_WIDTH  128

#define F_XTAL_MHZ 26

static const uint8_t LED_BUILTIN = 25;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t KEY_BUILTIN = 0;

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

static const uint8_t SS = 5;
static const uint8_t MOSI = 23;
static const uint8_t MISO = 19;
static const uint8_t SCK = 18;

static const uint8_t A0 = 36;
static const uint8_t A1 = 37;
static const uint8_t A2 = 38;
static const uint8_t A3 = 39;
static const uint8_t A4 = 32;
static const uint8_t A5 = 33;
static const uint8_t A6 = 34;
static const uint8_t A7 = 35;

// pfodWeb NOTE: A10/A13 deliberately NOT declared - dedicated onboard
// OLED SDA/SCL pins (see below).
static const uint8_t A11 = 0;
static const uint8_t A12 = 2;
static const uint8_t A14 = 13;
static const uint8_t A15 = 12;
static const uint8_t A16 = 14;
static const uint8_t A17 = 27;
static const uint8_t A18 = 25;
static const uint8_t A19 = 26;

// pfodWeb NOTE: T0/T3 deliberately NOT declared - same as A10/A13 above.
static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T4 = 13;
static const uint8_t T5 = 12;
static const uint8_t T6 = 14;
static const uint8_t T7 = 27;
static const uint8_t T8 = 33;
static const uint8_t T9 = 32;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

static const uint8_t LED = 25;
// pfodWeb NOTE: Vext (power-gate) and RST_OLED/SCL_OLED/SDA_OLED
// deliberately NOT declared - internal control line and dedicated
// onboard OLED display pins. SS/MOSI/MISO/SCK stay kept - no radio chip
// evidenced on this "WiFi Kit" (non-LoRa) variant.

#endif /* Pins_Arduino_h */
