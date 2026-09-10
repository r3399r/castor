# 禮物盒視覺樣板 — 第一階段

本次完成共用視覺基礎及 `/box` 的培育、商店、圖鑑樣式。其他頁面尚未改版，API、登入、權限、題目、統計與後端皆未修改，也沒有新增專案套件。

## 設計決策

- 深森林綠外層、暖奶油白操作面板、青綠進度與金色主要操作。顏色集中在 `webapp/styles/tokens.css`。
- tokens 包含字級、字體、間距、圓角、陰影、表面、邊框、焦點、互動狀態與原有 Tailwind 斷點。`@theme static` 讓尚未使用的 token 也可供後續頁面採用。
- 新樣式以 `.spirit-theme` 明確啟用；原有頁面不重新定義 blue、brown、beige 色階。
- `IllustratedHero` 使用原生 SVG 植物剪影與分界筆觸；不放大圖卡當 Banner。圖卡在 `SpiritScene` 中完整展示，裝飾獨立分層且不接收指標事件。
- `SpiritArtwork` 使用 `object-fit: contain`，保留鳥 LV5 的 1240×1269 原始比例；圖卡載入預留空間、非主要圖片延後載入、缺圖提供後備畫面。沒有裁切、重製或壓縮使用者原圖。
- 七種精靈的顯示目錄與既有 Demo ID 分離。鹿與鳥優先展示；其他既有商品和系列仍保留，沒有把海洋守護靈冒充成鳥。
- 培育資訊、操作區與成長外觀預覽分開。預覽尚未解鎖的階段有明確文字，不改實際等級。圖鑑仍僅能開啟已解鎖項目。
- 未取得、培育中／進行中、已完成以文字、鎖頭／勾選圖示和邊線共同表達。
- 原有四個 Demo 狀態保留在頁尾可展開設定，增加 LV5 預覽及鳥靈展示樣本。所有確認按鈕仍只關閉 Demo 對話框，不扣分、不升級、不送 API。
- 原有六項商品價格、海洋／毛孩圖鑑與公益說明保留。Demo 價格、XP 與公益說明不代表本次重新制定的正式規則。
- 共用 Modal 使用原生 dialog、Tab 焦點循環、Escape／背景關閉、關閉後焦點返回及背景捲動鎖定。Tabs 支援方向鍵、Home、End。
- 小量光點、hover 與進度 transition 均支援 `prefers-reduced-motion`。

## 共用元件

`webapp/components/ui/index.tsx`：Button（primary／secondary／quiet）、Card、ContentPanel／Panel、Badge、Progress、Tabs、Modal。

`webapp/components/spirit/index.tsx`：IllustratedHero、PaintedSectionDivider、SpiritArtwork、SpiritScene、SpiritStatusCard、GrowthTrack、RewardBanner、IllustratedEmptyState。

後續頁面使用方式：以 `.spirit-theme` 包住頁面，從上述元件匯入；正式精靈圖片對照由 `webapp/lib/guardianArtwork.ts` 集中設定。本次僅在 `/box` 啟用。

## 驗收結果與限制

| 項目 | 結果 |
| --- | --- |
| TypeScript | `tsc -p webapp/tsconfig.json --noEmit --incremental false` 通過 |
| 修改範圍 ESLint | 使用現有 ESLint 與 TypeScript recommended 規則、暫存設定檢查全部新增／修改 TS/TSX，通過 |
| 專案原有 lint 指令 | 已執行 `npm run lint --workspace webapp`；原本未完成 ESLint 設定，進入互動設定提示後退出，不能宣稱全專案 lint 通過 |
| 既有測試 | 已執行 `npm run test --workspace backend_new`；`vitest: command not found`，現有依賴尚未安裝完整，測試未能啟動 |
| 差異檢查 | `git diff --check` 通過 |
| 三尺寸版面 | 1440、834、390px 下三分頁及未取得／0點／不足／滿級狀態通過，無頁面水平捲動或可見內容越界 |
| 額外小螢幕 | 360px 下操作區無水平捲動，可見互動元件未被遮擋 |
| 圖片 | 十張圖卡均正常載入，使用 contain；鳥 LV5 保持完整構圖 |
| 鍵盤 | 分頁方向鍵、Modal Tab 循環、Escape、焦點還原通過 |
| 操作 | 投入上下限、零積分禁用、商店確認框、角色切換及成長預覽通過 |
| 減少動效 | 四個寬度下 reduced motion 檢查通過 |
| 文字檢查 | 視覺檢查桌機／平板／手機，修正未解鎖預留圖文字與鎖頭重疊 |
| 真實路由 | 重啟後三尺寸確認首頁及禮物盒／智慧練習／作答記錄／分析／個人頁的未登入狀態正常；題庫與預覽頁出現既有 categoryList 錯誤，詳見下方，登入後資料功能未驗收 |

瀏覽器 UI 驗收使用暫存的獨立 React 掛載畫面，直接打包真實 BoxClient，使用相同樣式與原始圖片，沒有變更或繞過正式 AuthGuard。Playwright／esbuild 工具安裝在 `/private/tmp/castor-ui-tools`，沒有加入專案依賴。

開發服務已於 2026-09-08 重啟，實際 `localhost:3000/box/` 已正常顯示 Google 登入及 AuthGuard 提示，先前靜態資源 404／停在載入中的問題已排除。瀏覽器測試使用新 session，沒有登入使用者帳號，因此登入後功能僅完成獨立元件 UI 驗收，尚未執行真實帳號端到端測試。

## 改版前後截圖

以下是同一 BoxClient 的獨立 UI 預覽，導航使用簡化的測試頁殼，不是登入後正式網站截圖。改版前使用修改前保存的原始 BoxClient／globals.css；改版後使用目前程式碼。

| 尺寸 | 改版前 | 改版後 |
| --- | --- | --- |
| 桌機 1440px | [Before](screenshots/before-desktop.png) | [After](screenshots/after-desktop.png) |
| 平板 834px | [Before](screenshots/before-tablet.png) | [After](screenshots/after-tablet.png) |
| 手機 390px | [Before](screenshots/before-mobile.png) | [After](screenshots/after-mobile.png) |

其他畫面：[商店](screenshots/after-desktop-store.png)、[圖鑑](screenshots/after-desktop-collection.png)、[鳥靈手機預覽](screenshots/after-mobile-bird.png)、[手機確認視窗](screenshots/modal-390-viewport.png)、[滿級示意](screenshots/after-desktop-complete.png)。

[瀏覽器檢查紀錄](checks.json) · [互動檢查紀錄](interactions.json) · [重啟後正式路由紀錄](live-routes.json)

## 完整程式檔案清單

修改：

1. `webapp/app/globals.css` — 匯入 tokens 與可選用的主題樣式。
2. `webapp/app/box/page.tsx` — 禮物盒主題容器，保留 Navbar／AuthGuard。
3. `webapp/app/box/BoxClient.tsx` — 三分頁、圖卡、狀態、共用操作與對話框。

新增：

4. `webapp/styles/tokens.css` — 集中設計規格。
5. `webapp/styles/spirit.css` — 元件、場景、RWD、互動與 reduced-motion 樣式。
6. `webapp/components/ui/index.tsx` — 基礎元件。
7. `webapp/components/spirit/index.tsx` — 可替換精靈的插畫元件。
8. `webapp/lib/guardianArtwork.ts` — 七種類型、名稱、分類、圖片目錄與階段顯示資料。
9. `webapp/app/box/demoData.ts` — 抽出原有示意資料，加入鳥靈及滿級預覽。
10. `webapp/app/box/SupportNote.tsx` — 保留並整理原有公益說明。

驗收產物：本目錄 `README.md`、`checks.json`、`interactions.json` 、`live-routes.json` 以及 14 張 PNG 截圖（11 張 UI 樣板、3 張正式路由未登入畫面）。

使用者先前提供、此次只引用而未修改的素材：`webapp/public/illustrations/guardians/deer/lv1.png`～`lv5.png` 與 `bird/lv1.png`～`lv5.png`，共十張；目前 Git 仍顯示為未追蹤檔案。

## 既有事項，未擴大處理

- 禮物盒原有商品、積分及公益說明為 Demo，與正式文件未完全同步；本次只改 UI。
- 首頁「開始練習」與禮物盒空狀態原有連結仍指向 `/question`；未任意變更路由。
- 原有 lint 設定及後端測試環境待補。
- `/question/`、`/preview2/` 出現 `categoryList.map is not a function`；`/preview/` 出現 `categoryList.find is not a function`。這些檔案本次未修改，列為既有資料／介面形狀問題，未擴大修復。
- 桌機 `/admin/` 單次導航被前一預覽頁錯誤中斷，未計為通過；平板、手機能到達登入提示。
- 其他頁面的登入後互動、題目渲染和統計需使用已登入帳號補驗收，尚未宣稱通過。
- 開發伺服器仍提示原有 `lib/api.ts` 從 package.json 匯入 version 的警告，本次未修改。

完成本階段後不繼續改造其他頁面，等待視覺確認。
