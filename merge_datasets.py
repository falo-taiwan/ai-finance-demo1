#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Merge datasets from ChatGPT, Claude, and Gemini crawlers.
Copies original reports and data into workspace reports/ folder.
Generates a combined, deduplicated master dataset.
"""
import os
import json
import csv
import shutil

CLAUDE_DIR = "/Users/force/ccc_max5/test"
CHATGPT_DIR = "/Users/force/AI-CodeX/Test001/runs/full_rebuild_smart_public"
GEMINI_DIR = "reports/gemini"
OUT_DIR = "reports"

FIELDS = ["市場", "代號", "公司簡稱", "公告日期", "異動情形", "新任者", "舊任者", "生效日期", "異動原因", "公告來源"]

def copy_original_files():
    print("Copying original files...", flush=True)
    # Claude
    os.makedirs(f"{OUT_DIR}/claude", exist_ok=True)
    shutil.copy(f"{CLAUDE_DIR}/report.html", f"{OUT_DIR}/claude/report.html")
    shutil.copy(f"{CLAUDE_DIR}/cae_tracker_full.json", f"{OUT_DIR}/claude/cae_tracker_full.json")
    shutil.copy(f"{CLAUDE_DIR}/cae_tracker_full.csv", f"{OUT_DIR}/claude/cae_tracker_full.csv")
    shutil.copy(f"{CLAUDE_DIR}/cae_run_report.json", f"{OUT_DIR}/claude/cae_run_report.json")

    # ChatGPT
    os.makedirs(f"{OUT_DIR}/chatgpt", exist_ok=True)
    shutil.copy(f"{CHATGPT_DIR}/report.html", f"{OUT_DIR}/chatgpt/report.html")
    shutil.copy(f"{CHATGPT_DIR}/interactive_report.html", f"{OUT_DIR}/chatgpt/interactive_report.html")
    shutil.copy(f"{CHATGPT_DIR}/records.json", f"{OUT_DIR}/chatgpt/records.json")
    shutil.copy(f"{CHATGPT_DIR}/records.csv", f"{OUT_DIR}/chatgpt/records.csv")
    shutil.copy(f"{CHATGPT_DIR}/summary.json", f"{OUT_DIR}/chatgpt/summary.json")

def load_claude():
    with open(f"{OUT_DIR}/claude/cae_tracker_full.json", "r", encoding="utf-8") as f:
        return json.load(f)

def load_chatgpt():
    # Needs field mapping from English to Chinese
    with open(f"{OUT_DIR}/chatgpt/records.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    mapped = []
    # Map market labels back to Chinese if needed
    mk_map = {"C": "公開發行", "L": "上市", "O": "上櫃", "R": "興櫃",
              "公開發行": "公開發行", "上市": "上市", "上櫃": "上櫃", "興櫃": "興櫃"}
    
    for r in data:
        src = r.get("source_params", {})
        row = {
            "市場": mk_map.get(r.get("market", ""), r.get("market", "")),
            "代號": r.get("company_code", ""),
            "公司簡稱": r.get("company_name", ""),
            "公告日期": r.get("announce_date", ""),
            "異動情形": r.get("change_type", ""),
            "新任者": r.get("new_person", ""),
            "舊任者": r.get("old_person", ""),
            "生效日期": r.get("effective_date", ""),
            "異動原因": r.get("reason", ""),
            "公告來源": json.dumps(src, ensure_ascii=False) if src else ""
        }
        mapped.append(row)
    return mapped

def load_gemini():
    with open(f"{GEMINI_DIR}/gemini_tracker_full.json", "r", encoding="utf-8") as f:
        return json.load(f)

def record_key(r):
    # Unique key for deduplication
    return (
        r["代號"].strip(),
        r["公告日期"].strip(),
        r["異動情形"].strip(),
        r["新任者"].strip(),
        r["舊任者"].strip()
    )

def main():
    copy_original_files()

    print("Loading datasets...", flush=True)
    c_records = load_claude()
    g_records = load_chatgpt()
    m_records = load_gemini()

    print(f"Claude records: {len(c_records)}")
    print(f"ChatGPT records: {len(g_records)}")
    print(f"Gemini records: {len(m_records)}")

    # Merge and deduplicate
    combined = {}
    
    # Track which crawler found which record
    crawler_sources = {} # key -> list of crawlers
    
    for r in c_records:
        k = record_key(r)
        combined[k] = r
        crawler_sources.setdefault(k, []).append("Claude")
        
    for r in g_records:
        k = record_key(r)
        if k not in combined:
            combined[k] = r
        crawler_sources.setdefault(k, []).append("ChatGPT")
        
    for r in m_records:
        k = record_key(r)
        if k not in combined:
            combined[k] = r
        crawler_sources.setdefault(k, []).append("Gemini")

    combined_list = list(combined.values())
    combined_list.sort(key=lambda r: (r["公告日期"], r["代號"]), reverse=True)

    print(f"Combined unique records: {len(combined_list)}")

    # Write merged files
    json.dump(combined_list, open(f"{OUT_DIR}/combined_tracker_full.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    with open(f"{OUT_DIR}/combined_tracker_full.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in combined_list:
            w.writerow(r)

    # Read reports to build comparison stats
    with open(f"{OUT_DIR}/claude/cae_run_report.json", "r", encoding="utf-8") as f:
        claude_rep = json.load(f)
    with open(f"{OUT_DIR}/chatgpt/summary.json", "r", encoding="utf-8") as f:
        chatgpt_rep = json.load(f)
    with open(f"{GEMINI_DIR}/gemini_run_report.json", "r", encoding="utf-8") as f:
        gemini_rep = json.load(f)

    # Calculate status total (use Gemini's, or Claude's, or ChatGPT's, they should all be 13238)
    declared_total = gemini_rep["data"]["declared_total_status"] or 13238

    # Calculate individual coverage
    claude_cov = claude_rep["data"]["coverage_pct"]
    chatgpt_cov = round((chatgpt_rep["total_records"] / declared_total) * 100, 2)
    gemini_cov = gemini_rep["data"]["coverage_pct"]
    combined_cov = round((len(combined_list) / declared_total) * 100, 2)

    # Calculate overlaps
    overlap_stats = {
        "claude_only": 0,
        "chatgpt_only": 0,
        "gemini_only": 0,
        "claude_chatgpt": 0,
        "claude_gemini": 0,
        "chatgpt_gemini": 0,
        "all_three": 0
    }

    for k, sources in crawler_sources.items():
        unique_sources = list(set(sources))
        if len(unique_sources) == 3:
            overlap_stats["all_three"] += 1
        elif len(unique_sources) == 2:
            if "Claude" in unique_sources and "ChatGPT" in unique_sources:
                overlap_stats["claude_chatgpt"] += 1
            elif "Claude" in unique_sources and "Gemini" in unique_sources:
                overlap_stats["claude_gemini"] += 1
            elif "ChatGPT" in unique_sources and "Gemini" in unique_sources:
                overlap_stats["chatgpt_gemini"] += 1
        elif len(unique_sources) == 1:
            src = unique_sources[0]
            if src == "Claude":
                overlap_stats["claude_only"] += 1
            elif src == "ChatGPT":
                overlap_stats["chatgpt_only"] += 1
            elif src == "Gemini":
                overlap_stats["gemini_only"] += 1

    comparison_stats = {
        "declared_total": declared_total,
        "combined_total": len(combined_list),
        "combined_coverage": combined_cov,
        "overlap_stats": overlap_stats,
        "crawlers": {
            "Claude": {
                "name": "Claude Max5",
                "method": claude_rep["method"],
                "duration_sec": claude_rep["duration_sec"],
                "requests": claude_rep["http_requests_total"],
                "bytes": claude_rep["http_bytes_total"],
                "unique_records": len(c_records),
                "coverage_pct": claude_cov,
                "report_link": "reports/claude/report.html",
                "data_link_json": "reports/claude/cae_tracker_full.json",
                "data_link_csv": "reports/claude/cae_tracker_full.csv"
            },
            "ChatGPT": {
                "name": "ChatGPT Pro",
                "method": "固定分格 年→月→市場 / 智慧名單",
                "duration_sec": chatgpt_rep["total_elapsed_seconds"],
                "requests": chatgpt_rep["total_slices"], # Slices count as HTTP requests
                "bytes": 0, # Not tracked in original ChatGPT summary
                "unique_records": len(g_records),
                "coverage_pct": chatgpt_cov,
                "report_link": "reports/chatgpt/report.html",
                "interactive_report_link": "reports/chatgpt/interactive_report.html",
                "data_link_json": "reports/chatgpt/records.json",
                "data_link_csv": "reports/chatgpt/records.csv"
            },
            "Gemini": {
                "name": "Gemini (Antigravity)",
                "method": gemini_rep["method"],
                "duration_sec": gemini_rep["duration_sec"],
                "requests": gemini_rep["http_requests_total"],
                "bytes": gemini_rep["http_bytes_total"],
                "unique_records": len(m_records),
                "coverage_pct": gemini_cov,
                "report_link": "reports/gemini/report.html",
                "data_link_json": "reports/gemini/gemini_tracker_full.json",
                "data_link_csv": "reports/gemini/gemini_tracker_full.csv"
            }
        }
    }

    with open(f"{OUT_DIR}/comparison_stats.json", "w", encoding="utf-8") as f:
        json.dump(comparison_stats, f, ensure_ascii=False, indent=2)

    print("Data merging and comparison stats generation complete!", flush=True)

if __name__ == "__main__":
    main()
