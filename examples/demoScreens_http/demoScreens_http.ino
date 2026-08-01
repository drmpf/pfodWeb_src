/*
 * demoScreens_http.ino
 * Arduino port of V3_DemoMsgProcessor.java pfod demo screens.
 * Serves all demo screens via WiFi (pfodWeb over HTTP and pfodApp over TCP).
 *
 * Required libraries (Arduino Library Manager):
 *   pfodParser V5.1.0+       -- pfodParser.h, pfodDwgs.h
 *
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 */

/**
 This example sketch compiles for ESP8266, Pi PicoW, Pi Pico2W and ESP32, ESP32C3.  Should also work for other ESP32 variants but has not been tested on all of them
 The project has been tested using Arduino IDE V2.3.6, Pi Pico board support V5.1.0,  ESP32 board support V3.3.1, ESP8266 board support V3.1.2

 If useLittleFSToServe_pfodWeb is set to true (default false) then the pfodWeb files need to be uploaded to the micro's file system
 The data upload for ESP8266, Pi Pico and ESP32, uses https://github.com/earlephilhower/arduino-littlefs-upload V0.2.0 installed in Arduino IDE V2
 https://github.com/earlephilhower/arduino-pico-littlefs-plugin/releases

 This project starts both a web server (port 80) to serve pfodWeb to a web browser and a TCP/IP client on port 4989 to server the Android pfodApp
 See the tutorial at https://www.forward.com.au/pfod/pfodWeb/index.html

 Setup Notes:
 Before running this code.
  a) Set the ssid and password (see WiFi Settings in the code below) to match your local network's router, ssid and password
  b) Set a static IP to an unused IP on your network OR leave as blank and check the Serial monitor for the assigned IP
  c) Upload the sketch, Open the IDE Serial Monitor to see what IP has been assigned
  d) From the pfodParse library, in sub-directory pfodWeb, open pfodWeb.html in a Chrome or Edge browser (>V141)
     and selected HTTP connection, fill in the IP for this board, click Connect to display the demo screens


  // To serve pfodWeb from the micro's file system
  =================================================
  If useLittleFSToServe_pfodWeb (below) is set to true then
  this code can also serve the pfodWeb files directly from the micro's file system.
  The files are in the data sub-directory of this sketch.
  This needs 1MB of file system space on the microprocessor.

  a) Configure the Tool menu Flash Size: to have FS (LittleFS file system) of 1MB for ESP32, Pi PicoW/2W and ESP8266
  b) Set the ssid and password (see WiFi Settings in the code below) to match your local network's router, ssid and password
  c) Edit **useLittleFSToServe_pfodWeb** to true to start the FS file system
  d) Set a static IP to an unused IP on your network OR leave as blank and check the Serial monitor for the assigned IP
  e) Do an initial upload of the sketch,
  f) CLOSE the serial monitor.
  g) Use Ctrl+Shift+P and search for "Upload LittleFS to Pico/ESP8266/ESP32" and upload the support files from the data sub-directory

  Check the Serial Monitor for the board's IP address e.g.
 Connected! IP address: 10.1.1.100
  Then in a web browser type  http://10.1.1.100  Note carefully use http:// NOT https://  to display the index.html page
  Choose either pfodWeb or pfodWebDebug

 For connecting via Android pfodApp, setup a connection in pfodApp. See https://www.forward.com.au/pfod/Android_pfodApp/pfodAppForAndroidGettingStarted.pdf

*/

static bool useLittleFSToServe_pfodWeb = false; // do no start LittleFS, need to use pfodWeb.html on computer to display drawing
// cacheSec only used if useLittleFSToServe_pfodWeb = true;
static uint32_t cacheSec = 10*60;  //seconds = 10mins, if useLittleFSToServe_pfodWeb = true use this to control cache timeout

// =================== WiFi settings ===================
const char *ssid = "xxxxxx";
const char *password = "xxxxxx";

//  NOTE:  if using PicoProbe to debug, uncomment #define PICO_PROBE to move Serial to Serial1
//#define PICO_PROBE

#ifdef ESP8266
#include <ESP8266WiFi.h>
#else
#include <WiFi.h>
#endif

IPAddress staticIP(10, 1, 1, 100);  // use a static IP, or leave as IPAddress staticIP; for an auto assigned ip (NOT recommended)

#include <pfodDebugPtr.h>
#include <pfodDelay.h>
#include <ESP_PicoW_pfodWebServer.h>  // also getRawDataWriter()
#include <ESP_PicoW_pfodAppServer.h>
#include "pfodMainMenu.h"

const char version[] = "V1";  // need non blank version for auto refresh

// ---- Raw data streaming  ----
// emits one DateData row every 800 ms thereafter via tick_pfodMainMenu(),
// called every loop() independent of any particular connection/request.
// Output goes outside any {...} pfod message, so the connected app sees
// it as raw data 
static pfodDelay rawDataDelay;     
static unsigned long DATA_DELAY_MS = 800;

// if running under PicoProbe debugging move Serial to Serial1
#ifdef PICO_PROBE
#define Serial Serial1
#endif

static Stream *debugPtr = NULL;

/**
   sets up WiFi
*/
static void setupWiFi() {
  if (debugPtr) {
    debugPtr->print(F("WiFi setup -- "));
  }
  WiFi.mode(WIFI_STA);
  if (((uint32_t)staticIP) != 0) {
    IPAddress gateway(staticIP[0], staticIP[1], staticIP[2], 1);  // set gatway to ... 1
    if (debugPtr) {
      debugPtr->print(F("Setting gateway to: "));
      debugPtr->println(gateway);
    }
    IPAddress subnet(255, 255, 255, 0);
    WiFi.config(staticIP, gateway, subnet);
  }

  WiFi.begin((char *)ssid, (char *)password);
  if (debugPtr) {
    debugPtr->print("Connecting to ");
    debugPtr->println(ssid);
  }
  // Wait for connection
  uint8_t i = 0;
  while (WiFi.status() != WL_CONNECTED && (i++ < 60)) {  //wait 30 seconds before fail
    if (debugPtr) {
      debugPtr->print(".");
    }
    delay(500);
  }
  if (WiFi.status() != WL_CONNECTED) {
    if (debugPtr) {
      debugPtr->print("Could not connect to ");
      debugPtr->println(ssid);
    }
    while (1) {
      delay(500);
    }
  }
  if (debugPtr) {
    debugPtr->print("Connected! IP address: ");
    debugPtr->println(WiFi.localIP());
  }
}

void setup(void) {
  Serial.begin(115200);
  for (int i = 10; i > 0; i--) {
    Serial.print(i);
    Serial.print(' ');
    delay(1000);
  }
  Serial.println();

  setDebugPtr(&Serial);      //set global debug
  debugPtr = getDebugPtr();  // enable extra debug here

  setupWiFi();
  init_pfodMainMenu(closeConnection_pfodAppServer); // set the closeConnection fn ptr
  start_pfodWebServer(version, useLittleFSToServe_pfodWeb, cacheSec);
  start_pfodAppServer(version);
  // <<<<<<<<< Your extra setup code goes here
  rawDataDelay.start(DATA_DELAY_MS);
}

void handle_parser() {
  handle_pfodAppServer();
  handle_pfodWebServer();
}

// ==================== Raw data tick ====================
// Send one tick of raw data: one DateData row.
static float baseTemp = 20;
static float baseRH = 80;
static void sendRawData() {
  // ----- DateData line -----
  Print& rawOut = getRawDataWriter();
  rawOut.print(millis());
  rawOut.print(',');
  rawOut.print(baseTemp + random(-5,+3)*0.1);
  rawOut.print(',');
  rawOut.print(baseRH + random(-2,+1));
  rawOut.println();
}

// Called every loop() (see demoScreens_httpssid.ino) -- independent of
// whether any client is currently connected/requesting.
void handleRawData() {
  if (rawDataDelay.justFinished()) {
    sendRawData();
    rawDataDelay.repeat(); // no drift 
  }
}

void loop(void) {
  handle_parser();
  handleRawData();  // drives the raw-data streaming timer, independent of any connection
  // <<<<<<<<< Your extra loop code goes here
}

// ============= end of demoScreens_httpssid.ino =============
