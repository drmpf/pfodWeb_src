#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define WIFI_LoRa_32_V3 true
#define DISPLAY_HEIGHT  64
#define DISPLAY_WIDTH   128

#define USB_VID 0x303a
#define USB_PID 0x1001

static const uint8_t LED_BUILTIN = 35;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 41;
static const uint8_t SCL = 42;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard LoRa radio SPI bus (no other SPI peripheral on this board).

// pfodWeb NOTE: A7-A13/A16/A17 and T8-T14 deliberately NOT declared -
// dedicated onboard OLED I2C, LoRa radio+SPI bus, and Vext power-gate.
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
static const uint8_t A18 = 19;
static const uint8_t A19 = 20;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;

static const uint8_t LED = 35;
// pfodWeb NOTE: Vext (power-gate) and RST_OLED/SCL_OLED/SDA_OLED
// deliberately NOT declared - internal control line and dedicated
// onboard OLED display I2C bus.

// pfodWeb NOTE: RST_LoRa/BUSY_LoRa/DIO0 deliberately NOT declared -
// dedicated onboard LoRa radio control lines.

#endif /* Pins_Arduino_h */
