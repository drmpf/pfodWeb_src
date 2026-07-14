#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 2;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t ADC1 = 35;
static const uint8_t ADC2 = 36;

// pfodWeb NOTE (dedicated-hardware pin audit - see
// boardsDetails/esp32/esp32/odroid_esp32/notes.txt for full sourcing):
// this file originally also carried a bus-role alias pair naming two GPIO
// numbers as an I2C clock/data pair, plus six more aliases naming GPIO
// numbers as a general SPI bus (slave-select, data-out, data-in, clock)
// and two DAC channels. All eight were removed here because either (a) no
// vendor documentation for this handheld confirms any onboard or
// expansion-port I2C use of that clock/data pair - it reads as unverified
// boilerplate copied from a generic template - or (b) the pin genuinely is
// wired to fixed onboard hardware confirmed via Hardkernel's own firmware
// source: the shared display-plus-SD-card SPI bus lines, the SD card's own
// chip-select line, and the two lines driving the onboard speaker
// amplifier/audio output. Those six GPIOs are excluded from the pin picker
// in this board's board.json; removing their aliases here stops them
// reappearing in the generated pin list and stops the two bus-role
// aliases from auto-tagging their GPIOs with capabilities they don't
// really have. The two ADC aliases that remain are genuinely useful
// sensor readings - see board.json's own NOTE and notes.txt for what they
// measure.

#endif /* Pins_Arduino_h */
