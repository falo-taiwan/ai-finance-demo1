# AI 財會與稅務自動化 POC 平台 (Accounting & Tax Automation)

這是一個基於 AI 技術的財會自動化概念驗證（POC）儀表板，具體展示並實現了兩大核心場景：
1. **大表（試算表）自動化報表與營所稅帳外調整**
2. **紙本薪資印領清冊 AI 掃描、防呆稽核與扣繳申報格式導出**

本專案完全為靜態網頁架構（純 HTML/JS/CSS），無需後端伺服器，非常適合直接部署至 **GitHub Pages**。

---

## 專案結構說明
* `index.html` - 主畫面結構，包含互動式儀表板、整合測試主控台與技術原理解析看板。
* `style.css` - 採用現代深色系玻璃擬態（Glassmorphism）的視覺風格，包含 OCR 雷射掃描動畫、測試日誌滾動與脈衝指示燈動畫。
* `app.js` - 前端會計勾稽運算、AI 科目語意對齊模擬、多模態視覺偵測定位與自動防呆稽核日誌。
* `salary_register_demo.png` - 作為多模態 AI 影像辨識數據輸入的「紙本薪資印領清冊」示範影像。

---

## 如何在本機運行？
由於瀏覽器安全策略（CORS），直接雙擊開啟 `index.html` 可能會導致圖片無法被 JS 正確讀取或下載失效。建議使用簡單的靜態伺服器：

### 方法 A：使用 Node.js / npx (推薦)
在專案根目錄下執行：
```bash
npx http-server -p 8080
```
然後在瀏覽器開啟 [http://localhost:8080](http://localhost:8080)。

### 方法 B：使用 Python 3
如果本機裝有 Python，執行：
```bash
python3 -m http.server 8080
```
然後在瀏覽器開啟 [http://localhost:8080](http://localhost:8080)。

---

## 如何部署至 GitHub Pages？

由於此專案為純前端靜態頁面，您可以非常快速地將其掛載到 GitHub Pages 上供他人（例如您的朋友）線上體驗：

### 第一步：建立 GitHub 倉庫並上傳代碼
1. 在您的 GitHub 帳號上新增一個全新的公開/私有倉庫（Repository），命名為例如 `Walker_ai`。
2. 在您的本機專案目錄下，打開終端機執行：
   ```bash
   # 初始化 Git 倉庫
   git init

   # 將所有檔案加入暫存區
   git add .

   # 提交檔案
   git commit -m "feat: init AI accountant POC with automated test console"

   # 建立主分支並連結 GitHub 遠端倉庫
   git branch -M main
   git remote add origin https://github.com/您的帳號名稱/您的倉庫名稱.git

   # 推送代碼至 GitHub
   git push -u origin main
   ```

### 第二步：啟用 GitHub Pages 線上預覽
1. 進入您剛建立的 GitHub 倉庫頁面，點擊右上方的 **Settings**（設定）。
2. 在左側選單中找到並點擊 **Pages**。
3. 在 **Build and deployment**（建置與部署）底下的 **Source** 選擇 **Deploy from a branch**（從分支部署）。
4. 在 **Branch** 選項中，選擇 **main**，資料夾選擇 **/ (root)**，然後點擊 **Save**（儲存）。
5. 稍等 1-2 分鐘後，刷新該頁面，GitHub 就會產生您的專案專屬線上網址：
   `https://您的帳號名稱.github.io/您的倉庫名稱/`

---

## 一鍵自動化整合測試說明
* 本平台專門設計了 **「一鍵模擬測試 (Run Test)」** 按鈕。
* 點擊後，右下角會滑出**自動化測試日誌主控台**，並自動按照真實會計審計流程執行一輪測試：
  1. 初始化模組與載入試算表大表。
  2. 執行 AI 科目語意自動對齊（信心度 97.4%）。
  3. 產出損益表與資產負債表，並自動進行借貸平衡校正稽核。
  4. 自動對交際費科目進行超限之「稅務帳外調整」。
  5. 切換至薪資模組並載入紙本影像。
  6. 執行 OCR 表格辨識，精準檢驗出紙本中多達 8 處的「人為計算實領錯誤」與 2 處「代簽異常」。
  7. 自動測試完成，提供完整的狀態驗證。
