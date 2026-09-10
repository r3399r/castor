# 禮物盒 Hero 背景驗證

沿用 Navbar 與 IllustratedHero，以 /box 專用 sp-box-page class 限定透明、absolute 導覽及背景樣式。HTML 文字、積分卡、API 與登入邏輯未變更。

原圖：webapp/public/images/spirit-garden-hero.png（2048 × 768，原始檔保留）。網站版：同目錄 spirit-garden-hero.webp，quality 85。CSS image-set 優先使用 WebP，PNG 為 fallback。

所有尺寸採 cover、center center、no-repeat：桌機保留橫向構圖並裁切上下；平板輕微裁切左右；手機裁切中央，不壓縮變形。預留 --spirit-garden-mobile-image 供日後替換手機圖。

## 驗證

- Desktop 1440 × 1000、tablet 834 × 1112、mobile 390 × 844。
- Hero 起點為頁面頂端，Header absolute / transparent / z-index 40。
- 標題及積分卡在 Header 下方，無水平溢出；平板與手機選單展開正常。
- 瀏覽器實際只請求 WebP。
- 已檢查實際開發站的未登入頁及首頁；首頁未套用 /box 樣式。
- 登入後三尺寸截圖使用實際 /box 元件與獨立測試登入 fixture；不是正式帳戶資料，未修改正式驗證程式。
- TypeScript 與修改頁面的 scoped ESLint 通過；專案既有 lint 缺少設定，使用暫存 ESLint 設定驗證。未執行 build。

數值見 checks.json；同目錄保存三尺寸、選單與未登入畫面。
