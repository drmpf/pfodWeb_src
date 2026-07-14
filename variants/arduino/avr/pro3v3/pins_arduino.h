/*
  pins_arduino.h - Pin definition functions for Arduino

  Arduino Pro or Pro Mini (3.3V, 8 MHz) w/ ATmega328P: same 8-analog-input
  ATmega328P pin map as Nano/Mini/BT. Split off from the single ambiguous
  "pro" boards.txt entry (2026-07-14, follow-up pass) — the real Arduino
  IDE's "pro" board offers a genuine user-facing menu choosing between
  this 3.3V/8MHz variant and a 5V/16MHz variant (see ../pro5v/), which
  build_boards.js cannot see (it only reads top-level
  `<id>.build.variant=` lines, never `.menu.` sub-keys) — so a single
  shared board.json could not correctly state one ADC reference voltage
  for both. This directory/boards.txt id is a pfodWeb Designer-only
  convenience split (not present in the real upstream Arduino boards.txt)
  representing the 3.3V/8MHz half of that menu.
*/

#include "../eightanaloginputs/pins_arduino.h"
