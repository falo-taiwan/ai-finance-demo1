// popup.js - Controller for Chrome Extension Popup

document.addEventListener("DOMContentLoaded", () => {
  initYearDropdowns();
  bindUIEvents();
  restoreState();
});

function initYearDropdowns() {
  const startSelect = document.getElementById("startYear");
  const endSelect = document.getElementById("endYear");

  // Populate ROC years from 84 to 115
  for (let y = 115; y >= 84; y--) {
    const optStart = document.createElement("option");
    optStart.value = y;
    optStart.textContent = `${y} 年`;
    if (y === 110) optStart.selected = true; // Default start
    startSelect.appendChild(optStart);

    const optEnd = document.createElement("option");
    optEnd.value = y;
    optEnd.textContent = `${y} 年`;
    if (y === 114) optEnd.selected = true; // Default end
    endSelect.appendChild(optEnd);
  }
}

function bindUIEvents() {
  const bindBtn = document.getElementById("bindBtn");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const clearLogBtn = document.getElementById("clearLogBtn");
  const downloadJsonBtn = document.getElementById("downloadJsonBtn");
  const downloadCsvBtn = document.getElementById("downloadCsvBtn");

  // Bind official tab
  bindBtn.addEventListener("click", () => {
    addLog("系統", "正在開啟官方 MOPS index 頁面並進行驗證跳轉...");
    chrome.runtime.sendMessage({ action: "BIND_TAB" }, (response) => {
      if (response && response.tabId) {
        startBtn.disabled = false;
        bindBtn.textContent = "✅ 已綁定官方 MOPS 視窗";
      }
    });
  });

  // Start Crawl
  startBtn.addEventListener("click", () => {
    const companyCode = document.getElementById("companyCode").value.trim();
    if (!companyCode) {
      addLog("系統", "請輸入公司代號！", "error");
      return;
    }

    const startYear = parseInt(document.getElementById("startYear").value);
    const endYear = parseInt(document.getElementById("endYear").value);

    // Build years list
    const years = [];
    if (startYear <= endYear) {
      for (let y = startYear; y <= endYear; y++) years.push(y.toString());
    } else {
      for (let y = startYear; y >= endYear; y--) years.push(y.toString());
    }

    chrome.runtime.sendMessage({
      action: "START_CRAWL",
      companyCode,
      years
    }, (response) => {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      toggleInputs(true);
    });
  });

  // Stop / Pause Crawl
  stopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "STOP_CRAWL" }, (response) => {
      startBtn.disabled = false;
      stopBtn.disabled = true;
    });
  });

  clearLogBtn.addEventListener("click", () => {
    const consoleDiv = document.getElementById("logConsole");
    consoleDiv.innerHTML = "";
  });

  // Downloads
  downloadJsonBtn.addEventListener("click", () => {
    chrome.storage.local.get("state", (data) => {
      const records = (data.state && data.state.records) || [];
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `mops_automation_${data.state.companyCode}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  });

  downloadCsvBtn.addEventListener("click", () => {
    chrome.storage.local.get("state", (data) => {
      const records = (data.state && data.state.records) || [];
      if (records.length === 0) return;
      
      const fields = ["市場", "代號", "公司簡稱", "公告日期", "異動情形", "新任者", "舊任者", "生效日期", "異動原因", "公告來源"];
      
      // Add UTF-8 BOM
      let csvContent = "\uFEFF";
      csvContent += fields.join(",") + "\n";
      
      records.forEach(r => {
        const row = fields.map(f => {
          let val = r[f] || "";
          // Escape quotes
          val = val.replace(/"/g, '""');
          if (val.includes(",") || val.includes("\n") || val.includes('"')) {
            val = `"${val}"`;
          }
          return val;
        });
        csvContent += row.join(",") + "\n";
      });
      
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8-sig;" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", url);
      downloadAnchor.setAttribute("download", `mops_automation_${data.state.companyCode}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
    });
  });

  // Message receiver in popup
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "LOG") {
      addLog("背景", message.text);
    }
    if (message.action === "UPDATE_STATS") {
      document.getElementById("recordsCount").innerText = message.count;
      downloadJsonBtn.disabled = message.count === 0;
      downloadCsvBtn.disabled = message.count === 0;
    }
    if (message.action === "CRAWL_DONE") {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      toggleInputs(false);
    }
  });
}

function restoreState() {
  chrome.storage.local.get("state", (data) => {
    if (data.state) {
      const state = data.state;
      document.getElementById("companyCode").value = state.companyCode || "2330";
      document.getElementById("recordsCount").innerText = state.records ? state.records.length : 0;
      
      if (state.tabId) {
        document.getElementById("startBtn").disabled = state.isAutomating;
        document.getElementById("bindBtn").textContent = "✅ 已綁定官方 MOPS 視窗";
      }
      
      if (state.isAutomating) {
        document.getElementById("stopBtn").disabled = false;
        toggleInputs(true);
      }
      
      if (state.records && state.records.length > 0) {
        document.getElementById("downloadJsonBtn").disabled = false;
        document.getElementById("downloadCsvBtn").disabled = false;
      }
    }
  });
}

function toggleInputs(disable) {
  document.getElementById("companyCode").disabled = disable;
  document.getElementById("startYear").disabled = disable;
  document.getElementById("endYear").disabled = disable;
}

function addLog(source, text, type = "normal") {
  const consoleDiv = document.getElementById("logConsole");
  const item = document.createElement("div");
  item.className = `log-item ${type}`;
  
  const timeStr = new Date().toLocaleTimeString();
  item.textContent = `[${timeStr}] [${source}] ${text}`;
  
  consoleDiv.appendChild(item);
  consoleDiv.scrollTop = consoleDiv.scrollHeight;
}
