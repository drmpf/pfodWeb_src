#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

// touch screen
#define TP_SDA 23
#define TP_SCL 32
#define TP_INT 38

// Interrupt IO port
#define RTC_INT     37
#define APX20X_INT  35
#define BMA42X_INT1 39

static const uint8_t TX = 1;
static const uint8_t RX = 3;

//Serial1 Already assigned to GPS LORA
#define TX1 33
#define RX1 34

// Already assigned to BMA423 PCF8563 and external extensions
static const uint8_t SDA = 21;
static const uint8_t SCL = 22;
// pfodWeb NOTE: SS/MOSI/MISO/SCK (GPIO13/15/2/14) deliberately NOT
// declared - "SPI has been configured as an SD card slot" per vendor
// comment (dedicated onboard microSD card SPI bus).
// Externally programmable IO
static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

#endif /* Pins_Arduino_h */
