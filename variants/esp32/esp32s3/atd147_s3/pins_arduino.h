#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define USB_VID 0x303a
#define USB_PID 0x1001

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 8;
static const uint8_t SCL = 9;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard TFT display SPI bus (LCD_CS/SCK/SDA macros alias these).

// pfodWeb NOTE: LCD_DC/RES deliberately NOT declared - dedicated onboard
// TFT display control lines (see board.json).

static const uint8_t BTN_A = 4;
static const uint8_t BTN_B = 5;
static const uint8_t BTN_C = 45;
#define KEY_BUILTIN BTN_A

// pfodWeb NOTE: A9-A13 and T10-T14 deliberately NOT declared - same
// dedicated TFT display SPI bus and LCD_DC/RES pins as above.
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A7 = 8;
static const uint8_t A8 = 9;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
static const uint8_t A16 = 17;
static const uint8_t A17 = 18;
static const uint8_t A18 = 19;
static const uint8_t A19 = 20;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;

#endif /* Pins_Arduino_h */
