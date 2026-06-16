// background.js - Service Worker for MOPS Automation Extension (v3.0)

let state = {
  tabId: null,
  isAutomating: false,
  companyCode: "2330",
  years: [],
  currentYearIndex: 0,
  records: []
};

// Load state from storage on startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ state });
});

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_CRAWL") {
    chrome.storage.local.get("state", (data) => {
      let curState = data.state || state;
      curState.isAutomating = true;
      curState.tabId = message.tabId; // Target user's active tab
      curState.companyCode = message.companyCode;
      curState.years = message.years;
      curState.currentYearIndex = 0;
      curState.records = []; // Clear previous runs
      
      chrome.storage.local.set({ state: curState }, () => {
        chrome.runtime.sendMessage({ action: "LOG", text: `開始對頁籤 ${message.tabId} 執行自動化！公司: ${message.companyCode}, 年份: ${message.years.join(",")}` });
        
        // Trigger content script on target tab directly
        chrome.tabs.sendMessage(curState.tabId, { action: "TRIGGER_NEXT" });
      });
    });
    sendResponse({ status: "started" });
    return true;
  }

  if (message.action === "STOP_CRAWL") {
    chrome.storage.local.get("state", (data) => {
      let curState = data.state || state;
      curState.isAutomating = false;
      chrome.storage.local.set({ state: curState }, () => {
        chrome.runtime.sendMessage({ action: "LOG", text: "自動化已暫停。" });
      });
    });
    sendResponse({ status: "stopped" });
    return true;
  }

  if (message.action === "GET_TASK") {
    chrome.storage.local.get("state", (data) => {
      let curState = data.state || state;
      if (curState.isAutomating && curState.currentYearIndex < curState.years.length) {
        const year = curState.years[curState.currentYearIndex];
        sendResponse({
          status: "RUNNING",
          companyCode: curState.companyCode,
          year: year,
          index: curState.currentYearIndex,
          total: curState.years.length
        });
      } else {
        sendResponse({ status: "IDLE" });
      }
    });
    return true;
  }

  if (message.action === "SUBMIT_DATA") {
    chrome.storage.local.get("state", (data) => {
      let curState = data.state || state;
      
      const newRecords = message.records || [];
      curState.records = curState.records.concat(newRecords);
      
      // Advance to next task
      curState.currentYearIndex++;
      
      chrome.storage.local.set({ state: curState }, () => {
        chrome.runtime.sendMessage({ 
          action: "LOG", 
          text: `年份 ${message.year} 查詢完成，抓取到 ${newRecords.length} 筆重大訊息。累計 ${curState.records.length} 筆。` 
        });
        
        // Update popup stats
        chrome.runtime.sendMessage({ 
          action: "UPDATE_STATS", 
          count: curState.records.length 
        });

        if (curState.currentYearIndex < curState.years.length) {
          // Trigger next year
          chrome.tabs.sendMessage(curState.tabId, { action: "TRIGGER_NEXT" });
        } else {
          curState.isAutomating = false;
          chrome.storage.local.set({ state: curState }, () => {
            chrome.runtime.sendMessage({ action: "LOG", text: `🎉 自動化查詢完畢！共抓取 ${curState.records.length} 筆重大訊息。請點擊下載匯出。` });
            chrome.runtime.sendMessage({ action: "CRAWL_DONE" });
          });
        }
      });
    });
    sendResponse({ status: "acknowledged" });
    return true;
  }
});
