const $ = id => document.getElementById(id);

const MODEL_CONFIGS = {
  "gemini-2.5": { label: "Gemini 2.5", inputPer1M: 1.25, outputPer1M: 10.0 },
  "gemini-3.1-fl": { label: "Gemini 3.1 FL", inputPer1M: 0.35, outputPer1M: 1.05 },
  "gemini-3.5": { label: "Gemini 3.5", inputPer1M: 2.5, outputPer1M: 15.0 }
};

let currentState = { running: false, results: [], yearly: [], logs: [], errors: [] };
let currentPlan = null;
let lastResolution = { targets: [], ambiguous: [], unresolved: [], method: "not_started" };
let lastUsage = { model: "Chrome-only", inputTokens: 0, outputTokens: 0, usd: 0, twd: 0 };
let companyDictionary = [];
let codeIndex = new Map();
let aliasIndex = new Map();

const CLEAR_ALL = "CLEAR_ALL";
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

function getAiMode() {
  return $("modeGemini").checked ? "gemini" : "chrome";
}

function getAutomationMode() {
  return "page_bound_browser";
}

function getCrawlerUrl() {
  // Return the currently active URL from bound state if possible, otherwise guess from active tab url
  return currentState.boundUrl || DEFAULT_CRAWLER_URL;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function normalizeAlias(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[，,。．.、:：;；()（）「」『』"'`]/g, "")
    .trim();
}

async function loadJson(path) {
  const response = await fetch(runtimeUrl(path));
  if (!response.ok) throw new Error(`讀取 ${path} 失敗`);
  return response.json();
}

async function loadCompanyDictionary() {
  if (companyDictionary.length) return;
  const [dictionary, nameIndex] = await Promise.all([
    loadJson("data/company_dictionary.json"),
    loadJson("data/company_name_index.json")
  ]);
  companyDictionary = dictionary;
  codeIndex = new Map(dictionary.map(item => [String(item.code), item]));
  aliasIndex = new Map();
  for (const item of nameIndex) {
    aliasIndex.set(normalizeAlias(item.alias), {
      alias: item.alias,
      matches: item.matches || []
    });
  }
}

function estimateCost({ modelId, inputTokens, outputTokens, exchangeRate }) {
  if (!modelId || modelId === "chrome") {
    return { model: "Chrome-only", inputTokens: 0, outputTokens: 0, usd: 0, twd: 0 };
  }
  const config = MODEL_CONFIGS[modelId] || MODEL_CONFIGS["gemini-2.5"];
  const usd = (inputTokens / 1_000_000 * config.inputPer1M) + (outputTokens / 1_000_000 * config.outputPer1M);
  return {
    model: config.label,
    inputTokens,
    outputTokens,
    usd,
    twd: usd * Number($("exchangeRate").value || exchangeRate || 30)
  };
}

function targetFromCode(code, source = "local_code") {
  const item = codeIndex.get(String(code));
  return {
    code: String(code),
    name: item ? item.primary_name : "",
    market: item && item.markets ? item.markets[0] || "" : "",
    aliases: item ? item.aliases || [] : [],
    evidenceCount: item ? item.evidence_count || 0 : 0,
    confidence: item ? "high" : "medium",
    source
  };
}

function addUniqueTarget(targets, target) {
  if (!target || !target.code || targets.some(item => item.code === target.code)) return;
  targets.push(target);
}

function extractCompanyHints(text) {
  const raw = String(text || "");
  const hints = new Set();
  for (const match of raw.matchAll(/\b\d{4,6}\b/g)) hints.add(match[0]);
  for (const [normalized, item] of aliasIndex.entries()) {
    if (normalized.length < 2) continue;
    if (normalizeAlias(raw).includes(normalized)) hints.add(item.alias);
  }
  return Array.from(hints);
}

function resolveCompanyTargets(prompt, parsedTargets = []) {
  const targets = [];
  const ambiguous = [];
  const unresolved = [];
  const localMatches = [];

  for (const item of parsedTargets || []) {
    const code = String(item.code || item.companyCode || "").trim();
    if (code) addUniqueTarget(targets, { ...targetFromCode(code, "ai_json"), name: item.name || targetFromCode(code).name });
  }

  for (const hint of extractCompanyHints(prompt)) {
    const normalized = normalizeAlias(hint);
    if (/^\d{4,6}$/.test(hint)) {
      const target = targetFromCode(hint);
      addUniqueTarget(targets, target);
      localMatches.push({ hint, type: "code", matches: [target] });
      continue;
    }

    const indexed = aliasIndex.get(normalized);
    if (!indexed || !indexed.matches.length) {
      unresolved.push(hint);
      continue;
    }
    localMatches.push({ hint, type: "alias", matches: indexed.matches });
    if (indexed.matches.length === 1) {
      const match = indexed.matches[0];
      addUniqueTarget(targets, {
        ...targetFromCode(match.code, "local_alias"),
        name: match.primary_name,
        matchedAlias: indexed.alias,
        evidenceCount: match.score || targetFromCode(match.code).evidenceCount,
        confidence: match.score >= 8 ? "high" : "medium"
      });
    } else {
      ambiguous.push({ hint, matches: indexed.matches });
    }
  }

  if (!targets.length && !ambiguous.length && !unresolved.length) {
    addUniqueTarget(targets, targetFromCode("2330", "default"));
  }

  return {
    method: "local_dictionary",
    targets,
    ambiguous,
    unresolved,
    localMatches,
    needsWebVerification: Boolean(ambiguous.length || unresolved.length),
    requiresUserConfirmation: true
  };
}

function normalizeTargetsFromGemini(parsed) {
  const targets = [];
  const rawTargets = parsed.targets || parsed.companies || [];
  if (Array.isArray(rawTargets)) {
    for (const item of rawTargets) {
      if (typeof item === "string") {
        if (/^\d{4,6}$/.test(item)) targets.push({ code: item });
      } else if (item && (item.code || item.companyCode)) {
        targets.push({ code: item.code || item.companyCode, name: item.name || item.companyName || "" });
      }
    }
  }
  if (Array.isArray(parsed.companyCodes)) {
    parsed.companyCodes.forEach(code => targets.push({ code }));
  }
  if (parsed.companyCode) targets.push({ code: parsed.companyCode, name: parsed.companyName || "" });
  return targets;
}

function buildResolutionPrompt(prompt, localResolution) {
  const candidates = [
    ...localResolution.targets.map(item => `${item.code} ${item.name} confidence=${item.confidence}`),
    ...localResolution.ambiguous.flatMap(item => item.matches.map(match => `${match.code} ${match.primary_name} ambiguous_for=${item.hint}`))
  ].slice(0, 24);
  return [
    "You are resolving Taiwan listed/public company names into official company codes.",
    "Prefer local dictionary candidates when they clearly match.",
    "If ambiguous, keep multiple candidates and mark requiresUserConfirmation true.",
    "Return JSON only. No markdown.",
    "Schema: { targets:[{code:string,name:string}], yearStart:number, yearEnd:number, saveHtml:boolean, exportFormats:string[], requiresUserConfirmation:boolean, notes:string[] }.",
    `Local candidates:\n${candidates.join("\n") || "none"}`,
    `User request:\n${prompt}`
  ].join("\n\n");
}

function parseYears(prompt) {
  const text = String(prompt || "");
  const years = Array.from(text.matchAll(/(?:民國)?\s*(\d{2,3})\s*(?:年)?/g))
    .map(match => Number(match[1]))
    .filter(year => year >= 1 && year <= 199);
  let yearStart = Number($("yearStart").value || 110);
  let yearEnd = Number($("yearEnd").value || 114);
  if (years.length >= 2) {
    yearStart = Math.min(years[0], years[1]);
    yearEnd = Math.max(years[0], years[1]);
  } else if (years.length === 1) {
    yearStart = years[0];
    yearEnd = years[0];
  }
  return { yearStart, yearEnd };
}

function parseOptions(prompt) {
  const text = String(prompt || "");
  const saveHtml = /保存|保留|html|原始/i.test(text);
  const exportFormats = [];
  if (/csv/i.test(text) || /下載|匯出/.test(text)) exportFormats.push("csv");
  if (/json/i.test(text)) exportFormats.push("json");
  if (exportFormats.length === 0) exportFormats.push("csv");
  return { saveHtml, exportFormats };
}

function buildOperationPlan(input) {
  const yearStart = Number(input.yearStart || 110);
  const yearEnd = Number(input.yearEnd || 114);
  const normalizedStart = Math.min(yearStart, yearEnd);
  const normalizedEnd = Math.max(yearStart, yearEnd);
  const targets = Array.isArray(input.targets) && input.targets.length
    ? input.targets.map(item => ({
      code: String(item.code || item.companyCode || "").trim(),
      name: item.name || item.companyName || "",
      confidence: item.confidence || "medium",
      source: item.source || "manual"
    })).filter(item => item.code)
    : [{ code: String(input.companyCode || "2330"), name: input.companyName || "", confidence: "manual", source: "manual" }];
  const automationMode = input.automationMode || "page_bound_browser";
  return {
    source: "dual_site_captured",
    companyCode: targets[0] ? targets[0].code : "2330",
    targets,
    yearStart: normalizedStart,
    yearEnd: normalizedEnd,
    saveHtml: Boolean(input.saveHtml),
    exportFormats: Array.isArray(input.exportFormats) && input.exportFormats.length ? input.exportFormats : ["csv"],
    entryUrl: input.entryUrl || getCrawlerUrl(),
    automationMode,
    humanPacedDelayMs: input.humanPacedDelayMs || 900,
    openStrategy: input.openStrategy || "current_or_bound_window",
    forceFreshWindow: Boolean(input.forceFreshWindow),
    estimatedQueries: targets.length * (normalizedEnd - normalizedStart + 1),
    requiresConfirmation: true,
    autoRunDemo: Boolean(input.autoRunDemo),
    blockedReason: input.blockedReason || "",
    actions: ["bind_target_page", "query_years", "parse_table", "show_results"]
  };
}

function parseChromeOnlyPrompt(prompt) {
  const resolution = resolveCompanyTargets(prompt);
  lastResolution = resolution;
  return buildOperationPlan({
    ...parseYears(prompt),
    ...parseOptions(prompt),
    targets: resolution.targets,
    automationMode: getAutomationMode(),
    blockedReason: resolution.needsWebVerification ? "有公司名稱需要確認或網路驗證" : ""
  });
}

async function applyDataFlowDemoPreset() {
  $("aiPrompt").value = "高效資料流：查 2330 台積電 113 到 115 年重大訊息，完成後下載 CSV";
  await loadCompanyDictionary();
  lastResolution = resolveCompanyTargets($("aiPrompt").value, [{ code: "2330", name: "台積電" }]);
  await runDemoPlan(buildOperationPlan({
    targets: lastResolution.targets,
    yearStart: 113,
    yearEnd: 115,
    saveHtml: false,
    exportFormats: ["csv"],
    entryUrl: DEFAULT_CRAWLER_URL,
    automationMode: "page_bound_browser",
    humanPacedDelayMs: 350,
    openStrategy: "fresh_demo_window",
    forceFreshWindow: true,
    autoRunDemo: true
  }));
}

async function applyHumanPacedDemoPreset() {
  $("aiPrompt").value = "人類節奏展示：查 2330 台積電 115 年重大訊息，放慢節奏呈現 AI 操作過程";
  await loadCompanyDictionary();
  lastResolution = resolveCompanyTargets($("aiPrompt").value, [{ code: "2330", name: "台積電" }]);
  await runDemoPlan(buildOperationPlan({
    targets: lastResolution.targets,
    yearStart: 115,
    yearEnd: 115,
    saveHtml: false,
    exportFormats: ["csv"],
    entryUrl: DEFAULT_CRAWLER_URL,
    automationMode: "page_bound_browser",
    humanPacedDelayMs: 900,
    openStrategy: "fresh_demo_window",
    forceFreshWindow: true,
    autoRunDemo: true
  }));
}

function setDemoButtonsDisabled(disabled) {
  $("dataFlowDemoBtn").disabled = disabled;
  $("humanPacedDemoBtn").disabled = disabled;
}

async function runDemoPlan(plan) {
  try {
    setDemoButtonsDisabled(true);
    renderPlan(plan);
    $("logBox").innerHTML += `<div>[demo] 展示模式：開新視窗並執行自動化流程</div>`;
    const response = await sendMessage({ type: "CONFIRM_RUN", plan: { ...plan, keepOriginalHtml: plan.saveHtml } });
    if (response && response.state) renderState(response.state);
  } finally {
    setDemoButtonsDisabled(false);
  }
}

function extractJsonObject(text) {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Gemini 回應沒有 JSON 物件");
  return JSON.parse(raw.slice(start, end + 1));
}

async function callGeminiForPlan(prompt) {
  const apiKey = $("apiKey").value.trim();
  if (!apiKey) throw new Error("請先輸入 Gemini API Key");
  const modelId = $("geminiModel").value;
  const localResolution = resolveCompanyTargets(prompt);
  const instruction = buildResolutionPrompt(prompt, localResolution);
  const body = {
    contents: [{ role: "user", parts: [{ text: instruction }] }],
    generationConfig: { temperature: 0.1 }
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error && payload.error.message ? payload.error.message : `Gemini HTTP ${response.status}`);
  }
  const outputText = (((payload.candidates || [])[0] || {}).content || {}).parts?.map(part => part.text || "").join("") || "";
  const parsed = extractJsonObject(outputText);
  const geminiTargets = normalizeTargetsFromGemini(parsed);
  const mergedResolution = resolveCompanyTargets(prompt, geminiTargets);
  mergedResolution.method = localResolution.needsWebVerification ? "local_dictionary_plus_gemini" : "local_dictionary_verified_by_gemini";
  lastResolution = mergedResolution;
  const usage = payload.usageMetadata || {};
  const inputTokens = usage.promptTokenCount || estimateTokens(instruction);
  const outputTokens = usage.candidatesTokenCount || estimateTokens(outputText);
  lastUsage = estimateCost({
    modelId,
    inputTokens,
    outputTokens,
    exchangeRate: $("exchangeRate").value
  });
  return buildOperationPlan({
    ...parseYears(prompt),
    ...parseOptions(prompt),
    ...parsed,
    targets: mergedResolution.targets,
    automationMode: getAutomationMode(),
    blockedReason: mergedResolution.needsWebVerification ? "AI 已輔助解析，但仍有候選需要人工確認" : ""
  });
}

function renderResolution(resolution = lastResolution) {
  const targetCount = resolution.targets ? resolution.targets.length : 0;
  const ambiguousCount = resolution.ambiguous ? resolution.ambiguous.length : 0;
  const unresolvedCount = resolution.unresolved ? resolution.unresolved.length : 0;
  $("resolutionPreview").textContent = [
    `方法：${resolution.method || "尚未開始"}`,
    `已選目標：${targetCount}`,
    `模糊候選：${ambiguousCount}`,
    `未解析：${unresolvedCount}`
  ].join("｜");
  const targetHtml = (resolution.targets || []).map(item => `
    <div class="target">
      <strong>${escapeHtml(item.code)} ${escapeHtml(item.name || "")}</strong>
      <span class="meta">來源：${escapeHtml(item.source || "")}｜信心：${escapeHtml(item.confidence || "")}｜證據數：${escapeHtml(item.evidenceCount || "")}</span>
    </div>
  `).join("");
  const ambiguousHtml = (resolution.ambiguous || []).map(item => `
    <div class="target warn">
      <strong>${escapeHtml(item.hint)} 需要確認</strong>
      <span class="meta">${escapeHtml(item.matches.map(match => `${match.code} ${match.primary_name}`).join(" / "))}</span>
    </div>
  `).join("");
  const unresolvedHtml = (resolution.unresolved || []).map(item => `
    <div class="target warn">
      <strong>${escapeHtml(item)} 未解析</strong>
      <span class="meta">可切換 Gemini API 輔助確認，或直接於下方輸入公司代號。</span>
    </div>
  `).join("");
  $("targetList").innerHTML = targetHtml + ambiguousHtml + unresolvedHtml;
}

function renderPlan(plan) {
  currentPlan = plan;
  $("planPreview").textContent = JSON.stringify(plan || { status: "尚未解析" }, null, 2);
  const canRun = Boolean(plan && plan.targets && plan.targets.length && !(lastResolution.ambiguous || []).length && !(lastResolution.unresolved || []).length);
  $("confirmRunBtn").disabled = !canRun;
  if (plan) {
    $("companyCode").value = plan.companyCode;
    $("yearStart").value = plan.yearStart;
    $("yearEnd").value = plan.yearEnd;
    $("saveHtml").value = String(Boolean(plan.saveHtml));
  }
  renderResolution();
}

function renderCost(cost = lastUsage) {
  $("costModel").textContent = cost.model;
  $("inputTokens").textContent = String(cost.inputTokens || 0);
  $("outputTokens").textContent = String(cost.outputTokens || 0);
  $("costUsd").textContent = `$${Number(cost.usd || 0).toFixed(6)}`;
  $("costTwd").textContent = `NT$${Number(cost.twd || 0).toFixed(2)}`;
}

function renderState(state) {
  currentState = state || currentState;
  $("boundStatus").textContent = currentState.boundTabId ? `已監控 Tab ${currentState.boundTabId}` : "尚未綁定";
  $("boundUrl").textContent = currentState.boundUrl ? `目前網址: ${currentState.boundUrl}` : "目前網址: 尚未監控";
  
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
  } else {
    const hasTargets = currentPlan && currentPlan.targets && currentPlan.targets.length;
    $("confirmRunBtn").disabled = !hasTargets;
    $("stopCrawlBtn").disabled = true;
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

async function parsePrompt() {
  try {
    await loadCompanyDictionary();
    const prompt = $("aiPrompt").value;
    if (getAiMode() === "gemini") {
      const plan = await callGeminiForPlan(prompt);
      renderPlan(plan);
      renderCost(lastUsage);
    } else {
      const plan = parseChromeOnlyPrompt(prompt);
      renderPlan(plan);
      lastUsage = estimateCost({ modelId: "chrome", inputTokens: 0, outputTokens: 0, exchangeRate: $("exchangeRate").value });
      renderCost(lastUsage);
    }
  } catch (error) {
    lastResolution = { targets: [], ambiguous: [], unresolved: [], method: "error" };
    renderPlan({ error: String(error && error.message ? error.message : error), requiresConfirmation: false });
    $("confirmRunBtn").disabled = true;
  }
}

async function confirmRun() {
  const plan = buildOperationPlan({
    ...(currentPlan || {}),
    targets: currentPlan && currentPlan.targets && currentPlan.targets.length
      ? currentPlan.targets
      : [{ code: $("companyCode").value, name: "" }],
    yearStart: $("yearStart").value,
    yearEnd: $("yearEnd").value,
    saveHtml: $("saveHtml").value === "true",
    entryUrl: getCrawlerUrl(),
    automationMode: getAutomationMode()
  });
  renderPlan(plan);
  const response = await sendMessage({ type: "CONFIRM_RUN", plan: { ...plan, keepOriginalHtml: plan.saveHtml } });
  if (response && response.state) renderState(response.state);
}

async function stopCrawl() {
  const response = await sendMessage({ type: "STOP_CRAWL" });
  if (response && response.state) renderState(response.state);
}

async function saveKey() {
  if (globalThis.chrome && chrome.storage) await chrome.storage.local.set({ geminiApiKey: $("apiKey").value.trim() });
}

async function clearKey() {
  $("apiKey").value = "";
  if (globalThis.chrome && chrome.storage) await chrome.storage.local.remove(["geminiApiKey"]);
}

async function testGemini() {
  const originalPrompt = $("aiPrompt").value;
  $("aiPrompt").value = "查 2330 114 年重大訊息";
  await parsePrompt();
  $("aiPrompt").value = originalPrompt;
}

async function clearAll() {
  await clearKey();
  lastResolution = { targets: [], ambiguous: [], unresolved: [], method: "not_started" };
  renderPlan(null);
  renderCost(estimateCost({ modelId: "chrome", inputTokens: 0, outputTokens: 0, exchangeRate: $("exchangeRate").value }));
  const response = await sendMessage({ type: CLEAR_ALL });
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

function bindEvents() {
  $("openBindBtn").addEventListener("click", async () => {
    const response = await sendMessage({ type: "OPEN_BIND", options: { entryUrl: getCrawlerUrl() } });
    if (response && response.state) renderState(response.state);
  });
  $("bindActiveBtn").addEventListener("click", async () => {
    const response = await sendMessage({ type: "BIND_ACTIVE" });
    if (response && response.state) renderState(response.state);
  });
  $("saveKeyBtn").addEventListener("click", saveKey);
  $("copyCrawlerUrlBtn").addEventListener("click", () => copyText(DEFAULT_CRAWLER_URL, "copyCrawlerUrlBtn"));
  $("copyTestSiteUrlBtn").addEventListener("click", () => copyText(TEST_SITE_URL, "copyTestSiteUrlBtn"));
  $("testGeminiBtn").addEventListener("click", testGemini);
  $("clearKeyBtn").addEventListener("click", clearKey);
  $("dataFlowDemoBtn").addEventListener("click", applyDataFlowDemoPreset);
  $("humanPacedDemoBtn").addEventListener("click", applyHumanPacedDemoPreset);
  $("parseBtn").addEventListener("click", parsePrompt);
  $("clearPromptBtn").addEventListener("click", () => { $("aiPrompt").value = ""; });
  $("confirmRunBtn").addEventListener("click", confirmRun);
  $("stopCrawlBtn").addEventListener("click", stopCrawl);
  $("cancelPlanBtn").addEventListener("click", () => renderPlan(null));
  $("csvBtn").addEventListener("click", () => sendMessage({ type: "DOWNLOAD", kind: "csv" }));
  $("jsonBtn").addEventListener("click", () => sendMessage({ type: "DOWNLOAD", kind: "json" }));
  $("clearResultsBtn").addEventListener("click", async () => {
    const response = await sendMessage({ type: "CLEAR_RESULTS" });
    if (response && response.state) renderState(response.state);
  });
  $("clearAllBtn").addEventListener("click", clearAll);
  $("filterBox").addEventListener("input", () => renderState(currentState));
  $("exchangeRate").addEventListener("input", () => renderCost(estimateCost({
    modelId: getAiMode() === "gemini" ? $("geminiModel").value : "chrome",
    inputTokens: lastUsage.inputTokens,
    outputTokens: lastUsage.outputTokens,
    exchangeRate: $("exchangeRate").value
  })));
}

async function init() {
  bindEvents();
  renderPlan(null);
  renderCost();
  try {
    await loadCompanyDictionary();
    $("resolutionPreview").textContent = `字典已載入：${companyDictionary.length} 筆公司`;
  } catch (error) {
    $("resolutionPreview").textContent = `字典載入失敗：${error.message}`;
  }
  if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === "STATE_UPDATE") renderState(message.state);
    });
  }
  if (globalThis.chrome && chrome.storage) {
    chrome.storage.local.get(["geminiApiKey"]).then(items => {
      if (items.geminiApiKey) $("apiKey").value = items.geminiApiKey;
    });
  }
  sendMessage({ type: "GET_STATE" }).then(response => renderState(response && response.state));
}

init();
