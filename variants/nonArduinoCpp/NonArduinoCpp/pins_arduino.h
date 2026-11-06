// pins_arduino.h stub for the "Non-Arduino CPP code" Designer target.
//
// This target generates plain C++ against the non-Arduino pfodParserCPP
// library (no Arduino core, no GPIOs), so there is no real pin map to
// declare.  The file exists only so build_boards.js's variant discovery
// (which looks for pins_arduino.h) finds this variant; buildCcodeBoard()
// in build_boards.js does not parse this file's contents and always
// emits an empty pins[] array.
