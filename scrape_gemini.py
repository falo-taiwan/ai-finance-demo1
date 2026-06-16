#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gemini Crawler: Dynamic Adaptive Slicing (Year -> Month -> Market)
Tracks HTTP requests, duration, unique records, and coverage.
Saves data directly to reports/gemini/.
"""
import os
import re
import time
import json
import csv
import html as ihtml
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import Counter

BASE = "https://howtofightfraud.com/cae-tracker/"
STATUS = "https://howtofightfraud.com/wp-json/mops-audit/v1/status"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 GeminiCrawler/1.0"
MARKETS = ["C", "L", "O", "R"]
YEARS = [str(y) for y in range(84, 116)]
MONTHS = [f"{m:02d}" for m in range(1, 13)]
CAP = 88
COLS = ["col-market", "col-code", "col-company", "col-date", "col-type",
        "col-new", "col-old", "col-eff", "col-reason"]
FIELDS = ["市場", "代號", "公司簡稱", "公告日期", "異動情形", "新任者", "舊任者", "生效日期", "異動原因", "公告來源"]

STAT = {"requests": 0, "bytes": 0, "http_ms": 0.0, "errors": 0}

def fetch(market="", year="", month="", retries=3):
    qs = (f"?ma_submitted=1&ma_market={market}&ma_year={year}"
          f"&ma_month={month}&ma_company=&ma_name=")
    url = BASE + qs
    last = None
    for attempt in range(retries + 1):
        t0 = time.perf_counter()
        try:
            req = Request(url, headers={"User-Agent": UA})
            with urlopen(req, timeout=45) as r:
                body = r.read()
                STAT["requests"] += 1
                STAT["bytes"] += len(body)
                STAT["http_ms"] += (time.perf_counter() - t0) * 1000
                time.sleep(0.05)  # Politeness delay
                return body.decode("utf-8", "replace")
        except Exception as e:
            last = e
            time.sleep(1.5 * (attempt + 1))
    STAT["errors"] += 1
    raise RuntimeError(f"fetch failed {market}/{year}/{month}: {last}")

def clean(s):
    return re.sub(r"\s+", " ", ihtml.unescape(re.sub(r"<[^>]+>", " ", s))).strip()

def parse(htmltext):
    capped = ("已達顯示上限" in htmltext)
    tb = re.search(r"<tbody>(.*?)</tbody>", htmltext, re.S)
    rows = []
    if tb:
        for tr in re.findall(r"<tr>(.*?)</tr>", tb.group(1), re.S):
            cells = {}
            for c in COLS:
                m = re.search(rf'<td class="{c}">(.*?)</td>', tr, re.S)
                cells[c] = clean(m.group(1)) if m else ""
            srcm = re.search(r'<td class="col-src">(.*?)</td>', tr, re.S)
            src = {}
            if srcm:
                for nm, val in re.findall(r'name="([^"]+)"\s+value="([^"]*)"', srcm.group(1)):
                    if nm in ("CODE", "KIND", "year", "month1", "co_id", "TYPEK", "step"):
                        src[nm] = val
            if not cells["col-code"] and not cells["col-company"]:
                continue
            row = {f: cells[c] for f, c in zip(FIELDS[:-1], COLS)}
            row["公告來源"] = json.dumps(src, ensure_ascii=False) if src else ""
            rows.append(row)
    return rows, capped

def key(r):
    return (r["代號"], r["公告日期"], r["異動情形"], r["新任者"], r["舊任者"])

def cell(market, year, month=""):
    t0 = time.perf_counter()
    try:
        rows, capped = parse(fetch(market, year, month))
        failed = False
    except Exception:
        rows, capped, failed = [], False, True
    return {"market": market, "year": year, "month": month, "rows": rows, "failed": failed,
            "capped": capped, "n": len(rows), "ms": round((time.perf_counter() - t0) * 1000, 1)}

def main():
    run_start = time.time()
    print(f"[start] {time.strftime('%H:%M:%S')} Gemini Adaptive Slicing (Year -> Month -> Market) Crawler Started", flush=True)

    # Fetch status for total count
    declared = None
    status_obj = None
    try:
        with urlopen(Request(STATUS, headers={"User-Agent": UA}), timeout=20) as r:
            status_obj = json.loads(r.read())
            declared = status_obj.get("total")
    except Exception as e:
        print("Status endpoint fetch failed:", e)

    seen = {}
    phase_counts = {"year": 0, "month": 0, "market": 0}
    capped_leaves = []
    failed_cells = []

    def collect(res):
        for r in res["rows"]:
            seen[key(r)] = r
        if res.get("failed"):
            failed_cells.append((res["market"], res["year"], res["month"]))

    # ---- Phase 1: Year (All markets, all months) ----
    print("[phase1] Querying 32 years (all markets, all months)...", flush=True)
    capped_years = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(cell, "", y): y for y in YEARS}
        for fu in as_completed(futs):
            res = fu.result()
            phase_counts["year"] += 1
            if res["capped"]:
                capped_years.append(res["year"])
            else:
                collect(res)
    print(f"  Single-query years (uncapped): {32 - len(capped_years)}, Capped years (need split): {len(capped_years)}", flush=True)

    # ---- Phase 2: Capped Years -> Split by 12 Months ----
    capped_months = []
    if capped_years:
        tasks = [(y, m) for y in capped_years for m in MONTHS]
        print(f"[phase2] Querying {len(tasks)} Year-Month combinations...", flush=True)
        with ThreadPoolExecutor(max_workers=4) as ex:
            futs = {ex.submit(cell, "", y, m): (y, m) for (y, m) in tasks}
            for fu in as_completed(futs):
                res = fu.result()
                phase_counts["month"] += 1
                if res["capped"]:
                    capped_months.append((res["year"], res["month"]))
                else:
                    collect(res)
    print(f"  Uncapped months: {len(capped_years)*12 - len(capped_months)}, Capped months (need split): {len(capped_months)}", flush=True)

    # ---- Phase 3: Capped Months -> Split by 4 Markets ----
    if capped_months:
        tasks = [(mk, y, m) for (y, m) in capped_months for mk in MARKETS]
        print(f"[phase3] Querying {len(tasks)} Market-Year-Month combinations...", flush=True)
        with ThreadPoolExecutor(max_workers=4) as ex:
            futs = {ex.submit(cell, mk, y, m): (mk, y, m) for (mk, y, m) in tasks}
            for fu in as_completed(futs):
                res = fu.result()
                phase_counts["market"] += 1
                collect(res)
                if res["capped"]:
                    capped_leaves.append(f'{res["market"]}/{res["year"]}/{res["month"]} ({res["n"]})')

    # ---- Retries for failed cells ----
    if failed_cells:
        retry = list(dict.fromkeys(failed_cells))
        failed_cells.clear()
        print(f"[retry] Retrying {len(retry)} failed cells...", flush=True)
        for mk, y, m in retry:
            res = cell(mk, y, m)
            if res.get("failed"):
                failed_cells.append((mk, y, m))
            else:
                for r in res["rows"]:
                    seen[key(r)] = r

    data = list(seen.values())
    data.sort(key=lambda r: (r["公告日期"], r["代號"]), reverse=True)

    # Create output directory
    out_dir = "reports/gemini"
    os.makedirs(out_dir, exist_ok=True)

    # Statistics
    def dist(f):
        return dict(Counter(r[f] for r in data).most_common())
    dates = sorted(r["公告日期"] for r in data if r["公告日期"])
    run_end = time.time()
    
    report = {
        "project": "cae-tracker (mops-audit/v1)",
        "run_started": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(run_start)),
        "run_finished": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(run_end)),
        "duration_sec": round(run_end - run_start, 2),
        "method": "動態自適應分格 年→月→市場",
        "http_requests_total": STAT["requests"],
        "http_bytes_total": STAT["bytes"],
        "http_ms_total": round(STAT["http_ms"], 1),
        "http_errors": STAT["errors"],
        "phase_request_counts": phase_counts,
        "rest_status_endpoint": status_obj,
        "data": {
            "declared_total_status": declared,
            "unique_records": len(data),
            "coverage_pct": round(len(data) / declared * 100, 2) if declared else None,
            "capped_leaves_remaining": capped_leaves,
            "failed_cells_residual": [f"{m}/{y}/{mo}" for (m, y, mo) in failed_cells],
            "complete": len(capped_leaves) == 0 and len(failed_cells) == 0,
            "fields": FIELDS,
            "market_distribution": dist("市場"),
            "type_distribution": dist("異動情形"),
            "date_range": [dates[0], dates[-1]] if dates else None,
        },
    }

    # Save output files
    json.dump(data, open(f"{out_dir}/gemini_tracker_full.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    with open(f"{out_dir}/gemini_tracker_full.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in data:
            w.writerow(r)
    json.dump(report, open(f"{out_dir}/gemini_run_report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # Write report.html for Gemini
    write_gemini_report_html(out_dir, report, data[:200])

    print(f"Gemini Crawler completed. Total records: {len(data)}. Requests: {STAT['requests']}.", flush=True)

def write_gemini_report_html(out_dir, report, sample_data):
    sample_rows = []
    for r in sample_data:
        sample_rows.append(
            f"<tr>"
            f"<td>{ihtml.escape(r['市場'])}</td>"
            f"<td>{ihtml.escape(r['代號'])}</td>"
            f"<td>{ihtml.escape(r['公司簡稱'])}</td>"
            f"<td>{ihtml.escape(r['公告日期'])}</td>"
            f"<td>{ihtml.escape(r['異動情形'])}</td>"
            f"<td>{ihtml.escape(r['新任者'])}</td>"
            f"<td>{ihtml.escape(r['舊任者'])}</td>"
            f"<td>{ihtml.escape(r['生效日期'])}</td>"
            f"<td>{ihtml.escape(r['異動原因'])}</td>"
            f"</tr>"
        )
        
    html_content = f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gemini 爬蟲執行報告</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #0f172a; color: #e2e8f0; margin: 0; padding: 20px; }}
    main {{ max-width: 1200px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }}
    h1 {{ font-size: 24px; color: #38bdf8; margin-bottom: 20px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }}
    .card {{ background: #111827; padding: 15px; border-radius: 8px; border: 1px solid #334155; }}
    .card span {{ font-size: 14px; color: #94a3b8; display: block; }}
    .card strong {{ font-size: 20px; color: #f8fafc; display: block; margin-top: 5px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }}
    th, td {{ border: 1px solid #334155; padding: 10px; text-align: left; }}
    th {{ background: #0f172a; color: #38bdf8; }}
    tr:nth-child(even) {{ background: #1e293b; }}
    tr:nth-child(odd) {{ background: #111827; }}
  </style>
</head>
<body>
  <main>
    <h1>Gemini (Antigravity) 爬蟲執行報告</h1>
    <div class="grid">
      <div class="card"><span>爬取總時長</span><strong>{report['duration_sec']} 秒</strong></div>
      <div class="card"><span>HTTP 總請求數</span><strong>{report['http_requests_total']} 次</strong></div>
      <div class="card"><span>實抓唯一記錄數</span><strong>{report['data']['unique_records']} 筆</strong></div>
      <div class="card"><span>覆蓋率</span><strong>{report['data']['coverage_pct']}%</strong></div>
    </div>
    <h2>資料預覽 (前 200 筆)</h2>
    <table>
      <thead>
        <tr>
          <th>市場</th><th>代號</th><th>公司簡稱</th><th>公告日期</th><th>異動情形</th><th>新任者</th><th>舊任者</th><th>生效日期</th><th>異動原因</th>
        </tr>
      </thead>
      <tbody>
        {"".join(sample_rows)}
      </tbody>
    </table>
  </main>
</body>
</html>
"""
    with open(f"{out_dir}/report.html", "w", encoding="utf-8") as f:
        f.write(html_content)

if __name__ == "__main__":
    main()
