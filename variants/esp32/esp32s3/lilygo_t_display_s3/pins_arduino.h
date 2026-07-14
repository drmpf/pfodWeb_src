#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define USB_VID 0x303a
#define USB_PID 0x1001

static const uint8_t BUTTON_1 = 0;
static const uint8_t BUTTON_2 = 14;
static const uint8_t BAT_VOLT = 4;
#define BAT_VOLT_PIN BAT_VOLT

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 18;
static const uint8_t SCL = 17;

static const uint8_t SS = 10;
static const uint8_t MOSI = 11;
static const uint8_t MISO = 13;
static const uint8_t SCK = 12;

// pfodWeb NOTE: TP_RESET/TP_INIT and the ST7789 LCD_* pins deliberately
// NOT declared — dedicated onboard touch controller + display, not
// general-purpose (see board.json chipGpios override).

// P1 (pfodWeb NOTE: PIN_21/16 deliberately NOT declared — those header
// positions are wired to TP_RESET/TP_INIT above)
static const uint8_t PIN_43 = 43;
static const uint8_t PIN_44 = 44;
static const uint8_t PIN_18 = 18;
static const uint8_t PIN_17 = 17;

// P2
static const uint8_t PIN_1 = 1;
static const uint8_t PIN_2 = 2;
static const uint8_t PIN_3 = 3;
static const uint8_t PIN_10 = 10;
static const uint8_t PIN_11 = 11;
static const uint8_t PIN_12 = 12;
static const uint8_t PIN_13 = 13;

// Analog (pfodWeb NOTE: A15 deliberately NOT declared — GPIO16 is
// TP_INIT above)
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A9 = 10;
static const uint8_t A10 = 11;
static const uint8_t A11 = 12;
static const uint8_t A12 = 13;
static const uint8_t A16 = 17;
static const uint8_t A17 = 18;

// Touch
static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T10 = 10;
static const uint8_t T11 = 11;
static const uint8_t T12 = 12;
static const uint8_t T13 = 13;

#endif /* Pins_Arduino_h */
