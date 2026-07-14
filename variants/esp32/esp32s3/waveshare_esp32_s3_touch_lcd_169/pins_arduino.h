
#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

// BN: ESP32 Family Device
#define USB_VID 0x303a
#define USB_PID 0x821e

#define USB_MANUFACTURER "Waveshare"
#define USB_PRODUCT      "ESP32-S3-Touch-LCD-1.69"
#define USB_SERIAL       ""

// display for ST7789V2
#define WS_LCD_DC  4
#define WS_LCD_CS  5
#define WS_LCD_SCL 6
#define WS_LCD_SDA 7
#define WS_LCD_RST 8
#define WS_LCD_BL  15

// Touch for CST816T
#define WS_TP_SCL 10
#define WS_TP_SDA 11
#define WS_TP_RST 13
#define WS_TP_INT 14

// Onboard RTC for PCF85063
#define WS_RTC_SCL     10
#define WS_RTC_SDA     11
#define WS_RTC_ADDRESS 0x51
#define WS_RTC_INT     41

// Onboard  QMI8658 IMU
#define WS_QMI8658_SDA     11
#define WS_QMI8658_SCL     10
#define WS_QMI8658_ADDRESS 0x6B
#define WS_QMI8658_INT1    38

// Onboard Electric buzzer & Custom buttons
// GPIO and PSRAM conflict, need to pay attention when using
#define WS_BUZZ    33  // Please pull down the level when using
#define WS_SYS_OUT 36
#define WS_SYS_EN  35

// Partial voltage measurement method
#define WS_BAT_ADC   1
#define BAT_VOLT_PIN WS_BAT_ADC

// UART0 pins
static const uint8_t TX = 43;
static const uint8_t RX = 44;

// pfodWeb NOTE: SDA/SCL not declared — shared with the onboard touch/
// RTC/IMU chips per this board's own comment above, not a general
// expansion port (see board.json).

// Mapping based on the ESP32S3 data sheet - alternate for SPI2
// pfodWeb NOTE: GPIO33/35/36 (BUZZ/SYS_EN/SYS_OUT above) double as
// MOSI/SCK here — the vendor's own "GPIO and PSRAM conflict" warning on
// those 3 pins takes priority, so MOSI/SCK/D13/D14/D16 are not declared
// (SS/MISO, which don't overlap the buzzer/system pins, are kept).
static const uint8_t SS = 34;    // FSPICS0
static const uint8_t MISO = 37;  // FSPIQ

// pfodWeb NOTE: OUTPUT_IO2/3/17/18 (GPIO2/3/17/18) are kept — unlike
// this board's touch_lcd_5/5b/7/43/43b siblings, this specific display
// (ST7789V2, pins 4/5/6/7/8/15) doesn't use GPIO2/3/17/18 for anything.
static const uint8_t OUTPUT_IO2 = 2;
static const uint8_t OUTPUT_IO3 = 3;
static const uint8_t OUTPUT_IO17 = 17;
static const uint8_t OUTPUT_IO18 = 18;

// Analog capable pins on the header (pfodWeb NOTE: A3-A6 deliberately
// NOT declared — dedicated onboard ST7789V2 display pins)
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;

// GPIO capable pins on the header (pfodWeb NOTE: D0-D3/D11 deliberately
// NOT declared — dedicated onboard display/IMU pins; D13/D14/D16 not
// declared per the buzzer/system-pin note above)
static const uint8_t D4 = 3;
static const uint8_t D5 = 2;
static const uint8_t D6 = 1;
static const uint8_t D7 = 44;
static const uint8_t D8 = 43;
static const uint8_t D9 = 40;
static const uint8_t D10 = 39;
static const uint8_t D12 = 37;
static const uint8_t D15 = 34;

// Touch input capable pins on the header (pfodWeb NOTE: T4-T7
// deliberately NOT declared — dedicated onboard display pins)
static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;

#endif /* Pins_Arduino_h */
