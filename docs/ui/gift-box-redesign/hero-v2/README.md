# Hero 底部與全頁漸層調整

本次產品程式只修改 webapp/styles/box-hero.css，所有規則限定 .sp-box-page；PNG、WebP、Header 元件、資料與互動邏輯均未修改。

Hero 最小高度：桌機 700px、平板（768–1023px）560px、手機 520px。背景 cover / center bottom，沒有負 margin。僅最後 94–100% 淡入 #083F41，移除白灰遮罩及原有 56px 過渡帶。Hero 下方開始依指定六個色標延伸全頁背景漸層。

積分卡底色 rgba(242,244,218,.94)、文字 #173F3A、數字 #916315、邊線 #DBCC8D，搭配柔和外光與深色陰影。兩角為 CSS 簡化葉片，pointer-events:none；預留 --spirit-balance-leaf-image 替換插畫。分頁及區塊標題增加淺色閱讀底，確保在深色背景可讀。

驗證：TypeScript、範圍 ESLint（沿用暫存設定）、git diff --check 通過。1440×1000、834×1112、390×844 均驗證標題及積分卡安全距離、無水平捲動、WebP 載入、三個分頁切換，以及平板／手機選單。實際開發站另驗證未登入狀態與首頁未套用 box 樣式。登入後截圖來自實際元件加獨立測試登入 fixture，未修改正式登入。
