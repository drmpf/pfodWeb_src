#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID          0x239A
#define USB_PID          0x80E5
#define USB_MANUFACTURER "Adafruit"
#define USB_PRODUCT      "EPD MagTag 2.9\" ESP32-S2"
#define USB_SERIAL       ""  // Empty string for MAC address

// User LED
#define LED_BUILTIN 13
#define BUILTIN_LED LED_BUILTIN  // backward compatibility

// Neopixel
#define PIN_NEOPIXEL 1  // D1
// RGB_BUILTIN and RGB_BRIGHTNESS can be used in new Arduino API rgbLedWrite() and digitalWrite() for blinking
#define RGB_BUILTIN    (PIN_NEOPIXEL + SOC_GPIO_PIN_COUNT)
#define RGB_BRIGHTNESS 64

#define NEOPIXEL_NUM      4    // number of neopixels
#define NEOPIXEL_POWER    21   // power pin
#define NEOPIXEL_POWER_ON LOW  // power pin state when on

#define PIN_BUTTON1 15
#define PIN_BUTTON2 14
#define PIN_BUTTON3 12
#define PIN_BUTTON4 11
#define PIN_BUTTON5 0  // BOOT0 switch

// pfodWeb NOTE: EPD_BUSY/RESET/DC/CS (GPIO5/6/7/8) and ACCEL_IRQ (GPIO9)
// deliberately NOT declared - dedicated onboard E-ink display + accelerometer
// (see board.json chipGpios override).

static const uint8_t BUTTON_A = PIN_BUTTON1;
static const uint8_t BUTTON_B = PIN_BUTTON2;
static const uint8_t BUTTON_C = PIN_BUTTON3;
static const uint8_t BUTTON_D = PIN_BUTTON4;

static const uint8_t LIGHT_SENSOR = 3;
static const uint8_t BATT_MONITOR = 4;
#define BAT_VOLT_PIN BATT_MONITOR
static const uint8_t SPEAKER_SHUTDOWN = 16;

static const uint8_t SDA = 33;
static const uint8_t SCL = 34;

// pfodWeb NOTE: SS/MOSI/SCK/MISO deliberately NOT declared - same E-ink
// display SPI bus as EPD_CS(8)/MOSI(35)/SCK(36)/MISO(37) above.

static const uint8_t TX = 43;
static const uint8_t RX = 44;
#define TX1 TX
#define RX1 RX

// pfodWeb NOTE: A6-A10 (GPIO5/6/7/8/9) deliberately NOT declared - same
// E-ink/accelerometer pins above. A18/A19 (GPIO19/20) deliberately NOT
// declared - native USB D-/D+ (would otherwise re-leak the chip-default
// excluded USB pins via this board's own alias).
static const uint8_t A0 = 17;
static const uint8_t A1 = 18;
static const uint8_t A2 = 1;
static const uint8_t A3 = 2;
static const uint8_t A4 = 3;
static const uint8_t A5 = 4;
static const uint8_t A11 = 10;
static const uint8_t A12 = 11;
static const uint8_t A13 = 12;
static const uint8_t A14 = 13;
static const uint8_t A15 = 14;
static const uint8_t A16 = 15;
static const uint8_t A17 = 16;

static const uint8_t T10 = 10;

static const uint8_t DAC1 = 17;
static const uint8_t DAC2 = 18;

#endif /* Pins_Arduino_h */
