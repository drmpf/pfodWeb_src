/*
   rawDataCollector.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Exports:    window.RawDataCollector class
// Depends on: nothing (pure data collector, no DOM or other module dependencies)
// Called by:  connectionManager.js feeds characters via processCharacters();
//             keepAliveAndHttp.js creates window.rawDataCollector instance;
//             chartAndRawData.js reads data via window.rawDataCollector;
//             responseHandlers.js reads data via window.rawDataCollector.getRawDataWithoutClearing()

/**
 * RawDataCollector - Processes raw character stream to collect ALL data outside {...}
 * Operates independently from message fragmentation
 *
 * Raw Data Collection:
 * - Collects ALL characters outside {} (pfod commands)
 * - Preserves all data including newlines, spaces, etc.
 * - Accumulates continuously as device sends data
 * - Resets when new raw data display session starts
 */
class RawDataCollector {
  constructor() {
    this.rawData = '';        // All collected raw data (OUTSIDE bytes only —
                              // the connection layer owns {..} framing).
    this.lastReturnedLength = 0; // Track how much data we've already returned for display
    // console.log('[RAW_DATA_COLLECTOR Created - character-stream raw data extraction');
  }

  /**
   * Process a string character-by-character from raw device data
   * Called from SerialConnection.startReading() and BLEConnection.handleCharacteristicChange()
   * BEFORE message fragmentation for { } extraction
   * @param {string} text - Raw text from device
   */
  processCharacters(text) {
    // console.log('[RAW_DATA_COLLECTOR processCharacters called with ${text.length} chars: ${JSON.stringify(text.substring(0, 50))}`);
    for (let i = 0; i < text.length; i++) {
      this.processChar(text[i]);
    }
  }

  /**
   * Process a single character from the raw stream
   * @param {string} char - Single character
   */
  processChar(char) {
    // The connection-layer OUTSIDE/INSIDE byte state machine owns all {..}
    // command framing — this collector is only ever handed OUTSIDE (raw)
    // bytes, so just accumulate every char verbatim (newlines, spaces, the
    // CSV/raw stream as the device sent it).
    this.rawData += char;
  }

  /**
   * Get all collected raw data
   * @returns {string} - All collected raw data
   */
  getRawData() {
    return this.rawData;
  }

  /**
   * Get raw data WITHOUT clearing it
   * The collector continues accumulating as more data arrives
   * @returns {string} - All collected raw data
   */
  getRawDataWithoutClearing() {
    // console.log('[RAW_DATA_COLLECTOR getRawDataWithoutClearing called - returning ${this.rawData.length} chars`);
    return this.rawData;
  }

  /**
   * Get ONLY new data since we started tracking for display
   * Used to append new chunks to the raw data display without duplication
   * @returns {string} - Only the newly arrived data since last display update
   */
  getNewData() {
    const newData = this.rawData.substring(this.lastReturnedLength);
    // console.log('[RAW_DATA_COLLECTOR getNewData called - returning ${newData.length} new chars (total: ${this.rawData.length}, returned before: ${this.lastReturnedLength})`);
    return newData;
  }

  /**
   * Mark that we've displayed data up to the current point
   * Call this after creating/updating the display to track progress
   */
  markDisplayedUpTo() {
    this.lastReturnedLength = this.rawData.length;
    // console.log('[RAW_DATA_COLLECTOR Marked display progress at ${this.lastReturnedLength} chars`);
  }

  /**
   * Get raw data and clear it (for consumption by raw data display)
   * @returns {string} - All collected raw data
   */
  extractAndClearRawData() {
    const data = this.rawData;
    this.rawData = '';
    // console.log('[RAW_DATA_COLLECTOR Extracted and cleared ${data.length} chars of raw data`);
    return data;
  }

  /**
   * Clear all collected raw data
   */
  clear() {
    this.rawData = '';
    this.lastReturnedLength = 0;
    // console.log('[RAW_DATA_COLLECTOR Cleared all raw data');
  }

  /**
   * Get statistics about collected data
   * @returns {object} - Stats about raw data
   */
  getStats() {
    return {
      totalBytes: this.rawData.length,
      lineCount: (this.rawData.match(/\n/g) || []).length
    };
  }
}

// Make class available globally for browser use
window.RawDataCollector = RawDataCollector;
