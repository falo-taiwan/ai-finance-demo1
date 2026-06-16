// app.js - Crawler Comparison Dashboard Interactivity (v2.0)

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initCharts();
  initDatasetViewer();
  console.log("Falo x Force Cheng Crawler Comparison Dashboard v2.0 initialized.");
});

/* Tab Switching */
function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      // Remove active from all tabs
      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));

      // Set active
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.getElementById(`tab-${target}`).classList.add("active");

      // Lazy load dataset if switching to master dataset tab
      if (target === "master-dataset") {
        loadMasterDataset();
      }
    });
  });
}

/* Chart Initialization */
function initCharts() {
  // Chart 1: Scraping Efficiency (Records per HTTP request)
  const ctx1 = document.getElementById("efficiencyChart").getContext("2d");
  new Chart(ctx1, {
    type: "bar",
    data: {
      labels: ["ChatGPT Pro", "Claude Max5", "Gemini (Antigravity)"],
      datasets: [
        {
          label: "抓取效率 (每請求抓取唯一筆數)",
          data: [30.8, 15.6, 29.9],
          backgroundColor: [
            "rgba(59, 130, 246, 0.65)",  // ChatGPT Blue
            "rgba(168, 85, 247, 0.65)", // Claude Purple
            "rgba(16, 185, 129, 0.65)"  // Gemini Green
          ],
          borderColor: [
            "rgba(59, 130, 246, 1)",
            "rgba(168, 85, 247, 1)",
            "rgba(16, 185, 129, 1)"
          ],
          borderWidth: 1.5,
          borderRadius: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#e2e8f0", font: { family: "Inter" } }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8" }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8" },
          title: {
            display: true,
            text: "唯一紀錄筆數 / 請求次數",
            color: "#94a3b8"
          }
        }
      }
    }
  });

  // Chart 2: Requests count & Elapsed Duration (Double Bar Chart)
  const ctx2 = document.getElementById("requestsChart").getContext("2d");
  new Chart(ctx2, {
    type: "bar",
    data: {
      labels: ["ChatGPT Pro", "Claude Max5", "Gemini (Antigravity)"],
      datasets: [
        {
          label: "總 HTTP 請求次數",
          data: [357, 704, 368],
          backgroundColor: "rgba(245, 158, 11, 0.6)", // Combined Amber
          borderColor: "rgba(245, 158, 11, 1)",
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: "y"
        },
        {
          label: "總執行耗時 (秒)",
          data: [500.0, 183.6, 455.0],
          backgroundColor: "rgba(96, 165, 250, 0.6)", // Blue Accent
          borderColor: "rgba(96, 165, 250, 1)",
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#e2e8f0", font: { family: "Inter" } }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8" }
        },
        y: {
          position: "left",
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8" },
          title: {
            display: true,
            text: "請求次數 (次)",
            color: "#94a3b8"
          }
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { color: "#94a3b8" },
          title: {
            display: true,
            text: "執行秒數 (秒)",
            color: "#94a3b8"
          }
        }
      }
    }
  });
}

/* Dataset Viewer (Tab 3) Logic */
let masterRecords = [];
let datasetLoaded = false;

function loadMasterDataset() {
  if (datasetLoaded) return;
  
  const tbody = document.getElementById("datasetTbody");
  
  fetch("reports/combined_tracker_full.json")
    .then(res => {
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json();
    })
    .then(data => {
      masterRecords = data;
      datasetLoaded = true;
      renderTable(masterRecords);
    })
    .catch(err => {
      console.error("Failed to load master dataset:", err);
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; color: #ef4444; padding: 30px;">
            ⚠️ 無法載入整合資料集。請確保 reports/combined_tracker_full.json 存在於伺服器。
          </td>
        </tr>
      `;
    });
}

function renderTable(records) {
  const tbody = document.getElementById("datasetTbody");
  const filteredCount = document.getElementById("filteredCount");
  
  filteredCount.innerText = records.length;
  
  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; color: #64748b; padding: 30px;">
          📭 沒有找到符合條件的公告記錄
        </td>
      </tr>
    `;
    return;
  }

  // Display only first 100 records for performance
  const displayLimit = 100;
  const itemsToRender = records.slice(0, displayLimit);
  
  let html = "";
  itemsToRender.forEach(r => {
    html += `
      <tr>
        <td><span class="market-badge ${getMarketClass(r['市場'])}">${r['市場']}</span></td>
        <td><code>${escapeHtml(r['代號'])}</code></td>
        <td><strong>${escapeHtml(r['公司簡稱'])}</strong></td>
        <td>${escapeHtml(r['公告日期'])}</td>
        <td>${escapeHtml(r['異動情形'])}</td>
        <td>${escapeHtml(r['新任者'])}</td>
        <td>${escapeHtml(r['舊任者'])}</td>
        <td>${escapeHtml(r['生效日期'])}</td>
        <td class="reason-td">${escapeHtml(r['異動原因'])}</td>
      </tr>
    `;
  });
  
  if (records.length > displayLimit) {
    html += `
      <tr>
        <td colspan="9" style="text-align:center; color: #94a3b8; font-style: italic; background: rgba(255,255,255,0.01);">
          (還有 ${records.length - displayLimit} 筆公告，請使用上方搜尋框過濾以縮小範圍)
        </td>
      </tr>
    `;
  }
  
  tbody.innerHTML = html;
}

function initDatasetViewer() {
  const mopsMarket = document.getElementById("mopsMarket");
  const mopsYear = document.getElementById("mopsYear");
  const mopsMonth = document.getElementById("mopsMonth");
  const mopsCompany = document.getElementById("mopsCompany");
  const mopsName = document.getElementById("mopsName");
  
  const mopsSearchBtn = document.getElementById("mopsSearchBtn");
  const mopsResetBtn = document.getElementById("mopsResetBtn");

  const performFilter = () => {
    if (!datasetLoaded) return;
    
    const market = mopsMarket.value;
    const year = mopsYear.value.trim();
    const month = mopsMonth.value;
    const company = mopsCompany.value.toLowerCase().trim();
    const name = mopsName.value.toLowerCase().trim();

    const filtered = masterRecords.filter(r => {
      // 1. Market Filter
      const matchMarket = !market || r['市場'] === market;
      
      // 2. Year Filter (Extract first part of ROC date YYY/MM/DD)
      let matchYear = true;
      if (year) {
        const dateParts = r['公告日期'].split('/');
        matchYear = dateParts.length > 0 && dateParts[0] === year;
      }

      // 3. Month Filter (Extract middle part of ROC date YYY/MM/DD)
      let matchMonth = true;
      if (month) {
        const dateParts = r['公告日期'].split('/');
        matchMonth = dateParts.length > 1 && dateParts[1] === month;
      }

      // 4. Company Code or Name Filter
      const matchCompany = !company || 
        r['代號'].includes(company) ||
        r['公司簡稱'].toLowerCase().includes(company);

      // 5. Person Name Filter
      const matchName = !name ||
        r['新任者'].toLowerCase().includes(name) ||
        r['舊任者'].toLowerCase().includes(name);

      return matchMarket && matchYear && matchMonth && matchCompany && matchName;
    });

    renderTable(filtered);
  };

  // Perform search on button click
  mopsSearchBtn.addEventListener("click", performFilter);

  // Press Enter key to search in input fields
  [mopsYear, mopsCompany, mopsName].forEach(input => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        performFilter();
      }
    });
  });

  // Real-time update for select dropdowns
  [mopsMarket, mopsMonth].forEach(select => {
    select.addEventListener("change", performFilter);
  });

  // Reset fields and search
  mopsResetBtn.addEventListener("click", () => {
    mopsMarket.value = "";
    mopsYear.value = "";
    mopsMonth.value = "";
    mopsCompany.value = "";
    mopsName.value = "";
    performFilter();
  });
}

/* Helper Utilities */
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getMarketClass(market) {
  switch (market) {
    case "上市": return "badge-l";
    case "上櫃": return "badge-o";
    case "興櫃": return "badge-r";
    case "公開發行": return "badge-c";
    default: return "";
  }
}

// Dynamically generate styles for badges in Javascript to ensure proper colors
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  .market-badge {
    padding: 3px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
  }
  .badge-l { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
  .badge-o { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
  .badge-r { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
  .badge-c { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
  .reason-td {
    color: var(--text-secondary);
    max-width: 250px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .reason-td:hover {
    white-space: normal;
    word-break: break-all;
  }
`;
document.head.appendChild(styleSheet);
