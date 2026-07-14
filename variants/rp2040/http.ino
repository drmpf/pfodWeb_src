/*
 * (c)2014-2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

/**
 This sketch compiles for ESP8266, Pi PicoW, Pi Pico2W and ESP32, ESP32C3.  Should also work for other ESP32 variants but has not been tested on all of them
 The project has been tested using Arduino IDE V2.3.6, Pi Pico board support V5.1.0,  ESP32 board support V3.3.1, ESP8266 board support V3.1.2

 If useLittleFSToServe_pfodWeb is set to true (default false) then the pfodWeb files need to be uploaded to the micro's file system
 The data upload for ESP8266, Pi Pico and ESP32, uses https://github.com/earlephilhower/arduino-littlefs-upload V0.2.0 installed in Arduino IDE V2
 https://github.com/earlephilhower/arduino-pico-littlefs-plugin/releases
 
 This project starts a web server (port 80) to be connected to by pfodWeb.html
 See the tutorial at https://www.forward.com.au/pfod/pfodWeb/index.html
 
 Setup Notes:
 Before running this code.
  a) Set the ssid and password (see WiFi Settings in the code below) to match your local network's router, ssid and password
  b) Set a static IP to an unused IP on your network OR leave as blank and check the Serial monitor for the assigned IP
  c) Upload the sketch, Open the IDE Serial Monitor to see what IP has been assigned
  d) From the pfodParse library, in sub-directory pfodWeb, open pfodWeb.html 
     and selected HTTP connection, fill in the IP for this board, click Connect to display GUI


  // To serve pfodWeb from the micro's file system
  =================================================
  If useLittleFSToServe_pfodWeb (below) is set to true then
  this code can also serve the pfodWeb files directly from the micro's file system.
  The files are in the data sub-directory of this sketch.
  This needs 1MB of file system space on the microprocessor.      

  a) Configure the Tool menu Flash Size: to have FS (LittleFS file system) of 1MB for ESP32, Pi PicoW/2W and ESP8266
  b) Set the ssid and password (see WiFi Settings in the code below) to match your local network's router, ssid and password
  c) Edit **useLittleFSToServe_pfodWeb** to true to start the FS file system
  c) Set a static IP to an unused IP on your network OR leave as blank and check the Serial monitor for the assigned IP
  d) Do an initial upload of the sketch,
  e) CLOSE  the serial monitor.
  f) Use Ctrl+Shift+P  and search for "Upload LittleFS to Pico/ESP8266/ESP32" and upload the support files from the data sub-directory

  Check the Serial Monitor for the board's IP address e.g.
 Connected! IP address: 10.1.1.100 
  Then in a web browser type  http://10.1.1.100  Note carefully use http:// NOT https://  to display the index.html page 
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

//IPAddress staticIP(10, 1, 1, 100);  // use a static IP,
IPAddress staticIP;  // use auto assigned ip. NOT recommended
// If auto assigned ip, check the Serial Monitor for the board's IP address e.g.
// e.g.   Connected! IP address: 10.1.1.100 

#include <pfodDebugPtr.h>
#include <ESP_PicoW_pfodWebServer.h>
#include "pfodMainMenu.h"

static Stream *debugPtr = NULL;

const char version[] = "V1";  // need non blank version for auto refresh

// if running under PicoProbe debugging move Serial to Serial1
#ifdef PICO_PROBE
#define Serial Serial1
#endif


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
  handle_mainMenuFnPtr mainMenuPtr = init_pfodMainMenu(); // initialize dwgs if any
  start_pfodWebServer(version, useLittleFSToServe_pfodWeb, cacheSec, mainMenuPtr);
  // <<<<<<<<< Your extra setup code goes here
}

void handle_parser() {
  handle_pfodWebServer();
}

void loop(void) {
  handle_parser();
  // <<<<<<<<< Your extra loop code goes here
}
