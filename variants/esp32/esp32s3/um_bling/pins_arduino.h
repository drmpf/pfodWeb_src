#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID          0x303A
#define USB_PID          0x817F
#define USB_MANUFACTURER "Unexpected Maker"
#define USB_PRODUCT      "BLING!"
#define USB_SERIAL       ""

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 8;
static const uint8_t SCL = 9;

// pfodWeb NOTE: SS/MOSI/MISO/SDO/SDI/SCK and SD_CS/SD_DETECT deliberately
// NOT declared - dedicated onboard microSD card SPI bus (GPIO21/35/36/37/38).

// pfodWeb NOTE: A0-A3/A5-A6 and T1-T4/T6-T7 deliberately NOT declared -
// same dedicated onboard I2S amp/RTC_INT/RGB_PWR pins below.
static const uint8_t A4 = 5;
static const uint8_t A7 = 8;
static const uint8_t A8 = 9;

static const uint8_t T5 = 5;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;

static const uint8_t BUTTON_A = 11;
static const uint8_t BUTTON_B = 10;
static const uint8_t BUTTON_C = 33;
static const uint8_t BUTTON_D = 34;

static const uint8_t VBAT_SENSE = 17;
#define BAT_VOLT_PIN VBAT_SENSE
static const uint8_t VBUS_SENSE = 16;

// pfodWeb NOTE: I2S_MIC_*/I2S_AMP_*/RTC_INT deliberately NOT declared -
// dedicated onboard mic (GPIO39-42), amp (GPIO1-4), and RTC interrupt (GPIO7).

static const uint8_t RGB_DATA = 18;
// RGB_BUILTIN and RGB_BRIGHTNESS can be used in new Arduino API rgbLedWrite()
#define RGB_BUILTIN    (RGB_DATA + SOC_GPIO_PIN_COUNT)
#define RGB_BRIGHTNESS 64
// BUILTIN_LED can be used in new Arduino API digitalWrite() like in Blink.ino
static const uint8_t LED_BUILTIN = RGB_BUILTIN;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

// pfodWeb NOTE: RGB_PWR (GPIO6) deliberately NOT declared - internal
// power-gate for the onboard RGB LED, not general-purpose.

#endif /* Pins_Arduino_h */
