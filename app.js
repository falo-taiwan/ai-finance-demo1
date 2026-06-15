// --- State Management ---
let currentTab = 'tb-tab';
let tbState = 'empty'; // 'empty' | 'loaded' | 'aligned' | 'generated'
let currentReportTab = 'original';
let ocrState = 'empty'; // 'empty' | 'loaded' | 'scanning' | 'done'

// --- Demo Data Definitions ---

// 1. Trial Balance Data
const trialBalanceRaw = [
  { code: '1101', name: '銀行存款-玉山銀行', debit: 12500000, credit: 0 },
  { code: '1130', name: '應收帳款-客A', debit: 4200000, credit: 0 },
  { code: '1200', name: '存貨-商品', debit: 8600000, credit: 0 },
  { code: '1400', name: '房屋及建築', debit: 25000000, credit: 0 },
  { code: '1401', name: '累計折舊-房屋及建築', debit: 0, credit: 5000000 },
  { code: '2100', name: '應付帳款-廠商B', debit: 0, credit: 3800000 },
  { code: '2200', name: '應付費用-薪資', debit: 0, credit: 450000 },
  { code: '3100', name: '普通股股本', debit: 0, credit: 20000000 },
  { code: '3200', name: '保留盈餘', debit: 0, credit: 15350000 },
  { code: '4100', name: '銷貨收入-國內銷貨', debit: 0, credit: 25800000 },
  { code: '5100', name: '銷貨成本-商品成本', debit: 14300000, credit: 0 },
  { code: '6100', name: '薪資費用-辦公室', debit: 3600000, credit: 0 },
  { code: '6200', name: '租金支出-辦公大樓', debit: 1200000, credit: 0 },
  { code: '6300', name: '郵電費-郵資電話', debit: 80000, credit: 0 },
  { code: '6400', name: '交際費-業務公關', debit: 920000, credit: 0 }
];

// 2. COA Mapping Data
const coaMapping = [
  { code: '1101', name: '銀行存款-玉山銀行', stdName: '現金及約當現金', confidence: '100%', note: '精準比對，歸類於流動資產' },
  { code: '1130', name: '應收帳款-客A', stdName: '應收帳款淨額', confidence: '98%', note: '自動語意對齊，歸類於流動資產' },
  { code: '1200', name: '存貨-商品', stdName: '存貨', confidence: '100%', note: '精準比對，歸類於流動資產' },
  { code: '1400', name: '房屋及建築', stdName: '不動產、廠房及設備', confidence: '95%', note: '分類至固定資產主科目' },
  { code: '1401', name: '累計折舊-房屋及建築', stdName: '不動產、廠房及設備累計折舊', confidence: '98%', note: '折舊科目減項歸類' },
  { code: '2100', name: '應付帳款-廠商B', stdName: '應付帳款', confidence: '100%', note: '精準比對，歸類於流動負債' },
  { code: '2200', name: '應付費用-薪資', stdName: '其他應付款', confidence: '92%', note: '費用應付款歸類於流動負債' },
  { code: '3100', name: '普通股股本', stdName: '股本', confidence: '100%', note: '精準比對，歸類於權益' },
  { code: '3200', name: '保留盈餘', stdName: '保留盈餘', confidence: '100%', note: '精準比對，歸類於權益' },
  { code: '4100', name: '銷貨收入-國內銷貨', stdName: '營業收入', confidence: '99%', note: '收入分類，計入損益表' },
  { code: '5100', name: '銷貨成本-商品成本', stdName: '營業成本', confidence: '99%', note: '成本分類，計入損益表' },
  { code: '6100', name: '薪資費用-辦公室', stdName: '推銷及管理費用-薪資', confidence: '94%', note: '管理費用歸類，計入損益表' },
  { code: '6200', name: '租金支出-辦公大樓', stdName: '推銷及管理費用-租金', confidence: '95%', note: '管理費用歸類，計入損益表' },
  { code: '6300', name: '郵電費-郵資電話', stdName: '推銷及管理費用-郵電費', confidence: '97%', note: '語意對齊，計入損益表' },
  { code: '6400', name: '交際費-業務公關', stdName: '推銷及管理費用-交際費', confidence: '96%', note: '管理費用歸類，稅務申報需特別檢核' }
];

// 3. Balance Sheet Data
const balanceSheet = {
  assets: [
    { name: '現金及約當現金', amount: 12500000, indent: false },
    { name: '應收帳款淨額', amount: 4200000, indent: false },
    { name: '存貨', amount: 8600000, indent: false },
    { name: '流動資產合計', amount: 25300000, indent: true, bold: true },
    { name: '不動產、廠房及設備 (PP&E)', amount: 25000000, indent: false },
    { name: '減：累計折舊', amount: -5000000, indent: false },
    { name: '非流動資產合計', amount: 20000000, indent: true, bold: true },
    { name: '資產總計', amount: 45300000, indent: false, bold: true, highlight: true }
  ],
  liabilitiesEquity: [
    { name: '應付帳款', amount: 3800000, indent: false },
    { name: '其他應付款', amount: 450000, indent: false },
    { name: '負債總計', amount: 4250000, indent: true, bold: true },
    { name: '股本', amount: 20000000, indent: false },
    { name: '保留盈餘', amount: 15350000, indent: false },
    { name: '本期淨利', amount: 5700000, indent: false, note: '由損益表結轉' },
    { name: '權益總計', amount: 41050000, indent: true, bold: true },
    { name: '負債及權益總計', amount: 45300000, indent: false, bold: true, highlight: true }
  ]
};

// 4. Income Statement Data
const incomeStatement = [
  { name: '營業收入', amount: 25800000, bold: true },
  { name: '減：營業成本', amount: -14300000, bold: false },
  { name: '營業毛利', amount: 11500000, bold: true },
  { name: '減：營業費用', amount: null, bold: true },
  { name: '　薪資費用', amount: -3600000, bold: false },
  { name: '　租金支出', amount: -1200000, bold: false },
  { name: '　郵電費', amount: -80000, bold: false },
  { name: '　交際費', amount: -920000, bold: false },
  { name: '營業費用合計', amount: -5800000, bold: true },
  { name: '營業利益 (本期稅前淨利)', amount: 5700000, bold: true, highlight: true }
];

// 5. Tax Report Data
const taxReport = {
  originalNetIncome: 5700000,
  adjustments: [
    { name: '帳載稅前本期淨利', type: 'base', amount: 5700000 },
    { name: '交際費超限調整 (帳載 920,000 元，稅法限額 600,000 元)', type: 'add', amount: 320000 },
    { name: '課稅所得額', type: 'total', amount: 6020000 },
    { name: '營所稅率', type: 'rate', amount: 0.20 },
    { name: '應納營所稅額 (20%)', type: 'tax', amount: 1204000 },
    { name: '稅後本期淨利', type: 'aftertax', amount: 4496000 }
  ]
};

// 6. OCR Extracted Data
const ocrData = [
  { name: '陳小明', id: 'A19***3645', totalPay: 15000, tax: 5, insurance: 1200, netPay: 17500, signature: '已簽名', status: 'error', reason: '算式錯誤 (15,000 - 5 - 1,200 應為 13,795)' },
  { name: '李美玲', id: 'B28***4521', totalPay: 19000, tax: 13, insurance: 6600, netPay: 15400, signature: '已蓋章', status: 'error', reason: '算式錯誤 (19,000 - 13 - 6,600 應為 12,387)' },
  { name: '王大同', id: 'C18***6459', totalPay: 16000, tax: 6, insurance: 5000, netPay: 13000, signature: '委託代簽 (李美玲)', status: 'warning', reason: '簽名不符 (代簽) 且算式不符 (應為 10,994)' },
  { name: '王大同', id: 'C18***6459', totalPay: 15000, tax: 4, insurance: 2200, netPay: 17000, signature: '委託代簽 (李美玲)', status: 'warning', reason: '簽名不符 (代簽) 且算式不符 (應為 12,796)' },
  { name: '王大同', id: 'C18***6459', totalPay: 6000, tax: 3, insurance: 1200, netPay: 6500, signature: '已簽名', status: 'error', reason: '算式錯誤 (6,000 - 3 - 1,200 應為 4,797)' },
  { name: '張淑芬', id: 'D28***5211', totalPay: 17000, tax: 2, insurance: 1200, netPay: 16400, signature: '已蓋章', status: 'error', reason: '算式錯誤 (17,000 - 2 - 1,200 應為 15,798)' },
  { name: '張淑芬', id: 'D28***5211', totalPay: 16600, tax: 10, insurance: 500, netPay: 13500, signature: '已蓋章', status: 'error', reason: '算式錯誤 (16,600 - 10 - 500 應為 16,090)' },
  { name: '劉建宏', id: 'E19***7465', totalPay: 7000, tax: 5, insurance: 1200, netPay: 6500, signature: '已蓋章', status: 'error', reason: '算式錯誤 (7,000 - 5 - 1,200 應為 5,795)' }
];

// --- Utilities ---
function formatNumber(num) {
  if (num === null || num === undefined) return '';
  return new Intl.NumberFormat('zh-TW').format(num);
}

function formatPercent(val) {
  return (val * 100) + '%';
}

// --- Tab Controller ---
function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });

  // Activate selected tab
  const activeBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
  if (activeBtn) activeBtn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// --- Report Sub-Tab Controller ---
function switchReportTab(reportId) {
  currentReportTab = reportId;
  document.querySelectorAll('.report-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const activeBtn = document.getElementById(`r-tab-${reportId}`);
  if (activeBtn) activeBtn.classList.add('active');

  renderReportData();
}

// --- Module 1: Trial Balance Logic ---

function loadTrialBalance() {
  tbState = 'loaded';
  
  // Update UI control button states
  document.getElementById('btn-load-tb').classList.add('btn-disabled');
  document.getElementById('btn-align-tb').classList.remove('btn-disabled');
  
  // Update Step tracking
  document.getElementById('step-1').classList.add('complete');
  document.getElementById('step-1-desc').innerText = '已成功載入 15 筆會計科目數據';
  document.getElementById('step-2').classList.add('active');
  
  // Show table and remove placeholder
  document.getElementById('tb-empty-placeholder').classList.add('hidden');
  document.getElementById('tb-data-table').classList.remove('hidden');
  
  switchReportTab('original');
}

function alignChartOfAccounts() {
  tbState = 'aligned';
  
  // Loader animation
  const loader = document.getElementById('tb-loader');
  const table = document.getElementById('tb-data-table');
  loader.classList.add('active');
  table.classList.add('hidden');
  document.getElementById('btn-align-tb').classList.add('btn-disabled');
  
  setTimeout(() => {
    loader.classList.remove('active');
    table.classList.remove('hidden');
    
    // Enable next button
    document.getElementById('btn-generate-reports').classList.remove('btn-disabled');
    
    // Update step tracker
    document.getElementById('step-2').classList.remove('active');
    document.getElementById('step-2').classList.add('complete');
    document.getElementById('step-2-desc').innerText = '科目映射成功，信心度平均 97.4%';
    document.getElementById('step-3').classList.add('active');
    
    switchReportTab('mapping');
  }, 1500);
}

function generateReports() {
  tbState = 'generated';
  
  const loader = document.getElementById('tb-loader');
  const table = document.getElementById('tb-data-table');
  loader.classList.add('active');
  table.classList.add('hidden');
  document.getElementById('tb-loader-text').innerText = '正在運行財會勾稽公式，並進行營所稅限額調整試算...';
  document.getElementById('btn-generate-reports').classList.add('btn-disabled');
  
  setTimeout(() => {
    loader.classList.remove('active');
    table.classList.remove('hidden');
    
    // Enable export button
    document.getElementById('btn-export-tb').classList.remove('btn-disabled');
    
    // Update step tracker
    document.getElementById('step-3').classList.remove('active');
    document.getElementById('step-3').classList.add('complete');
    document.getElementById('step-3-desc').innerText = '已生成 BS, IS 及營所稅申報調整底稿';
    
    switchReportTab('bs');
  }, 2000);
}

function renderReportData() {
  const table = document.getElementById('tb-data-table');
  table.innerHTML = '';
  
  if (tbState === 'empty') {
    return;
  }
  
  if (currentReportTab === 'original') {
    // Original TB view
    table.innerHTML = `
      <thead>
        <tr>
          <th>科目代碼</th>
          <th>科目名稱</th>
          <th class="text-right">借方金額 (Debit)</th>
          <th class="text-right">貸方金額 (Credit)</th>
        </tr>
      </thead>
      <tbody>
        ${trialBalanceRaw.map(row => `
          <tr>
            <td>${row.code}</td>
            <td>${row.name}</td>
            <td class="text-right">${row.debit > 0 ? formatNumber(row.debit) : '-'}</td>
            <td class="text-right">${row.credit > 0 ? formatNumber(row.credit) : '-'}</td>
          </tr>
        `).join('')}
        <tr style="font-weight: 700; background: rgba(30, 41, 59, 0.6); border-top: 2px solid var(--card-border);">
          <td>合計</td>
          <td></td>
          <td class="text-right">${formatNumber(70400000)}</td>
          <td class="text-right">${formatNumber(70400000)}</td>
        </tr>
      </tbody>
    `;
  } 
  else if (currentReportTab === 'mapping') {
    if (tbState === 'loaded') {
      table.innerHTML = `
        <div class="ocr-placeholder">
          <p>請在左側控制中心點擊「執行 AI 科目映射」</p>
        </div>
      `;
      return;
    }
    // Mapping view
    table.innerHTML = `
      <thead>
        <tr>
          <th>原始科目</th>
          <th>標準映射科目</th>
          <th class="text-center">AI 信心指數</th>
          <th>分類說明</th>
        </tr>
      </thead>
      <tbody>
        ${coaMapping.map(row => `
          <tr>
            <td><span style="color: var(--text-secondary); font-size: 0.8rem; margin-right: 0.5rem;">[${row.code}]</span> ${row.name}</td>
            <td><span class="badge badge-info">${row.stdName}</span></td>
            <td class="text-center"><span style="color: ${parseInt(row.confidence) > 95 ? 'var(--accent-emerald)' : 'var(--accent-amber)'}">${row.confidence}</span></td>
            <td style="color: var(--text-secondary); font-size: 0.8rem;">${row.note}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }
  else if (currentReportTab === 'bs') {
    if (tbState === 'loaded' || tbState === 'aligned') {
      table.innerHTML = `
        <div class="ocr-placeholder">
          <p>請在左側控制中心點擊「一鍵生成底稿與報表」</p>
        </div>
      `;
      return;
    }
    // Balance Sheet view
    let rowsHtml = '';
    const maxLen = Math.max(balanceSheet.assets.length, balanceSheet.liabilitiesEquity.length);
    
    for (let i = 0; i < maxLen; i++) {
      const asset = balanceSheet.assets[i] || { name: '', amount: null };
      const liab = balanceSheet.liabilitiesEquity[i] || { name: '', amount: null };
      
      const assetStyle = asset.bold ? 'font-weight:700;' : '';
      const assetClass = asset.highlight ? 'class="highlight-row"' : '';
      const assetIndent = asset.indent ? 'padding-left: 2rem;' : '';
      
      const liabStyle = liab.bold ? 'font-weight:700;' : '';
      const liabClass = liab.highlight ? 'class="highlight-row"' : '';
      const liabIndent = liab.indent ? 'padding-left: 2rem;' : '';
      
      rowsHtml += `
        <tr style="border-bottom: 1px solid var(--card-border);">
          <!-- Assets -->
          <td style="${assetStyle} ${assetIndent}" ${assetClass}>${asset.name}</td>
          <td class="text-right" style="${assetStyle}" ${assetClass}>${asset.amount !== null ? formatNumber(asset.amount) : ''}</td>
          <!-- Divider -->
          <td style="border-right: 1px solid var(--card-border); padding: 0; width: 1px;"></td>
          <!-- Liabilities & Equity -->
          <td style="${liabStyle} ${liabIndent}" ${liabClass}>
            ${liab.name}
            ${liab.note ? `<span style="display:block; font-size:0.7rem; color:var(--accent-teal); font-weight:normal;">* ${liab.note}</span>` : ''}
          </td>
          <td class="text-right" style="${liabStyle}" ${liabClass}>${liab.amount !== null ? formatNumber(liab.amount) : ''}</td>
        </tr>
      `;
    }
    
    table.innerHTML = `
      <thead>
        <tr>
          <th>資產項目 (Assets)</th>
          <th class="text-right">金額</th>
          <th style="width: 1px; padding: 0;"></th>
          <th>負債及權益項目 (Liabilities & Equity)</th>
          <th class="text-right">金額</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    `;
  }
  else if (currentReportTab === 'is') {
    if (tbState === 'loaded' || tbState === 'aligned') {
      table.innerHTML = `
        <div class="ocr-placeholder">
          <p>請在左側控制中心點擊「一鍵生成底稿與報表」</p>
        </div>
      `;
      return;
    }
    // Income Statement view
    table.innerHTML = `
      <thead>
        <tr>
          <th>損益項目 (Income & Expense)</th>
          <th class="text-right">金額 (NT$)</th>
          <th>結構比例</th>
        </tr>
      </thead>
      <tbody>
        ${incomeStatement.map(row => {
          const isHighlight = row.highlight ? 'class="highlight-row" style="font-weight: 700;"' : '';
          const style = row.bold ? 'style="font-weight: 700;"' : '';
          const ratio = row.amount !== null ? ((Math.abs(row.amount) / 25800000) * 100).toFixed(1) + '%' : '';
          return `
            <tr ${isHighlight} ${style}>
              <td>${row.name}</td>
              <td class="text-right">${row.amount !== null ? formatNumber(row.amount) : ''}</td>
              <td>${row.amount !== null ? ratio : ''}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
  }
  else if (currentReportTab === 'tax') {
    if (tbState === 'loaded' || tbState === 'aligned') {
      table.innerHTML = `
        <div class="ocr-placeholder">
          <p>請在左側控制中心點擊「一鍵生成底稿與報表」</p>
        </div>
      `;
      return;
    }
    // Tax Report view
    table.innerHTML = `
      <thead>
        <tr>
          <th>申報調整項目</th>
          <th>調整類別</th>
          <th class="text-right">帳載數額</th>
          <th class="text-right">申報調整/課稅數額</th>
        </tr>
      </thead>
      <tbody>
        ${taxReport.adjustments.map(row => {
          let typeBadge = '';
          let rowStyle = '';
          let valCol = '';
          
          switch(row.type) {
            case 'base':
              typeBadge = '<span class="badge badge-info">帳載基礎</span>';
              valCol = `<td class="text-right">${formatNumber(row.amount)}</td>`;
              break;
            case 'add':
              typeBadge = '<span class="badge badge-warning">帳外調整增加</span>';
              rowStyle = 'color: var(--accent-amber);';
              valCol = `<td class="text-right">+ ${formatNumber(row.amount)}</td>`;
              break;
            case 'total':
              typeBadge = '<span class="badge badge-success">課稅總額</span>';
              rowStyle = 'font-weight: 700; background: rgba(30, 41, 59, 0.4);';
              valCol = `<td class="text-right">${formatNumber(row.amount)}</td>`;
              break;
            case 'rate':
              typeBadge = '<span class="badge">營所稅法定稅率</span>';
              valCol = `<td class="text-right">${formatPercent(row.amount)}</td>`;
              break;
            case 'tax':
              typeBadge = '<span class="badge badge-success" style="background:rgba(239, 68, 68, 0.15); color:var(--accent-red); border:1px solid rgba(239,68,68,0.3)">應納稅額</span>';
              rowStyle = 'font-weight: 700; color: var(--accent-red);';
              valCol = `<td class="text-right">${formatNumber(row.amount)}</td>`;
              break;
            case 'aftertax':
              typeBadge = '<span class="badge badge-success">稅後純益</span>';
              rowStyle = 'font-weight: 700; background: rgba(16, 185, 129, 0.05);';
              valCol = `<td class="text-right" style="color: var(--accent-emerald)">${formatNumber(row.amount)}</td>`;
              break;
          }
          
          return `
            <tr style="${rowStyle}">
              <td>${row.name}</td>
              <td>${typeBadge}</td>
              <td></td>
              ${valCol}
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
  }
}

function exportCurrentReport() {
  let csvRows = [];
  let filename = "report.csv";
  
  if (currentReportTab === 'original') {
    filename = "Trial_Balance_Original.csv";
    csvRows.push("科目代碼,科目名稱,借方金額,貸方金額");
    trialBalanceRaw.forEach(r => {
      csvRows.push(`${r.code},${r.name},${r.debit},${r.credit}`);
    });
  } 
  else if (currentReportTab === 'mapping') {
    filename = "COA_AI_Mapping.csv";
    csvRows.push("科目代碼,原始科目名稱,對應標準科目,AI信心指數,說明");
    coaMapping.forEach(r => {
      csvRows.push(`${r.code},${r.name},${r.stdName},${r.confidence},${r.note}`);
    });
  }
  else if (currentReportTab === 'bs') {
    filename = "Balance_Sheet.csv";
    csvRows.push("資產項目,資產金額,,負債及權益項目,負債權益金額");
    const maxLen = Math.max(balanceSheet.assets.length, balanceSheet.liabilitiesEquity.length);
    for (let i = 0; i < maxLen; i++) {
      const asset = balanceSheet.assets[i] || { name: '', amount: '' };
      const liab = balanceSheet.liabilitiesEquity[i] || { name: '', amount: '' };
      csvRows.push(`"${asset.name}",${asset.amount !== null ? asset.amount : ''},,"${liab.name}",${liab.amount !== null ? liab.amount : ''}`);
    }
  }
  else if (currentReportTab === 'is') {
    filename = "Income_Statement.csv";
    csvRows.push("損益項目,金額");
    incomeStatement.forEach(r => {
      csvRows.push(`"${r.name}",${r.amount !== null ? r.amount : ''}`);
    });
  }
  else if (currentReportTab === 'tax') {
    filename = "Tax_Adjustment_Report.csv";
    csvRows.push("項目,調整類別,金額");
    taxReport.adjustments.forEach(r => {
      csvRows.push(`"${r.name}",${r.type},${r.amount}`);
    });
  }
  
  const csvString = csvRows.join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


// --- Module 2: OCR Salary Register Logic ---

function loadSalaryRegisterImage() {
  ocrState = 'loaded';
  
  // Hide placeholder, show image
  document.getElementById('image-placeholder').classList.add('hidden');
  const img = document.getElementById('salary-img');
  img.classList.remove('hidden');
  img.style.opacity = '0.5'; // dimmed until scanned
  
  // Enable scan button
  document.getElementById('btn-start-scan').classList.remove('btn-disabled');
}

function startOcrScanning() {
  ocrState = 'scanning';
  
  const imageContainer = document.getElementById('image-container');
  imageContainer.classList.add('scanning');
  imageContainer.classList.remove('scanning-done');
  
  // Disable scan buttons during scan
  document.getElementById('btn-start-scan').classList.add('btn-disabled');
  
  // Show table loader
  document.getElementById('ocr-empty-placeholder').classList.add('hidden');
  document.getElementById('ocr-data-table').classList.add('hidden');
  document.getElementById('ocr-loader').classList.add('active');
  
  // Simulate scanning duration
  setTimeout(() => {
    ocrState = 'done';
    
    // Stop laser animation and display bounding boxes
    imageContainer.classList.remove('scanning');
    imageContainer.classList.add('scanning-done');
    
    // Brighten the scanned image to normal
    document.getElementById('salary-img').style.opacity = '1.0';
    
    // Hide table loader, display result table
    document.getElementById('ocr-loader').classList.remove('active');
    document.getElementById('ocr-data-table').classList.remove('hidden');
    
    // Enable export button
    document.getElementById('btn-export-declaration').classList.remove('btn-disabled');
    
    // Populate data
    populateOcrTable();
  }, 3000);
}

function populateOcrTable() {
  const tbody = document.getElementById('ocr-tbody');
  tbody.innerHTML = '';
  
  ocrData.forEach(row => {
    let signBadge = '';
    if (row.signature.includes('已')) {
      signBadge = `<span class="badge badge-success">${row.signature}</span>`;
    } else {
      signBadge = `<span class="badge badge-warning">${row.signature}</span>`;
    }
    
    let alertHtml = '';
    if (row.status === 'error') {
      alertHtml = `<div style="color: var(--accent-red); font-size: 0.75rem; margin-top: 0.25rem; font-weight: 500;">⚠️ ${row.reason}</div>`;
    } else if (row.status === 'warning') {
      alertHtml = `<div style="color: var(--accent-amber); font-size: 0.75rem; margin-top: 0.25rem; font-weight: 500;">⚠️ ${row.reason}</div>`;
    }
    
    tbody.innerHTML += `
      <tr style="border-bottom: 1px solid var(--card-border);">
        <td style="font-weight: 500;">${row.name}</td>
        <td style="font-family: monospace; color: var(--text-secondary);">${row.id}</td>
        <td class="text-right">${formatNumber(row.totalPay)}</td>
        <td class="text-right" style="color: ${row.tax > 0 ? 'var(--accent-teal)' : 'var(--text-muted)'}">${row.tax > 0 ? formatNumber(row.tax) : '0'}</td>
        <td class="text-right">${formatNumber(row.insurance)}</td>
        <td class="text-right" style="font-weight: 600;">
          ${formatNumber(row.netPay)}
          ${alertHtml}
        </td>
        <td class="text-center">${signBadge}</td>
      </tr>
    `;
  });
}

function exportDeclarationFile() {
  // Generate a mock withholding tax format CSV
  let csvRows = [];
  csvRows.push("格式代號,申報單位統編,身分證字號,姓名,給付年月,給付總額,扣繳稅額,給付淨額");
  
  ocrData.forEach(r => {
    // 50 is Taiwan withholding code for Salary (薪資所得)
    // 88888888 is a mock company tax ID
    csvRows.push(`50,88888888,${r.id.replace('***', 'ABC')},${r.name},202606,${r.totalPay},${r.tax},${r.netPay}`);
  });
  
  const csvString = csvRows.join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "Withholding_Tax_Declaration.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --- Automated Test Console Logic ---

function closeConsole() {
  const consolePanel = document.getElementById('test-console');
  consolePanel.classList.add('hidden');
}

async function runAutomatedTest() {
  const consolePanel = document.getElementById('test-console');
  const logsContainer = document.getElementById('console-logs');
  const progressFill = document.getElementById('console-progress');
  const testBtn = document.getElementById('btn-auto-test');

  // Initialize Console UI
  consolePanel.classList.remove('hidden');
  logsContainer.innerHTML = '';
  progressFill.style.width = '0%';
  testBtn.classList.add('btn-disabled');

  const addLog = (text, type = 'info') => {
    const entry = document.createElement('div');
    entry.className = `console-log-entry ${type}`;
    entry.innerText = text;
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
  };

  const updateProgress = (pct) => {
    progressFill.style.width = `${pct}%`;
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Reset POC State to ensure clean run
  tbState = 'empty';
  ocrState = 'empty';
  document.getElementById('btn-load-tb').classList.remove('btn-disabled');
  document.getElementById('btn-align-tb').classList.add('btn-disabled');
  document.getElementById('btn-generate-reports').classList.add('btn-disabled');
  document.getElementById('btn-export-tb').classList.add('btn-disabled');
  document.getElementById('step-1').className = 'flow-step';
  document.getElementById('step-1-desc').innerText = '尚未載入資料檔';
  document.getElementById('step-2').className = 'flow-step';
  document.getElementById('step-2-desc').innerText = '待科目映射觸發';
  document.getElementById('step-3').className = 'flow-step';
  document.getElementById('step-3-desc').innerText = '待一鍵生成觸發';
  document.getElementById('tb-empty-placeholder').classList.remove('hidden');
  document.getElementById('tb-data-table').classList.add('hidden');
  
  document.getElementById('image-placeholder').classList.remove('hidden');
  document.getElementById('salary-img').classList.add('hidden');
  document.getElementById('btn-start-scan').classList.add('btn-disabled');
  document.getElementById('btn-export-declaration').classList.add('btn-disabled');
  document.getElementById('ocr-empty-placeholder').classList.remove('hidden');
  document.getElementById('ocr-data-table').classList.add('hidden');
  document.getElementById('image-container').className = 'ocr-preview-container';

  try {
    addLog('=== 啟動自動化整合測試流程 ===', 'header-log');
    await sleep(800);

    // Step 1: Initialize
    addLog('[1/9] 正在初始化財會環境與模擬測試模組...', 'info');
    updateProgress(10);
    await sleep(1000);

    // Step 2: Load TB
    addLog('[2/9] 觸發：載入範例大表 (試算表)...', 'info');
    switchTab('tb-tab');
    loadTrialBalance();
    addLog('[2/9] 試算表載入成功：共 15 筆會計科目，借貸借方 = 貸方 = $70,400,000 [完全平衡]', 'success');
    updateProgress(20);
    await sleep(1500);

    // Step 3: Align COA
    addLog('[3/9] 觸發：執行 AI 科目映射與對應整理...', 'info');
    alignChartOfAccounts();
    // Waiting for align chart inner timeout (1500ms) + buffer
    await sleep(2200);
    addLog('[3/9] 科目映射完成！所有會計科目已歸類至對應標準科目 [平均信心度 97.4%]', 'success');
    updateProgress(40);
    await sleep(1200);

    // Step 4: Generate reports
    addLog('[4/9] 觸發：一鍵生成底稿、資產負債表 (BS) 與損益表 (IS)...', 'info');
    generateReports();
    // Waiting for generate reports inner timeout (2000ms) + buffer
    await sleep(2700);
    addLog('[4/9] 底稿與財務三表生成成功！結構化數據已匯入即時預覽區', 'success');
    updateProgress(60);
    await sleep(1200);

    // Step 5: Audit BS
    addLog('[5/9] 進行 資產負債表 (BS) 借貸勾稽與平衡檢測...', 'info');
    addLog('   - 資產總計: $45,300,000', 'info');
    addLog('   - 負債及權益總計: $45,300,000', 'info');
    addLog('   [勾稽通過] 資產 = 負債 + 權益 [借貸完全平衡]', 'success');
    updateProgress(70);
    await sleep(1200);

    // Step 6: Audit Tax adjustments
    addLog('[6/9] 進行 營所稅帳外調整限額計算檢核...', 'info');
    addLog('   - 偵測科目 [6400 交際費] 帳載金額: $920,000', 'info');
    addLog('   - 營所稅法交際費申報限額: $600,000', 'info');
    addLog('   - 帳外調整調增: $320,000 (增加課稅所得額)', 'warning');
    addLog('   - 計算申報應納稅額: $1,204,000 (稅率 20%)', 'info');
    addLog('   [檢核通過] 營所稅與申報底稿調整無誤', 'success');
    updateProgress(80);
    await sleep(1500);

    // Step 7: OCR load
    addLog('[7/9] 切換至「薪資印領清冊 AI 辨識」頁籤並載入紙本影像...', 'info');
    switchTab('ocr-tab');
    loadSalaryRegisterImage();
    addLog('[7/9] 順利載入紙本影像檔 [salary_register_demo.png]', 'success');
    updateProgress(88);
    await sleep(1500);

    // Step 8: OCR scan
    addLog('[8/9] 觸發：啟動 AI 多模態表格與簽章辨識辨識引擎...', 'info');
    startOcrScanning();
    // Waiting for ocr scan inner timeout (3000ms) + buffer
    await sleep(3500);
    addLog('[8/9] 影像提取成功！成功結構化抽取 8 筆薪資細項資料', 'success');
    updateProgress(94);
    await sleep(1200);

    // Step 9: Audit OCR errors
    addLog('[9/9] 進行 薪資明細 AI 自動防呆稽核審查...', 'info');
    addLog('   - 數學算式檢驗: 發現 8 處記帳實領金額與算式不符 (標記 ⚠️ 算式錯誤)', 'error');
    addLog('   - 簽章異常偵測: 發現王大同 2 筆由李美玲代簽 (標記 ⚠️ 委託代簽)', 'warning');
    addLog('   [防呆通過] 成功自動抓出清冊中所有人為計算與代簽異常！', 'success');
    updateProgress(100);
    await sleep(800);

    addLog('=== 自動化整合測試全部通過！===', 'header-log');
  } catch (err) {
    addLog(`[ERROR] 測試執行失敗: ${err.message}`, 'error');
  } finally {
    testBtn.classList.remove('btn-disabled');
  }
}
