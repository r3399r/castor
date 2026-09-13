# 共同培育面板

移除上方區域 Bar，原有選擇器移入資料卡 Header；共用 SpiritStatusCard 新增可選 headerAction，以保留其他使用處預設行為。

培育展示使用原本 sp-growing-layout 作為共同外框：30px 圓角、單一邊框與陰影、overflow hidden、gap 0。桌機 48/52、平板 44/56、手機單欄。操作區桌機48px、平板28px、手機24px內距。圖卡 transform:none、rotate:0deg。

TypeScript noEmit、scope ESLint（暫存設定）、git diff --check 通過。以實際元件搭配隔離 auth fixture 檢查 1440、834、390px：無水平溢出、相鄰邊緣直接接合、圖卡無旋轉、切換森林鹿靈與彩羽鳥靈正常。正式登入與資料邏輯未變更。截圖非正式帳戶資料。
