// Shared constants to avoid circular dependencies
// Exports:    window.JS_VERSION (string), module.exports.JS_VERSION for Node.js
// Depends on: nothing
// Called by:  pfodWeb.js (reads window.JS_VERSION on load and stores in this.js_ver,
//             logs version after bundle load)
  var JS_VERSION = "V4.1.1-- 4th July 2026";
// V4.1.1 added supoort for for ESP32 and Pi Pico and ESP8266 and for connections BLE, TCP/IP and HTTP 
// V4.1.0 revised pfodProxy added password and extraFonts
// V4.0.2 added Mouse over show data values in chart
// V4.0.1 added Minimal C Code target
// V4.0.0 added Designer
// V3.1.0 added menu items
// V3.0.8 combined .js files to reduce downloads, added Chart Config
// V3.0.7 added Chart Only option
// V3.0.6 increase allowable length of HTTP ip:port to 50, Also keep http response when timeout resends cmd
// V3.0.5 now handles port no's via NAT for example targetIP=xx.xx.xx.xx:54989
// V3.0.4 added stacked charts
// V3.0.3 fixed chart updates and added timestamp to csv data
// V3.0.2 disable refresh in chart mode fixed value scaling
// V3.0.1 auto chart option on startup
// V3.0.0 added initial charting support
// V2.0.4 fixed scaling for nested dwgs
// V2.0.3 fixed transform for nested dwgs
// V2.0.2 fixed transform pushZero for nested dwgs
// V2.0.1 edit to .ino files
// V2.0.0 removed nodejs server, bundled all files in single htmls
// V1.1.5 added init() of drawings
// V1.1.4 added pfodMainDrawing.h generated file
// V1.1.3 dwg updates as response received

// Make available globally for browser use
if (typeof window !== 'undefined') {
    window.JS_VERSION = JS_VERSION;
}

// Export for Node.js use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JS_VERSION };
}