const $ = id => document.getElementById(id);

let currentState = { running: false, results: [], yearly: [], logs: [], errors: [] };
let companyDictionary = [];
let codeIndex = new Map();
let aliasIndex = new Map();

const DEFAULT_CRAWLER_URL = "https://mops.twse.com.tw/mops/#/web/t05st01";
const TEST_SITE_URL = "https://howtofightfraud.com/cae-tracker/";

function sendMessage(message) {
  if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    return Promise.resolve({ ok: true, state: currentState });
  }
  return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
}

function runtimeUrl(path) {
  if (globalThis.chrome && chrome.runtime && chrome.runtime.getURL) return chrome.runtime.getURL(path);
  return path;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getCrawlerUrl() {
  return currentState.boundUrl || DEFAULT_CRAWLER_URL;
}

async function loadJson(path) {
  const response = await fetch(runtimeUrl(path));
  if (!response.ok) throw new Error(`讀取 ${path} 失敗`);
  return response.json();
}

async function loadCompanyDictionary() {
  if (companyDictionary.length) return;
  try {
    const [dictionary, nameIndex] = await Promise.all([
      loadJson("data/company_dictionary.json"),
      loadJson("data/company_name_index.json")
    ]);
    companyDictionary = dictionary;
    codeIndex = new Map(dictionary.map(item => [String(item.code), item]));
  } catch (err) {
    console.error("Failed to load dictionary", err);
  }
}

function updateCompanyPreview() {
  const code = $("companyCode").value.trim();
  if (!code) {
    $("resolutionPreview").textContent = "尚未輸入公司代號。";
    return;
  }
  const item = codeIndex.get(code);
  if (item) {
    $("resolutionPreview").textContent = `驗證公司：${item.code} ${item.primary_name} (${item.markets[0] || "上市"})`;
  } else {
    $("resolutionPreview").textContent = `手動輸入代號: ${code} (字典無符合)`;
  }
}

function buildOperationPlan() {
  const code = $("companyCode").value.trim() || "2330";
  const startYear = Number($("yearStart").value || 110);
  const endYear = Number($("yearEnd").value || 114);
  const delayMs = Number($("delayMs").value || 350);
  const saveHtml = $("saveHtml").value === "true";
  
  const item = codeIndex.get(code);
  const name = item ? item.primary_name : "";

  return {
    source: "dual_site_captured",
    companyCode: code,
    companyName: name,
    targets: [{ code, name }],
    yearStart: startYear,
    yearEnd: endYear,
    delayMs: delayMs,
    saveHtml: saveHtml,
    entryUrl: getCrawlerUrl(),
    automationMode: "page_bound_browser",
    openStrategy: "current_or_bound_window",
    actions: ["bind_target_page", "query_years", "parse_table", "show_results"]
  };
}

function renderState(state) {
  currentState = state || currentState;
  $("boundStatus").textContent = currentState.boundTabId ? `已監控 Tab ${currentState.boundTabId}` : "尚未綁定";
  $("boundUrl").textContent = currentState.boundUrl ? `目前監控網址: ${currentState.boundUrl}` : "目前監控網址: 尚未監控";
  
  // Client-side records filtering
  const query = $("filterBox").value.trim().toLowerCase();
  const filtered = currentState.results.filter(row => {
    if (!query) return true;
    return [
      row.queryYear,
      row.announceDate,
      row.companyCode,
      row.companyName,
      row.subject,
      row.reason,
      row.changeType,
      row.newPerson,
      row.oldPerson,
      row.rawText
    ].join(" ").toLowerCase().includes(query);
  });

  $("totalRows").textContent = filtered.length;
  $("doneYears").textContent = currentState.yearly.length;
  $("errorCount").textContent = currentState.errors.length;

  $("csvBtn").disabled = filtered.length === 0;
  $("jsonBtn").disabled = filtered.length === 0;

  if (currentState.running) {
    $("confirmRunBtn").disabled = true;
    $("stopCrawlBtn").disabled = false;
    toggleInputs(true);
  } else {
    $("confirmRunBtn").disabled = false;
    $("stopCrawlBtn").disabled = true;
    toggleInputs(false);
  }

  $("recordBody").innerHTML = filtered.slice(0, 100).map(row => {
    const displayCompany = row.companyName ? `${row.companyCode} ${row.companyName}` : row.companyCode;
    const displaySubject = row.subject || row.reason || row.changeType || "";
    return `
      <tr>
        <td>${escapeHtml(row.queryYear)}</td>
        <td>${escapeHtml(row.announceDate)}</td>
        <td>${escapeHtml(displayCompany)}</td>
        <td>${escapeHtml(displaySubject)}</td>
      </tr>
    `;
  }).join("");

  $("logBox").innerHTML = currentState.logs.slice(-150).map(item => {
    const time = item.ts ? item.ts.slice(11, 19) : "";
    return `<div>[${escapeHtml(time)}] ${escapeHtml(item.message)}</div>`;
  }).join("");
  $("logBox").scrollTop = $("logBox").scrollHeight;
}

function toggleInputs(disable) {
  $("companyCode").disabled = disable;
  $("yearStart").disabled = disable;
  $("yearEnd").disabled = disable;
  $("delayMs").disabled = disable;
  $("saveHtml").disabled = disable;
}

async function startAutomation() {
  const plan = buildOperationPlan();
  const response = await sendMessage({ type: "CONFIRM_RUN", plan: { ...plan, keepOriginalHtml: plan.saveHtml } });
  if (response && response.state) renderState(response.state);
}

async function stopAutomation() {
  const response = await sendMessage({ type: "STOP_CRAWL" });
  if (response && response.state) renderState(response.state);
}

async function copyText(value, btnId) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    $(btnId).textContent = "已複製";
    window.setTimeout(() => { $(btnId).textContent = "複製"; }, 1200);
  } catch (error) {
    $(btnId).textContent = "失敗";
    window.setTimeout(() => { $(btnId).textContent = "複製"; }, 1200);
  }
}

async function resetRpa() {
  $("companyCode").value = "2330";
  $("yearStart").value = "110";
  $("yearEnd").value = "114";
  $("delayMs").value = "350";
  $("saveHtml").value = "false";
  updateCompanyPreview();
  const response = await sendMessage({ type: "CLEAR_ALL" });
  if (response && response.state) renderState(response.state);
}

function bindEvents() {
  $("openBindBtn").addEventListener("click", async () => {
    const response = await sendMessage({ type: "OPEN_BIND", options: { entryUrl: getCrawlerUrl() } });
    if (response && response.state) renderState(response.state);
  });
  $("bindActiveBtn").addEventListener("click", async () => {
    const response = await sendMessage({ type: "BIND_ACTIVE" });
    if (response && response.state) renderState(response.state);
  });
  $("copyCrawlerUrlBtn").addEventListener("click", () => copyText(DEFAULT_CRAWLER_URL, "copyCrawlerUrlBtn"));
  $("copyTestSiteUrlBtn").addEventListener("click", () => copyText(TEST_SITE_URL, "copyTestSiteUrlBtn"));
  $("companyCode").addEventListener("input", updateCompanyPreview);
  $("confirmRunBtn").addEventListener("click", startAutomation);
  $("stopCrawlBtn").addEventListener("click", stopAutomation);
  $("resetPlanBtn").addEventListener("click", resetRpa);
  $("csvBtn").addEventListener("click", () => sendMessage({ type: "DOWNLOAD", kind: "csv" }));
  $("jsonBtn").addEventListener("click", () => sendMessage({ type: "DOWNLOAD", kind: "json" }));
  $("clearResultsBtn").addEventListener("click", async () => {
    const response = await sendMessage({ type: "CLEAR_RESULTS" });
    if (response && response.state) renderState(response.state);
  });
  $("filterBox").addEventListener("input", () => renderState(currentState));
}

async function init() {
  bindEvents();
  await loadCompanyDictionary();
  updateCompanyPreview();
  
  if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === "STATE_UPDATE") renderState(message.state);
    });
  }
  
  sendMessage({ type: "GET_STATE" }).then(response => {
    if (response && response.state) {
      renderState(response.state);
      // Restore parameter inputs from state
      if (response.state.companyCode) $("companyCode").value = response.state.companyCode;
      if (response.state.yearly && response.state.yearly.length > 0) {
        // Just let it restore inputs
      }
      updateCompanyPreview();
    }
  });
}

init();
