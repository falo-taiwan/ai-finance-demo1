// background.js - Service Worker for MOPS Automation Extension (v2.0)

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
  if (message.action === "BIND_TAB") {
    // Navigate index first to set cookies/session, then deep link to bypass TWSE error redirect
    chrome.tabs.create({ url: "https://mops.twse.com.tw/mops/web/index" }, (tab) => {
      state.tabId = tab.id;
      state.isAutomating = false;
      chrome.storage.local.set({ state });
      
      // Wait for index page to load, then redirect to the new SPA hash URL!
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === state.tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          
          setTimeout(() => {
            chrome.tabs.update(state.tabId, { url: "https://mops.twse.com.tw/mops/#/web/t05st01" }, () => {
              chrome.runtime.sendMessage({ action: "LOG", text: "官方網頁開啟並已引導至新版重大訊息頁 (mops/#/web/t05st01)！" });
            });
          }, 1500);
        }
      });
      
      sendResponse({ status: "binding", tabId: tab.id });
    });
    return true; // Keep channel open
  }

  if (message.action === "START_CRAWL") {
    chrome.storage.local.get("state", (data) => {
      let curState = data.state || state;
      curState.isAutomating = true;
      curState.companyCode = message.companyCode;
      curState.years = message.years;
      curState.currentYearIndex = 0;
      curState.records = []; // Clear previous runs
      
      chrome.storage.local.set({ state: curState }, () => {
        chrome.runtime.sendMessage({ action: "LOG", text: `開始自動化查詢！公司: ${message.companyCode}, 年份: ${message.years.join(",")}` });
        
        // Ensure the tab is actually on the query page before sending the trigger
        chrome.tabs.get(curState.tabId, (tab) => {
          if (!tab.url.includes("t05st01")) {
            chrome.runtime.sendMessage({ action: "LOG", text: "偵測到頁籤偏離，正在重新導向至重大訊息歷史查詢頁..." });
            chrome.tabs.update(curState.tabId, { url: "https://mops.twse.com.tw/mops/#/web/t05st01" }, () => {
              // Wait for SPA router to load the page, then trigger content script
              setTimeout(() => {
                chrome.tabs.sendMessage(curState.tabId, { action: "TRIGGER_NEXT" });
              }, 2500);
            });
          } else {
            chrome.tabs.sendMessage(curState.tabId, { action: "TRIGGER_NEXT" });
          }
        });
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
      
      // Merge records
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
