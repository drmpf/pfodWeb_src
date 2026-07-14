#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 2;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t KEY_BUILTIN = 0;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

// pfodWeb NOTE: the address-select alias for GPIO 12, previously declared
// here, has been removed. This vendor board (iarduino.ru "Metro ESP-32")
// carries an onboard connector for chaining the vendor's proprietary
// I2C "Metro module" accessories, and this GPIO is committed to managing
// that chain's module addressing (per the iarduino_Metro Arduino library,
// whose module-detection function takes an address-line argument that
// defaults to this same GPIO on this board family). Removing the alias
// keeps this GPIO out of the Designer's pin list entirely - see board.json
// for the matching chipGpios exclusion and full source citations.

static const uint8_t SS = 5;
static const uint8_t MOSI = 23;
static const uint8_t MISO = 19;
static const uint8_t SCK = 18;

#endif /* Pins_Arduino_h */
