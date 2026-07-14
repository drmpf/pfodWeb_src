/*
 * (c)2014-2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// install pfodParser from the Arduino Library Manager
//    OR download the libraries from http://www.forward.com.au/pfod/pfodParserLibraries/index.html
// pfodParser V5.1.0+ contains pfodParser, pfodSecurity
#include <pfodParser.h>
#include "pfodMainMenu.h"

const char version[] = "V1";
pfodParser parser; // create a parser to handle the pfod messages
handle_mainMenuFnPtr handle_mainMenu; // pointer to fn the handles the main menu

void closeConnection(Stream *io) {
  (void)(io);
  // add any special code here to force connection to be dropped
}

// the setup routine runs once on reset:
void setup() {
  Serial.begin(115200);
  for (int i=3; i>0; i--) {
    // wait a few secs to see if we are being programmed
    delay(1000);
  }

  parser.setVersion(version);
  parser.connect(&Serial); // connect the parser to the i/o stream
  handle_mainMenu = init_pfodMainMenu(closeConnection); // intialize main menu, returns pointer to mainMenu handler
  // <<<<<<<<< Your extra setup code goes here
}

void loop() {
  handle_mainMenu(parser); // handle i/o via this parser
}
