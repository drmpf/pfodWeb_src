#pragma once

#include <cyw43_wrappers.h>

#define PICO_RP2350A 1

// Pin definitions taken from:
// https://github.com/rp-rs/rp-hal-boards/blob/main/boards/pimoroni-plasma-2040/src/lib.rs

// LEDs
#define PIN_LED        (16u)
#define PIN_LED_R      (16u)
#define PIN_LED_G      (17u)
#define PIN_LED_B      (18u)
#define LED_BUILTIN    PIN_LED

// Switches
#define PIN_SWITCH_A (12u)
#define PIN_SWITCH_USER (22u)

// Digital pins
// pfodWeb NOTE (RP2040W family audit, 2026-07-13): the vendor's
// "#if 0 ... #endif"-disabled D0-D10 block (declaring GPIO26-29,6,7,0,1,2,
// 4,3 as plain digital pins, including GPIO29 - a CYW43 wireless-bus/
// current-sense pin, and several already-tagged onboard LED-strip/button
// GPIOs) was removed entirely rather than left disabled. This project's .h
// parser is a plain regex scan with no C-preprocessor awareness, so "#if 0"
// has no effect on it - the block's static-const declarations were still
// being picked up as real pin aliases, silently re-exposing GPIO29 and
// other already-handled pins as plain general-purpose "Dn" pins. Same class
// of fix already applied to the non-WiFi pimoroni_plasma2040/pimoroni_plasma2350
// siblings this session. Confirmed this exact disabled block is present
// verbatim in the real upstream arduino-pico core
// (variants/pimoroni_plasma2350w/pins_arduino.h) - it is genuinely dead
// code there too (excluded by the real C preprocessor), so removing it here
// has zero effect on compiled firmware behaviour, unlike the live SPI0
// SS/MOSI/MISO/SCK declarations further down (left untouched - see note
// there).

// Analog pins
static const uint8_t A0  = (26u);
static const uint8_t A1  = (27u);
static const uint8_t A2  = (28u);
// pfodWeb NOTE: A3 deliberately NOT declared here — the vendor value
// (31u) is the "not pinned out" sentinel (GPIO31 does not physically
// exist on this chip); declaring it leaked a phantom "A3 (GPIO31)" pin.
#define ADC_RESOLUTION 12

// NeoPixel
#define PIN_NEOPIXEL   (15u)
//#define NEOPIXEL_POWER (11u)

// Serial1
#define PIN_SERIAL1_TX (31u)
#define PIN_SERIAL1_RX (31u)

// Serial2 not pinned out
#define PIN_SERIAL2_TX (31u)
#define PIN_SERIAL2_RX (31u)

// SPI
// pfodWeb NOTE (RP2040W family audit, 2026-07-13): PIN_SPI0_MISO/MOSI/SCK/SS
// (GPIO24/24/29/25) are the CYW43439/RM2 wireless module's own internal
// gSPI control bus (confirmed via this file's own "wired to wifi module"
// comment below, this file's own SPI_HOWMANY (0u) declaration further down,
// and an independent third-party RP2350 SDK board header for this exact
// board - matthew-mccall/pico-sdk-plasma2350-w's pimoroni_plasma2350w.h -
// which documents GPIO23=WiFi power-up, GPIO24=WiFi data in/out,
// GPIO25=WiFi chip-select, GPIO29=WiFi clock, an exact match). Despite this,
// the static const SS/MOSI/MISO/SCK declarations below are NOT dead code -
// this file is confirmed byte-for-byte identical to the real, actively
// compiled upstream arduino-pico core file
// (earlephilhower/arduino-pico variants/pimoroni_plasma2350w/pins_arduino.h,
// fetched directly for comparison), so removing them (unlike the dead
// "#if 0" block above) WOULD change real compiled firmware behaviour -
// out of scope for this pin-database/Designer audit per this repo's
// hardware-configuration-change restriction. Consequence: this project's
// board.json chipGpios mechanism cannot fully suppress GPIO24/25/29's
// exposure as SPI-capable pins (chipGpios capability overrides do not
// prevent build_boards.js's unconditional spi_ss/spi_mosi/spi_miso/spi_sck
// auto-append once a static-const SS/MOSI/MISO/SCK alias resolves to a
// GPIO) - documented instead via note-only chipGpios entries for GPIO24/25
// (and the existing A3-exclusion note covers GPIO29's current-sense/wireless
// dual-use). See boardsDetails/rp2040/rp2040w/pimoroni_plasma2350w/notes.txt.
#define PIN_SPI0_MISO  (24u) // wired to wifi module
#define PIN_SPI0_MOSI  (24u)
#define PIN_SPI0_SCK   (29u)
#define PIN_SPI0_SS    (25u)
static const uint8_t SS   = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK  = PIN_SPI0_SCK;
//
#define SS PIN_SPI0_SS

// Not pinned out
#define PIN_SPI1_MISO  (31u)
#define PIN_SPI1_MOSI  (31u)
#define PIN_SPI1_SCK   (31u)
#define PIN_SPI1_SS    (31u)
//#define SPI_MISO       (PIN_SPI1_MISO)
//#define SPI_MOSI       (PIN_SPI1_MOSI)
//#define SPI_SCK        (PIN_SPI1_SCK)

// Wire
#define __WIRE0_DEVICE (i2c0)
#define PIN_WIRE0_SDA  (20u)
#define PIN_WIRE0_SCL  (21u)
#define SDA            PIN_WIRE0_SDA
#define SCL            PIN_WIRE0_SCL
#define I2C_SDA        (SDA)
#define I2C_SCL        (SCL)

// Wire1 not pinned out
#define __WIRE1_DEVICE (i2c1)
#define PIN_WIRE1_SDA  (31u)
#define PIN_WIRE1_SCL  (31u)

#define SERIAL_HOWMANY (0u)
#define SPI_HOWMANY    (0u)
#define WIRE_HOWMANY   (1u)
