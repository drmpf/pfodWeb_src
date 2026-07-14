#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define Vision_Master_T190 true
#define DISPLAY_HEIGHT     170
#define DISPLAY_WIDTH      320

#define USB_VID 0x303a
#define USB_PID 0x1001

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 2;
static const uint8_t SCL = 1;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard LoRa radio SPI bus (no other SPI peripheral on this board).

// pfodWeb NOTE: A4/A7-A13 and T5/T8-T14 deliberately NOT declared -
// dedicated onboard Vext power-gate, LoRa radio+SPI bus.
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
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
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;

// pfodWeb NOTE: Vext (power-gate) and TFT_SCL/CS/RST/RS/SDA deliberately
// NOT declared - internal control line and dedicated onboard TFT display.

// pfodWeb NOTE: RST_LoRa/BUSY_LoRa/DIO0 deliberately NOT declared -
// dedicated onboard LoRa radio control lines.

#endif /* Pins_Arduino_h */
