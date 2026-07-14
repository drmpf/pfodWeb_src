#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define USB_VID          0x303A
#define USB_PID          0x81BB
#define USB_MANUFACTURER "PowerFeather"
#define USB_PRODUCT      "ESP32-S3 PowerFeather"
#define USB_SERIAL       ""

// pfodWeb NOTE: ALARM(21)/INT(5)/EN(7) removed - confirmed dedicated to
// the onboard fuel gauge alarm, battery charger interrupt, and Feather
// Wing power-enable control respectively (vendor SDK
// github.com/PowerFeather/powerfeather-sdk src/Mainboard/Mainboard.h and
// docs.powerfeather.dev "Pins & Signals"). See board.json for full
// per-pin reasoning and sources.

static const uint8_t LED = 46;
static const uint8_t BTN = 0;

static const uint8_t TX = 44;
static const uint8_t RX = 42;
static const uint8_t TX0 = 43;

static const uint8_t SS = -1;
static const uint8_t MISO = 41;
static const uint8_t MOSI = 40;
static const uint8_t SCK = 39;

static const uint8_t SCL = 36;
static const uint8_t SDA = 35;

// pfodWeb NOTE: WIRE1_PIN_DEFINED / SCL1(48) / SDA1(47) removed - this is
// the SDK-managed STEMMA QT I2C bus (Wire1) used internally to talk to
// the onboard fuel gauge and charger ICs; vendor docs explicitly state
// "User code should not configure and use these IO, as doing so can
// cause faulty behavior." See board.json for full reasoning and sources.

static const uint8_t A0 = 10;
static const uint8_t A1 = 9;
static const uint8_t A2 = 8;
static const uint8_t A3 = 3;
static const uint8_t A4 = 2;
static const uint8_t A5 = 1;

static const uint8_t D5 = 15;
static const uint8_t D6 = 16;
static const uint8_t D7 = 37;
static const uint8_t D8 = 6;
static const uint8_t D9 = 17;
static const uint8_t D10 = 18;
static const uint8_t D11 = 45;
static const uint8_t D12 = 12;
static const uint8_t D13 = 11;

#define LED_BUILTIN 46
#define BUILTIN_LED LED_BUILTIN  // backward compatibility

#endif /* Pins_Arduino_h */
