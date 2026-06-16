// content.js - Content Script for MOPS Automation Extension (v4.0)

let hudElement = null;

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "TRIGGER_NEXT") {
    runAutomationStep();
    sendResponse({ status: "running" });
  }
  return true;
});

// Run a single automation step
function runAutomationStep() {
  // Check if we are inside the correct frame that actually has the query fields.
  // If not, exit silently (no HUD, no errors) to prevent parent frame from blocking.
  const coIdInput = document.querySelector('input[name="co_id"]') || document.getElementById("co_id");
  const yearInput = document.querySelector('input[name="year"]') || document.querySelector('select[name="year"]') || document.getElementById("year");
  
  if (!coIdInput || !yearInput) {
    return; // Exit silently for other frames/parent windows
  }

  chrome.runtime.sendMessage({ action: "GET_TASK" }, (task) => {
    if (!task || task.status !== "RUNNING") {
      removeHUD();
      return;
    }

    showHUD(task.year, task.companyCode, task.index + 1, task.total);
    updateHUDStatus("正在自動輸入資料並送出查詢...");

    // Find submit button in this frame
    const submitBtn = document.querySelector('input[type="button"][value="查詢"]') || 
                      document.querySelector('button[type="submit"]') || 
                      document.querySelector('input[type="submit"]') ||
                      document.querySelector('.ma-btn-primary') ||
                      document.querySelector('input[value=" 查詢 "]') ||
                      document.querySelector('input[value="查詢"]') ||
                      document.querySelector('input[value*="查詢"]');

    if (!submitBtn) {
      updateHUDStatus("❌ 錯誤：找不到『查詢』提交按鈕", true);
      chrome.runtime.sendMessage({ action: "LOG", text: "錯誤：在表單中找不到『查詢』提交按鈕。", type: "error" });
      return;
    }

    executeFormFillAndSubmit(coIdInput, yearInput, submitBtn, task);
  });
}

function executeFormFillAndSubmit(coIdInput, yearInput, submitBtn, task) {
  // Set values
  coIdInput.value = task.companyCode;
  
  if (yearInput.tagName === "SELECT") {
    yearInput.value = task.year;
  } else {
    yearInput.value = task.year;
  }
  
  // Set month to empty (all months)
  const monthSelect = document.querySelector('select[name="ma_month"]') || document.querySelector('select[name="month"]') || document.getElementById("month");
  if (monthSelect) {
    monthSelect.value = "";
  }

  // Record current AJAX result HTML to detect change
  const ajaxContainer = document.getElementById("ajaxOut") || document.getElementById("ajaxOut1") || document.body;
  const oldHtml = ajaxContainer.innerHTML;

  updateHUDStatus(`正在送出 ${task.year} 年度查詢...`);

  // Submit form
  submitBtn.click();

  // Poll container for AJAX load finish
  let pollCount = 0;
  const maxPolls = 60; // 30 seconds max
  
  const interval = setInterval(() => {
    const currentHtml = ajaxContainer.innerHTML;
    const hasChanged = currentHtml !== oldHtml;
    const isLoaded = !currentHtml.includes("查詢中") && 
                     !currentHtml.includes("Loading") && 
                     !currentHtml.includes("請稍候");

    if (hasChanged && isLoaded && currentHtml.trim().length > 100) {
      clearInterval(interval);
      updateHUDStatus(`正在提取 ${task.year} 年度重大訊息...`);
      extractAndSubmit(task.year, task.companyCode);
    } else {
      pollCount++;
      if (pollCount >= maxPolls) {
        clearInterval(interval);
        updateHUDStatus(`⚠️ 查詢超時，嘗試讀取現有內容...`);
        extractAndSubmit(task.year, task.companyCode);
      }
    }
  }, 500);
}

// Extract table data and send to background service worker
function extractAndSubmit(year, companyCode) {
  const ajaxContainer = document.getElementById("ajaxOut") || document.getElementById("ajaxOut1") || document.body;
  const tables = ajaxContainer.querySelectorAll("table");
  let records = [];

  tables.forEach(table => {
    const rows = table.querySelectorAll("tr");
    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 6) {
        const rowCompanyCode = cells[1].textContent.trim();
        const rowCompanyName = cells[2].textContent.trim();
        const announceDate = cells[3].textContent.trim();
        const spokeTime = cells[4].textContent.trim();
        const subject = cells[5].textContent.trim();

        if (rowCompanyCode === companyCode) {
          const isAuditSupervisorChange = subject.includes("稽核") || subject.includes("主管異動");
          
          if (isAuditSupervisorChange) {
            records.push({
              "市場": "上市",
              "代號": rowCompanyCode,
              "公司簡稱": rowCompanyName,
              "公告日期": announceDate,
              "異動情形": "內部稽核主管異動",
              "新任者": "詳見官方重大訊息",
              "舊任者": "詳見官方重大訊息",
              "生效日期": announceDate,
              "異動原因": subject,
              "公告來源": JSON.stringify({
                "co_id": rowCompanyCode,
                "year": year,
                "subject": subject,
                "time": spokeTime
              })
            });
          }
        }
      }
    });
  });

  chrome.runtime.sendMessage({
    action: "SUBMIT_DATA",
    year: year,
    records: records
  });
}

// HUD Visual overlay
function showHUD(year, companyCode, currentStep, totalSteps) {
  if (!hudElement) {
    hudElement = document.createElement("div");
    hudElement.style.position = "fixed";
    hudElement.style.top = "10px";
    hudElement.style.right = "10px";
    hudElement.style.background = "#0f172a";
    hudElement.style.color = "#f8fafc";
    hudElement.style.border = "1px solid #10b981";
    hudElement.style.borderRadius = "8px";
    hudElement.style.padding = "12px 18px";
    hudElement.style.fontFamily = "sans-serif";
    hudElement.style.fontSize = "13px";
    hudElement.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.4)";
    hudElement.style.zIndex = "99999999";
    hudElement.style.width = "280px";
    
    // Add pulsing green light
    const pulse = document.createElement("span");
    pulse.className = "hud-pulse";
    pulse.style.display = "inline-block";
    pulse.style.width = "8px";
    hudElement.appendChild(pulse);

    document.body.appendChild(hudElement);
    
    const style = document.createElement("style");
    style.innerText = `
      .hud-pulse {
        width: 8px;
        height: 8px;
        background: #10b981;
        border-radius: 50%;
        margin-right: 8px;
        box-shadow: 0 0 8px #10b981;
        animation: pulse-glow 1.5s infinite;
      }
      @keyframes pulse-glow {
        0% { transform: scale(0.9); opacity: 0.6; }
        50% { transform: scale(1.1); opacity: 1; box-shadow: 0 0 12px #10b981; }
        100% { transform: scale(0.9); opacity: 0.6; }
      }
    `;
    document.head.appendChild(style);
  }

  hudElement.innerHTML = `
    <div style="display:flex; align-items:center; margin-bottom: 6px; font-weight:700; color:#10b981;">
      <span class="hud-pulse"></span>🤖 MOPS 自動化機器人執行中
    </div>
    <div style="margin-bottom:4px;">公司代碼：<strong>${companyCode}</strong></div>
    <div style="margin-bottom:4px;">目前進度：<strong>${currentStep} / ${totalSteps} 年 (${year}年)</strong></div>
    <div id="hud-status" style="font-size:11px; color:#94a3b8; margin-top:6px;">初始化中...</div>
  `;
}

function updateHUDStatus(text, isError = false) {
  const statusEl = document.getElementById("hud-status");
  if (statusEl) {
    statusEl.innerText = text;
    statusEl.style.color = isError ? "#ef4444" : "#94a3b8";
  }
}

function removeHUD() {
  if (hudElement) {
    hudElement.remove();
    hudElement = null;
  }
}
