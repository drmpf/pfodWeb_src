/**
  This sketch compiles for the Adafruit nRF52 board family (Feather
  nRF52832/nRF52840, ItsyBitsy nRF52840, Circuit Playground Bluefruit,
  CLUE, Metro nRF52840, Nordic nRF52840/nRF52833 DK, Raytac nRF52840
  dongle, Particle Xenon) — Adafruit's own Adafruit_nRF52_Arduino core.

  See the tutorial at https://www.forward.com.au/pfod/pfodWeb/index.html

  Setup Notes:
  =============
  Install the latest pfodParser library from the Arduino library manager.
  Load this sketch.
  From the pfodParser library, in sub-directory pfodWeb, open pfodWeb.html in
  any web browser and select BLE connection, follow the pfodProxy
  instructions to start the pfodProxy, click Select BLE to choose this
  device and Connect via pfodProxy.

  For connecting via Android pfodApp, setup a connection in pfodApp. See
  https://www.forward.com.au/pfod/Android_pfodApp/pfodAppForAndroidGettingStarted.pdf

  Unlike ESP32's BLEDevice library, the nRF52's Bluefruit library's BLEUart
  class already implements the Stream interface (available/read/write/peek)
  directly, so it is passed straight to the parser -- no custom Stream
  wrapper class is needed here the way variants/esp32/ble.ino needs one.
*/

#include <bluefruit.h>
#include <pfodBLEBufferedSerial.h>

// install pfodParser from the Arduino Library Manager
//    OR download the libraries from http://www.forward.com.au/pfod/pfodParserLibraries/index.html
// pfodParser.zip V5.1.0+ contains pfodParser, pfodSecurity, pfodDelay
#include <pfodParser.h>
#include <pfodDebugPtr.h>
#include "pfodMainMenu.h"

const char version[] = "V1";
const char* localName = "pfod_BLE";  // <<<<<<  change this string to customize the advertised name of your board

BLEUart bleuart;  // BLE UART service -- already a Stream, no wrapper needed
BLEDis bledis;    // BLE device information service (optional, shown in scanners)

pfodBLEBufferedSerial bleBufferedSerial;

pfodParser parser;                     // create a parser with menu version string to handle the pfod messages
handle_mainMenuFnPtr handle_mainMenu;  // pointer to fn the handles the main menu
static Stream* debugPtr = NULL;

// Called by pfodMainMenu.cpp when it sees the {!} close-connection command.
// Bluefruit auto-restarts advertising on disconnect (see connect_callback /
// the restartOnDisconnect(true) call in startAdv() below), so there's
// nothing extra to do here.
void closeConnection(Stream* io) {
  (void)(io);
  // add any special code here to force connection to be dropped
}

void connect_callback(uint16_t conn_handle) {
  Serial.println("BLE Connected");
}

void disconnect_callback(uint16_t conn_handle, uint8_t reason) {
  (void)conn_handle;
  (void)reason;
  Serial.println("BLE Disconnected");
}

void startAdv(void) {
  // Advertising packet
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);

  // Secondary Scan Response packet (optional)
  Bluefruit.ScanResponse.addName();

  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);  // in units of 0.625 ms
  Bluefruit.Advertising.setFastTimeout(30);    // number of seconds in fast mode
  Bluefruit.Advertising.start(0);              // 0 = Don't stop advertising after n seconds
}

// the setup routine runs once on reset:
void setup() {
  Serial.begin(115200);
  for (int i = 10; i > 0; i--) {
    Serial.print(i);
    Serial.print(' ');
    delay(500);
  }
  Serial.println();

  setDebugPtr(&Serial);      //set global debug
  debugPtr = getDebugPtr();  // enable extra debug here

  Bluefruit.begin();
  Bluefruit.setTxPower(4);
  Bluefruit.setName(localName);
  Bluefruit.Periph.setConnectCallback(connect_callback);
  Bluefruit.Periph.setDisconnectCallback(disconnect_callback);

  bledis.setManufacturer("Adafruit Industries");
  bledis.begin();

  bleuart.begin();

  startAdv();
  Serial.println("BLE Advertising started");

  // connect parser
  parser.setVersion(version);
  parser.connect(bleBufferedSerial.connect(&bleuart));  // BLEUart is a Stream -- connect it directly

  handle_mainMenu = init_pfodMainMenu(closeConnection);  // intialize main menu, returns pointer to mainMenu handler
  // <<<<<<<<< Your extra setup code goes here
}

// the loop routine runs over and over again forever:
void loop() {
  handle_mainMenu(parser);
  //  <<<<<<<<<<<  Your other loop() code goes here
}
