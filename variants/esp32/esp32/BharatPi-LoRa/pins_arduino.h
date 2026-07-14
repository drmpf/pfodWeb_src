#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 2;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

// pfodWeb NOTE: A0/A3/A4 (GPIO14/4/2) deliberately NOT declared - same
// dedicated LoRa radio pins as below (RST/LORA_SS/DIO0).
static const uint8_t A1 = 13;
static const uint8_t A2 = 12;
static const uint8_t A5 = 0;

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t TX2 = 17;
static const uint8_t RX2 = 16;

// pfodWeb NOTE: LORA_SS/RST/DIO0 (GPIO4/14/2) deliberately NOT declared
// - dedicated onboard LoRa radio control lines.

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

static const uint8_t SS = 5;
static const uint8_t MOSI = 23;
static const uint8_t MISO = 19;
static const uint8_t SCK = 18;

#endif /* Pins_Arduino_h */
