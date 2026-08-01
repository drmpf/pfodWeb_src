/*
 * demoScreens.ino
 * Arduino port of V3_DemoMsgProcessor.java pfod demo screens.
 * Serves all demo screens via Serial at 115200 baud.
 * Remove any shield/adapter before programming the board.
 *
 * Hardware: Arduino Uno (Serial TX=D1, RX=D0), Mega, etc.
 *
 * Required libraries (Arduino Library Manager):
 *   pfodParser V5.1.0+       -- pfodParser.h, pfodDwgs.h
 *
 * Command hierarchy mirrors V3_DemoMsgProcessor.java exactly.
 * parser.getCmd() returns the full null-terminated command string;
 * sub-commands are accessed by checking subsequent characters.
 *
 * (c)2014-2024 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 */

#include <pfodParser.h>
#include <pfodDelay.h>


pfodParser parser("V361");
pfodDwgs dwgs(&parser);

long pfodLongRtn;  // reused by all parseLong() calls
void closeConnection(Stream* /*io*/);
// ---- Raw data streaming (mirrors V3_DemoMsgProcessor.getRawData) ----
// Started 1 s after the first '{.}' (refresh) message is received, then
// emits one DateData row + one MotorData row every 800 ms thereafter.
// Output goes outside any {...} pfod message, so the connected app sees
// it as raw data (Section 9 streaming view in pfodWeb).
pfodDelay rawDataDelay;            // reused for initial 1 s delay then 800 ms cadence
bool        rawDataArmed     = false; // first '{.}' has been seen, timer started

// ---- Text input state ----
// Initial value: "Hello World\n你好 世界" (UTF-8)
char textInput[52] = "Hello World\n\xE4\xBD\xA0\xE5\xA5\xBD \xE4\xB8\x96\xE7\x95\x8C";

// ---- Multi-selection state (backtick-separated indices, e.g. "`0`2") ----
char selectionArgs[24] = "";

// ---- Single-selection state (-1 = nothing selected) ----
int singleSelection = -1;

// ---- RGB colour selector ----
int redValue = 100;
int greenValue = 120;
int blueValue = 140;

// ---- Numeric input ----
int numericValue = 140;

// ---- Oxygen control simulation ----
int oxygenLevel = 209;
bool oxygenOn = false;

// ---- Enable / Disable menu ----
bool buttonHidden = false;
bool buttonDisabled = true;
int sliderPos = 50;

// ---- Fan control (0=Off, 1=Low, 2=High) ----
int fanPosition = 0;


// ---- Demo-info page counters (reset on every main-menu request) ----
int infoCount = 0;
int info1Count = 0;

// ---- Navigation highlight flags ----
bool menusListsSelected = false;
bool dataLoggingSelected = false;
bool languagesSelected = false;
bool numTextSelected = false;
bool numNumberSelected = false;
bool formatExamplesSelected = false;
bool demoInfoSelected = false;

// ---- 256-colour picker drawing constants ----
const char TOUCH_CMD = 't';  // touch-zone command letter embedded in drawings
int colourNo;                // current colour number used while building a drawing

const int COL_A = 0;    // section a: colours  0-15  (8x2 grid)
const int COL_B = 16;   // section b: colours 16-51  (6x6 grid)
const int COL_C = 52;   // section c: colours 52-87  (6x6 grid)
const int COL_D = 88;   // section d: colours 88-123 (6x6 grid)
const int COL_E = 124;  // section e: colours 124-159(6x6 grid)
const int COL_F = 160;  // section f: colours 160-195(6x6 grid)
const int COL_G = 196;  // section g: colours 196-231(6x6 grid)
const int COL_H = 232;  // section h: colours 232-255(6x4 grid)


// ==================== Utilities ====================

// Return a single uppercase hex digit for nibble v (0-15)
static char hexNibble(int v) {
  v &= 0xF;
  return (v < 10) ? ('0' + v) : ('A' + v - 10);
}

// Print a byte as two hex digits (e.g. 0xAB -> "AB")
static void printHexByte(int v) {
  parser.print(hexNibble((v >> 4) & 0xF));
  parser.print(hexNibble(v & 0xF));
}

// Print the current RGB colour as a 6-char hex string (e.g. "64780C")
static void printColorHex() {
  printHexByte(redValue);
  printHexByte(greenValue);
  printHexByte(blueValue);
}


// Advance simulated oxygen level one step
static void stepOxygen() {
  if (oxygenLevel > 90) oxygenLevel -= 2;
  if (oxygenOn && (oxygenLevel < 310)) oxygenLevel += 4;
}


// ==================== Raw data tick ====================
// Send one tick of raw data: one DateData row + one MotorData row.
// On the very first call (idx == -1) sends the column-title header row instead
// of a data row, matching V3_DemoMsgProcessor.getRawData().  MotorData wraps
// back to the start when exhausted; DateData stops at end-of-data.
static float baseTemp = 20;
static float baseRH = 80;
static void sendRawDataTick() {
  // ----- DateData line -----
  parser.print(millis());
  parser.print(',');
  parser.print(baseTemp + random(-5,+3)*0.1);
  parser.print(',');
  parser.print(baseRH + random(-2,+1));
  parser.println();
}
// ==================== Setup ====================

void setup() {
  Serial.begin(115200);
  // Wait briefly so the board is not accidentally reprogrammed
  delay(1000);

  parser.connect(&Serial);
}

// ==================== Main loop ====================

void loop() {
  // Raw data streaming timer.  Fires 1 s after first '{.}' (initial delay
  // armed in the '.' handler below), then re-armed at 800 ms each tick.
  if (rawDataDelay.justFinished()) {
    sendRawDataTick();
    rawDataDelay.start(2000); // permanent 800 ms cadence after the first fire
  }
  uint8_t cmd = parser.parse();
  if (cmd != 0) {
    // getCmd() returns a pointer to the full null-terminated command string.
    // parse() returns only the first byte; subsequent bytes (sub-commands)
    // are read from fullCmd[1], fullCmd[2], etc.
    byte* fullCmd = parser.getCmd();

    if ('.' == cmd) {
      // Arm raw data streaming on the FIRST '{.}' only — 1 s initial delay
      if (!rawDataArmed) {
        rawDataArmed = true;
        rawDataDelay.start(1000);
      }
      infoCount = 0;
      info1Count = 0;
      if (!parser.isRefresh()) sendMainMenu();
      else sendMainMenuUpdate();

    } else if ('@' == cmd) {
      // Return zero millis offset (no real-time clock on this device)
      parser.print(F("{@`0}"));

    } else if ('l' == cmd) {
      menusListsSelected = true;
      handleMenusAndLists(fullCmd);

    } else if ('u' == cmd) {
      dataLoggingSelected = true;
      handleDataLogging(fullCmd);

    } else if ('x' == cmd) {
      numNumberSelected = true;
      handleNumericScreen(fullCmd);

    } else if ('T' == cmd) {
      numTextSelected = true;
      handleTextScreen(fullCmd);

    } else if ('a' == cmd) {
      languagesSelected = true;
      if (!parser.isRefresh()) sendLanguages();
      else parser.print(F("{;}"));

    } else if ('d' == cmd) {
      demoInfoSelected = true;
      handleDemoInfo(fullCmd);

    } else if ('!' == cmd) {
      closeConnection(parser.getPfodAppStream());

    } else {
      parser.print(F("{}"));
    }
  }
}

void closeConnection(Stream* /*io*/) {
  // Add code here to force the connection to drop when needed
}

// ==================== Main Menu ====================

// Shared menu items used in both sendMainMenu() and sendMainMenuUpdate()
static void sendMainMenuItems() {
  parser.print(F("|l"));
  parser.print(menusListsSelected ? F("<bg bl><w>") : F("<bg w><bk><b>"));
  parser.print(F("~Menus & Lists"));
  parser.print(F("|u"));
  parser.print(dataLoggingSelected ? F("<bg bl><w>") : F("<bg w><bk><b>"));
  parser.print(F("~Data Logging"));
  parser.print(F("|x"));
  parser.print(numNumberSelected ? F("<bg bl><w>") : F("<bg w><bk><b>"));
  parser.print(F("~Number Input"));
  parser.print(F("|T"));
  parser.print(numTextSelected ? F("<bg bl><w>") : F("<bg w><bk><b>"));
  parser.print(F("~Text Input"));
  parser.print(F("|a"));
  parser.print(languagesSelected ? F("<bg bl><w>") : F("<bg w><bk><b>"));
  parser.print(F("~Languages\nExamples"));
  parser.print(F("|d"));
  parser.print(demoInfoSelected ? F("<bg bl><w>") : F("<bg w><bk><b>"));
  parser.print(F("~Demo Info"));
  infoCount = 0;
}

void sendMainMenu() {
  parser.print(F("{,<bg 000040>~<+1><b>pfodApp Demo\n</+1>"));
  parser.print(F("<-3>These screens' contents, including the colors "));
  parser.print(F("are completely controlled by the code in the device you connect to."));
  parser.print(F("\nYour micro-processor code determines the text, buttons, colors. "));
  parser.print(F("This one pfodApp works with all pfodDevices.\n~"));
  parser.sendVersion();
  sendMainMenuItems();
  parser.print(F("}"));
}

void sendMainMenuUpdate() {
  parser.print(F("{;"));
  sendMainMenuItems();
  parser.print(F("}"));
}

// ==================== Text Input Screen (cmd "T...") ====================

void handleTextScreen(byte* fullCmd) {
if (fullCmd[1] == '\0') {
    // Display text input screen with current textInput as default content
    parser.print(F("{'TT`25~<b><bg 000040><b><+1>Example Text Input screen.</+1>\n"));
    parser.print(F("<-1>The pfodDevice controls this prompt and the text shown.\n"));
    parser.print(F("The pfodDevice message has set the maximum length of text to\n 25 bytes\n"));
    parser.print(F("Your device can set the length upto 250 bytes\n"));
    parser.print(F("The Accept button sends your edited text back to the pfodDevice.\n"));
    parser.print(F("The back arrow returns to the previous screen without send any text back."));
    parser.print(F("|"));
    parser.print(textInput);  // show current saved text as editable default
    parser.print(F("}"));

  } else if (fullCmd[1] == 'T') {
    // do not use getEditedText() here as that is for drawing touchInput responses
    const byte* edited = parser.getFirstArg(); // {TT~... }
    if (edited != NULL && edited[0] != '\0') {
      strncpy(textInput, (char*)edited, sizeof(textInput) - 1);
      textInput[sizeof(textInput) - 1] = '\0';
    }
    parser.print(F("{}"));

  } else {
    parser.print(F("{}"));
  }
}

// ==================== Numeric Input Screen (cmd "x...") ====================

void handleNumericScreen(byte* fullCmd) {
  if (fullCmd[1] == '\0') {
    // Display numeric input screen
    parser.print(F("{#xy~<-1><bg 000040><b>Example Number input screen.</-1>\n"));
    parser.print(F("<-3>The pfodDevice message has limited the return value to be between 0 and 254 (inclusive) but"));
    parser.print(F(" because of the scaling and offset specified in the message,"));
    parser.print(F(" the user can only enter numbers between 0 and 100\n"));
    parser.print(F("For display and user input purposes, the message has specified \na scaling of 0.3937 an offset of 0 and units of %\n"));
    parser.print(F(" The Accept button sends an integer number (between 0 and 254) back to the pfodDevice.\n"));
    parser.print(F(" The back arrow returns to the previous screen without send back any value.\n"));
    parser.print(F(" Use the ... menu button to access the Debug View to see the message that created this screen"));
    parser.print(F(" and the message sent when you click Accept.`"));
    parser.print(numericValue);
    parser.print(F("`254`0~%~0.3937~0}"));

  } else if (fullCmd[1] == 'y') {
    // User accepted a numeric value
    parser.parseLong(parser.getFirstArg(), &pfodLongRtn);
    numericValue = (int)pfodLongRtn;
    parser.print(F("{}"));

  } else {
    parser.print(F("{}"));
  }
}

// ==================== Languages Screen (cmd "a") ====================

void sendLanguages() {
  parser.print(F("{,<bg 000040>~<+1><b>Languages Examples</+1><-3>\n"));
  parser.print(F(" You can code your pfodDevice (Arduino or micro) to send screens in"));
  parser.print(F(" your own language (using UTF-8) and pfodApp will displayed them if your mobile has the necessary font.\n"));
  parser.print(F("<b>All buttons, except the first, are disable.~"));
  parser.sendVersion();
  // Active: back to main
  parser.print(F("|.<bg bl>~Back to Main Screen"));
  // Disabled language buttons (! prefix = disabled, never sent by pfodApp)
  // German: Zurück zur Hauptseite
  parser.print(F("|a!<bg bl>~\x5a\x75\x72\xc3\xbc\x63\x6b\x20\x7a\x75\x72\x20\x48\x61\x75\x70\x74\x73\x65\x69\x74\x65"));
  // Chinese: 回到主画面
  parser.print(F("|b!<bg bl>~\xe5\x9b\x9e\xe5\x88\xb0\xe4\xb8\xbb\xe7\x94\xbb\xe9\x9d\xa2"));
  // Greek: Πίσω στην κύρια οθόνη
  parser.print(F("|c!<bg bl>~\xce\xa0\xce\xaf\xcf\x83\xcf\x89\x20\xcf\x83\xcf\x84\xce\xb7\xce\xbd\x20\xce\xba\xcf\x8d\xcf\x81\xce\xb9\xce\xb1\x20\xce\xbf\xce\xb8\xcf\x8c\xce\xbd\xce\xb7"));
  // Japanese: メイン画面に戻る
  parser.print(F("|d!<bg bl>~\xe3\x83\xa1\xe3\x82\xa4\xe3\x83\xb3\xe7\x94\xbb\xe9\x9d\xa2\xe3\x81\xab\xe6\x88\xbb\xe3\x82\x8b"));
  // Korean: 메인 화면으로 돌아
  parser.print(F("|e!<bg bl>~\xeb\xa9\x94\xec\x9d\xb8\x20\xed\x99\x94\xeb\xa9\xb4\xec\x9c\xbc\xeb\xa1\x9c\x20\xeb\x8f\x8c\xec\x95\x84"));
  // Russian: Обратно в главное меню
  parser.print(F("|f!<bg bl>~\xd0\x9e\xd0\xb1\xd1\x80\xd0\xb0\xd1\x82\xd0\xbd\xd0\xbe\x20\xd0\xb2\x20\xd0\xb3\xd0\xbb\xd0\xb0\xd0\xb2\xd0\xbd\xd0\xbe\xd0\xb5\x20\xd0\xbc\xd0\xb5\xd0\xbd\xd1\x8e"));
  parser.print(F("}"));
}

// ==================== Demo Info (cmd "d...") ====================

void handleDemoInfo(byte* fullCmd) {
  if (fullCmd[1] == '\0') {
    infoCount++;
    if (infoCount == 1) {
      // First visit: show info page 1 with auto-scroll prompt
      parser.print(F("{,<bg 000040>~<+1>"));
      parser.print(F("pfodApp V3.0.\n"));
      parser.print(F("The pfodApp is like a micro-browser that displays the "));
      parser.print(F("micro-pages served by a pfodDevice.\n"));
      parser.print(F("Connects via Bluetooth, Bluetooth LE (Low Energy), Wifi or SMS.\n"));
      parser.print(F("WiFi and SMS connections can be secured with 128bit security.`1000"));
      parser.sendVersion();
      parser.print(F("|dn-<bg bl>~Press for next page ...}"));
    } else {
      // On refresh: update to collapse the prompt
      parser.print(F("{;`0|dn}"));
    }

  } else if (fullCmd[1] == 'n') {
    info1Count++;
    if (info1Count == 1) {
      // Show info page 2
      parser.print(F("{,<bg 000040>~<+1><b>pfod</b></+1>\nstands for\n<+1>Protocol for Operations Discovery</+1>\n\n"));
      parser.print(F(" <-2>The full specification, with examples of all the messages "));
      parser.print(F("and screens, is available from \nwww.pfod.com.au\n"));
      parser.print(F(" The ... menu button gives you access to the Debug View Screen`1000"));
      parser.sendVersion();
      parser.print(F("|.-<bg bl>~Back to front screen}"));
    } else {
      parser.print(F("{;`0|.}"));
    }

  } else {
    parser.print(F("{}"));
  }
}

// ==================== Data Logging (cmd "u...") ====================

void handleDataLogging(byte* fullCmd) {
  if (fullCmd[1] == '\0') {
    // Top-level data-logging menu
    if (!parser.isRefresh()) {
      parser.print(F("{,<bg 000040>~pfodApp provides\ndata logging and plotting\nagainst date and time.~"));
      parser.sendVersion();
      parser.print(F("|ud<bg bl>~Plot some random data v date/time\n<-2>against YMD timestamps\nSeparate Plots"));
      parser.print(F("|ut<bg bl>~Plot some random data v date/time\n<-2>against mm:ss timestamps\nCombined Plot"));
      parser.print(F("|ur<bg bl>~Show Raw Data readings"));
      parser.print(F("|ui<bg bl>~More Information on Data Logging"));
      parser.print(F("}"));
    } else {
      parser.print(F("{;}"));
    }

  } else if (fullCmd[1] == 'r') {
    // Raw data text view
    parser.print(F("{=<bg 000040>Raw Data Readings}"));

  } else if (fullCmd[1] == 'd') {
    // Temp/RH versus date (YMD timestamps); \xc2\xb0 = UTF-8 degree sign °
    parser.print(F("{=Temp \xc2\xb0\x43 / RH% with YMD`150~E MMM/dd HH:mm:ss UTC"));
    parser.print(F("|Date|Temp \xc2\xb0\x43~30~15|RH%~82~40}"));

  } else if (fullCmd[1] == 't') {
    // Temp/RH versus time (ms timestamps)
    parser.print(F("{=Temp \xc2\xb0\x43 / RH% with ms timestamps`150~mm:ss.S"));
    parser.print(F("|Time`0|Temp \xc2\xb0\x43`1~30~15|RH%`1~82~40}"));

  } else if (fullCmd[1] == 'i') {
    // Information page about data logging
    if (!parser.isRefresh()) {
      parser.print(F("{,<bg 000040>~<+6><b>Raw Data</+6>\n"));
      parser.print(F(" <-3>Any data that is not a pfod message is Raw Data.\n"));
      parser.print(F(" When the pfodDevice sends the Raw Data msg, <b>{=</b> ...,"));
      parser.print(F(" the screen shows the most recent raw data, either as text or as a plot,"));
      parser.print(F(" depending on what the pfodDevice requests.\n\n"));
      parser.print(F(" As with other screens, what is shown is completely controlled by your Arduino or micro.~"));
      parser.print(F("}"));
    } else {
      parser.print(F("{;}"));
    }

  } else {
    parser.print(F("{}"));
  }
}

// ==================== Menus and Lists (cmd "l...") ====================

void handleMenusAndLists(byte* fullCmd) {
  if (fullCmd[1] == '\0') {
    // Top-level Menus & Lists screen
    if (!parser.isRefresh()) {
      parser.print(F("{,<bg 000040>~<-2><b>Examples of Menus, Single and Multi-selection screens and Formatting</b>\n"));
      parser.print(F(" <-1>Everything displayed here, including the flashing, is completely"));
      parser.print(F(" controlled by the messages sent from the pfodDevice (Arduino or other micro)~"));
      parser.sendVersion();
      parser.print(F("|ll<bg bl>~<-1>Menus with mixtures of\ntext and slider items"));
      parser.print(F("|ls<bg bl>~<-1>Single Selection Example"));
      parser.print(F("|lm<bg bl>~<-1>Multi-selection Example"));
      // Flashing (+) until the user visits Formatting Examples
      if (!formatExamplesSelected) {
        parser.print(F("|lf+<bg bl>~Formatting Examples"));
      } else {
        parser.print(F("|lf<bg bl>~Formatting Examples"));
      }
      parser.print(F("|lo<bg bl>~<-1>Oxygen Control Example\n<-1>(sound and flashing alerts)"));
      parser.print(F("|le<bg bl>~<-1>Enable, Disable, Hide and Unhide Menu items"));
      parser.print(F("}"));
    } else {
      // Refresh: only update the Formatting Examples item flash state
      parser.print(F("{;"));
      parser.print(formatExamplesSelected ? F("|lf") : F("|lf+"));
      parser.print(F("}"));
    }

  } else {
    switch (fullCmd[1]) {
      case 's': handleSingleSelection(fullCmd); break;
      case 'm': handleMultiSelection(fullCmd); break;
      case 'l': handleMixedMenu(fullCmd); break;
      case 'f':
        formatExamplesSelected = true;
        handleFormattingExamples(fullCmd);
        break;
      case 'o': handleOxygenControl(fullCmd); break;
      case 'e': handleEnableDisable(fullCmd); break;
      default: parser.print(F("{}")); break;
    }
  }
}

// ==================== Single Selection (cmd "ls...") ====================

void handleSingleSelection(byte* fullCmd) {
  if (fullCmd[2] == '\0') {
    // Display single-selection screen
    parser.print(F("{?lsS`"));
    parser.print(singleSelection);
    parser.print(F("~<bg 000040><b><+1>Single Selection Example Screen</b>\n\n"));
    parser.print(F("The pfodDevice determines what is displayed on this screen.  "));
    parser.print(F("\n including the colours of the <g>Level 1</g>, "));
    parser.print(F("<y>Level 2</y> and <r>Level 3</r>\n"));
    parser.print(F("When you make your single selection it is sent back to the pfodDevice"));
    parser.print(F(" and the previous menu is displayed.\n"));
    parser.print(F("The back arrow returns to the previous screen without sending any selection."));
    parser.print(F("|<g>Level 1|<y>Level 2|<r>Level 3}"));

  } else if (fullCmd[2] == 'S') {
    // User made a selection; save it
    parser.parseLong(parser.getFirstArg(), &pfodLongRtn);
    singleSelection = (int)pfodLongRtn;
    parser.print(F("{}"));

  } else {
    parser.print(F("{}"));
  }
}

// ==================== Multi Selection (cmd "lm...") ====================

void handleMultiSelection(byte* fullCmd) {
  if (fullCmd[2] == '\0') {
    // Display multi-selection screen with previously chosen items pre-selected
    parser.print(F("{*lmM"));
    parser.print(selectionArgs);  // e.g. "`0`2" pre-selects items 0 and 2
    parser.print(F("~<bg 000040><b><+1>Multi-selection Example Screen</b>\n\n"));
    parser.print(F("The pfodDevice determines what is displayed on this screen.  "));
    parser.print(F("When you press the Accept button your selection is sent back to the pfodDevice"));
    parser.print(F(" and the previous menu is displayed."));
    parser.print(F("|Fade on/off|3 Levels|Flash|SOS}"));

  } else if (fullCmd[2] == 'M') {
    // User accepted selections; rebuild selectionArgs from returned backtick args
    selectionArgs[0] = '\0';
    byte* argPtr = parser.getFirstArg();
    while (argPtr != NULL && *argPtr != '\0') {
      parser.parseLong(argPtr, &pfodLongRtn);
      char numBuf[8];
      ltoa(pfodLongRtn, numBuf, 10);
      if (strlen(selectionArgs) + 1 + strlen(numBuf) < sizeof(selectionArgs)) {
        strcat(selectionArgs, "`");
        strcat(selectionArgs, numBuf);
      }
      argPtr = parser.getNextArg(argPtr);
    }
    parser.print(F("{}"));

  } else {
    parser.print(F("{}"));
  }
}

// ==================== Mixed Menu (cmd "ll...") ====================

void handleMixedMenu(byte* fullCmd) {
  if (fullCmd[2] == '\0') {
    // Top-level Mixed Menu
    if (!parser.isRefresh()) {
      parser.print(F("{,<bg 000040>~<-3>This demo has a number of examples of mixed menus."));
      parser.print(F("The first is a color selector using pfod drawings\n"));
      parser.print(F("The second is an rgb color chooser\n"));
      parser.print(F("The second is a 3 position fan control slider\n"));
      parser.print(F("The sliders show text or scaled values plus units as specified by the pfodDevice message.\n"));
      parser.print(F(" The actual values sent and received by the pfodDevice are always integers~"));
      parser.sendVersion();
      parser.print(F("|llc<bg w>~<bl><+1>256 Colour Picker"));
      parser.print(F("|lll<bg w>~<+1>RGB <r>Colour</r> <g>Selector</g> <bl>Example</bl>"));
      parser.print(F("|llf<bg w>~<bl><+1>Fan Control"));
      parser.print(F("}"));
    } else {
      parser.print(F("{;}"));
    }

  } else {
    switch (fullCmd[2]) {
      case 'l': handleColorSelector(fullCmd); break;
      case 'c': handle256ColorPicker(fullCmd); break;
      case 'f': handleFanControl(fullCmd); break;
      default: parser.print(F("{}")); break;
    }
  }
}


// ==================== RGB Colour Selector (cmd "lll...") ====================

// Print the colour-selector refresh or full background + slider values
static void sendColorRefresh() {
  parser.print(F("<bg "));
  printColorHex();
  parser.print(F(">~<+3><bw>Colour &lt;"));
  printColorHex();
  parser.print(F(">\n<-6>\nBack button returns to previous menu."));
  parser.print(F("|lllr`"));
  parser.print(redValue);
  parser.print(F("|lllg`"));
  parser.print(greenValue);
  parser.print(F("|lllb`"));
  parser.print(blueValue);
}

void handleColorSelector(byte* fullCmd) {
  if (fullCmd[3] == '\0') {
    if (!parser.isRefresh()) {
      // Full screen
      parser.print(F("{,<bg "));
      printColorHex();
      parser.print(F(">~<+3><bw>Colour &lt;"));
      printColorHex();
      parser.print(F(">\n<-6>\nBack button returns to previous menu.~"));
      parser.sendVersion();
      parser.print(F("|lllr<bg ff0000>`"));
      parser.print(redValue);
      parser.print(F("~<w>Red <b>`255`0~</b>%~100~0"));
      parser.print(F("|lllg<bg 00ff00>`"));
      parser.print(greenValue);
      parser.print(F("~<bk>Green <b>`255`0~</b>%~100~0"));
      parser.print(F("|lllb<bg 0000ff>`"));
      parser.print(blueValue);
      parser.print(F("~<w>Blue <b>`255`0~</b>%~100~0}"));
    } else {
      parser.print(F("{;"));
      sendColorRefresh();
      parser.print(F("}"));
    }

  } else if (fullCmd[3] == 'r') {
    parser.parseLong(parser.getFirstArg(), &pfodLongRtn);
    redValue = (int)pfodLongRtn;
    parser.print(F("{;"));
    sendColorRefresh();
    parser.print(F("}"));

  } else if (fullCmd[3] == 'g') {
    parser.parseLong(parser.getFirstArg(), &pfodLongRtn);
    greenValue = (int)pfodLongRtn;
    parser.print(F("{;"));
    sendColorRefresh();
    parser.print(F("}"));

  } else if (fullCmd[3] == 'b') {
    parser.parseLong(parser.getFirstArg(), &pfodLongRtn);
    blueValue = (int)pfodLongRtn;
    parser.print(F("{;"));
    sendColorRefresh();
    parser.print(F("}"));

  } else {
    parser.print(F("{}"));
  }
}

// ==================== 256 Colour Picker (cmd "llc...") ====================
// Each section has a label row and an image-holder row.
// Lowercase cmd (a-h) = pfodApp loads the drawing image.
// Uppercase cmd (A-H) = pfodApp reports a touch inside the drawing.

// Send one colour-picker section drawing using pfodDwgs.
// cols/rows define the grid size; startColour is the palette offset.
static void sendColourPickerDwg(int cols, int rows, int startColour) {
  if (!parser.isRefresh()) {
    parser.parseLong(parser.getFirstArg(), &pfodLongRtn);
    if (pfodLongRtn != 0) {
      // Non-zero offset means pfodApp already has the image; send empty ack
      parser.print(F("{}"));
      return;
    }
    colourNo = startColour;
    dwgs.start(cols, rows, dwgs.BLACK);  // black background, no more chunks
    parser.sendRefreshAndVersion(0);     // cache with parser version, no auto-refresh
    for (int row = 0; row < rows; row++) {
      for (int col = 0; col < cols; col++) {
        dwgs.rectangle().color(colourNo).offset(col, row).filled().send();
        colourNo++;
      }
    }
    dwgs.touchZone().cmd(TOUCH_CMD).size(cols, rows).filter(dwgs.DOWN_UP).send();
    dwgs.end();
  } else {
    parser.print(F("{}"));
  }
}

// Handle a touch inside a colour-picker drawing section.
// gridCols and startColour allow the correct palette index to be computed.
static void handleColourPickerTouch(int gridCols, int startColour) {
  byte dwgCmd = parser.parseDwgCmd();
  (void)dwgCmd;
  if (parser.dwgCmdEquals(TOUCH_CMD)) {
    int col = parser.getTouchedCol();
    int row = parser.getTouchedRow();
    int selectedColour = row * gridCols + col + startColour;
    parser.print(F("{;<bg "));
    parser.print(selectedColour);
    parser.print(F(">~256 Colour Picker\nColour No "));
    parser.print(selectedColour);
    parser.print(F("}"));
  } else {
    parser.print(F("{}"));
  }
}

void handle256ColorPicker(byte* fullCmd) {
  if (fullCmd[3] == '\0') {
    // Display the 256-colour picker menu
    if (!parser.isRefresh()) {
      parser.print(F("{,<bw>~256 Colour Picker\nClick colour to choose.~"));
      parser.sendVersion();
      parser.print(F("|!llcAl~<-3><bw>Colours 0 to 15"));
      parser.print(F("|+llcA~llca"));
      parser.print(F("|!llcBl~<-3><bw>Colours 16 to 51"));
      parser.print(F("|+llcB~llcb"));
      parser.print(F("|!llcCl~<-3><bw>Colours 52 to 87"));
      parser.print(F("|+llcC~llcc"));
      parser.print(F("|!llcDl~<-3><bw>Colours 88 to 123"));
      parser.print(F("|+llcD~llcd"));
      parser.print(F("|!llcEl~<-3><bw>Colours 124 to 159"));
      parser.print(F("|+llcE~llce"));
      parser.print(F("|!llcFl~<-3><bw>Colours 160 to 195"));
      parser.print(F("|+llcF~llcf"));
      parser.print(F("|!llcGl~<-3><bw>Colours 196 to 231"));
      parser.print(F("|+llcG~llcg"));
      parser.print(F("|!llcHl~<-3><bw>Colours 232 to 255"));
      parser.print(F("|+llcH~llch"));
      parser.print(F("}"));
    } else {
      parser.print(F("{;}"));
    }

  } else {
    // Drawing load (lowercase) or touch event (uppercase) for sections a-h / A-H
    switch (fullCmd[3]) {
      case 'a': sendColourPickerDwg(8, 2, COL_A); break;  // 16 colours, 8x2
      case 'A': handleColourPickerTouch(8, COL_A); break;
      case 'b': sendColourPickerDwg(6, 6, COL_B); break;  // 36 colours, 6x6
      case 'B': handleColourPickerTouch(6, COL_B); break;
      case 'c': sendColourPickerDwg(6, 6, COL_C); break;
      case 'C': handleColourPickerTouch(6, COL_C); break;
      case 'd': sendColourPickerDwg(6, 6, COL_D); break;
      case 'D': handleColourPickerTouch(6, COL_D); break;
      case 'e': sendColourPickerDwg(6, 6, COL_E); break;
      case 'E': handleColourPickerTouch(6, COL_E); break;
      case 'f': sendColourPickerDwg(6, 6, COL_F); break;
      case 'F': handleColourPickerTouch(6, COL_F); break;
      case 'g': sendColourPickerDwg(6, 6, COL_G); break;
      case 'G': handleColourPickerTouch(6, COL_G); break;
      case 'h': sendColourPickerDwg(6, 4, COL_H); break;  // 24 colours, 6x4
      case 'H': handleColourPickerTouch(6, COL_H); break;
      default: parser.print(F("{}")); break;
    }
  }
}


// ==================== Fan Control (cmd "llf...") ====================

static void sendFanUpdate() {
  parser.print(F("{;|llfo`"));
  parser.print(fanPosition);
  parser.print(F("}"));
}

void handleFanControl(byte* fullCmd) {
  if (fullCmd[3] == '\0') {
    if (!parser.isRefresh()) {
      parser.print(F("{,<bg 000040>~<+5>Fan Control\n<-4>Off, Low or High<-4>\nBack button returns to previous menu.~"));
      parser.sendVersion();
      parser.print(F("|llfo<bg bl>`"));
      parser.print(fanPosition);
      parser.print(F("~<+4><b>Fan is ~~Off\\Low\\High}"));
    } else {
      sendFanUpdate();
    }

  } else if (fullCmd[3] == 'o') {
    parser.parseLong(parser.getFirstArg(), &pfodLongRtn);
    fanPosition = (int)pfodLongRtn;
    sendFanUpdate();

  } else {
    parser.print(F("{}"));
  }
}

// ==================== Formatting Examples (cmd "lf...") ====================
// All items are disabled (!), so pfodApp never sends any sub-commands.

void handleFormattingExamples(byte* fullCmd) {
  if (fullCmd[2] == '\0') {
    if (!parser.isRefresh()) {
      parser.print(F("{,<bg 000040>~\nFormatting Examples\n<-2>(scroll down for more)</-2>\n"));
      parser.print(F("<-4>This illustrates some of the format codes available.\n"));
      parser.print(F("Set the background colour by adding a colour to the row's command\n"));
      parser.print(F("Set flashing and sound by adding + and @ to the row's command\n~"));
      parser.sendVersion();
      parser.print(F("|!lftxt~<-5>The first row below is formatted as an empty spacer\n"));
      parser.print(F("adjust the spacer size using font size formatting"));
      parser.print(F("|!lf0080~<-4>"));  
      parser.print(F("|!lfr~<r>&lt;r>"));
      parser.print(F("|!lfb~<b>&lt;b> "));
      parser.print(F("|!lfi~<i>&lt;i>"));
      parser.print(F("|!lfu~<u>&lt;u>"));
      parser.print(F("|!lfa~<+12>&lt;+12>"));
      parser.print(F("|!lf6~<+6>&lt;+6>"));
      parser.print(F("|!lf5~<+5>&lt;+5>"));
      parser.print(F("|!lf4~<+4>&lt;+4>"));
      parser.print(F("|!lf3~<+3>&lt;+3>"));
      parser.print(F("|!lf2~<+2>&lt;+2>"));
      parser.print(F("|!lf1~<+1>&lt;+1>"));
      parser.print(F("|!lf0~<+0> &lt;+0> normal size"));
      parser.print(F("|!lf7~<-1>&lt;-1>"));
      parser.print(F("|!lf8~<-2>&lt;-2>"));
      parser.print(F("|!lf9~<-3>&lt;-3>"));
      parser.print(F("|!lfc~<-4>&lt;-4>"));
      parser.print(F("|!lfd~<-5>&lt;-5>"));
      parser.print(F("|!lff~<-6>&lt;-6>"));
      parser.print(F("}"));
    } else {
      parser.print(F("{;}"));
    }
  } else {
    parser.print(F("{}"));
  }
}

// ==================== Oxygen Control (cmd "lo...") ====================
// \xc2\xb2 = UTF-8 for superscript 2 (²); displayed as O²

static void sendOxygenGaugeRow(bool fullSend) {
  // Gauge row (disabled label '!')
  parser.print(fullSend ? F("|!loC<b><+3>") : F("|!loC"));
  if ((oxygenLevel < 195) || (oxygenLevel > 235)) {
    parser.print(F("<bg r>@+"));  // red background + alarm flash + sound
  } else {
    parser.print(F("<bg g>"));  // green background = safe
  }
  parser.print('`');
  parser.print(oxygenLevel);
  if (fullSend) {
    // Full display with gauge range and units
    parser.print(F("~O\xc2\xb2 "));
    if (oxygenLevel < 195) parser.print(F("LOW\n"));
    else if (oxygenLevel > 235) parser.print(F("HIGH\n"));
    else parser.print(F("\n"));
    parser.print(F("~%`270`150~27~15"));
  } else {
    // Refresh: label only (no range change)
    parser.print(F("~O\xc2\xb2 "));
    if (oxygenLevel < 195) parser.print(F("LOW\n"));
    else if (oxygenLevel > 235) parser.print(F("HIGH\n"));
    else parser.print('\n');
  }
}

void handleOxygenControl(byte* fullCmd) {
  stepOxygen();  // advance simulation each time the oxygen screen is visited

  if (fullCmd[2] == '\0') {
    if (!parser.isRefresh()) {
      // Full oxygen control screen
      parser.print(F("{,<bg 000040>~<b><y>Keep the O\xc2\xb2 in the <00e000>green</00e000>\nusing the Oxygen Valve</b>\n"));
      parser.print(F("<-3>An alarm will sound and the display will start flashing if levels exceeded safe values.\n"));
      parser.print(F("<-1>\nSee pfodAppForAndroidGettingStarted for how to change the sound~"));
      parser.sendVersion();
      parser.print(F("`1000"));  // 1000 ms refresh interval
      sendOxygenGaugeRow(true);
      // Valve on/off toggle
      parser.print(F("|loA<bg bl>`"));
      parser.print(oxygenOn ? 1 : 0);
      parser.print(F("~<+2>Oxygen Valve\n~~Off\\On"));
      parser.print(F("}"));
    } else {
      // Refresh: update gauge and valve state
      parser.print(F("{;"));
      sendOxygenGaugeRow(false);
      parser.print(F("|loA`"));
      parser.print(oxygenOn ? 1 : 0);
      parser.print(F("}"));
    }

  } else if (fullCmd[2] == 'A') {
    // Oxygen valve toggled
    parser.parseLong(parser.getFirstArg(), &pfodLongRtn);
    oxygenOn = (pfodLongRtn != 0);
    parser.print(F("{;"));
    sendOxygenGaugeRow(false);
    parser.print(F("|loA`"));
    parser.print(oxygenOn ? 1 : 0);
    parser.print(F("}"));

  } else {
    parser.print(F("{}"));
  }
}

// ==================== Enable / Disable Menu (cmd "le...") ====================

// Emit the five shared item rows for full-send and refresh
static void sendEnableDisableRows(bool fullSend) {
  if (fullSend) {
    // Hide/Unhide toggle button
    parser.print(F("|leH<bg bl><b><+2>`"));
    parser.print(buttonHidden ? 0 : 1);
    parser.print(F("~~ Button~Unhide\\Hide~t"));
    // The button that can be hidden ('-' suffix hides it from pfodApp)
    parser.print(F("|leb"));
    parser.print(buttonHidden ? F("-") : F(""));
    parser.print(F("~<b><i>Button to be hidden"));
    // Enable button (! makes it appear selected/highlighted when enabled)
    parser.print(F("|leE<bg bl>"));
    parser.print(!buttonDisabled ? F("!") : F(""));
    parser.print(F("~<b><+2>Enable</b><-3>\nButton and Slider "));
    // Disable button
    parser.print(F("|leD<bg bl>"));
    parser.print(buttonDisabled ? F("!") : F(""));
    parser.print(F("~<b><+2>Disable</b><-3>\nButton and Slider "));
    // Slider (disabled with '!' when buttonDisabled)
    parser.print(F("|leS<bg bl>"));
    parser.print(buttonDisabled ? F("!") : F(""));
    parser.print('`');
    parser.print(sliderPos);
    parser.print(F("~<+1>Slider ~%`100~100"));
  } else {
    // Refresh: send only current values (no labels)
    parser.print(F("|leH`"));
    parser.print(buttonHidden ? 0 : 1);
    parser.print(F("|leb"));
    parser.print(buttonHidden ? F("-") : F(""));
    parser.print(F("|leE"));
    parser.print(!buttonDisabled ? F("!") : F(""));
    parser.print(F("|leD"));
    parser.print(buttonDisabled ? F("!") : F(""));
    parser.print(F("|leS"));
    parser.print(buttonDisabled ? F("!") : F(""));
    parser.print('`');
    parser.print(sliderPos);
  }
}

void handleEnableDisable(byte* fullCmd) {
  if (fullCmd[2] == '\0') {
    if (!parser.isRefresh()) {
      parser.print(F("{,<bg 000040>~<b>Examples of Hiding and Disabling buttons and sliders~"));
      parser.sendVersion();
      sendEnableDisableRows(true);
      parser.print(F("}"));
    } else {
      parser.print(F("{;"));
      sendEnableDisableRows(false);
      parser.print(F("}"));
    }

  } else if (fullCmd[2] == 'H') {
    // Hide/Unhide toggled (the slider sends 0 or 1 but we just toggle)
    buttonHidden = !buttonHidden;
    parser.print(F("{;"));
    sendEnableDisableRows(false);
    parser.print(F("}"));

  } else if (fullCmd[2] == 'E') {
    buttonDisabled = false;
    parser.print(F("{;"));
    sendEnableDisableRows(false);
    parser.print(F("}"));

  } else if (fullCmd[2] == 'D') {
    buttonDisabled = true;
    parser.print(F("{;"));
    sendEnableDisableRows(false);
    parser.print(F("}"));

  } else if (fullCmd[2] == 'S') {
    // Slider moved (only reachable when not disabled)
    parser.parseLong(parser.getFirstArg(), &pfodLongRtn);
    sliderPos = (int)pfodLongRtn;
    parser.print(F("{;"));
    sendEnableDisableRows(false);
    parser.print(F("}"));

  } else if (fullCmd[2] == 'b') {
    // The hidden button was pressed (only reachable when unhidden)
    parser.print(F("{}"));

  } else {
    parser.print(F("{}"));
  }
}
// ============= end of demoScreens.ino =============
