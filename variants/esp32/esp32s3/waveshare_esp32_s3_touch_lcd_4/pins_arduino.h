
#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

// BN: ESP32 Family Device
#define USB_VID 0x303a
#define USB_PID 0x823D

#define USB_MANUFACTURER "Waveshare"
#define USB_PRODUCT      "ESP32-S3-Touch-LCD-4"
#define USB_SERIAL       ""

// UART0 pins
static const uint8_t TX = 43;
static const uint8_t RX = 44;

// pfodWeb NOTE: SDA/SCL not declared — the vendor's own value here is
// (-1), a "not connected" sentinel that would otherwise leak a phantom
// "SDA (GPIO255)" pin (uint8_t wraps -1 to 255, which doesn't exist).

// Mapping based on the ESP32S3 data sheet - alternate for SPI2
static const uint8_t SS = 34;    // FSPICS0
static const uint8_t MOSI = 35;  // FSPID
static const uint8_t MISO = 37;  // FSPIQ
static const uint8_t SCK = 36;   // FSPICLK

// Mapping based on the ESP32S3 data sheet - alternate for OUTPUT
static const uint8_t OUTPUT_IO2 = 2;
static const uint8_t OUTPUT_IO3 = 3;
static const uint8_t OUTPUT_IO17 = 17;
static const uint8_t OUTPUT_IO18 = 18;

// pfodWeb NOTE: this board's file (unlike its 5/5b/7/43/43b siblings)
// documents no WS_LCD_*/WS_TP_* pins at all, and a fuller sibling file
// (touch_lcd_1.69) shows GPIO2/3/17/18 are NOT dedicated to its onboard
// display there — so, absent solid evidence for this specific variant,
// A0-A6/D0-D16/T1-T7 below are kept as declared rather than guessing.

// Analog capable pins on the header
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;

// GPIO capable pins on the header
static const uint8_t D0 = 7;
static const uint8_t D1 = 6;
static const uint8_t D2 = 5;
static const uint8_t D3 = 4;
static const uint8_t D4 = 3;
static const uint8_t D5 = 2;
static const uint8_t D6 = 1;
static const uint8_t D7 = 44;
static const uint8_t D8 = 43;
static const uint8_t D9 = 40;
static const uint8_t D10 = 39;
static const uint8_t D11 = 38;
static const uint8_t D12 = 37;
static const uint8_t D13 = 36;
static const uint8_t D14 = 35;
static const uint8_t D15 = 34;
static const uint8_t D16 = 33;

// Touch input capable pins on the header
static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;

#endif /* Pins_Arduino_h */
