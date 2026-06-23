/*
   messageViewer.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Exports:    window.MessageCollector class, window.RawMessageViewer class,
//             window.ChartConfigViewer class
// Depends on: window.csvCollector (ChartConfigViewer reads CSV field counts and applies configs),
//             window.chartDisplay (ChartConfigViewer calls displayChartWithPlotNo indirectly)
// Called by:  keepAliveAndHttp.js initializeMessageViewer (creates all three instances as
//             window.messageCollector, window.rawMessageViewer, window.chartConfigViewer);
//             toolbarAndMenu.js showToolbarMenu (opens rawMessageViewer / chartConfigViewer)

/**
 * MessageCollector - Centralized collector for raw messages from all connections
 * Stores messages with metadata (timestamp, direction, connection type, size)
 */
class MessageCollector {
  constructor(maxMessages = 500) {
    this.messages = [];
    this.maxMessages = maxMessages;
    this.subscribers = []; // Callback functions to notify of new messages
    this.isPaused = false;
    // console.log('[MESSAGE_COLLECTOR Created with max messages:', maxMessages);
  }

  /**
   * Add a message to the collector
   * @param {string} direction - 'sent' or 'received'
   * @param {string} message - The raw message text
   * @param {string} protocol - 'http', 'serial', or 'ble'
   * @param {string} cmd - Optional command that was sent (for reference)
   */
  addMessage(direction, message, protocol, cmd = null) {
    if (this.isPaused) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      direction: direction,
      protocol: protocol,
      message: message,
      cmd: cmd,
      size: message ? message.length : 0
    };

    this.messages.push(entry);

    // Trim to max messages if needed
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }

    // Notify subscribers
    this.notifySubscribers(entry);

    const logPrefix = direction === 'sent' ? '>>> SENT' : '<<< RECEIVED';
    // console.log('[MESSAGE_COLLECTOR ${logPrefix} [${protocol}] ${message ? message.substring(0, 100) : '(empty)'}`);
  }

  /**
   * Subscribe to new messages
   * @param {function} callback - Function to call with new message entry
   */
  subscribe(callback) {
    this.subscribers.push(callback);
  }

  /**
   * Unsubscribe from messages
   * @param {function} callback - The callback to remove
   */
  unsubscribe(callback) {
    this.subscribers = this.subscribers.filter(cb => cb !== callback);
  }

  /**
   * Notify all subscribers of a new message
   */
  notifySubscribers(entry) {
    this.subscribers.forEach(callback => {
      callback(entry);
    });
  }

  /**
   * Get all messages
   */
  getMessages() {
    return [...this.messages];
  }

  /**
   * Get messages filtered by protocol
   */
  getMessagesByProtocol(protocol) {
    return this.messages.filter(msg => msg.protocol === protocol);
  }

  /**
   * Get messages filtered by direction
   */
  getMessagesByDirection(direction) {
    return this.messages.filter(msg => msg.direction === direction);
  }

  /**
   * Clear all messages
   */
  clear() {
    this.messages = [];
    // console.log('[MESSAGE_COLLECTOR Messages cleared');
  }

  /**
   * Pause collecting messages
   */
  pause() {
    this.isPaused = true;
    // console.log('[MESSAGE_COLLECTOR Paused');
  }

  /**
   * Resume collecting messages
   */
  resume() {
    this.isPaused = false;
    // console.log('[MESSAGE_COLLECTOR Resumed');
  }

  /**
   * Export messages as JSON, with ms field (ms since first message timestamp)
   * and bytes field (raw uint8_t wire-byte count — pfod is a text protocol
   * with one wire byte per character, so this is the JS string length).
   */
  exportAsJSON() {
    const t0 = this.messages.length > 0 ? new Date(this.messages[0].timestamp).getTime() : 0;
    const withMs = this.messages.map(msg => {
      const ms = new Date(msg.timestamp).getTime() - t0;
      const bytes = msg.message ? msg.message.length : 0;
      return { timestamp: msg.timestamp, ms, direction: msg.direction, bytes, message: msg.message };
    });
    return JSON.stringify(withMs, null, 2);
  }

  /**
   * Export messages as CSV, with ms column (ms since first message timestamp)
   * and bytes column (raw uint8_t wire-byte count — pfod is a text protocol
   * with one wire byte per character, so this is the JS string length).
   */
  exportAsCSV() {
    if (this.messages.length === 0) {
      return 'timestamp,ms,direction,bytes,message\n';
    }

    const t0 = new Date(this.messages[0].timestamp).getTime();
    const header = 'timestamp,ms,direction,bytes,message\n';
    const rows = this.messages.map(msg => {
      const ms = new Date(msg.timestamp).getTime() - t0;
      const bytes = msg.message ? msg.message.length : 0;
      const message = msg.message.replace(/"/g, '""').replace(/\n/g, '\\n'); // Escape quotes; represent newlines as \n
      return `"${msg.timestamp}",${ms},"${msg.direction}",${bytes},"${message}"`;
    });

    return header + rows.join('\n');
  }
}

/**
 * RawMessageViewer - UI component to display collected messages
 */
class RawMessageViewer {
  constructor(messageCollector, containerId = 'side-panel') {
    this.collector = messageCollector;
    this.containerId = containerId;
    this.isVisible = false;
    this.filterDirection = 'all'; // 'all', 'sent', 'received', 'timeout'
    this.autoScroll = true;
    this.messageViews = []; // Store references to message view elements for scrolling

    // Message batching for performance with high-speed data
    this.pendingMessages = []; // Queue of messages to add
    this.updateScheduled = false; // Flag to track if an update is already scheduled
    this.maxBatchSize = 50; // Process up to 50 messages per animation frame
    this.animationFrameId = null;

    console.log('[RAW_MESSAGE_VIEWER] Created with container:', containerId);

    // Subscribe to new messages
    this.collector.subscribe((entry) => this.onNewMessage(entry));
  }

  /**
   * Initialize and create the viewer UI
   */
  initialize() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('[RAW_MESSAGE_VIEWER] Container not found:', this.containerId);
      return;
    }

    this.createViewerHTML(container);
    this.attachEventListeners();
    this.updateMessageDisplay();
    console.log('[RAW_MESSAGE_VIEWER] Initialized');
  }

  /**
   * Create the HTML structure for the viewer
   */
  createViewerHTML(container) {
    container.innerHTML = `
      <div class="raw-message-viewer" id="raw-message-viewer-main">
        <div class="raw-message-header">
          <div class="raw-message-title">
            <span>Raw Message Viewer</span>
            <button class="raw-message-close-btn" id="raw-message-close-btn" title="Close viewer">&times;</button>
          </div>
          <div class="raw-message-toolbar">
            <div class="raw-message-filters">
              <select id="raw-msg-filter-direction" class="raw-message-filter">
                <option value="all">Direction: All</option>
                <option value="sent">Direction: Sent</option>
                <option value="received">Direction: Received</option>
                <option value="timeout">Direction: Timeout</option>
              </select>
            </div>
            <div class="raw-message-buttons">
              <label class="raw-message-checkbox">
                <input type="checkbox" id="raw-msg-autoscroll" checked>
                Auto-scroll
              </label>
              <button id="raw-msg-clear-btn" class="raw-message-btn">Clear</button>
              <button id="raw-msg-export-json-btn" class="raw-message-btn">Export JSON</button>
              <button id="raw-msg-export-csv-btn" class="raw-message-btn">Export CSV</button>
              <button id="raw-msg-export-csv-by-fields-btn" class="raw-message-btn" title="Export CSV data organized by field count">Export CSV by Fields</button>
            </div>
          </div>
        </div>
        <div class="raw-message-content">
          <div class="raw-message-list" id="raw-message-list">
            <div class="raw-message-empty">No messages yet</div>
          </div>
        </div>
      </div>
    `;

    this.attachStyles(container);
  }

  /**
   * Attach CSS styles to the container
   */
  attachStyles(container) {
    const style = document.createElement('style');
    style.textContent = `
      #${this.containerId} {
        all: initial;
        display: none;
        flex-direction: column;
        width: 100%;
        height: 100%;
        font-family: 'Courier New', monospace;
        min-width: 200px;
        background-color: #1e1e1e;
      }

      .raw-message-viewer {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background-color: #1e1e1e;
        color: #d4d4d4;
        border: 1px solid #333;
        box-sizing: border-box;
        z-index: 5000;
      }

      .raw-message-header {
        flex-shrink: 0;
        background-color: #252526;
        border-bottom: 1px solid #3e3e42;
        padding: 8px;
      }

      .raw-message-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-weight: bold;
        font-size: 14px;
        color: #cccccc;
      }

      .raw-message-close-btn {
        background: none;
        border: none;
        color: #cccccc;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .raw-message-close-btn:hover {
        color: #ffffff;
      }

      .raw-message-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .raw-message-filters {
        display: flex;
        gap: 8px;
      }

      .raw-message-filter,
      .raw-message-btn,
      .raw-message-checkbox input {
        background-color: #3c3c3c;
        color: #d4d4d4;
        border: 1px solid #555;
        padding: 4px 8px;
        border-radius: 3px;
        font-size: 12px;
        cursor: pointer;
        font-family: Arial, sans-serif;
      }

      .raw-message-filter:hover,
      .raw-message-btn:hover {
        background-color: #454545;
      }

      .raw-message-filter:focus,
      .raw-message-btn:focus {
        outline: 1px solid #007acc;
      }

      .raw-message-buttons {
        display: flex;
        gap: 8px;
      }

      .raw-message-checkbox {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        font-size: 12px;
        color: #d4d4d4;
      }

      .raw-message-checkbox input {
        cursor: pointer;
        padding: 0;
        width: 16px;
        height: 16px;
      }

      .raw-message-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .raw-message-list {
        flex: 1;
        overflow-y: auto;
        overflow-x: auto;
        background-color: #1e1e1e;
        padding: 4px;
      }

      .raw-message-item {
        display: flex;
        padding: 4px;
        margin: 2px 0;
        border-radius: 2px;
        border-left: 3px solid;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-size: 11px;
        line-height: 1.4;
      }

      .raw-message-item.sent {
        border-left-color: #4ec9b0;
        background-color: #1e3b2a;
      }

      .raw-message-item.received {
        border-left-color: #ce9178;
        background-color: #3b2a1e;
      }

      .raw-message-item.timeout {
        border-left-color: #f44747;
        background-color: #3b1e1e;
      }

      .raw-message-item-time {
        color: #858585;
        min-width: 100px;
        margin-right: 0px;
        flex-shrink: 0;
      }

      .raw-message-item-direction {
        color: #d7ba7d;
        min-width: 20px;
        margin-right: 2px;
        flex-shrink: 0;
        font-weight: bold;
      }

      .raw-message-item-text {
        flex: 1;
        color: #ce9178;
        word-break: break-all;
      }

      .raw-message-empty {
        color: #858585;
        padding: 20px;
        text-align: center;
        font-style: italic;
      }

      /* Scrollbar styling */
      .raw-message-list::-webkit-scrollbar {
        width: 12px;
        height: 12px;
      }

      .raw-message-list::-webkit-scrollbar-track {
        background-color: #1e1e1e;
      }

      .raw-message-list::-webkit-scrollbar-thumb {
        background-color: #464647;
        border-radius: 4px;
      }

      .raw-message-list::-webkit-scrollbar-thumb:hover {
        background-color: #5a5a5a;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Attach event listeners to controls
   */
  attachEventListeners() {
    const closeBtn = document.getElementById('raw-message-close-btn');
    if (!closeBtn) throw new Error('[messageViewer] attachEventListeners: #raw-message-close-btn not found');
    closeBtn.addEventListener('click', () => this.hide());

    const filterDir = document.getElementById('raw-msg-filter-direction');
    if (!filterDir) throw new Error('[messageViewer] attachEventListeners: #raw-msg-filter-direction not found');
    filterDir.addEventListener('change', (e) => {
      this.filterDirection = e.target.value;
      this.updateMessageDisplay();
    });

    const autoscroll = document.getElementById('raw-msg-autoscroll');
    if (!autoscroll) throw new Error('[messageViewer] attachEventListeners: #raw-msg-autoscroll not found');
    autoscroll.addEventListener('change', (e) => {
      this.autoScroll = e.target.checked;
    });

    const clearBtn = document.getElementById('raw-msg-clear-btn');
    if (!clearBtn) throw new Error('[messageViewer] attachEventListeners: #raw-msg-clear-btn not found');
    clearBtn.addEventListener('click', () => {
      this.collector.clear();
      // Also clear CSV collector if available
      if (ConnectionManager.csvCollector) {
        ConnectionManager.csvCollector.clear();
      }
      this.updateMessageDisplay();
    });

    const exportJsonBtn = document.getElementById('raw-msg-export-json-btn');
    if (!exportJsonBtn) throw new Error('[messageViewer] attachEventListeners: #raw-msg-export-json-btn not found');
    exportJsonBtn.addEventListener('click', () => this.exportJSON());

    const exportCsvBtn = document.getElementById('raw-msg-export-csv-btn');
    if (!exportCsvBtn) throw new Error('[messageViewer] attachEventListeners: #raw-msg-export-csv-btn not found');
    exportCsvBtn.addEventListener('click', () => this.exportCSV());

    const exportCsvByFieldsBtn = document.getElementById('raw-msg-export-csv-by-fields-btn');
    if (!exportCsvByFieldsBtn) throw new Error('[messageViewer] attachEventListeners: #raw-msg-export-csv-by-fields-btn not found');
    exportCsvByFieldsBtn.addEventListener('click', () => this.exportCSVByFieldCount());
  }

  /**
   * Called when a new message is added to the collector
   * Messages are queued and processed in batches to prevent DOM thrashing
   */
  onNewMessage(entry) {
    if (!this.isVisible) {
      return; // Don't update if not visible
    }

    if (!this.shouldDisplayMessage(entry)) {
      return;
    }

    // Queue the message instead of adding it immediately
    this.pendingMessages.push(entry);

    // Schedule a batch update if one isn't already scheduled
    if (!this.updateScheduled) {
      this.updateScheduled = true;
      this.animationFrameId = requestAnimationFrame(() => {
        this.processPendingMessages();
      });
    }
  }

  /**
   * Process queued messages in batches using requestAnimationFrame
   * This prevents DOM thrashing when receiving high-speed data
   */
  processPendingMessages() {
    if (this.pendingMessages.length === 0) {
      this.updateScheduled = false;
      return;
    }

    const messageList = document.getElementById('raw-message-list');
    if (!messageList) {
      this.pendingMessages = [];
      this.updateScheduled = false;
      return;
    }

    // Process up to maxBatchSize messages
    const batch = this.pendingMessages.splice(0, this.maxBatchSize);

    // Remove empty message if it exists
    const emptyMsg = messageList.querySelector('.raw-message-empty');
    if (emptyMsg && this.messageViews.length === 0) {
      emptyMsg.remove();
    }

    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();
    batch.forEach(entry => {
      const messageEl = this.createMessageElement(entry);
      fragment.appendChild(messageEl);
      this.messageViews.push(messageEl);
    });

    messageList.appendChild(fragment);

    // Limit number of visible elements to prevent memory issues
    const maxVisibleMessages = 1000;
    while (this.messageViews.length > maxVisibleMessages) {
      const removed = this.messageViews.shift();
      removed.remove();
    }

    // Scroll to bottom if autoScroll is enabled
    if (this.autoScroll) {
      messageList.scrollTop = messageList.scrollHeight;
    }

    // Schedule next batch if there are more messages
    if (this.pendingMessages.length > 0) {
      this.animationFrameId = requestAnimationFrame(() => {
        this.processPendingMessages();
      });
    } else {
      this.updateScheduled = false;
    }
  }

  /**
   * Check if message should be displayed based on current filters
   */
  shouldDisplayMessage(entry) {
    if (this.filterDirection !== 'all' && entry.direction !== this.filterDirection) {
      return false;
    }
    return true;
  }

  /**
   * Create a message element from an entry
   */
  createMessageElement(entry) {
    const messageEl = document.createElement('div');
    messageEl.className = `raw-message-item ${entry.direction}`;

    const timeEl = document.createElement('span');
    timeEl.className = 'raw-message-item-time';
    const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
    timeEl.textContent = time;

    const directionEl = document.createElement('span');
    directionEl.className = 'raw-message-item-direction';
    directionEl.textContent = entry.direction === 'sent' ? '<<' : '>>';

    const textEl = document.createElement('span');
    textEl.className = 'raw-message-item-text';
    textEl.textContent = entry.message;

    messageEl.appendChild(timeEl);
    messageEl.appendChild(directionEl);
    messageEl.appendChild(textEl);

    return messageEl;
  }

  /**
   * Add a message to the display (used by updateMessageDisplay during filtering)
   */
  addMessageToDisplay(entry) {
    const messageList = document.getElementById('raw-message-list');
    if (!messageList) throw new Error('[messageViewer] addMessageToDisplay: #raw-message-list not found');

    // Remove empty message if it exists
    const emptyMsg = messageList.querySelector('.raw-message-empty');
    if (emptyMsg) {
      emptyMsg.remove();
    }

    const messageEl = this.createMessageElement(entry);
    messageList.appendChild(messageEl);
    this.messageViews.push(messageEl);

    // Limit number of visible elements to prevent memory issues
    const maxVisibleMessages = 1000;
    if (this.messageViews.length > maxVisibleMessages) {
      const removed = this.messageViews.shift();
      removed.remove();
    }
  }

  /**
   * Update the entire message display based on filters
   */
  updateMessageDisplay() {
    const messageList = document.getElementById('raw-message-list');
    if (!messageList) throw new Error('[messageViewer] updateMessageDisplay: #raw-message-list not found');

    messageList.innerHTML = '';
    this.messageViews = [];

    const messages = this.collector.getMessages();
    const filteredMessages = messages.filter(msg => this.shouldDisplayMessage(msg));

    if (filteredMessages.length === 0) {
      messageList.innerHTML = '<div class="raw-message-empty">No messages match the filters</div>';
      return;
    }

    filteredMessages.forEach(entry => this.addMessageToDisplay(entry));

    if (this.autoScroll) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }

  /**
   * Show the viewer.
   * Hides chart-config-viewer-main if present so only one view shows at a time.
   */
  show() {
    // Hide chart config inner content if it exists - only one view at a time
    const configMain = document.getElementById('chart-config-viewer-main');
    if (configMain) {
      configMain.style.display = 'none';
    }
    if (window.chartConfigViewer) {
      window.chartConfigViewer.isVisible = false;
    }

    // Show raw message viewer inner content (may have been hidden by ChartConfigViewer.show())
    const rawMain = document.getElementById('raw-message-viewer-main');
    if (rawMain) {
      rawMain.style.display = 'flex';
    }

    const container = document.getElementById(this.containerId);
    if (container) {
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.flex = 0.30; // 30% width
      this.isVisible = true;
      this.updateMessageDisplay();

      // Show the divider
      const divider = document.getElementById('resize-divider');
      if (divider) {
        divider.style.display = 'block';
      }

      // Set canvas pane to 70%
      const canvasPane = document.getElementById('canvas-pane');
      if (canvasPane) {
        canvasPane.style.flex = 0.70;
      }

      console.log('[RAW_MESSAGE_VIEWER] Shown - canvas 70%, viewer 30%');
      setTimeout(() => window.drawingViewer.handleResize(), 0);
    }
  }

  /**
   * Hide the viewer
   */
  hide() {
    const container = document.getElementById(this.containerId);
    if (container) {
      container.style.display = 'none';
      container.style.flex = 0; // Take no space
      this.isVisible = false;

      // Cancel any pending animation frame and clear pending messages
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.pendingMessages = [];
      this.updateScheduled = false;

      // Hide the divider
      const divider = document.getElementById('resize-divider');
      if (divider) {
        divider.style.display = 'none';
      }

      // Set canvas pane to 100%
      const canvasPane = document.getElementById('canvas-pane');
      if (canvasPane) {
        canvasPane.style.flex = 1;
      }

      console.log('[RAW_MESSAGE_VIEWER] Hidden - canvas 100%');
      setTimeout(() => window.drawingViewer.handleResize(), 0);
    }
  }

  /**
   * Toggle viewer visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Export messages as JSON file
   */
  exportJSON() {
    const json = this.collector.exportAsJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pfod-messages-${new Date().toISOString().replace(/:/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    console.log('[RAW_MESSAGE_VIEWER] Exported as JSON');
  }

  /**
   * Export messages as CSV file
   */
  exportCSV() {
    const csv = this.collector.exportAsCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pfod-messages-${new Date().toISOString().replace(/:/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    console.log('[RAW_MESSAGE_VIEWER] Exported as CSV');
  }

  /**
   * Export CSV data by field count (from CSVCollector)
   * Creates separate files for each field count format
   * Shows dialog to choose timestamp format
   */
  exportCSVByFieldCount() {
    const csvCollector = ConnectionManager.csvCollector;
    if (!csvCollector) {
      console.warn('[RAW_MESSAGE_VIEWER] CSV collector not available');
      return;
    }

    const fieldCounts = csvCollector.getFieldCounts();
    if (fieldCounts.length === 0) {
      console.warn('[RAW_MESSAGE_VIEWER] No CSV data collected');
      pfodAlert('No CSV data has been collected yet.\n\nCSV data appears after closing braces } or line breaks in the device communication.', () => {
        // onClose callback - alert will be dismissed when Close button is clicked
      });
      return;
    }

    // Always use default format (no timestamps)
    this.doExportCSVByFieldCount(csvCollector, fieldCounts, 'none');

    // Commented out: popup dialog to select export format
    // this.showExportFormatDialog((format) => {
    //   this.doExportCSVByFieldCount(csvCollector, fieldCounts, format);
    // });
  }

  /**
   * Show modal dialog to select CSV export format
   * @param {function} callback - Called with selected format: 'none', 'ms', 'z', 'local'
   */
  showExportFormatDialog(callback) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 150px;
      z-index: 10001;
    `;

    // Create modal box
    const modal = document.createElement('div');
    modal.style.cssText = `
      background-color: white;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      max-width: 500px;
      width: 90%;
      overflow: hidden;
    `;

    // Create title bar
    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
      background-color: #4CAF50;
      color: white;
      padding: 15px 20px;
      font-size: 18px;
      font-weight: bold;
      font-family: Arial, sans-serif;
    `;
    titleBar.textContent = 'Export CSV Format';

    // Create content area
    const contentArea = document.createElement('div');
    contentArea.style.cssText = `
      padding: 20px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      font-weight: bold;
      margin-bottom: 15px;
    `;
    title.textContent = 'Choose timestamp format for CSV export:';
    contentArea.appendChild(title);

    // Create radio button options
    const options = [
      { value: 'none', label: 'No Timestamps (default)', description: 'Just the CSV data' },
      { value: 'ms', label: 'With Milliseconds', description: 'ms,field1,field2... (epoch ms)' },
      { value: 'z', label: 'With UTC Z Timestamps', description: '2025-11-15T14:30:45.123Z,field1,field2...' },
      { value: 'local', label: 'With Local Time', description: '2025-11-15 14:30:45.123,field1,field2...' }
    ];

    let selectedValue = 'none';

    for (const option of options) {
      const label = document.createElement('label');
      label.style.cssText = `
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-bottom: 12px;
        cursor: pointer;
      `;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'csv-format';
      radio.value = option.value;
      radio.checked = option.value === 'none';
      radio.style.cssText = `
        margin-top: 3px;
        cursor: pointer;
      `;
      radio.addEventListener('change', (e) => {
        if (e.target.checked) selectedValue = option.value;
      });

      const textDiv = document.createElement('div');
      textDiv.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 3px;
      `;

      const labelText = document.createElement('div');
      labelText.style.cssText = `
        font-weight: 500;
      `;
      labelText.textContent = option.label;

      const descText = document.createElement('div');
      descText.style.cssText = `
        font-size: 12px;
        color: #666;
        font-family: monospace;
      `;
      descText.textContent = option.description;

      textDiv.appendChild(labelText);
      textDiv.appendChild(descText);
      label.appendChild(radio);
      label.appendChild(textDiv);
      contentArea.appendChild(label);
    }

    // Create button area
    const buttonArea = document.createElement('div');
    buttonArea.style.cssText = `
      padding: 0 20px 20px 20px;
      display: flex;
      gap: 10px;
      justify-content: center;
    `;

    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export';
    exportButton.style.cssText = `
      background-color: #4CAF50;
      color: white;
      padding: 10px 30px;
      border: none;
      border-radius: 5px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      font-family: Arial, sans-serif;
    `;
    exportButton.onclick = () => {
      document.body.removeChild(overlay);
      callback(selectedValue);
    };

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
      background-color: #888;
      color: white;
      padding: 10px 30px;
      border: none;
      border-radius: 5px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      font-family: Arial, sans-serif;
    `;
    cancelButton.onclick = () => {
      document.body.removeChild(overlay);
    };

    buttonArea.appendChild(exportButton);
    buttonArea.appendChild(cancelButton);

    // Assemble modal
    modal.appendChild(titleBar);
    modal.appendChild(contentArea);
    modal.appendChild(buttonArea);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Focus export button
    setTimeout(() => exportButton.focus(), 100);
  }

  /**
   * Perform the actual CSV export with selected format
   * @param {CSVCollector} csvCollector - The CSV collector instance
   * @param {array} fieldCounts - Array of field counts to export
   * @param {string} format - Export format: 'none', 'ms', 'z', 'local'
   */
  doExportCSVByFieldCount(csvCollector, fieldCounts, format) {
    // Select export method based on format
    let exportMethod;
    let suffix = '';
    switch (format) {
      case 'ms':
        exportMethod = 'exportAsTextWithMs';
        suffix = '-with-ms';
        break;
      case 'z':
        exportMethod = 'exportAsTextWithZTimestamps';
        suffix = '-with-z-time';
        break;
      case 'local':
        exportMethod = 'exportAsTextWithLocalTimestamps';
        suffix = '-with-local-time';
        break;
      case 'none':
      default:
        exportMethod = 'exportAsText';
        suffix = '';
    }

    // Export each field count as separate file
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    let exportedCount = 0;

    for (const fieldCount of fieldCounts) {
      const csvText = csvCollector[exportMethod](fieldCount);
      if (csvText.length > 0) {
        const blob = new Blob([csvText], { type: 'text/csv; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `pfod-csv-${fieldCount}fields${suffix}-${timestamp}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        exportedCount++;
        console.log(`[RAW_MESSAGE_VIEWER] Exported CSV file for ${fieldCount} fields with format=${format} (${csvCollector.getLineCount(fieldCount)} lines)`);
      }
    }

    console.log(`[RAW_MESSAGE_VIEWER] Exported ${exportedCount} CSV files with format=${format}`);
  }
}

/**
 * ChartConfigViewer - UI panel for chart field configuration.
 * Shares the side-panel container with RawMessageViewer.
 * Only one of the two views is visible at a time.
 *
 * Shows ALL CSV fields (from csvCollector) with editable title, plotNo, max, min,
 * and units. Apply rebuilds the chartInfo and re-displays the chart.
 */
class ChartConfigViewer {
  /**
   * @param {string} containerId - ID of the shared side-panel container
   */
  constructor(containerId = 'side-panel') {
    this.containerId = containerId;
    this.isVisible = false;
    console.log('[CHART_CONFIG_VIEWER] Created with container:', containerId);
  }

  /**
   * Initialize: create the shell structure (header + scrollable body) and append
   * to the shared container. Called after RawMessageViewer.initialize().
   */
  initialize() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('[CHART_CONFIG_VIEWER] Container not found:', this.containerId);
      return;
    }

    const main = document.createElement('div');
    main.id = 'chart-config-viewer-main';
    main.style.cssText = `
      display: none;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background-color: #ffffff;
      color: #333333;
      border: 1px solid #cccccc;
      box-sizing: border-box;
      font-family: Arial, sans-serif;
    `;

    // Title bar with close button
    const header = document.createElement('div');
    header.style.cssText = `
      flex-shrink: 0;
      background-color: #f0f0f0;
      border-bottom: 1px solid #cccccc;
      padding: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: bold;
      font-size: 14px;
      color: #333333;
    `;

    const titleSpan = document.createElement('span');
    titleSpan.textContent = 'Chart Configuration';

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #666666;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => this.hide());
    closeBtn.addEventListener('mouseover', () => { closeBtn.style.color = '#000000'; });
    closeBtn.addEventListener('mouseout', () => { closeBtn.style.color = '#666666'; });

    const datasetSelect = document.createElement('select');
    datasetSelect.id = 'ccv-dataset-select';
    datasetSelect.title = 'Select CSV dataset by field count';
    datasetSelect.style.cssText = `
      background: #ffffff;
      color: #333333;
      border: 1px solid #cccccc;
      border-radius: 3px;
      font-size: 11px;
      padding: 2px 4px;
      margin-right: 6px;
      cursor: pointer;
    `;
    datasetSelect.addEventListener('change', () => this._switchDataset(parseInt(datasetSelect.value)));

    header.appendChild(titleSpan);
    header.appendChild(datasetSelect);
    header.appendChild(closeBtn);
    main.appendChild(header);

    // Fixed action bar: Save / Load / Apply
    const actionBar = document.createElement('div');
    actionBar.style.cssText = `
      flex-shrink: 0;
      background-color: #f0f0f0;
      border-bottom: 1px solid #cccccc;
      padding: 6px 8px;
      display: flex;
      gap: 6px;
    `;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'ccv-action-btn';
    saveBtn.id = 'ccv-save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.title = 'Save config to browser storage';
    saveBtn.addEventListener('click', () => this._saveConfig());
    const loadBtn = document.createElement('button');
    loadBtn.className = 'ccv-action-btn';
    loadBtn.id = 'ccv-load-btn';
    loadBtn.textContent = 'Load';
    loadBtn.title = 'Load config from browser storage';
    loadBtn.addEventListener('click', () => this._loadConfig());
    actionBar.appendChild(saveBtn);
    actionBar.appendChild(loadBtn);
    main.appendChild(actionBar);

    // Scrollable body - populated by populate() each time show() is called
    const body = document.createElement('div');
    body.id = 'chart-config-body';
    body.style.cssText = `
      flex: 1;
      overflow-y: auto;
      background-color: #ffffff;
      padding: 8px;
      box-sizing: border-box;
    `;
    main.appendChild(body);

    // Inject shared CSS for form controls (once per page)
    if (!document.getElementById('ccv-styles')) {
      const style = document.createElement('style');
      style.id = 'ccv-styles';
      style.textContent = `
        .ccv-input {
          background-color: #ffffff;
          color: #333333;
          border: 1px solid #cccccc;
          border-radius: 3px;
          padding: 2px 4px;
          font-size: 12px;
          width: 100%;
          box-sizing: border-box;
        }
        .ccv-input:focus { outline: 1px solid #0e7acb; border-color: #0e7acb; }
        .ccv-label { font-size: 11px; color: #666666; margin-bottom: 2px; display: block; }
        .ccv-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px; }
        .ccv-row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 4px; }
        .ccv-field-block {
          background: #f8f8f8;
          border: 1px solid #dddddd;
          border-radius: 4px;
          padding: 6px;
          margin-bottom: 6px;
        }
        .ccv-field-hdr { font-size: 11px; margin-bottom: 5px; font-weight: bold; }
        .ccv-action-btn {
          flex: 1;
          background: #e8e8e8;
          color: #333333;
          border: 1px solid #bbbbbb;
          border-radius: 3px;
          padding: 5px 0;
          font-size: 12px;
          font-weight: bold;
          cursor: pointer;
        }
        .ccv-action-btn:hover { background: #d0d0d0; }
        .ccv-action-btn-primary { background: #0e7acb; color: #fff; border-color: #0e7acb; }
        .ccv-action-btn-primary:hover { background: #1a8de0; }
        .ccv-section-sep {
          border: none;
          border-top: 1px solid #cccccc;
          margin: 8px 0;
        }
      `;
      document.head.appendChild(style);
    }

    container.appendChild(main);
    console.log('[CHART_CONFIG_VIEWER] Initialized');
  }

  /**
   * Show the Chart Configuration view.
   * Hides raw-message-viewer-main, makes the panel visible, then populates the form.
   */
  show() {
    // Hide raw message viewer inner content - only one view at a time
    const rawMain = document.getElementById('raw-message-viewer-main');
    if (rawMain) {
      rawMain.style.display = 'none';
    }
    if (window.rawMessageViewer) {
      if (window.rawMessageViewer.animationFrameId) {
        cancelAnimationFrame(window.rawMessageViewer.animationFrameId);
        window.rawMessageViewer.animationFrameId = null;
      }
      window.rawMessageViewer.pendingMessages = [];
      window.rawMessageViewer.updateScheduled = false;
      window.rawMessageViewer.isVisible = false;
    }

    // Show chart config inner content
    const configMain = document.getElementById('chart-config-viewer-main');
    if (configMain) {
      configMain.style.display = 'flex';
    }

    // Show the shared container
    const container = document.getElementById(this.containerId);
    if (container) {
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.flex = 0.30;
    }

    // Show the divider
    const divider = document.getElementById('resize-divider');
    if (divider) {
      divider.style.display = 'block';
    }

    // Set canvas pane to 70%
    const canvasPane = document.getElementById('canvas-pane');
    if (canvasPane) {
      canvasPane.style.flex = 0.70;
    }

    // Populate form with current data
    this.populate();
    this.isVisible = true;
    console.log('[CHART_CONFIG_VIEWER] Shown');
    setTimeout(() => window.drawingViewer.handleResize(), 0);
  }

  /**
   * Hide the Chart Configuration view and collapse the side panel.
   */
  hide() {
    const configMain = document.getElementById('chart-config-viewer-main');
    if (configMain) {
      configMain.style.display = 'none';
    }

    const container = document.getElementById(this.containerId);
    if (container) {
      container.style.display = 'none';
      container.style.flex = 0;
    }

    const divider = document.getElementById('resize-divider');
    if (divider) {
      divider.style.display = 'none';
    }

    const canvasPane = document.getElementById('canvas-pane');
    if (canvasPane) {
      canvasPane.style.flex = 1;
    }

    this.isVisible = false;
    console.log('[CHART_CONFIG_VIEWER] Hidden');
    setTimeout(() => window.drawingViewer.handleResize(), 0);
  }

  /**
   * Toggle visibility of the Chart Configuration view.
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Helper: create a labelled input wrapper and return the wrapper element.
   * The input element has the given id so _applyConfig() can find it by id.
   *
   * @param {string} id        - id attribute for the <input>
   * @param {string} labelText - visible label above the input
   * @param {string} type      - input type ('text' or 'number')
   * @param {string} value     - initial value (already a string)
   * @param {string} placeholder
   * @returns {HTMLElement} wrapper div
   */
  _makeInput(id, labelText, type, value, placeholder) {
    const wrap = document.createElement('div');
    const lbl = document.createElement('label');
    lbl.className = 'ccv-label';
    lbl.textContent = labelText;
    const inp = document.createElement('input');
    inp.className = 'ccv-input';
    inp.id = id;
    inp.type = type;
    inp.value = value;
    inp.placeholder = placeholder;
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return wrap;
  }

  /**
   * Build a flat array (indexed by CSV column 0..csvFieldCount-1) of field specs,
   * merging what the last chartInfo knew about each field.
   * Fields not mentioned in chartInfo get default label/plotNo/max/min/unit.
   *
   * @param {object|null} chartInfo    - window.drawingViewer.currentChartInfo (may be null)
   * @param {number}      csvFieldCount - actual number of columns in CSV data
   * @returns {Array} - [{label, plotNo, max, min, unit, index}, ...]
   */
  _buildAllFieldSpecs(chartInfo, csvFieldCount) {
    // Start with defaults for every CSV column
    const result = [];
    for (let i = 0; i < csvFieldCount; i++) {
      result.push({ label: `field${i + 1}`, plotNo: null, max: null, min: null, unit: null, index: i, included: false });
    }

    // No chart loaded yet — return the default per-column specs so the config
    // viewer can still render (user opens Chart Config from a non-chart state
    // or before displayChartWithPlotNo has set drawingViewer.currentChartInfo).
    if (!chartInfo) return result;

    // Overlay X-axis field from chartInfo (plotNo = 0).
    // xAxisFieldIndex >= 0 means a CSV column is the X-axis (regardless of useCountFlag).
    const xIdx = chartInfo.xAxisFieldIndex;
    if (xIdx >= 0 && xIdx < csvFieldCount) {
      result[xIdx].label = chartInfo.xAxisFieldLabel || result[xIdx].label;
      result[xIdx].plotNo = 0;
      result[xIdx].included = true;
    }

    // Overlay Y-axis fields from subplots; never overwrite the X-axis slot.
    // Track auto-assignment counter for unassigned fields (subplot.plotNo === -1):
    // these fields had no explicit plotNo in the chart command, so assign them
    // sequential Y-field numbers (1, 2, 3...) matching the DEFAULT MODE auto-assignment.
    let autoYPlotNo = 0;
    for (const subplot of (chartInfo.subplots || [])) {
      for (const spec of (subplot.fieldSpecs || [])) {
        if (spec.index >= 0 && spec.index < csvFieldCount && spec.index !== xIdx) {
          autoYPlotNo++;
          result[spec.index] = {
            label: spec.label || `field${spec.index + 1}`,
            plotNo: spec.plotNo !== null && spec.plotNo !== undefined ? spec.plotNo : (subplot.plotNo === -1 ? autoYPlotNo : subplot.plotNo),
            max: spec.max !== null && spec.max !== undefined ? spec.max : null,
            min: spec.min !== null && spec.min !== undefined ? spec.min : null,
            unit: spec.unit || null,
            index: spec.index,
            included: true
          };
        }
      }
    }

    return result;
  }

  /**
   * Apply a raw plot command string directly (e.g. from a URL ?chart= param).
   * Parses the command and re-displays the chart without reading the form.
   * @param {string} cmdStr - e.g. "{=Chart`500|field1`1}"
   */
  applyChartCommand(cmdStr) {
    const cmdArray = this._parsePlotCommand(cmdStr);
    const newChartInfo = window.chartDisplay
      ? window.chartDisplay.parseChartLabelsWithPlotNo(cmdArray)
      : null;
    if (newChartInfo && window.drawingViewer) {
      window.currentChartInfo = newChartInfo;
      window.drawingViewer.displayChartWithPlotNo();
    }
  }

  /**
   * Build a plot command from the form, parse it, and re-display the chart.
   * Going through the plot command path ensures the same field count and
   * column mapping as if the command had been received from the device.
   * Called by the Apply button.
   */
  /**
   * Schedule _applyConfig() after a delay (ms). Resets the timer on every call
   * so rapid input only triggers one apply. Cancelled automatically when
   * _applyConfig() is called directly (blur, Enter, dropdown change).
   */
  _scheduleApply(delay = 5000) {
    clearTimeout(this._applyTimer);
    this._applyTimer = setTimeout(() => {
      this._applyTimer = null;
      this._applyConfig();
    }, delay);
  }

  _applyConfig() {
    clearTimeout(this._applyTimer);
    this._applyTimer = null;
    const { cmd } = this._buildPlotCommand();
    const cmdArray = this._parsePlotCommand(cmd);
    const newChartInfo = window.chartDisplay
      ? window.chartDisplay.parseChartLabelsWithPlotNo(cmdArray)
      : null;
    if (newChartInfo && window.drawingViewer) {
      // Stamp per-field autoScale from the form checkboxes onto the parsed
      // fieldSpecs. autoScale=false means the field opts in to hard constraints
      // when Apply is pressed; autoScale=true (default / unchecked) keeps the
      // axis soft regardless. This state is not saved in the plot command.
      for (const subplot of (newChartInfo.subplots || [])) {
        for (const fieldSpec of (subplot.fieldSpecs || [])) {
          const el = document.getElementById(`ccv-f-autoscale-${fieldSpec.index}`);
          fieldSpec.autoScale = el ? el.checked : true;
        }
      }

      // If frozen and maxPoints changed, keep the current center row constant:
      // center = frozenStartRow + oldMaxPoints/2  =>  newStartRow = center - newMaxPoints/2
      // Must read window.currentChartInfo (the OLD value) before overwriting it below.
      if (window.chartDisplay && window.chartDisplay.frozenStartRow !== null) {
        const oldMaxPoints = window.currentChartInfo.maxPoints;
        const newMaxPoints = newChartInfo.maxPoints;
        if (oldMaxPoints !== newMaxPoints) {
          const before = window.chartDisplay.frozenStartRow;
          const center = window.chartDisplay.frozenStartRow + Math.floor(oldMaxPoints / 2);
          window.chartDisplay.frozenStartRow = Math.max(0, Math.round(center - newMaxPoints / 2));
          console.error('[FREEZE_DBG] _applyConfig recenter: oldMaxPoints=', oldMaxPoints,
            'newMaxPoints=', newMaxPoints, 'frozenStartRow', before, '->', window.chartDisplay.frozenStartRow);
        }
      }
      window.currentChartInfo = newChartInfo;
      window.drawingViewer.displayChartWithPlotNo();
      // Update the URL ?chart= param so the user can bookmark this config
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('chart', cmd);
      history.replaceState(null, '', '?' + urlParams.toString());
    }
  }

  /**
   * Read all form inputs and build a pfod plot command string.
   * Excluded fields use empty labels to preserve CSV column positions.
   * Format: {=title`maxPoints~timeFormat|field1spec|field2spec...}
   *
   * @returns {{cmd: string, filename: string}} - plot command string and suggested filename
   */
  _buildPlotCommand() {
    const chartInfo = window.currentChartInfo;
    // Use the field count of the currently displayed chart — matches the form rows shown.
    const formFieldCount = chartInfo ? chartInfo.fieldCount : 0;

    const titleEl   = document.getElementById('ccv-title');
    const maxPtsEl  = document.getElementById('ccv-maxpoints');
    const timeFmtEl = document.getElementById('ccv-timeformat');

    const title      = titleEl   ? titleEl.value.trim()   : 'Chart';
    const maxPtsRaw  = maxPtsEl  ? maxPtsEl.value.trim() : '';
    const maxPtsVal  = parseInt(maxPtsRaw);
    const totalCsvLines = (window.csvCollector && chartInfo && window.csvCollector.getFieldCounts().includes(chartInfo.fieldCount))
      ? window.csvCollector.getLineCount(chartInfo.fieldCount) : 500;
    const maxPoints  = (maxPtsRaw === '' || isNaN(maxPtsVal)) ? totalCsvLines : maxPtsVal;
    const timeFormat = timeFmtEl ? timeFmtEl.value.trim() : '';

    // Build first element: =title`maxPoints[~timeFormat][~C][~S]
    // Preserve ~C (clear) / ~S (sort) plot-option flags from the current chartInfo
    // since the form has no checkbox for them yet — without this, every Apply
    // strips the flags and the chart loses its sort/clear behaviour.
    let firstElem = `=${title}\`${maxPoints}`;
    if (timeFormat.length > 0) firstElem += `~${timeFormat}`;
    if (chartInfo && chartInfo.clearData) firstElem += '~C';
    if (chartInfo && chartInfo.sortData)  firstElem += '~S';

    // Build one pipe element per form field row
    const fieldParts = [];
    for (let i = 0; i < formFieldCount; i++) {
      const inclEl    = document.getElementById(`ccv-f-incl-${i}`);
      const titleFEl  = document.getElementById(`ccv-f-title-${i}`);
      const plotNoEl  = document.getElementById(`ccv-f-plotno-${i}`);
      const maxEl     = document.getElementById(`ccv-f-max-${i}`);
      const minEl     = document.getElementById(`ccv-f-min-${i}`);
      const unitEl    = document.getElementById(`ccv-f-unit-${i}`);

      const included  = inclEl ? inclEl.checked : true;
      if (!included) {
        fieldParts.push('');
        continue;
      }

      const label     = titleFEl  ? titleFEl.value.trim()   : `field${i + 1}`;
      const plotNoStr = plotNoEl  ? plotNoEl.value.trim()   : '';
      const plotNo    = plotNoStr === '' ? null : parseInt(plotNoStr);
      let maxStr    = maxEl     ? maxEl.value.trim()      : '';
      let minStr    = minEl     ? minEl.value.trim()      : '';
      const unit      = unitEl    ? unitEl.value.trim()     : '';

      // If both max and min are numbers and max < min, swap them and update the form
      const maxNum = parseFloat(maxStr);
      const minNum = parseFloat(minStr);
      if (maxStr !== '' && minStr !== '' && !isNaN(maxNum) && !isNaN(minNum) && maxNum < minNum) {
        if (maxEl) maxEl.value = minStr;
        if (minEl) minEl.value = maxStr;
        const tmp = maxStr; maxStr = minStr; minStr = tmp;
      }

      let spec = label;
      if (plotNo !== null && !isNaN(plotNo)) spec += '`' + plotNo;

      const hasMax  = maxStr !== '';
      const hasMin  = minStr !== '';
      const hasUnit = unit   !== '';
      if (hasMax || hasMin || hasUnit) {
        spec += '~' + maxStr;
        if (hasMin || hasUnit) {
          spec += '~' + minStr;
          if (hasUnit) spec += '~' + unit;
        }
      }
      fieldParts.push(spec);
    }

    const cmd      = '{' + firstElem + '|' + fieldParts.join('|') + '}';
    const filename = title.replace(/[^a-zA-Z0-9]/g, '_') + '.' + formFieldCount + 'fields';
    return { cmd, filename };
  }

  /**
   * Save the current chart configuration as a pfod plot command file.
   * The filename is the chart title with non-alphanumeric characters replaced by _.
   */
  _saveConfig() {
    // Apply first so any max/min swap is done and the chart matches what is saved
    this._applyConfig();
    const { cmd, filename } = this._buildPlotCommand();
    const blob = new Blob([cmd], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Parse a pfod plot command string into the cmdArray format expected by
   * window.chartDisplay.parseChartLabelsWithPlotNo().
   * Strips outer { } then splits on |, re-prefixing | on each field element.
   *
   * @param {string} cmdStr - e.g. "{=TestChart`50~ss.SSS|time`0|temp`1~100~0~C}"
   * @returns {Array} cmdArray - e.g. ["=TestChart`50~ss.SSS", "|time`0", "|temp`1~100~0~C"]
   */
  _parsePlotCommand(cmdStr) {
    let content = cmdStr.trim();
    if (content.startsWith('{')) content = content.substring(1);
    if (content.endsWith('}'))  content = content.slice(0, -1);

    const parts    = content.split('|');
    const cmdArray = [parts[0]];
    for (let i = 1; i < parts.length; i++) {
      cmdArray.push('|' + parts[i]);
    }
    return cmdArray;
  }

  /**
   * Open a file picker for .pfod files, read the selected file,
   * parse the pfod plot command, and re-populate the form.
   */

  /**
   * Switch to a different CSV dataset by field count.
   * If the current chartInfo already matches, just re-populate the form.
   * Otherwise generate a default plot command for that field count, display it, and populate.
   *
   * @param {number} fieldCount - The field count of the target dataset
   */
  _switchDataset(fieldCount) {
    const currentInfo = window.currentChartInfo;
    if (currentInfo && currentInfo.fieldCount === fieldCount) {
      this.populate();
      return;
    }
    // Build a default plot command: field1 = X-axis (plotNo 0), remaining = subplot 1
    let cmd = '{=Chart`500|field1`0';
    for (let i = 2; i <= fieldCount; i++) {
      cmd += '|field' + i + '`1';
    }
    cmd += '}';
    const cmdArray = this._parsePlotCommand(cmd);
    const newChartInfo = window.chartDisplay
      ? window.chartDisplay.parseChartLabelsWithPlotNo(cmdArray)
      : null;
    if (newChartInfo) {
      window.currentChartInfo = newChartInfo;
      window.drawingViewer.displayChartWithPlotNo();
    }
    this.populate();
  }

  _loadConfig() {
    const chartInfo     = window.currentChartInfo;
    const fieldCount    = chartInfo ? chartInfo.fieldCount : 0;
    const acceptExt     = fieldCount > 0 ? ('.' + fieldCount + 'fields') : '.fields';

    const input  = document.createElement('input');
    input.type   = 'file';
    input.accept = acceptExt;
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) throw new Error('[messageViewer] file input change: no file selected');
      const reader = new FileReader();
      reader.onload = (e) => {
        const cmdStr   = e.target.result.trim();
        const cmdArray = this._parsePlotCommand(cmdStr);
        const loadedChartInfo = window.chartDisplay
          ? window.chartDisplay.parseChartLabelsWithPlotNo(cmdArray)
          : null;
        if (loadedChartInfo) {
          window.currentChartInfo = loadedChartInfo;
          this.populate();
          // Apply via _applyConfig so max/min swap is performed and URL is updated
          this._applyConfig();
        } else {
          console.warn('[CHART_CONFIG_VIEWER] Failed to parse loaded plot command');
          alert('Failed to load chart configuration: the file is not a valid pfod chart config.');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /**
   * Populate the body with editable form fields.
   * Field count is taken from csvCollector (actual data), not from the last plot command.
   * Chart-level settings (title, maxPoints, timeFormat) are taken from
   * window.currentChartInfo — the single holder for the currently displayed chart.
   */
  populate() {
    const body = document.getElementById('chart-config-body');
    if (!body) {
      console.error('[CHART_CONFIG_VIEWER] Body element not found');
      return;
    }

    // Snapshot autoScale checkbox states before rebuilding DOM so Apply / live
    // chart refresh don't reset them. Map: field index → boolean.
    const savedAutoScale = {};
    body.querySelectorAll('input[id^="ccv-f-autoscale-"]').forEach(el => {
      const idx = el.id.replace('ccv-f-autoscale-', '');
      savedAutoScale[idx] = el.checked;
    });

    // Save focused element so blur-triggered rebuilds don't lose cursor position.
    const activeId = document.activeElement ? document.activeElement.id : null;
    const selStart = document.activeElement ? document.activeElement.selectionStart : null;
    const selEnd   = document.activeElement ? document.activeElement.selectionEnd   : null;

    // Determine field count from actual CSV data
    const fieldCounts = window.csvCollector ? window.csvCollector.getFieldCounts() : [];
    const csvFieldCount = fieldCounts.length > 0
      ? Math.max(...fieldCounts.map(f => parseInt(f)))
      : 0;

    const setActionBtns = (enabled) => {
      ['ccv-save-btn', 'ccv-load-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) { btn.disabled = !enabled; btn.style.opacity = enabled ? '' : '0.4'; }
      });
    };
    if (csvFieldCount === 0) {
      setActionBtns(false);
      body.innerHTML = '<div style="padding:12px;color:#666666;font-size:13px;">No CSV data available.<br>Connect to a device and receive data first.<br>Close and reopen Chart Configuration when data is available.</div>';
      return;
    }
    setActionBtns(true);

    // Update dataset dropdown with all available field counts
    const datasetSelect = document.getElementById('ccv-dataset-select');
    if (datasetSelect) {
      const allFieldCounts = window.csvCollector ? window.csvCollector.getFieldCounts() : [];
      datasetSelect.innerHTML = '';
      for (const fc of allFieldCounts) {
        const opt = document.createElement('option');
        opt.value = String(fc);
        opt.textContent = fc + ' fields';
        datasetSelect.appendChild(opt);
      }
    }

    const chartInfo = window.currentChartInfo;
    console.log('[CHART_CONFIG_VIEWER] populate: title=', chartInfo ? chartInfo.title : 'null');
    const displayFieldCount = chartInfo ? chartInfo.fieldCount : 0;
    const totalLines = (window.csvCollector && displayFieldCount > 0 && window.csvCollector.getFieldCounts().includes(displayFieldCount))
      ? window.csvCollector.getLineCount(displayFieldCount) : 0;

    // Set dropdown to the current dataset's field count
    if (datasetSelect && displayFieldCount > 0) datasetSelect.value = String(displayFieldCount);

    // Build per-field color map matching the chart plot line colors.
    // Colors are assigned per-subplot: subplot series 0 = index 0, series 1 = index 1, etc.
    // Must stay in sync with the colors array in chartDisplay.js (black removed).
    const PLOT_LINE_COLORS = [
      '#0000FF',  // Blue
      '#FF0000',  // Red
      '#008000',  // Green
      '#FF8000',  // Orange
      '#800080',  // Purple
      '#008080',  // Teal
      '#FF69B4',  // Hot Pink (chart uses #FFC0CB, darkened for white bg)
      '#A52A2A',  // Brown
      '#FF7F50',  // Coral
      '#B8860B',  // Dark Goldenrod (chart uses #FFFF00, darkened for white bg)
    ];
    const fieldColors = {};
    if (chartInfo) {
      if (chartInfo.xAxisFieldIndex >= 0) {
        fieldColors[chartInfo.xAxisFieldIndex] = '#000000';
      }
      for (const subplot of (chartInfo.subplots || [])) {
        for (const spec of (subplot.fieldSpecs || [])) {
          fieldColors[spec.index] = PLOT_LINE_COLORS[spec.index % PLOT_LINE_COLORS.length];
        }
      }
    }
    const allFieldSpecs = this._buildAllFieldSpecs(chartInfo, displayFieldCount);

    // Clear previous content
    body.innerHTML = '';

    // --- Chart-level settings ---
    const section = document.createElement('div');

    const row1 = document.createElement('div');
    row1.className = 'ccv-row2';
    row1.appendChild(this._makeInput('ccv-title', 'Screen Title', 'text',
      chartInfo ? (chartInfo.title || '') : '', 'Chart title'));
    // Display Points field with side-by-side ▲/▼ buttons, each the full height of the input
    const maxPtsWrap = document.createElement('div');
    maxPtsWrap.className = 'ccv-field-wrap';
    const maxPtsLbl = document.createElement('label');
    maxPtsLbl.className = 'ccv-label';
    maxPtsLbl.textContent = 'Display Points of ' + totalLines;
    maxPtsLbl.id = 'ccv-maxpoints-label';
    const maxPtsInner = document.createElement('div');
    maxPtsInner.style.cssText = 'display:flex;align-items:stretch;';
    const maxPtsInp = document.createElement('input');
    maxPtsInp.className = 'ccv-input';
    maxPtsInp.id = 'ccv-maxpoints';
    maxPtsInp.type = 'number';
    maxPtsInp.value = String(chartInfo ? (chartInfo.maxPoints || 500) : 500);
    maxPtsInp.placeholder = String(totalLines);
    maxPtsInp.style.flex = '1';
    const makeArrow = (symbol, factor) => {
      const btn = document.createElement('button');
      btn.textContent = symbol;
      btn.style.cssText = 'padding:0 7px;cursor:pointer;border:1px solid #aaa;border-left:none;background:#f0f0f0;font-size:12px;line-height:1;';
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const inp = document.getElementById('ccv-maxpoints');
        if (!inp) throw new Error('[messageViewer] makeArrow: #ccv-maxpoints not found');
        const cur = parseInt(inp.value);
        const next = Math.max(1, isNaN(cur) ? 500 : Math.round(cur * factor));
        inp.value = String(next);
        this._applyConfig();
      });
      return btn;
    };
    maxPtsInner.appendChild(maxPtsInp);
    maxPtsInner.appendChild(makeArrow('▲', 2));
    maxPtsInner.appendChild(makeArrow('▼', 0.5));
    maxPtsWrap.appendChild(maxPtsLbl);
    maxPtsWrap.appendChild(maxPtsInner);
    row1.appendChild(maxPtsWrap);

    section.appendChild(row1);

    // X-axis format dropdown
    const timeFmtWrap = document.createElement('div');
    timeFmtWrap.className = 'ccv-field-wrap';
    timeFmtWrap.style.marginBottom = '6px';
    const timeFmtLbl = document.createElement('label');
    timeFmtLbl.className = 'ccv-label';
    timeFmtLbl.textContent = 'X-axis Format';
    const timeFmtSel = document.createElement('select');
    timeFmtSel.className = 'ccv-input';
    timeFmtSel.id = 'ccv-timeformat';
    timeFmtSel.style.cursor = 'pointer';
    const timeFmtOptions = [
      { value: '',             label: '' },
      { value: 'ss.S',         label: 'secs (ss.S)' },
      { value: 'mm:ss',        label: 'mins:sec (mm:ss)' },
      { value: 'HH:mm:ss',     label: 'hr:mins:sec (HH:mm:ss)' },
      { value: 'unix-dt',      label: 'Year Month Day Hr:Mins:sec' },
      { value: 'unix-ddd-hm',  label: 'weekday hr:mins' },
      { value: 'unix-ddd-hms', label: 'weekday hr:mins:sec' }
    ];
    const currentTimeFmt = chartInfo ? (chartInfo.timeFormat || '') : '';

    // If the current format isn't one of the presets (e.g. a SimpleDateFormat
    // pattern like "E MMM/dd HH:mm UTC" sent by the device), preserve it as a
    // custom option so it round-trips through Apply unchanged.
    const isPreset = timeFmtOptions.some(o => o.value === currentTimeFmt);
    if (!isPreset && currentTimeFmt !== '') {
      const customOpt = document.createElement('option');
      customOpt.value = currentTimeFmt;
      customOpt.textContent = currentTimeFmt + '  (current)';
      timeFmtSel.appendChild(customOpt);
    }
    for (const opt of timeFmtOptions) {
      const el = document.createElement('option');
      el.value = opt.value;
      el.textContent = opt.label;
      timeFmtSel.appendChild(el);
    }
    timeFmtSel.value = currentTimeFmt;
    timeFmtWrap.appendChild(timeFmtLbl);
    timeFmtWrap.appendChild(timeFmtSel);
    section.appendChild(timeFmtWrap);

    const sep = document.createElement('hr');
    sep.className = 'ccv-section-sep';
    section.appendChild(sep);

    // Hint line

    body.appendChild(section);

    // --- One block per CSV field ---
    for (let i = 0; i < allFieldSpecs.length; i++) {
      const spec = allFieldSpecs[i];
      const block = document.createElement('div');
      block.className = 'ccv-field-block';

      const hdr = document.createElement('div');
      hdr.className = 'ccv-field-hdr';
      const fieldColor = fieldColors[i] || '#333333';
      const isXAxis = chartInfo && chartInfo.xAxisFieldIndex === i;
      // White pill background for checkbox + label
      const chkWrap = document.createElement('span');
      chkWrap.style.cssText = 'display:inline-flex;align-items:center;background:#ffffff;border-radius:4px;padding:2px 6px;border:1px solid #ccc;';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = `ccv-f-incl-${i}`;
      chk.checked = spec.included;
      chk.style.cssText = `margin-right:6px;cursor:pointer;vertical-align:middle;accent-color:${fieldColor};`;
      const chkLbl = document.createElement('label');
      chkLbl.htmlFor = `ccv-f-incl-${i}`;
      chkLbl.textContent = `CSV column ${i + 1}` + (isXAxis ? ' (X-Axis)' : '');
      chkLbl.style.cursor = 'pointer';
      chkLbl.style.color = fieldColor;
      chkLbl.style.fontWeight = 'bold';
      chkWrap.appendChild(chk);
      chkWrap.appendChild(chkLbl);
      hdr.appendChild(chkWrap);

      // autoScale checkbox: ticked (default) = axis expands beyond max/min;
      // unticked = axis fixed at max/min values. Not saved/loaded.
      const autoScaleWrap = document.createElement('span');
      autoScaleWrap.style.cssText = 'display:inline-flex;align-items:center;background:#ffffff;border-radius:4px;padding:2px 6px;border:1px solid #ccc;margin-left:8px;';
      const autoScaleChk = document.createElement('input');
      autoScaleChk.type = 'checkbox';
      autoScaleChk.id = `ccv-f-autoscale-${i}`;
      autoScaleChk.checked = true;
      autoScaleChk.disabled = isXAxis;
      autoScaleChk.style.cssText = `margin-right:6px;cursor:${isXAxis ? 'default' : 'pointer'};vertical-align:middle;${isXAxis ? 'opacity:0.4;' : ''}`;
      const autoScaleLbl = document.createElement('label');
      autoScaleLbl.htmlFor = `ccv-f-autoscale-${i}`;
      autoScaleLbl.textContent = 'autoScale';
      autoScaleLbl.style.cursor = isXAxis ? 'default' : 'pointer';
      autoScaleLbl.style.opacity = isXAxis ? '0.4' : '';
      autoScaleWrap.appendChild(autoScaleChk);
      autoScaleWrap.appendChild(autoScaleLbl);
      autoScaleChk.addEventListener('change', () => {
        syncPlotSiblings(i, 'autoscale');
        this._applyConfig();
      });
      hdr.appendChild(autoScaleWrap);

      block.appendChild(hdr);

      // Row: Title + Plot No
      const row1f = document.createElement('div');
      row1f.className = 'ccv-row2';
      row1f.appendChild(this._makeInput(`ccv-f-title-${i}`, 'Title', 'text',
        spec.label, `field${i + 1}`));
      // Plot No dropdown: X-Axis (0) then 1..displayFieldCount
      // For single-field charts, count is always the X-axis — only offer plotNo 1, no X-Axis option.
      const plotNoWrap = document.createElement('div');
      plotNoWrap.className = 'ccv-field-wrap';
      const plotNoLbl = document.createElement('label');
      plotNoLbl.className = 'ccv-label';
      plotNoLbl.textContent = 'Plot No';
      const plotNoSel = document.createElement('select');
      plotNoSel.className = 'ccv-input';
      plotNoSel.id = `ccv-f-plotno-${i}`;
      plotNoSel.style.cursor = 'pointer';
      if (displayFieldCount > 1) {
        // X-Axis option
        const optX = document.createElement('option');
        optX.value = '0';
        optX.textContent = '0 X-Axis';
        plotNoSel.appendChild(optX);
      }
      for (let pn = 1; pn <= displayFieldCount; pn++) {
        const opt = document.createElement('option');
        opt.value = String(pn);
        opt.textContent = String(pn);
        plotNoSel.appendChild(opt);
      }
      // Single-field: always plotNo=1; multi-field: use auto-assigned spec value.
      // _buildAllFieldSpecs guarantees non-null plotNo for included fields (auto-assigned
      // from subplot position when no explicit plotNo was in the chart command).
      const currentPlotNo = displayFieldCount === 1 ? 1 : Math.max(0, spec.plotNo ?? 1);
      plotNoSel.value = String(currentPlotNo);
      // Disable Plot No when only one field — Count is used as X-axis automatically
      if (displayFieldCount === 1) {
        plotNoSel.disabled = true;
        plotNoSel.style.opacity = '0.4';
        plotNoSel.style.cursor = 'default';
      }
      plotNoWrap.appendChild(plotNoLbl);
      plotNoWrap.appendChild(plotNoSel);
      row1f.appendChild(plotNoWrap);
      block.appendChild(row1f);

      // Row: Max + Min + Units
      const row2f = document.createElement('div');
      row2f.className = 'ccv-row3';
      const maxWrap  = this._makeInput(`ccv-f-max-${i}`, 'Max', 'number',
        spec.max !== null ? String(spec.max) : '', 'auto');
      const minWrap  = this._makeInput(`ccv-f-min-${i}`, 'Min', 'number',
        spec.min !== null ? String(spec.min) : '', 'auto');
      const unitWrap = this._makeInput(`ccv-f-unit-${i}`, 'Units', 'text',
        spec.unit || '', 'units');
      if (isXAxis) {
        [maxWrap, minWrap, unitWrap].forEach(w => {
          const inp = w.querySelector('input');
          if (inp) { inp.disabled = true; inp.style.opacity = '0.4'; inp.style.cursor = 'default'; }
        });
      }
      row2f.appendChild(maxWrap);
      row2f.appendChild(minWrap);
      row2f.appendChild(unitWrap);
      block.appendChild(row2f);

      // Toggle input fields disabled state when checkbox changes
      const setRowsEnabled = (enabled) => {
        [row1f, row2f].forEach(row => {
          row.querySelectorAll('input, select').forEach(inp => {
            inp.disabled = !enabled;
            inp.style.opacity = enabled ? '' : '0.4';
          });
        });
      };
      chk.addEventListener('change', () => setRowsEnabled(chk.checked));
      if (!spec.included) setRowsEnabled(false);

      body.appendChild(block);
    }

    // Restore autoScale checkbox states saved before DOM rebuild
    Object.keys(savedAutoScale).forEach(idx => {
      const el = document.getElementById(`ccv-f-autoscale-${idx}`);
      if (el) el.checked = savedAutoScale[idx];
    });

    // Wire live-apply listeners to all rebuilt inputs.
    // Validation helper: red border on max/min fields when value is non-numeric.
    const markValidity = (inp) => {
      const empty = inp.value.trim() === '';
      const valid = empty || !isNaN(parseFloat(inp.value));
      inp.style.borderColor = valid ? '' : 'red';
    };

    // Fields sharing a Plot No share one Y-axis (chartDisplay.js combines
    // their max/min into max(max's)/min(min's) when drawing it), so per-field
    // divergence in the form is confusing. Propagate autoScale/max/min/unit
    // from the edited field to every other field currently on the same plot.
    // Called before _applyConfig() so the same apply pass picks up the
    // synced sibling values.
    const syncPlotSiblings = (sourceIndex, kind) => {
      const plotNoSel = document.getElementById(`ccv-f-plotno-${sourceIndex}`);
      const src = document.getElementById(`ccv-f-${kind}-${sourceIndex}`);
      if (!plotNoSel || !src) return;
      for (let j = 0; j < displayFieldCount; j++) {
        if (j === sourceIndex) continue;
        const siblingPlotNoSel = document.getElementById(`ccv-f-plotno-${j}`);
        if (!siblingPlotNoSel || siblingPlotNoSel.value !== plotNoSel.value) continue;
        const dst = document.getElementById(`ccv-f-${kind}-${j}`);
        if (!dst) continue;
        if (kind === 'autoscale') dst.checked = src.checked;
        else dst.value = src.value;
      }
    };

    // One-time cleanup pass: the fields were just populated as-is from the
    // chart command / loaded config, which can disagree within a Plot No
    // group (e.g. a {=...} message or saved file specifying different
    // max/min/unit per field on the same plot). Reconcile each group once
    // here, then syncPlotSiblings (above) keeps them in lockstep from here
    // on as the user edits.
    const plotGroups = {};
    for (let i = 0; i < displayFieldCount; i++) {
      const plotNoSel = document.getElementById(`ccv-f-plotno-${i}`);
      if (!plotNoSel || plotNoSel.value === '0') continue; // X-axis is never shared
      (plotGroups[plotNoSel.value] = plotGroups[plotNoSel.value] || []).push(i);
    }
    for (const indices of Object.values(plotGroups)) {
      if (indices.length < 2) continue;
      const first = indices[0];

      // autoScale: matches chartDisplay.js's subplotAllAutoScale — ANY field
      // set to hard (unticked) already makes the whole shared axis hard.
      const anyHard = indices.some(idx => {
        const el = document.getElementById(`ccv-f-autoscale-${idx}`);
        return el && !el.checked;
      });
      const firstAuto = document.getElementById(`ccv-f-autoscale-${first}`);
      if (firstAuto) firstAuto.checked = !anyHard;
      syncPlotSiblings(first, 'autoscale');

      // max/min: combine the same way chartDisplay.js does when drawing the axis.
      let combinedMax = null, combinedMin = null;
      for (const idx of indices) {
        const maxEl = document.getElementById(`ccv-f-max-${idx}`);
        const minEl = document.getElementById(`ccv-f-min-${idx}`);
        if (maxEl && maxEl.value.trim() !== '' && !isNaN(parseFloat(maxEl.value))) {
          const v = parseFloat(maxEl.value);
          combinedMax = combinedMax === null ? v : Math.max(combinedMax, v);
        }
        if (minEl && minEl.value.trim() !== '' && !isNaN(parseFloat(minEl.value))) {
          const v = parseFloat(minEl.value);
          combinedMin = combinedMin === null ? v : Math.min(combinedMin, v);
        }
      }
      const firstMax = document.getElementById(`ccv-f-max-${first}`);
      const firstMin = document.getElementById(`ccv-f-min-${first}`);
      if (firstMax && combinedMax !== null) firstMax.value = String(combinedMax);
      if (firstMin && combinedMin !== null) firstMin.value = String(combinedMin);
      syncPlotSiblings(first, 'max');
      syncPlotSiblings(first, 'min');

      // unit: first non-empty value found in the group.
      const firstUnit = document.getElementById(`ccv-f-unit-${first}`);
      if (firstUnit && firstUnit.value.trim() === '') {
        const otherUnit = indices
          .map(idx => document.getElementById(`ccv-f-unit-${idx}`))
          .find(el => el && el.value.trim() !== '');
        if (otherUnit) firstUnit.value = otherUnit.value;
      }
      syncPlotSiblings(first, 'unit');
    }

    body.querySelectorAll('input[type="text"], input[type="number"]').forEach(inp => {
      const isMaxMin = inp.id.startsWith('ccv-f-max-') || inp.id.startsWith('ccv-f-min-');
      if (isMaxMin) inp.addEventListener('input', () => markValidity(inp));
      inp.addEventListener('blur', (e) => {
        if (isMaxMin) markValidity(inp);
        const m = inp.id.match(/^ccv-f-(max|min|unit)-(\d+)$/);
        if (m) syncPlotSiblings(parseInt(m[2], 10), m[1]);
        // If focus is moving to an autoScale checkbox (user clicked it while
        // this field was active), skip the apply here. The checkbox's own
        // change listener calls _applyConfig() after the click completes,
        // with the correct toggled state already set on the element.
        // Applying here would rebuild the DOM mid-click, replacing the
        // checkbox and swallowing the change event.
        const rt = e.relatedTarget;
        if (rt && rt.id && rt.id.startsWith('ccv-f-autoscale-')) return;
        this._applyConfig();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('input', () => this._scheduleApply(5000));
    });

    body.querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', () => this._applyConfig());
    });

    body.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      if (!chk.id.startsWith('ccv-f-autoscale-')) {
        chk.addEventListener('change', () => this._applyConfig());
      }
    });

    // Restore focus and cursor position after DOM rebuild (e.g. triggered by blur-apply)
    if (activeId && activeId.startsWith('ccv-')) {
      const el = document.getElementById(activeId);
      if (el) {
        el.focus();
        if (selStart !== null && el.setSelectionRange) el.setSelectionRange(selStart, selEnd);
      }
    }
  }
}

// Make classes available globally
window.MessageCollector = MessageCollector;
window.RawMessageViewer = RawMessageViewer;
window.ChartConfigViewer = ChartConfigViewer;
