/**
  From the pfodParser library, in sub-directory pfodWeb, open pfodWeb.html in any web brower
  and select Serial connection,  follow the pfodProxy instructions to start the pfodProxy
  Click Select COM Port to choose the serial port for this board and
  Connect via pfodProxy
**/

// NON-ARDUINO target -- builds against the plain-C++ pfodParserCPP library
// (https://github.com/drmpf/pfodParserCPP), not Arduino's pfodParser.
// Download/clone pfodParserCPP and add its src/ directory to your build's
// include path.  See pfodParserCPP/BUILDING.md for CMake/manual build
// instructions, and pfodParserCPP/examples/ for worked examples for
// several non-Arduino platforms (ESP-IDF, STM32, nRF52, PIC32, Zephyr).
// pfodParser.h (generated alongside this file) pulls in the real
// pfodParserCPP.h for us -- include that, not pfodParserCPP.h directly,
// so every generated file in this sketch goes through the one adapter.
#include "pfodParser.h"
#include "pfodMainMenu.h"
#include "target_Stream.h"

const char version[] = "V1";
pfodParser parser; // create a parser to handle the pfod messages
handle_mainMenuFnPtr handle_mainMenu; // pointer to fn that handles the main menu

void closeConnection(pfodStream *io) {
  (void)(io);
  // add any special code here to force connection to be dropped
}

// the pfodStream wrapping this board's serial port,
// complete target_Stream.cpp for your board, see readme.txt
target_Stream serialStream;

// the setup routine runs once on reset:
void setup() {
  parser.setVersion(version);

  serialStream.begin(115200); // initialise the serial port, add any other args your target_Stream::begin() needs, e.g. port, rx buffer
  parser.connect(&serialStream); // connect the parser to the i/o stream

  handle_mainMenu = init_pfodMainMenu(closeConnection); // intialize main menu, returns pointer to mainMenu handler
  // <<<<<<<<< Your extra setup code goes here
}

void loop() {
  handle_mainMenu(parser); // handle i/o via this parser
}

int main() {
  setup();
  while (1) {
    loop();
  }
  return 0;
}
