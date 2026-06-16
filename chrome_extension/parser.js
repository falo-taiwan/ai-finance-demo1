(function attachParser(globalScope) {
  const TRACKER_BASE = "https://howtofightfraud.com/cae-tracker/";
  const MOPS_ACTION = "https://mopsov.twse.com.tw/mops/web/ajax_t05st01";

  const FIELD_MAP = [
    ["market", "col-market"],
    ["companyCode", "col-code"],
    ["companyName", "col-company"],
    ["announceDate", "col-date"],
    ["changeType", "col-type"],
    ["newPerson", "col-new"],
    ["oldPerson", "col-old"],
    ["effectiveDate", "col-eff"],
    ["reason", "col-reason"]
  ];

  function buildTrackerUrl({ companyCode, year, month = "", market = "" }) {
    const params = new URLSearchParams({
      ma_submitted: "1",
      ma_market: market,
      ma_year: String(year || ""),
      ma_month: month,
      ma_company: String(companyCode || ""),
      ma_name: ""
    });
    return `${TRACKER_BASE}?${params.toString()}`;
  }

  function decodeHtml(value) {
    return String(value || "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function cleanHtml(value) {
    return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractTableBody(html) {
    const tableMatch = String(html || "").match(/<table[^>]*class="[^"]*mops-audit-table[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) return "";
    const bodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    return bodyMatch ? bodyMatch[1] : tableMatch[1];
  }

  function extractCell(rowHtml, className) {
    const pattern = new RegExp(`<td[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`, "i");
    const match = rowHtml.match(pattern);
    return match ? cleanHtml(match[1]) : "";
  }

  function extractSourceForm(rowHtml) {
    const formMatch = rowHtml.match(/<form[^>]*class="[^"]*ma-srcform[^"]*"[^>]*>([\s\S]*?)<\/form>/i);
    if (!formMatch) return { sourceAction: MOPS_ACTION, sourceParams: {} };
    const openTag = rowHtml.match(/<form[^>]*class="[^"]*ma-srcform[^"]*"[^>]*>/i);
    const actionMatch = openTag ? openTag[0].match(/\saction="([^"]+)"/i) : null;
    const params = {};
    const inputPattern = /<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/gi;
    let inputMatch;
    while ((inputMatch = inputPattern.exec(formMatch[1])) !== null) {
      params[decodeHtml(inputMatch[1])] = decodeHtml(inputMatch[2]);
    }
    return {
      sourceAction: actionMatch ? decodeHtml(actionMatch[1]) : MOPS_ACTION,
      sourceParams: params
    };
  }

  function parseTrackerHtml(html, context = {}) {
    const body = extractTableBody(html);
    const rows = [];
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(body)) !== null) {
      const rowHtml = rowMatch[1];
      const record = {
        queryYear: String(context.year || ""),
        queryCompany: String(context.companyCode || "")
      };
      for (const [field, className] of FIELD_MAP) {
        record[field] = extractCell(rowHtml, className);
      }
      if (!record.companyCode && !record.companyName) continue;
      const source = extractSourceForm(rowHtml);
      record.sourceAction = source.sourceAction;
      record.sourceParams = source.sourceParams;
      const seq = source.sourceParams.seq_no || source.sourceParams.SEQ_NO || "";
      record.recordId = `${record.companyCode}_${record.announceDate}_${seq || rows.length + 1}`;
      rows.push(record);
    }
    return {
      rows,
      capped: String(html || "").includes("已達顯示上限"),
      visibleRows: rows.length,
      totalText: extractTotalText(html)
    };
  }

  function parseMopsResultHtml(html, context = {}) {
    const rows = [];
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(String(html || ""))) !== null) {
      const rowHtml = rowMatch[1];
      const cells = [];
      const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
        const text = cleanHtml(cellMatch[1]);
        if (text) cells.push(text);
      }
      if (cells.length < 3) continue;
      const rawText = cells.join(" ");
      const companyCodeText = String(context.companyCode || "");
      const hasCompany = companyCodeText && rawText.includes(companyCodeText);
      const hasDate = /\d{4}\/\d{2}\/\d{2}|\d{3}\/\d{2}\/\d{2}/.test(rawText);
      if (!hasCompany && !hasDate) continue;
      if (/公司代號|公司名稱|發言日期|主旨/.test(rawText) && cells.length < 8) continue;

      const dateCell = cells.find(value => /\d{4}\/\d{2}\/\d{2}|\d{3}\/\d{2}\/\d{2}/.test(value)) || "";
      const timeCell = cells.find(value => /^\d{2}:\d{2}(:\d{2})?$/.test(value)) || "";
      const codeIndex = cells.findIndex(value => value === companyCodeText);
      const companyCode = codeIndex >= 0 ? cells[codeIndex] : companyCodeText;
      const companyName = codeIndex >= 0 && cells[codeIndex + 1] ? cells[codeIndex + 1] : "";
      const subject = cells.find(value =>
        value.length > 8 &&
        value !== companyCode &&
        value !== companyName &&
        value !== dateCell &&
        value !== timeCell &&
        !/^\d+$/.test(value)
      ) || rawText;

      rows.push({
        queryYear: String(context.year || ""),
        companyCode,
        companyName,
        announceDate: dateCell,
        announceTime: timeCell,
        subject,
        cells,
        rawText,
        sourceUrl: context.sourceUrl || ""
      });
    }
    return {
      rows,
      visibleRows: rows.length,
      rawText: cleanHtml(html).slice(0, 300)
    };
  }

  function extractTotalText(html) {
    const text = cleanHtml(html);
    const match = text.match(/共\s*\d+\s*筆|顯示\s*\d+\s*筆|已達顯示上限/);
    return match ? match[0] : "";
  }

  globalScope.TsmcParser = {
    TRACKER_BASE,
    MOPS_ACTION,
    buildTrackerUrl,
    parseTrackerHtml,
    parseMopsResultHtml,
    cleanHtml
  };
})(typeof self !== "undefined" ? self : globalThis);
