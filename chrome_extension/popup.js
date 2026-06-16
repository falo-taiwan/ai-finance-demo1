const el = id => document.getElementById(id);

let currentState = {
  running: false,
  results: [],
  yearly: [],
  logs: [],
  errors: []
};

function optionsFromUi() {
  return {
    companyCode: el("companyCode").value.trim() || "2330",
    yearStart: el("yearStart").value.trim() || "110",
    yearEnd: el("yearEnd").value.trim() || "114",
    delayMs: Number(el("delayMs").value || 350),
    fetchOriginals: el("fetchOriginals").checked,
    keepOriginalHtml: el("keepOriginalHtml").checked,
    visualReplay: el("visualReplay").checked
  };
}

function sendMessage(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(state) {
  currentState = state || currentState;
  el("statusText").textContent = currentState.running ? "執行中" : "待命";
  el("boundText").textContent = currentState.boundTabId
    ? `Tab ${currentState.boundTabId}｜${currentState.boundUrl || ""}`
    : "尚未監控";
  el("runBtn").disabled = currentState.running;
  
  renderYearly(currentState.yearly);
  renderRecords(currentState.results);
  renderLogs(currentState.logs);
}

function renderYearly(yearly) {
  el("yearBody").innerHTML = yearly.map(item => `
    <tr>
      <td>${escapeHtml(item.year)}</td>
      <td>${escapeHtml(item.rows || 0)}</td>
      <td>${escapeHtml(item.status || "")}</td>
      <td>${escapeHtml(item.elapsedMs || "")}</td>
      <td class="${item.capped ? "warn" : ""}">${item.capped ? "是" : "否"}</td>
    </tr>
  `).join("");
}

function renderRecords(records) {
  const query = el("filterBox").value.trim().toLowerCase();
  const filtered = records.filter(row => {
    if (!query) return true;
    return [
      row.announceDate,
      row.announceTime,
      row.companyCode,
      row.companyName,
      row.subject,
      row.reason,
      row.changeType,
      row.rawText
    ].join(" ").toLowerCase().includes(query);
  });
  
  el("totalRows").textContent = filtered.length;
  el("doneYears").textContent = currentState.yearly.length;
  el("errorCount").textContent = currentState.errors.length;
  
  el("csvBtn").disabled = filtered.length === 0;
  el("jsonBtn").disabled = filtered.length === 0;

  el("recordBody").innerHTML = filtered.map(row => {
    const originalStatus = row.original ? row.original.status : "";
    const originalClass = originalStatus && String(originalStatus) !== "200" ? "bad" : "";
    const displaySubject = row.subject || row.reason || row.changeType || "";
    return `
      <tr>
        <td>${escapeHtml(row.queryYear)}</td>
        <td>${escapeHtml(row.announceDate)}</td>
        <td>${escapeHtml(row.announceTime)}</td>
        <td>${escapeHtml(row.companyCode)}</td>
        <td>${escapeHtml(row.companyName)}</td>
        <td class="reason">${escapeHtml(displaySubject)}</td>
        <td class="${originalClass}">${escapeHtml(originalStatus || "未留")}</td>
      </tr>
    `;
  }).join("");
}

function renderLogs(logs) {
  el("logBox").innerHTML = logs.slice(-120).map(item => {
    const time = item.ts ? item.ts.slice(11, 19) : "";
    return `<div>[${escapeHtml(time)}] ${escapeHtml(item.message)}</div>`;
  }).join("");
  el("logBox").scrollTop = el("logBox").scrollHeight;
}

async function runQuery() {
  render({ ...currentState, running: true, logs: [{ ts: new Date().toISOString(), message: "送出查詢任務" }], results: [], yearly: [], errors: [] });
  const response = await sendMessage({ type: "QUERY_YEARS", options: optionsFromUi() });
  if (!response || !response.ok) {
    render({
      ...currentState,
      running: false,
      errors: [{ error: response && response.error ? response.error : "unknown error" }],
      logs: [...currentState.logs, { ts: new Date().toISOString(), message: `失敗：${response && response.error ? response.error : "unknown error"}` }]
    });
    return;
  }
  render(response.state);
}

async function openAndBind() {
  const response = await sendMessage({ type: "OPEN_BIND", options: optionsFromUi() });
  if (response && response.state) render(response.state);
}

async function bindActive() {
  const response = await sendMessage({ type: "BIND_ACTIVE" });
  if (response && response.state) render(response.state);
}

async function download(kind) {
  await sendMessage({ type: "DOWNLOAD", kind });
}

if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === "STATE_UPDATE") render(message.state);
  });
}

el("runBtn").addEventListener("click", runQuery);
el("openBindBtn").addEventListener("click", openAndBind);
el("bindActiveBtn").addEventListener("click", bindActive);
el("csvBtn").addEventListener("click", () => download("csv"));
el("jsonBtn").addEventListener("click", () => download("json"));
el("filterBox").addEventListener("input", () => renderRecords(currentState.results));

sendMessage({ type: "GET_STATE" }).then(response => render(response && response.state));
