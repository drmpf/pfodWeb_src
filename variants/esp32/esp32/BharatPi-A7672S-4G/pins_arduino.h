#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 2;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t A0 = 14;
static const uint8_t A1 = 13;
static const uint8_t A2 = 12;
static const uint8_t A3 = 4;
static const uint8_t A4 = 2;
static const uint8_t A5 = 0;

static const uint8_t TX = 1;
static const uint8_t RX = 3;

// pfodWeb NOTE: TX_4G/RX_4G (GPIO17/16) deliberately NOT declared -
// dedicated onboard A7672S cellular modem UART. Already absent from the
// ESP32-classic chip default (PSRAM-reserved range), so removing the
// alias is sufficient - no board.json override needed.

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

static const uint8_t SS = 5;
static const uint8_t MOSI = 23;
static const uint8_t MISO = 19;
static const uint8_t SCK = 18;

#endif /* Pins_Arduino_h */
