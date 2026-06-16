// content.js - Content Script for MOPS Automation Extension

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
  chrome.runtime.sendMessage({ action: "GET_TASK" }, (task) => {
    if (!task || task.status !== "RUNNING") {
      removeHUD();
      return;
    }

    showHUD(task.year, task.companyCode, task.index + 1, task.total);

    // 1. Locate form elements on TWSE MOPS official page
    const coIdInput = document.querySelector('input[name="co_id"]') || document.getElementById("co_id");
    const yearInput = document.querySelector('input[name="year"]') || document.querySelector('select[name="year"]') || document.getElementById("year");
    const monthSelect = document.querySelector('select[name="month"]') || document.getElementById("month");
    
    // Form submit button
    const submitBtn = document.querySelector('input[type="button"][value="查詢"]') || 
                      document.querySelector('button[type="submit"]') || 
                      document.querySelector('input[type="submit"]') ||
                      document.querySelector('.ma-btn-primary') ||
                      document.querySelector('input[value=" 查詢 "]');

    if (!coIdInput || !yearInput) {
      updateHUDStatus("❌ 錯誤：找不到官方查詢輸入框 (co_id/year)", true);
      chrome.runtime.sendMessage({ action: "LOG", text: "錯誤：找不到官方查詢輸入框 (co_id/year)。自動化中斷。", type: "error" });
      return;
    }

    // 2. Set form values
    coIdInput.value = task.companyCode;
    
    // Set Year (MOPS select or input text)
    if (yearInput.tagName === "SELECT") {
      yearInput.value = task.year;
    } else {
      yearInput.value = task.year;
    }
    
    // Set Month to "ALL" (usually value "" or "0")
    if (monthSelect) {
      monthSelect.value = ""; 
    }

    // 3. Record current AJAX result HTML to detect change
    const ajaxContainer = document.getElementById("ajaxOut") || document.getElementById("ajaxOut1") || document.body;
    const oldHtml = ajaxContainer.innerHTML;

    updateHUDStatus(`正在送出 ${task.year} 年度查詢...`);

    // 4. Click the query button to submit AJAX POST
    if (submitBtn) {
      submitBtn.click();
    } else {
      // Fallback: Submit enclosing form
      const form = coIdInput.closest("form");
      if (form) form.submit();
      else {
        updateHUDStatus("❌ 錯誤：找不到查詢按鈕或表單", true);
        return;
      }
    }

    // 5. Poll container for AJAX load finish
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
        updateHUDStatus(`正在提取 ${task.year} 年度資料...`);
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
  });
}

// Extract table data and send to background service worker
function extractAndSubmit(year, companyCode) {
  const ajaxContainer = document.getElementById("ajaxOut") || document.getElementById("ajaxOut1") || document.body;
  const tables = ajaxContainer.querySelectorAll("table");
  let records = [];

  // Parse major announcement tables
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

        // Validate company code matches and subject contains target keyword (e.g. 稽核主管)
        // If subject doesn't contain the keyword, it's still mapped to keep all records if needed,
        // but let's filter for relevant announcements to match the project theme!
        if (rowCompanyCode === companyCode) {
          const isAuditSupervisorChange = subject.includes("稽核主管") || subject.includes("稽核");
          
          if (isAuditSupervisorChange) {
            records.push({
              "市場": "上市", // Default to listed for TSMC 2330
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

  // Send extracted records back to background
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
    
    // Injected style for pulsing animation
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
