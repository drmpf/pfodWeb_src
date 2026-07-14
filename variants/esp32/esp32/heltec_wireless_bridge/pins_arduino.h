#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define WIRELESS_BRIDGE true

static const uint8_t LED_BUILTIN = 25;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility

static const uint8_t KEY_BUILTIN = 0;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

// pfodWeb NOTE: SS/MOSI/MISO/SCK (GPIO18/27/19/5) deliberately NOT
// declared - this board's entire purpose is a LoRa wireless bridge, and
// there's no other plausible SPI consumer, so this bus is treated as
// dedicated to the onboard LoRa radio (same reasoning as tbeam/
// sparkfun_lora_gateway). RST_LoRa/DIO0/DIO1/DIO2 (GPIO14/26/35/34)
// deliberately NOT declared - explicit LoRa radio control lines.

static const uint8_t Vext = 21;
static const uint8_t LED = 25;
static const uint8_t BLE_LED = 25;
static const uint8_t WIFI_LED = 23;
static const uint8_t LoRa_LED = 22;

#endif /* Pins_Arduino_h */
