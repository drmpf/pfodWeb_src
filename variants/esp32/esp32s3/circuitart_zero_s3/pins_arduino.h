#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define USB_VID          0x303A
#define USB_PID          0x80DB
#define USB_MANUFACTURER "CircuitART"
#define USB_PRODUCT      "ZeroS3"
#define USB_SERIAL       ""  // Empty string for MAC address

// User LED
#define LED_BUILTIN 46
#define BUILTIN_LED LED_BUILTIN  // backward compatibility

// RGB LED
#define PIN_RGB_LED 47
// RGB_BUILTIN and RGB_BRIGHTNESS can be used in new Arduino API rgbLedWrite() and digitalWrite() for blinking
#define RGB_BUILTIN    (PIN_RGB_LED + SOC_GPIO_PIN_COUNT)
#define RGB_BRIGHTNESS 64
#define RGBLED_NUM     1  // number of RGB LEDs

static const uint8_t KEY_BUILTIN = 0;

// pfodWeb NOTE: TFT_DC/CS/RST/RESET, SD_CS/SD_CHIP_SELECT, TX1/RX2, and
// SS/MOSI/SCK/MISO deliberately NOT declared — this board's onboard TFT
// (DC=5/CS=39/RST=40) and microSD card share one SPI bus (SS=39=TFT_CS,
// MOSI=35/SCK=36/MISO=37), plus a second UART (TX1/RX2=40/41) also
// overlapping the TFT RST pin — none general-purpose (see board.json).

static const uint8_t TX = 43;
static const uint8_t RX = 44;
static const uint8_t TX0 = 43;
static const uint8_t RX0 = 44;

static const uint8_t SDA = 33;
static const uint8_t SCL = 34;

static const uint8_t DAC1 = 17;
static const uint8_t DAC2 = 18;

// pfodWeb NOTE: A4-A15 deliberately NOT declared — dedicated onboard
// TFT/SD/camera pins (see board.json chipGpios override)
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A11 = 12;
static const uint8_t A16 = 17;
static const uint8_t A17 = 18;

// pfodWeb NOTE: T5-T11/T13-T15 deliberately NOT declared — same reason
static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T12 = 12;

// pfodWeb NOTE: D5-D11/D13-D16/D35-D41 deliberately NOT declared —
// same reason
static const uint8_t D0 = 0;
static const uint8_t D1 = 1;
static const uint8_t D2 = 2;
static const uint8_t D3 = 3;
static const uint8_t D4 = 4;
static const uint8_t D12 = 12;
static const uint8_t D17 = 17;
static const uint8_t D18 = 18;
static const uint8_t D33 = 33;
static const uint8_t D34 = 34;

// Camera
#define TFT_CAM_POWER 21

#define PWDN_GPIO_NUM  -1  // connected through expander
#define RESET_GPIO_NUM -1  // connected through expander
#define XCLK_GPIO_NUM  15
#define SIOD_GPIO_NUM  SDA
#define SIOC_GPIO_NUM  SCL

#define Y9_GPIO_NUM    14  //16
#define Y8_GPIO_NUM    13  //14
#define Y7_GPIO_NUM    11  //13
#define Y6_GPIO_NUM    10
#define Y5_GPIO_NUM    9  //8
#define Y4_GPIO_NUM    8  //6
#define Y3_GPIO_NUM    7
#define Y2_GPIO_NUM    6  //9
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM  48
#define PCLK_GPIO_NUM  16  //11

#endif /* Pins_Arduino_h */
