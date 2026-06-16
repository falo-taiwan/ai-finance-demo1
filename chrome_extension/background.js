importScripts("parser.js");

const MOPS_ENTRY_URL = "https://mops.twse.com.tw/mops/web/t05st01";
const MOPS_OV_ENTRY_URL = "https://mops.twse.com.tw/mops/#/web/t05st01";
const TEST_SITE_ENTRY_URL = "https://howtofightfraud.com/cae-tracker/";

const state = {
  running: false,
  startedAt: "",
  finishedAt: "",
  companyCode: "2330",
  companyName: "台積電",
  targets: [{ code: "2330", name: "台積電" }],
  automationMode: "page_bound_browser",
  entryUrl: MOPS_OV_ENTRY_URL,
  openStrategy: "current_or_bound_window",
  boundTabId: null,
  boundWindowId: null,
  boundUrl: "",
  results: [],
  yearly: [],
  logs: [],
  errors: []
};

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

function resetRun(options = {}) {
  const targets = Array.isArray(options.targets) && options.targets.length
    ? options.targets
    : [{ code: options.companyCode || "2330", name: options.companyName || "" }];
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = "";
  state.targets = targets;
  state.companyCode = targets[0] ? String(targets[0].code || targets[0].companyCode || "2330") : "2330";
  state.companyName = targets[0] ? String(targets[0].name || targets[0].companyName || "") : "";
  state.automationMode = options.automationMode || "page_bound_browser";
  state.entryUrl = options.entryUrl || MOPS_OV_ENTRY_URL;
  state.openStrategy = options.openStrategy || "current_or_bound_window";
  state.results = [];
  state.yearly = [];
  state.logs = [];
  state.errors = [];
}

function log(message, extra = {}) {
  const item = { ts: new Date().toISOString(), message, ...extra };
  state.logs.push(item);
  chrome.runtime.sendMessage({ type: "STATE_UPDATE", state }).catch(() => {});
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeYears(yearStart, yearEnd) {
  const start = Number(yearStart);
  const end = Number(yearEnd);
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const years = [];
  for (let year = lo; year <= hi; year += 1) years.push(String(year));
  return years;
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => finish(), timeoutMs);
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === "complete") finish();
    }).catch(() => finish());
  });
}

async function openCrawlerWindowAndBind(options = {}) {
  const url = options.entryUrl || MOPS_OV_ENTRY_URL;
  const created = await chrome.windows.create({
    url,
    type: "normal",
    focused: true,
    width: 1280,
    height: 850
  });
  const tab = created.tabs && created.tabs[0];
  state.boundWindowId = created.id || null;
  state.boundTabId = tab ? tab.id : null;
  state.boundUrl = url;
  if (state.boundTabId) await waitForTabComplete(state.boundTabId);
  log("已開啟並綁定查詢視窗", { tabId: state.boundTabId, windowId: state.boundWindowId, url });
  return { tabId: state.boundTabId, windowId: state.boundWindowId, url };
}

async function bindActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id) throw new Error("找不到目前分頁");
  state.boundTabId = tab.id;
  state.boundWindowId = tab.windowId || null;
  state.boundUrl = tab.url || "";
  log("已綁定目前分頁", { tabId: state.boundTabId, windowId: state.boundWindowId, url: state.boundUrl });
  return { tabId: state.boundTabId, windowId: state.boundWindowId, url: state.boundUrl };
}

async function ensureMopsBoundTab() {
  const entryUrl = state.entryUrl || MOPS_OV_ENTRY_URL;
  if (state.boundTabId) {
    try {
      const tab = await chrome.tabs.get(state.boundTabId);
      const url = tab.url || "";
      // Check if it's either MOPS or the test tracker
      if (/mops.*twse\.com\.tw|howtofightfraud\.com\/cae-tracker/.test(url)) return;
      await chrome.tabs.update(state.boundTabId, { url: entryUrl, active: true });
      await waitForTabComplete(state.boundTabId);
      state.boundUrl = entryUrl;
      return;
    } catch (error) {
      state.boundTabId = null;
      state.boundWindowId = null;
      state.boundUrl = "";
    }
  }
  await openCrawlerWindowAndBind({ entryUrl });
}

async function queryYearInBoundTab(companyCode, year, options = {}) {
  await ensureMopsBoundTab();
  if (!state.boundTabId) throw new Error("尚未綁定查詢頁籤");
  
  const tab = await chrome.tabs.get(state.boundTabId);
  const currentUrl = tab.url || "";
  const isGov = /twse\.com\.tw/.test(currentUrl);
  
  log(`正在頁籤執行自動表單填寫 (年分: ${year}, 代碼: ${companyCode}, 網站別: ${isGov ? 'TWSE MOPS 官方' : '測試網站'})`);

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: state.boundTabId },
    world: "MAIN",
    args: [{
      companyCode,
      year,
      isGov,
      automationMode: options.automationMode || "page_bound_browser",
      humanPacedDelayMs: options.humanPacedDelayMs || 900
    }],
    func: async ({ companyCode, year, isGov, automationMode, humanPacedDelayMs }) => {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const pace = Math.max(350, Number(humanPacedDelayMs || 900));

      if (isGov) {
        // --- Government MOPS Form Automation ---
        const form = document.forms.form1 || document.querySelector("form#form1");
        if (!form) throw new Error("找不到 MOPS 官方查詢表單 form1");

        const setValue = (name, value) => {
          const field = form.elements[name] || document.getElementById(name);
          if (field) {
            field.focus && field.focus();
            field.value = value;
            field.dispatchEvent(new Event("input", { bubbles: true }));
            field.dispatchEvent(new Event("change", { bubbles: true }));
          }
        };

        if (automationMode === "human_paced_browser") {
          const focusEl = form.elements.co_id || document.getElementById("co_id") || form;
          focusEl.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(pace);
        }
        setValue("co_id", companyCode);
        if (automationMode === "human_paced_browser") await sleep(pace);
        setValue("year", String(year));
        if (automationMode === "human_paced_browser") await sleep(pace);
        setValue("month", "");
        setValue("TYPEK", "all");
        setValue("TYPEK2", "");
        setValue("queryName", "co_id");
        setValue("inpuType", "co_id");
        setValue("step", "1");
        setValue("firstin", "1");
        setValue("off", "1");
        form.action = "/mops/web/ajax_t05st01";

        const beforeTable = document.querySelector("#table01");
        const before = beforeTable ? beforeTable.innerHTML : "";
        
        if (automationMode === "human_paced_browser") {
          const submitBtn = document.querySelector("input[type='button'], input[type='submit'], button") || form;
          submitBtn.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(pace);
        }

        if (typeof doAction === "function") {
          doAction();
        } else if (typeof ajax1 === "function") {
          ajax1(form, "table01");
        } else {
          form.submit();
        }

        const started = Date.now();
        while (Date.now() - started < 20000) {
          const table = document.querySelector("#table01");
          const html = table ? table.innerHTML : "";
          if (html && html !== before && !/資料載入中|loading/i.test(html)) {
            if (automationMode === "human_paced_browser") {
              table.scrollIntoView({ behavior: "smooth", block: "start" });
              await sleep(pace);
            }
            return {
              ok: true,
              html: table.outerHTML,
              text: table.innerText || "",
              pageUrl: location.href,
              elapsedMs: Date.now() - started
            };
          }
          await sleep(250);
        }
        
        const finalTable = document.querySelector("#table01");
        return {
          ok: false,
          html: finalTable ? finalTable.outerHTML : "",
          text: finalTable ? finalTable.innerText || "" : "",
          pageUrl: location.href,
          elapsedMs: Date.now() - started,
          error: "等待 MOPS 查詢結果逾時"
        };
      } else {
        // --- Private Test Site Form Automation ---
        const coIdInput = document.querySelector('input[name="ma_company"]');
        const yearInput = document.querySelector('select[name="ma_year"]');
        const submitBtn = document.querySelector('button[type="submit"]') || 
                          document.querySelector('.ma-btn-primary') ||
                          document.querySelector('input[type="submit"]');

        if (!coIdInput || !yearInput || !submitBtn) {
          throw new Error("找不到測試網頁的輸入欄位（ma_company / ma_year）或查詢按鈕");
        }

        if (automationMode === "human_paced_browser") {
          coIdInput.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(pace);
        }
        coIdInput.value = companyCode;
        coIdInput.dispatchEvent(new Event("input", { bubbles: true }));
        coIdInput.dispatchEvent(new Event("change", { bubbles: true }));

        if (automationMode === "human_paced_browser") await sleep(pace);

        yearInput.value = String(year);
        yearInput.dispatchEvent(new Event("change", { bubbles: true }));

        const monthSelect = document.querySelector('select[name="ma_month"]');
        if (monthSelect) {
          monthSelect.value = "";
          monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const tableContainer = document.querySelector(".mops-audit-table") || document.body;
        const beforeHtml = tableContainer.innerHTML;

        if (automationMode === "human_paced_browser") {
          submitBtn.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(pace);
        }

        submitBtn.click();

        const started = Date.now();
        while (Date.now() - started < 20000) {
          const newContainer = document.querySelector(".mops-audit-table") || document.body;
          const html = newContainer.innerHTML;
          if (html && html !== beforeHtml && !/查詢中|loading/i.test(html)) {
            if (automationMode === "human_paced_browser") {
              newContainer.scrollIntoView({ behavior: "smooth", block: "start" });
              await sleep(pace);
            }
            return {
              ok: true,
              html: newContainer.outerHTML,
              text: newContainer.innerText || "",
              pageUrl: location.href,
              elapsedMs: Date.now() - started
            };
          }
          await sleep(250);
        }

        const finalContainer = document.querySelector(".mops-audit-table") || document.body;
        return {
          ok: false,
          html: finalContainer.outerHTML,
          text: finalContainer.innerText || "",
          pageUrl: location.href,
          elapsedMs: Date.now() - started,
          error: "等待測試網頁查詢結果逾時"
        };
      }
    }
  });
  return result;
}

async function queryCompanyYears(options) {
  const companyCode = String(options.companyCode || "2330").trim();
  const companyName = String(options.companyName || "").trim();
  const years = normalizeYears(options.yearStart || 110, options.yearEnd || 114);
  const automationMode = options.automationMode || state.automationMode || "page_bound_browser";
  const humanPacedDelayMs = Math.max(350, Number(options.humanPacedDelayMs || 900));
  const defaultDelay = automationMode === "api_data_flow" ? 120 : automationMode === "human_paced_browser" ? humanPacedDelayMs : 350;
  const delayMs = Math.max(0, Number(options.delayMs || defaultDelay));
  const keepOriginalHtml = Boolean(options.keepOriginalHtml);
  
  if (!state.running || options.reset !== false) resetRun({ ...options, companyCode, companyName, automationMode });
  const modeLabel = automationMode === "api_data_flow" ? "API / 資料流" : automationMode === "human_paced_browser" ? "人類節奏" : "頁面監控";
  log(`開始自動化：${companyCode} ${companyName}，年度：${years[0]}-${years[years.length - 1]}，模式：${modeLabel}`);

  for (const year of years) {
    if (!state.running) break;
    try {
      log(`開始執行 ${year} 年查詢任務...`);
      const page = await queryYearInBoundTab(companyCode, year, { automationMode, humanPacedDelayMs });
      
      const isGov = /twse\.com\.tw/.test(page.pageUrl || state.boundUrl);
      let parsed;
      if (isGov) {
        parsed = TsmcParser.parseMopsResultHtml(page.html || "", {
          companyCode,
          year,
          sourceUrl: page.pageUrl || state.boundUrl
        });
      } else {
        parsed = TsmcParser.parseTrackerHtml(page.html || "", {
          companyCode,
          year,
          sourceUrl: page.pageUrl || state.boundUrl
        });
      }

      const yearlyItem = {
        year,
        url: page.pageUrl || state.boundUrl,
        status: page.ok ? 200 : "timeout",
        bytes: new Blob([page.html || ""]).size,
        elapsedMs: page.elapsedMs,
        rows: parsed.rows.length,
        capped: parsed.capped || false,
        companyCode,
        companyName,
        automationMode,
        totalText: parsed.totalText || parsed.rawText || ""
      };
      
      state.yearly.push(yearlyItem);

      // Standardize record schemas for dual-site outputs
      for (const row of parsed.rows) {
        row.queryYear = row.queryYear || String(year);
        row.companyCode = row.companyCode || companyCode;
        row.companyName = row.companyName || companyName;
        row.automationMode = automationMode;
        
        // Ensure standard fields exist
        row.market = row.market || (isGov ? "上市" : "");
        row.announceDate = row.announceDate || "";
        row.announceTime = row.announceTime || "";
        row.changeType = row.changeType || (isGov ? "內部稽核主管異動" : "");
        row.newPerson = row.newPerson || (isGov ? "詳見官方重大訊息" : "");
        row.oldPerson = row.oldPerson || (isGov ? "詳見官方重大訊息" : "");
        row.effectiveDate = row.effectiveDate || row.announceDate || "";
        row.reason = row.reason || row.subject || "";
        row.sourceUrl = row.sourceUrl || page.pageUrl || state.boundUrl;

        row.original = {
          status: page.ok ? 200 : "timeout",
          bytes: yearlyItem.bytes,
          html: keepOriginalHtml ? page.html || "" : ""
        };
      }
      
      state.results.push(...parsed.rows);
      log(`完成 ${year} 年度查詢：擷取到 ${parsed.rows.length} 筆資料`, yearlyItem);
    } catch (error) {
      const item = {
        year,
        url: state.boundUrl,
        error: String(error && error.message ? error.message : error)
      };
      state.errors.push(item);
      state.yearly.push({ year, url: state.boundUrl, status: "error", rows: 0, error: item.error });
      log(`執行 ${year} 年度查詢失敗：${item.error}`, item);
    }
    
    if (state.running) {
      await sleep(delayMs);
    }
  }

  if (options.reset !== false) {
    state.running = false;
    state.finishedAt = new Date().toISOString();
    log(`自動化執行完畢！共抓取 ${state.results.length} 筆重大訊息，錯誤計 ${state.errors.length} 筆`);
    chrome.storage.local.set({ lastOpenQueryAgentRun: state }).catch(() => {});
  }
  return state;
}

async function queryTargets(options) {
  const targets = Array.isArray(options.targets) && options.targets.length
    ? options.targets
    : [{ code: options.companyCode || "2330", name: options.companyName || "" }];
  resetRun({ ...options, targets });
  
  const forceFreshWindow = Boolean(options.forceFreshWindow || options.openStrategy === "fresh_demo_window");
  if (forceFreshWindow) {
    state.boundTabId = null;
    state.boundWindowId = null;
    state.boundUrl = "";
    log("展示模式：強制開啟全新查詢分頁並綁定", {
      openStrategy: "fresh_demo_window",
      entryUrl: state.entryUrl
    });
    await openCrawlerWindowAndBind({ entryUrl: state.entryUrl || MOPS_OV_ENTRY_URL });
  }

  for (const target of targets) {
    if (!state.running) break;
    await queryCompanyYears({
      ...options,
      reset: false,
      companyCode: target.code || target.companyCode,
      companyName: target.name || target.companyName || ""
    });
  }

  state.running = false;
  state.finishedAt = new Date().toISOString();
  log(`所有公司年份查詢完畢：${targets.length} 家公司，累計抓取 ${state.results.length} 筆重大訊息`);
  chrome.storage.local.set({ lastOpenQueryAgentRun: state }).catch(() => {});
  return state;
}

function toCsv(rows) {
  const fields = [
    "market",
    "companyCode",
    "companyName",
    "announceDate",
    "changeType",
    "newPerson",
    "oldPerson",
    "effectiveDate",
    "reason",
    "sourceUrl"
  ];
  const headers = [
    "市場",
    "代號",
    "公司簡稱",
    "公告日期",
    "異動情形",
    "新任者",
    "舊任者",
    "生效日期",
    "異動原因",
    "公告來源"
  ];
  
  const quote = value => `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
  const lines = [headers.map(quote).join(",")];
  
  for (const row of rows) {
    lines.push(fields.map(field => {
      let val = row[field];
      if (field === "changeType" && !val) val = "內部稽核主管異動";
      if (field === "reason" && !val) val = row.subject || row.reason || "";
      if (field === "market" && !val) val = "上市"; 
      if (field === "effectiveDate" && !val) val = row.announceDate || "";
      if (field === "newPerson" && !val) val = "詳見官方重大訊息";
      if (field === "oldPerson" && !val) val = "詳見官方重大訊息";
      return quote(val);
    }).join(","));
  }
  return "\ufeff" + lines.join("\n");
}

function downloadData(kind) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const filename = kind === "json"
    ? `mops-captured-data-${stamp}.json`
    : `mops-captured-data-${stamp}.csv`;
  const content = kind === "json" ? JSON.stringify(state, null, 2) : toCsv(state.results);
  const mime = kind === "json" ? "application/json" : "text/csv";
  const url = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
  return chrome.downloads.download({ url, filename, saveAs: true });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    sendResponse({ state });
    return false;
  }
  if (message.type === "QUERY_YEARS") {
    queryTargets(message.options || {})
      .then(nextState => sendResponse({ ok: true, state: nextState }))
      .catch(error => sendResponse({ ok: false, error: String(error && error.message ? error.message : error), state }));
    return true;
  }
  if (message.type === "CONFIRM_RUN") {
    queryTargets(message.plan || message.options || {})
      .then(nextState => sendResponse({ ok: true, state: nextState }))
      .catch(error => sendResponse({ ok: false, error: String(error && error.message ? error.message : error), state }));
    return true;
  }
  if (message.type === "OPEN_BIND") {
    openCrawlerWindowAndBind(message.options || {})
      .then(bound => sendResponse({ ok: true, bound, state }))
      .catch(error => sendResponse({ ok: false, error: String(error && error.message ? error.message : error), state }));
    return true;
  }
  if (message.type === "BIND_ACTIVE") {
    bindActiveTab()
      .then(bound => sendResponse({ ok: true, bound, state }))
      .catch(error => sendResponse({ ok: false, error: String(error && error.message ? error.message : error), state }));
    return true;
  }
  if (message.type === "DOWNLOAD") {
    downloadData(message.kind || "csv")
      .then(downloadId => sendResponse({ ok: true, downloadId }))
      .catch(error => sendResponse({ ok: false, error: String(error && error.message ? error.message : error) }));
    return true;
  }
  if (message.type === "CLEAR_RESULTS") {
    state.running = false;
    state.finishedAt = "";
    state.results = [];
    state.yearly = [];
    state.logs = [];
    state.errors = [];
    chrome.storage.local.remove(["lastOpenQueryAgentRun"]).catch(() => {});
    sendResponse({ ok: true, state });
    return false;
  }
  if (message.type === "STOP_CRAWL") {
    state.running = false;
    log("自動化已暫停。");
    sendResponse({ ok: true, state });
    return false;
  }
  if (message.type === "CLEAR_ALL") {
    state.running = false;
    state.finishedAt = "";
    state.results = [];
    state.yearly = [];
    state.logs = [];
    state.errors = [];
    chrome.storage.local.remove(["lastOpenQueryAgentRun"]).catch(() => {});
    sendResponse({ ok: true, state });
    return false;
  }
  return false;
});
