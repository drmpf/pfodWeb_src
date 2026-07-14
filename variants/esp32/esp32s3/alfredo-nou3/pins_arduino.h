#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#define USB_VID          0xAFD0
#define USB_PID          0x0003
#define USB_MANUFACTURER "Alfredo"
#define USB_PRODUCT      "NoU3"
#define USB_SERIAL       ""  // Empty string for MAC address

// User LED
#define LED_BUILTIN 45
#define BUILTIN_LED LED_BUILTIN  // backward compatibility

// pfodWeb NOTE: this file originally also had a dead-code block, already
// disabled by the vendor via C++ line comments, declaring TX on GPIO
// thirty-nine and RX on GPIO forty (plus matching TX1/RX1 defines) - the
// vendor never wired a dedicated UART1 to these pins (the board uses
// native USB CDC for Serial). That block was deleted here rather than
// left in place because this project's build_boards.js ESP32 parser
// regex is comment-blind - it would match the disabled declaration text
// as a plain substring regardless of the leading "//" - and was silently
// turning those two GPIOs into dedicated serial-only pins, stripping
// their normal digital/pwm capabilities, despite the vendor never
// actually wiring a UART there. Deliberately NOT reproducing the exact
// disabled declaration syntax in this note, since doing so would trip
// the same comment-blind regex again. See boardsDetails/esp32/esp32s3/
// alfredo-nou3/notes.txt for full detail.
static const uint8_t SDA = -1;
static const uint8_t SCL = -1;

static const uint8_t SS = -1;
static const uint8_t MOSI = -1;
static const uint8_t SCK = -1;
static const uint8_t MISO = -1;

#endif /* Pins_Arduino_h */
