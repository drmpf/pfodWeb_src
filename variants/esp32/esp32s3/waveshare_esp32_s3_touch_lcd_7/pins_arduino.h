
#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

// BN: ESP32 Family Device
#define USB_VID 0x303a
#define USB_PID 0x8234

#define USB_MANUFACTURER "Waveshare"
#define USB_PRODUCT      "ESP32-S3-Touch-LCD-7"
#define USB_SERIAL       ""

// display for ST7262
#define WS_LCD_B3 14
#define WS_LCD_B4 38
#define WS_LCD_B5 18
#define WS_LCD_B6 17
#define WS_LCD_B7 10

#define WS_LCD_G2 39
#define WS_LCD_G3 0
#define WS_LCD_G4 45
#define WS_LCD_G5 48
#define WS_LCD_G6 47
#define WS_LCD_G7 21

#define WS_LCD_R3 1
#define WS_LCD_R4 2
#define WS_LCD_R5 42
#define WS_LCD_R6 41
#define WS_LCD_R7 40

#define WS_LCD_VSYNC 3
#define WS_LCD_HSYNC 46
#define WS_LCD_PCLK  7
#define WS_LCD_DE    5

// Touch for gt911
#define WS_TP_SDA 8
#define WS_TP_SCL 9
#define WS_TP_RST -1
#define WS_TP_INT 4

//RS485
#define WS_RS485_RXD 16
#define WS_RS485_TXD 15

//CAN
#define WS_CAN_RXD 19
#define WS_CAN_TXD 20

//Onboard CH422G IO expander
#define WS_CH422G_SDA 8
#define WS_CH422G_SCL 9

// UART0 pins
static const uint8_t TX = 43;
static const uint8_t RX = 44;

// pfodWeb NOTE: SDA/SCL not declared — per this board's own comment
// this I2C bus is shared with the onboard IMU, and GPIO10 is also the
// dedicated LCD B7 data line, so it's not a general expansion port.

// Mapping based on the ESP32S3 data sheet - alternate for SPI2
static const uint8_t SS = 34;    // FSPICS0
static const uint8_t MOSI = 35;  // FSPID
static const uint8_t MISO = 37;  // FSPIQ
static const uint8_t SCK = 36;   // FSPICLK

// pfodWeb NOTE: OUTPUT_IO2/3/17/18 deliberately NOT declared — they
// just re-label GPIO2/3/17/18, which are already excluded above as
// dedicated onboard ST7262 RGB LCD data lines (R4/VSYNC/B6/B5).

// Analog capable pins on the header (pfodWeb NOTE: A0-A4/A6
// deliberately NOT declared — GPIO1/2/3/4/5/7 are all dedicated onboard
// LCD/touch pins, see the SDA/SCL/board.json notes above/below)
static const uint8_t A5 = 6;

// GPIO capable pins on the header (pfodWeb NOTE: D0/D2-D6/D9-D11
// deliberately NOT declared — dedicated onboard LCD/touch pins; D12-D16
// (GPIO33-37) are genuinely free on this board despite being in the
// chip's usual flash/PSRAM range — this board's own file declares them,
// so they're trusted per this project's audit policy)
static const uint8_t D1 = 6;
static const uint8_t D7 = 44;
static const uint8_t D8 = 43;
static const uint8_t D12 = 37;
static const uint8_t D13 = 36;
static const uint8_t D14 = 35;
static const uint8_t D15 = 34;
static const uint8_t D16 = 33;

// Touch input capable pins on the header (pfodWeb NOTE: T1-T5/T7
// deliberately NOT declared — dedicated onboard LCD/touch pins)
static const uint8_t T6 = 6;

#endif /* Pins_Arduino_h */
