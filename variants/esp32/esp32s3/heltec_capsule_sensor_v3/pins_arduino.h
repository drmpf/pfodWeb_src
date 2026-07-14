#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define HELTEC_CAPSULE_SENSOR_V3 true

#define USB_VID 0x303a
#define USB_PID 0x1001

// Some boards have too low voltage on this pin (board design bug)
// Use different pin with 3V and connect with 48
// and change this setup for the chosen pin (for example 38)
static const uint8_t LED_BUILTIN = SOC_GPIO_PIN_COUNT + 48;
#define BUILTIN_LED    LED_BUILTIN  // backward compatibility
#define LED_BUILTIN    LED_BUILTIN
#define RGB_BUILTIN    LED_BUILTIN
#define RGB_BRIGHTNESS 64

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 41;
static const uint8_t SCL = 42;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard LoRa radio SPI bus (no other SPI peripheral on this board;
// see RST_LoRa/BUSY_LoRa/DIO0 below).

// pfodWeb NOTE: A0/A2-A4/A7-A13 and T1/T3-T5/T8-T14 deliberately NOT
// declared - dedicated onboard GPS module, LoRa radio SPI bus, and
// LoRa RST/BUSY/DIO0 pins (see below).
static const uint8_t A1 = 2;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
static const uint8_t A16 = 17;
static const uint8_t A17 = 18;
static const uint8_t A18 = 19;
static const uint8_t A19 = 20;

static const uint8_t T2 = 2;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;

static const uint8_t LED0 = 33;
static const uint8_t LED1 = 34;
static const uint8_t USER_BUTTON = 18;

// pfodWeb NOTE: Vext (power-gate for onboard peripherals), GPS_*, and
// ADC_BATTERY_CTRL_PIN (battery-ADC enable FET) deliberately NOT declared
// - internal-only control lines, not general-purpose (see board.json).
static const uint8_t ADC_BATTERY_PIN = 7;
#define BAT_VOLT_PIN ADC_BATTERY_PIN

// pfodWeb NOTE: RST_LoRa/BUSY_LoRa/DIO0 deliberately NOT declared -
// dedicated onboard LoRa radio control lines.

#endif /* Pins_Arduino_h */
