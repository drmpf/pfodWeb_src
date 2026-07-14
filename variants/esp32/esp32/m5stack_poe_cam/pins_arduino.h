#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 25;
static const uint8_t SCL = 33;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - upstream
// declares them as -1 ("Modified elsewhere", set programmatically by
// the camera library). -1 wraps to 255 as a uint8_t, which would
// otherwise leak a phantom "GPIO255" pin.

// pfodWeb NOTE: G5/G15/G18/G19/G21/G22/G23/G26/G27/G32/G34/G35/G36/G39
// deliberately NOT declared - dedicated onboard OV2640 camera pins and
// W5500 PoE Ethernet SPI bus (confirmed via M5Stack PoECam docs). G4/G13
// deliberately NOT declared - dedicated W5500 CS/MOSI (see board.json
// chipGpios override). G0 stays kept as the status LED; SDA/SCL
// (GPIO25/33) stay kept as the general extension port.
static const uint8_t G2 = 2;
static const uint8_t G33 = 33;

static const uint8_t G0 = 0;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

static const uint8_t ADC1 = 35;
static const uint8_t ADC2 = 36;

#endif /* Pins_Arduino_h */
