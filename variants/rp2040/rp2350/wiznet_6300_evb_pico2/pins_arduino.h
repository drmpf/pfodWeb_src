#pragma once

#define PICO_RP2350A 1

// Pin definitions taken from:
//    https://datasheets.raspberrypi.org/pico/pico-datasheet.pdf
// (WIZnet W6300-EVB-Pico2 is a Pico2-form-factor board with the same
// physical RP2350 GPIO layout as the plain Raspberry Pi Pico 2 - this
// file is a copy of ../generic/pins_arduino.h with the SPI0 pin
// assignment corrected to match this board's real onboard wiring, see
// the pfodWeb NOTE below)

// LEDs
#define PIN_LED        (25u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

#define PIN_SERIAL2_TX (8u)
#define PIN_SERIAL2_RX (9u)

// pfodWeb NOTE (RP2040/RP2350 Ethernet dedicated-hardware audit,
// 2026-07-12): unlike the plain-Pico2 ../generic/pins_arduino.h template
// this file is otherwise a copy of, GPIO15-22 on this board are NOT free
// header pins - they are hardwired to the onboard WIZnet W6300 Ethernet
// controller's QSPI interface. Confirmed via the official pinout table
// at https://docs.wiznet.io/Product/Chip/Ethernet/W6300/w6300-evb-pico2
// and independently via the WIZnet-PICO-C firmware's own pin config
// (github.com/WIZnet-ioNIC/WIZnet-PICO-C):
//   GPIO15 = INTn (interrupt request, W6300 -> RP2350)
//   GPIO16 = CSn  (QSPI chip select)
//   GPIO17 = SCLK (QSPI clock)
//   GPIO18 = IO0  (QSPI data line 0 / MOSI in single-SPI mode)
//   GPIO19 = IO1  (QSPI data line 1 / MISO in single-SPI mode)
//   GPIO20 = IO2  (QSPI data line 2, quad mode only)
//   GPIO21 = IO3  (QSPI data line 3, quad mode only)
//   GPIO22 = RSTn (reset request, RP2350 -> W6300)
// The generic template's PIN_SPI0_* values (MISO=16,MOSI=19,SCK=18,
// SS=17) are the plain Pico2's SPI0-peripheral default routing, which by
// numeric coincidence lands on the same GPIO16-19 range this board uses
// for the W6300 - but with the roles permuted (e.g. GPIO16 is genuinely
// CSn on this board, not MISO). Left uncorrected, build_boards.js's
// alias-based SS/MOSI/MISO/SCK -> "spi_ss"/"spi_mosi"/"spi_miso"/
// "spi_sck" capability tagging (which cannot be overridden per-GPIO from
// board.json - that tagging step runs unconditionally after any
// chipGpios override, see build_boards.js buildEsp32Board()) would
// mislabel this board's real CS/SCK/IO0/IO1 lines. The four macros below
// are corrected to match the real wiring (SS/CSn=16, SCK=17, MOSI/IO0=18,
// MISO/IO1=19) so the auto-derived "SPI SS"/"SPI SCK"/"SPI MOSI"/
// "SPI MISO" bus tags the Designer shows are accurate. Same fix as the
// RP2040-chip sibling variants/rp2040/rp2040/wiznet_6300_evb_pico/
// pins_arduino.h. See this board's own board.json chipGpios entries
// (GPIO15-22) for the full capability corrections, and
// boardsDetails/rp2040/rp2350/wiznet_6300_evb_pico2/notes.txt for the
// complete research trail. GPIO20/GPIO21 (IO2/IO3) have no equivalent
// slot in the SS/MOSI/MISO/SCK vocabulary (QSPI has two more data lines
// than plain SPI) - those are handled as plain excluded pins in
// board.json instead.
#define PIN_SPI0_MISO  (19u)
#define PIN_SPI0_MOSI  (18u)
#define PIN_SPI0_SCK   (17u)
#define PIN_SPI0_SS    (16u)

#define PIN_SPI1_MISO  (12u)
#define PIN_SPI1_MOSI  (15u)
#define PIN_SPI1_SCK   (14u)
#define PIN_SPI1_SS    (13u)

// Wire
#define PIN_WIRE0_SDA  (4u)
#define PIN_WIRE0_SCL  (5u)

#define PIN_WIRE1_SDA  (26u)
#define PIN_WIRE1_SCL  (27u)

#define SERIAL_HOWMANY (3u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (2u)

#include "../generic/common.h"
