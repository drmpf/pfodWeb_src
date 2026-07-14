#pragma once

#include <stdint.h>

#define PINS_COUNT          (26u)
#define NUM_DIGITAL_PINS    (26u)
#define NUM_ANALOG_INPUTS   (3u)
#define NUM_ANALOG_OUTPUTS  (0u)
#define ADC_RESOLUTION      (12u)
#define WIRE_INTERFACES_COUNT (WIRE_HOWMANY)

#ifdef PIN_LED
#define LED_BUILTIN PIN_LED
#endif

#ifdef __PIN_D0
static const uint8_t D0 = __PIN_D0;
#else
static const uint8_t D0 = (0u);
#endif
#ifdef __PIN_D1
static const uint8_t D1 = __PIN_D1;
#else
static const uint8_t D1 = (1u);
#endif
#ifdef __PIN_D2
static const uint8_t D2 = __PIN_D2;
#else
static const uint8_t D2 = (2u);
#endif
#ifdef __PIN_D3
static const uint8_t D3 = __PIN_D3;
#else
static const uint8_t D3 = (3u);
#endif
#ifdef __PIN_D4
static const uint8_t D4 = __PIN_D4;
#else
static const uint8_t D4 = (4u);
#endif
#ifdef __PIN_D5
static const uint8_t D5 = __PIN_D5;
#else
static const uint8_t D5 = (5u);
#endif
#ifdef __PIN_D6
static const uint8_t D6 = __PIN_D6;
#else
static const uint8_t D6 = (6u);
#endif
#ifdef __PIN_D7
static const uint8_t D7 = __PIN_D7;
#else
static const uint8_t D7 = (7u);
#endif
#ifdef __PIN_D8
static const uint8_t D8 = __PIN_D8;
#else
static const uint8_t D8 = (8u);
#endif
#ifdef __PIN_D9
static const uint8_t D9 = __PIN_D9;
#else
static const uint8_t D9 = (9u);
#endif
#ifdef __PIN_D10
static const uint8_t D10 = __PIN_D10;
#else
static const uint8_t D10 = (10u);
#endif
#ifdef __PIN_D11
static const uint8_t D11 = __PIN_D11;
#else
static const uint8_t D11 = (11u);
#endif
#ifdef __PIN_D12
static const uint8_t D12 = __PIN_D12;
#else
static const uint8_t D12 = (12u);
#endif
#ifdef __PIN_D13
static const uint8_t D13 = __PIN_D13;
#else
static const uint8_t D13 = (13u);
#endif
#ifdef __PIN_D14
static const uint8_t D14 = __PIN_D14;
#else
static const uint8_t D14 = (14u);
#endif
#ifdef __PIN_D15
static const uint8_t D15 = __PIN_D15;
#else
static const uint8_t D15 = (15u);
#endif
#ifdef __PIN_D16
static const uint8_t D16 = __PIN_D16;
#else
static const uint8_t D16 = (16u);
#endif
#ifdef __PIN_D17
static const uint8_t D17 = __PIN_D17;
#else
static const uint8_t D17 = (17u);
#endif
#ifdef __PIN_D18
static const uint8_t D18 = __PIN_D18;
#else
static const uint8_t D18 = (18u);
#endif
#ifdef __PIN_D19
static const uint8_t D19 = __PIN_D19;
#else
static const uint8_t D19 = (19u);
#endif
#ifdef __PIN_D20
static const uint8_t D20 = __PIN_D20;
#else
static const uint8_t D20 = (20u);
#endif
#ifdef __PIN_D21
static const uint8_t D21 = __PIN_D21;
#else
static const uint8_t D21 = (21u);
#endif
#ifdef __PIN_D22
static const uint8_t D22 = __PIN_D22;
#else
static const uint8_t D22 = (22u);
#endif

/*
 * pfodWeb NOTE: GPIO23/24/25/29 are deliberately NOT declared here (the
 * upstream common.h declares all of D0-D29 unconditionally). On the
 * official Raspberry Pi Pico/Pico 2 reference design (and its many
 * pin-compatible clones, which is what boards relying on this shared
 * fallback are assumed to be), these four are wired to on-board circuitry,
 * not general-purpose header pins:
 *   GPIO23 - SMPS power-save mode control for the onboard regulator
 *   GPIO24 - VBUS sense (HIGH when USB power is present)
 *   GPIO25 - onboard LED
 *   GPIO29 - VSYS voltage-divider sense (also ADC3) — not broken out
 * Confirmed against the official Pico datasheet/pinout — these pins are
 * not present on the 40-pin header at all. A board using this shared
 * fallback with a genuinely different power/LED circuit that DOES expose
 * these pins should declare its own pins_arduino.h (bypassing this file)
 * rather than relying on the blanket default. Only GPIO0-22 and GPIO26-28
 * (26 pins total) plus A0-A2 (GPIO26-28) match the real 26-GPIO/3-ADC-
 * channel Pico pinout — GPIO29/A3 is dropped entirely for the same reason.
 */
static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);

static const uint8_t SS = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
