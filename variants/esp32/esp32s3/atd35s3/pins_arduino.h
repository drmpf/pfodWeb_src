#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define USB_VID 0x303a
#define USB_PID 0x1001

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 8;
static const uint8_t SCL = 9;

static const uint8_t SS = 10;
static const uint8_t MOSI = 11;
static const uint8_t MISO = 13;
static const uint8_t SCK = 12;

// pfodWeb NOTE: LCD_DC/RES/BL and SD_CS/CD deliberately NOT declared -
// dedicated onboard TFT display (shares the SS/MOSI/SCK bus above, plus
// MISO) + microSD card (see board.json chipGpios override).

static const uint8_t BTN_A = 4;
#define KEY_BUILTIN BTN_A

static const uint8_t LED_BUILTIN = 5;

// pfodWeb NOTE: DAC_DIN/BCLK/WS deliberately NOT declared - dedicated
// onboard I2S DAC/audio output.

// pfodWeb NOTE: A2/A9-A13/A16/A17 and T3/T10-T14 deliberately NOT
// declared - same dedicated TFT/SD SPI bus and LCD_BL/RES pins as above.
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A7 = 8;
static const uint8_t A8 = 9;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
static const uint8_t A18 = 19;
static const uint8_t A19 = 20;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;

#endif /* Pins_Arduino_h */
