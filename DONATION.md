# 公益捐款功能 — 設計與進度

分支 `donation`。這份文件是中斷點的交接紀錄：設計已經定案、資料層已經寫完，API 正在進行、前端還沒開始。
回來接手時先讀「現在的狀態」和「接下來的順序」兩節。

---

## 現在的狀態

| 層 | 狀態 |
| --- | --- |
| 資料表 DDL | ✅ 完成，六支新表 ＋ `guardian` 一個新欄位 |
| drizzle schema | ✅ 完成，對真實資料庫 smoke 測過 |
| `packages/shared` 型別 | ✅ 完成（組織／捐款／公開紀錄／批次 admin） |
| `/api/charity-organization` | ✅ 完成，31 個 regression test |
| `/api/donation` | ✅ 完成，23 個 regression test |
| `/api/info/donation` | ✅ 完成，19 個 regression test |
| `/api/charity-category` | ✅ 完成，6 個 regression test |
| `/api/donation-batch` | ✅ 完成，51 個 regression test |
| admin 介面（前端） | ✅ 完成，兩頁 |
| 使用者前端（`/box/donation`） | ✅ 完成，改打真實 API |
| 公開徵信頁（`/impact`） | ✅ 完成，不需登入 |

已驗證：五支 SQL 實際灌進本機 dev DB、五條 FK 建立成功、drizzle 欄位名對得上真實資料庫、後端全套測試 193 unit ＋ 714 regression 全過（45 檔 907 個）、webapp `next build` 通過。

**前端四個畫面都沒有實際點過。** 後端有測試、前端有型別檢查與 build，但瀏覽器裡的互動（檔案上傳、確認框、分頁、VIP 的類別切換）未經人工驗證——除 `/impact` 外都需要真實 Firebase 登入才能跑起來。

### 型別為什麼不一次寫完

原本的第 1 步是「先把四組型別都寫掉」。改成跟著各自的路由走：還沒寫的端點，其回傳形狀只是猜測，先寫下來只會在實作時漂掉。`CharityOrganization` 這組是和路由同一次加的。

> `AGENTS.md` 裡「LV5 選擇是純前端、localStorage、不是正式付款狀態」那段**刻意還沒改**，因為在 API 寫好之前它仍然是對的。路由進去的那一次一起更新。

---

## 資料模型

```
guardian (既有，七個公益類別，+ unrestricted_category)
   │
   ├─< charity_organization_guardian >─ charity_organization
   │                                          │
   │                                          ├─< donation_batch ─< donation_batch_evidence
   │                                          │          │
   └──────────────< donation >────────────────┘          │
                      │ batch_id ─────────────────────────┘
                      └ user_guardian (既有)
```

| 表 | 一列代表 |
| --- | --- |
| `charity_organization` | 一個基金會／協會 |
| `charity_organization_guardian` | 「這個組織屬於這個公益類別」，多對多 |
| `donation` | 一位使用者用一隻滿級精靈換到的一筆捐款 |
| `donation_batch` | 一次實際從平台帳戶匯出的款項 |
| `donation_batch_evidence` | 一份證明文件（匯款單／收據／感謝狀） |

每張表的欄位理由都寫在 `db/table/*.sql` 的註解裡，不在這裡重複。以下只記**不會出現在 SQL 註解**的部分。

### 類別是獨立的表（2026-11-08 改過）

**原本的設計是「類別就是 guardian」**——`guardian.theme` 存那七個類別名稱，捐款相關的表直接 FK 到 `guardian`。使用者問到 VIP 與「未來類別擴充」時發現這個耦合有三個問題：

1. 要新增一個捐款類別，就**必須同時出一顆新蛋**（美術、`spiritCatalog` 的 code、商店上架、價格）
2. 同一個類別想有兩顆不同造型的蛋做不到——`theme` 可以重複，但 `donation` 指的是物種，公開頁按它分組會把一個類別裂成兩組同名區塊。而且 `guardian` 只有 `uk_code`、**`theme` 沒有 unique**，所以這個洞當時是開著的
3. `donation.guardian_id` 的語意是「類別」，`user_guardian.guardian_id` 的語意是「物種」——**同名異義**

所以拆成 `charity_category`：

```
charity_category (code, name, sort_order, is_active)   ← name 有 UNIQUE，不重蹈 1:1 的覆轍
guardian.category_id        → charity_category.id      ← NULL = 不綁類別（VIP）
charity_organization_category (organization_id, category_id)
donation.category_id        → charity_category.id
```

**`unrestricted_category` 這個旗標整個拿掉了。** 「這隻精靈可任選類別」現在就是 `guardian.category_id IS NULL`——同一句話，但由 schema 保證而不是靠程式記得檢查。

`guardian.theme` 留著，但語意收窄成「**這顆蛋自己的主題標籤**」：`/api/guardian` 和 `/api/store` 要印它，連沒有類別的 VIP 也要印。七顆蛋的 theme 今天和它們類別的 name 讀起來一樣，等一個類別有多顆蛋時就會分開。

欄位命名從此刻起要分清楚：**`user_guardian.guardian_id` 是物種，`donation.category_id` 是類別。**

### 為什麼組織↔類別是多對多

大型基金會同時落在兩個類別很常見（兒少＋教育翻轉）。多一張表現在只要十行，之後要補就得改 schema、回填、改掉所有查詢。

### 為什麼批次不存筆數和小計

批次成立後成員不會再變（`donation.user_guardian_id` 是 UNIQUE、且不能反悔），所以 `COUNT` 和 `SUM` 當場從 `donation.batch_id` 聚合就好。存成欄位只是多兩個會跟事實對不起來的東西。

`transferred_amount` 是例外，它是**銀行事實**所以要存。`transferred_amount − SUM(donation.amount)` 就是平台加碼。**若為負數代表匯少了，admin 介面必須擋下不讓公開。**

### 為什麼 `donation.guardian_id` 看起來多餘但必要

它存的是**使用者實際選的類別**。一般精靈被強制等於自己的類別，但 VIP 精靈（規劃中）可以七選一，那時 `donation.guardian_id ≠ user_guardian.guardian_id`，無法用 join 推回來。

VIP 本身會是 `guardian` 的第 8 列，而它**不能**成為 `donation.guardian_id` 的值——用 `guardian.unrestricted_category = 1` 判斷，不要在程式裡寫死 `code === 'vip'`。

---

## 已定案的決定（不要再重新討論）

| 決定 | 內容 |
| --- | --- |
| 建列時機 | **確認選擇時**才建 `donation` 列，不是滿級時 |
| 金額 | **NT$1,000**，暫定值 |
| 反悔 | **不可以**。`uk_user_guardian` UNIQUE |
| 撥款 | 批次為主，逐筆＝只含一筆的批次 |
| VIP | 規劃中，可捐給所有類別 |

### 捐款上限是「每位使用者的物種數」

`user_guardian` 有 `UNIQUE (user_id, guardian_id)`——**一個物種一隻精靈**（[store.ts](backend_new/src/routes/store.ts) 也明確回 `ALREADY_OWNED`）。配上 `donation.user_guardian_id` 的 UNIQUE：

> 一位使用者每個**物種**最多一筆捐款。今天七個物種 → 七筆；VIP 上線後八個 → 八筆。

VIP 的語意已定案為「**可任選類別，一人一隻**」，所以它帶來的是「+1 筆、而且那一筆可任選類別」，不是「可以捐更多」。`user_guardian` 的 UNIQUE 刻意不動。

拆出 `charity_category` 之後，上限跟著「物種數」走而不是「類別數」——以後一個類別掛兩顆蛋，上限就會變成九。這是刻意的：要調整上限就是調整物種數。

**但要記住**：這個預算天花板是靠一條為了「收集玩法」而存在的約束在守。哪天有人為了收集樂趣放寬「每種蛋只能有一隻」，捐款預算會無聲地變成無上限。要放寬的話，必須同時明確設一個捐款上限。

校準用的數字：1 point = 1 XP，滿級 1,000,000 XP，單選題基準約 100 點 → **一筆捐款大約一萬題**。

### 建列時機的後果（重要）

因為是確認時才建列，「滿級但還沒選對象」的那些人在 `donation` 表裡**不存在**。
所以公開頁的「累積應捐金額」**不能**用 `SUM(donation.amount)`——那會漏掉所有還沒選的人。但也不該整個用 `COUNT(user_guardian WHERE level = 5) × DONATION_AMOUNT`，那會把**已經凍結的金額**也用今天的常數重算一遍，正好違反上一節。

實際實作把它拆成兩半，各用各的依據：

```
confirmedAmount  = SUM(donation.amount)                     -- 已選的，凍結值
pendingCount     = COUNT(user_guardian WHERE level = 5)
                     − COUNT(donation)                      -- 滿級但還沒選
pendingAmount    = pendingCount × DONATION_AMOUNT           -- 只有這半用今天的數字
promisedAmount   = confirmedAmount + pendingAmount
```

`/api/info/donation` 回傳全部五個數字，所以讀的人可以自己驗算 `promisedAmount`。**只有 `pendingAmount` 會隨 `DONATION_AMOUNT` 變動**，而那正是還沒凍結的部分。

我曾提議把建列搬到滿級時好讓這個數字精確，使用者否決了。`pendingCount` 用 `Math.max(0, …)` 夾住：每筆捐款都經過滿級檢查，所以今天不可能是負的，但負數會讓應捐總額低於已撥款金額。

### 金額的後果

`donation.amount` 在確認當下凍結，顯示時絕不可以回頭讀常數，否則調整金額會把歷史紀錄一起改寫。

還沒改掉的兩個舊假數字：
- `AGENTS.md` 寫 `NT$10`
- `webapp/lib/donationDemo.ts` 的 `DEMO_DONATION_AMOUNT = 100`

### 使用者怎麼驗算自己那筆

公開頁**必須同時印出筆數**，不能只印總額：

```
批次 #12 — 財團法人OO基金會                   2026-12-01
  使用者捐款  57 筆 × NT$1,000  =  NT$57,000
  平台加碼                        +  NT$ 3,000
  實際匯出                           NT$60,000   ← 收據上的數字
  交易序號 ...8842   [匯款單] [收據] [感謝狀]
```

筆數是驗算的錨點。使用者自己那頁寫「你的 NT$1,000 包含在批次 #12 中」並連過去，他就能自己算 57×1000+3000=60000。

---

## 接下來的順序

1. ~~**`packages/shared` 型別**~~ — 改成跟著各自的路由加，見上
2. ~~**`/api/charity-organization`**~~ ✅ — 公開讀（依類別列出），admin 寫
   - `GET /`（`categoryId`、`isActive` 篩選、分頁）、`GET /:id`、`POST /`、`PUT /:id`、`PUT /:id/category`、`DELETE /:id`
   - 讀端**刻意公開**（group 掛 `adminAuth`，只擋寫）。基金會的名稱／簡介／官網本來就是公開頁要印的東西，和 `/api/question` 那種「容忍」不一樣
   - `DELETE` 在該組織已有 `donation` 或 `donation_batch` 時回 400 而不是讓 FK 變成 500。退場用 `isActive`
   - 停用（`is_active = 0`）的類別不能掛新組織。拆出 `charity_category` 之後，「VIP 不能當第八個類別」這個守衛就不需要了——VIP 根本不在那張表裡，填不進去
   - `tax_id` 重複回 400；`isActive` query 用 `'true'|'false'` 字面值，不用 `z.coerce.boolean()`（它會把 `"false"` 轉成 true）
3. ~~**`/api/donation`**~~ ✅ — 使用者確認選擇、查自己的紀錄
   - `POST /`（確認）、`GET /`（自己的紀錄，分頁，附 `donationAmount`）
   - `DONATION_AMOUNT = 1000` 在 `src/lib/donationAmount.ts`，確認時複製進 `donation.amount`，顯示時絕不回頭讀。放在 lib 不放 route，因為 `/api/info/donation` 也要用它算還沒選的那半——route import route 只為一個常數，是第二份副本的起點
   - 重放的確認回 400 `DONATION_ALREADY_CONFIRMED`（`uk_user_guardian` 仍是真正的保證，這個檢查只是讓它有話可說而不是 500）
   - 別人的精靈回 **404 不是 403**——某個 id 存不存在不是這個呼叫者的事
   - 一般精靈只能捐自己的類別（`categoryId` 省略即可，填錯回 `DONATION_CATEGORY_INVALID`）；`guardian.category_id IS NULL` 的（VIP）必須明寫 `categoryId`
   - 組織必須 `isActive` 且確實掛在所選類別下（公開頁是按類別分組的）
   - `batch` 用 **left join**：剛確認完的捐款沒有批次，那是最常見的狀態
4. ~~**`/api/info/donation`**~~ ✅ — 公開徵信頁的資料。掛在 `/api/info/*` 底下可直接吃到既有的 5 分鐘 CloudFront TTL，且那條 behavior 本來就不轉送 `Authorization`，公開端點完全相符
   - 寫在 `routes/info.ts` 裡，不另開路由檔；`app.ts` 要單獨掛 `transaction`（那個 group 是逐路徑掛的，`/api/info` 本身是健康檢查，資料庫掛了也要回 200）
   - 只列 `published = 1` 的批次。**summary 的 `transferredAmount` 用同一個條件**，所以把看得到的批次加起來就等於那個總額
   - 每個批次帶 `donationCount` / `donationSubtotal` / `platformTopUp` / `transferredAmount`，而 `donationCount × donationUnitAmount + platformTopUp = transferredAmount` 就是收據上的數字
   - `donationUnitAmount` 在成員金額不一致時回 **null**（用 `COUNT(DISTINCT amount)` 判斷）。「57 × NT$1,000」這行只在金額一致時成立，所以是後端決定、不是前端猜
   - `platformTopUp` **帶正負號，不夾到 0**。匯少的批次本來就不該被公開（那是 admin 介面的責任），但真的漏出去時，夾成 0 會破壞這頁唯一存在的理由——那條驗算式
   - 聚合值在 SQL 裡 `cast(… as signed)`：裸的 `SUM()` 經 mysql2 回來是**字串**，會原封不動變成 JSON 裡的 `"57000"`。這點用測試釘住了（拿掉 cast 會爆 8 個）
5. **admin 介面** — 分成後端與前端兩半
   - **5a. `/api/donation-batch`** ✅ — 批次的 API 原本整個不存在，不只是「介面」沒做。全部掛 `requireAdmin`（不是 `adminAuth`）：`GET /unpaid` 會列出哪個使用者被欠多少，讀端開放就等於公開個人捐款資料。公開版本是 `/api/info/donation`，那邊只列批次、永不列人
     - 作業流程就是端點順序：`GET /unpaid?organizationId=` → `POST /` → `POST /:id/evidence` → `PUT /:id/publish`
     - **公開的守衛在 `PUT /:id/publish`**：匯出金額 < 捐款小計回 `BATCH_UNDERPAID`、零張證明回 `BATCH_NO_EVIDENCE`。`/api/info/donation` 刻意讓 `platformTopUp` 帶負號而不夾到 0，就是因為這件事在這裡擋；兩邊的測試互相引用
     - **建立時刻意寬鬆**：金額低於小計照建，只是不能公開。未公開批次上的錯字該用 `PUT` 修，不該讓剛組好的成員清單整組作廢
     - 成員用明確的 `donationIds[]`，不是「該組織所有未撥款的」。admin 付他看到的那些，清單載入後才確認的捐款不會被掃進沒涵蓋它的匯款
     - 成員清單**建立後凍結**（`donation_batch` 的 schema 註解就這麼寫，公開頁的驗算式依賴它）。要改成員只能 `DELETE` 整個批次——它會把 `donation.batch_id` 放回 NULL——再重建
     - 已公開的批次不可改、不可刪，**但可以加證明**：收據和感謝狀常常晚幾週才到，為了附上它們而把真實撥款收回隱藏更糟
     - `PUT /:id/unpublish` 給誤按留退路
     - `GET /unpaid` 的 `summary` 描述**整個未撥款集合**而非當前頁。批次只能從畫面上的資料組，所以第二頁必須有辦法讓人知道它存在
     - 證明上傳接受 PDF（銀行和基金會實際寄來的就是 PDF）。後果歸算繪製端：PDF 不能當 `<img>` 的來源，公開頁要分支處理
     - `s3_key` 存下來而不是事後從 URL 反推：`deleteFromS3` 要的是 key，而從 URL 推導會在 bucket 或 region 一改時無聲失效
     - 刪除時先刪列、後刪物件。S3 失敗時兩種順序沒差（整個 handler 回滾），差別在「物件刪掉後刪列才失敗」那種情況——反過來會留下指向不存在物件的列
   - **5b. 前端 admin 頁** ✅ — 兩頁，都登記在 `/admin` 入口
     - **先補了 `GET /api/charity-category`**：原本整個 repo 沒有任何端點能列出公益類別，所以組織維護頁的類別勾選框沒東西可選。這是 5a 沒發現的缺口。唯讀（類別是 seed 出來的，且用 `code` 綁著精靈物種；開 API 新增第八個類別只會生出沒有蛋通往的類別，改名則會無聲改寫公開紀錄裡「這筆捐款支持了什麼」）。讀端開放，和 `charity-organization` 一致——這些名稱本來就印在公開頁上
     - `/admin/charity-organization`：列表（依類別／狀態篩選）、新增／編輯 modal、停用切換、刪除。**刪除按鈕留著但以停用為主**：後端在組織已有捐款或批次時回 400，UI 的確認框直接告訴使用者「已經有人捐給它的話請改用停用」
     - 已停用的類別若已經掛在該組織上，會以**不可取消的勾選**顯示並標註「儲存時會被拒絕」。單純把它從清單濾掉的話，一次無關的儲存會失敗而畫面上沒有任何線索
     - `/admin/donation-batch`：兩個 tab。「建立撥款」＝選組織 → 勾選捐款（預設全選本頁、金額預填小計）→ 填匯款資訊 → 建立；「撥款批次」＝列表 ＋ 詳細 modal（上傳／刪除證明、公開、取消公開、刪除）
     - **金額低於小計時當場說**，不等後端拒絕：表單即時顯示「比小計少 NT$X——批次可以建立，但無法公開」，列表的狀態欄顯示「未完備」，詳細頁的公開按鈕 disabled 並寫出原因
     - 待撥款的 `summary` 顯示在清單上方，且當 `unpaidCount > 本頁筆數` 時明確標註「其餘請分批處理」——批次只能收本頁的捐款，第二頁必須自己出聲
     - 上傳走既有的 `toApiImage`（`webapp/lib/imageFile.ts`），過大的照片會自動縮，PDF 無法縮所以過大就明確拒絕並說明上限
     - 選取狀態每次重載清單就重設：隔了一段時間的 id 可能已被別的批次收走，而 `POST` 是整批拒絕的
   - ⚠️ **證明上傳在 S3 prefix 開通前無法真的用**，見下
6. ~~**前端**~~ ✅ — `/box/donation` 改打真實 API，新增公開頁 `/impact`
   - **先補了 `GET /api/guardian` 的 `category`**：選擇畫面要列「這隻精靈所屬類別下的組織」，而那支 API 原本只回傳 `theme`（顯示標籤，不是類別）。`invest` 的回應走同一個 DTO 所以一起補。兩邊都用 **left join**——`categoryId IS NULL` 的精靈（VIP）不能從自己主人的收藏裡消失
   - **真實流程獨立成 `app/box/DonationFlow.tsx`**，不在 `DonationDemo.tsx` 裡加 `demoMode` 分支。那個檔案的狀態在 localStorage、組織是虛構的，兩個來源混在同一個元件裡，正是「示範金額被當成真實承諾印出來」的成因。demo 保留在 `?demo=donation` 供設計檢視，路由層分流（`app/box/donation/DonationRouteClient.tsx`）
   - 「這隻精靈用掉了嗎」是**去找有沒有 `userGuardianId` 等於它的 donation**，不是看精靈上的旗標——上限是每個物種一筆，`user_guardian` 的 UNIQUE 就是那個保證
   - 紀錄頁印 **`donation.amount`（凍結值）**，不是今天的 `donationAmount`。只有「還沒確認」的畫面可以印今天的數字
   - 類別選單**只對 `category === null` 的精靈出現**。其他精靈只有一個合法值，給選擇再被後端拒絕比不給更糟
   - `categoryId` 也只在 VIP 時送出。一般精靈省略即可，省得前端得猜對
   - 只列 `isActive=true` 的組織：停用的會被 `POST /api/donation` 拒絕，列出來是死路
   - 連到 `/impact` 的連結**只在 `batch.published` 時出現**。未公開的批次不在那頁上，連過去會看不到自己那筆
   - 慶祝彩帶的「看過了」仍存 localStorage。那是純粹的單人便利性，正是 localStorage 該用的地方；storage 被封鎖時當成「已看過」，重複放彩帶比不放更糟
   - **公開頁 `/impact` 刻意在 `AuthGuard` 外面。** 只有有帳號的人看得到的紀錄不算證明。它把驗算式印出來而不是只給總額：`筆數 × 單筆金額 ＋ 平台加碼 = 實際匯出`，旁邊就是那筆金額的證明文件
   - `donationUnitAmount` 為 null（成員金額不一致）時不印「N × NT$X」那行，只印小計——這是後端用 `COUNT(DISTINCT)` 決定的，前端不猜
   - **`SupportNote` 的金額改成從 API 讀**。它原本寫死 `NT$10`，在後端 `DONATION_AMOUNT` 搬動後就過期了；承諾旁邊的數字是最不該放第二份副本的地方。讀不到時不印佔位數字，只是不報價
   - 樣式沿用 `webapp/styles/donation-demo.css`（名字已經不準，檔頭加了說明：`.donation-flow-*` 等規則現在三個畫面共用）

每一步都要附 regression test，照 `backend_new/regression/routes/` 既有寫法。

### 兩個頁面

| 頁面 | 身分 | 內容 |
| --- | --- | --- |
| `/box/donation/` | 登入 | 選擇 → 確認 → 我的紀錄；紀錄頁連到對應批次 |
| 公開頁 | **不需登入** | 所有已公開批次。不需登入才有意義——能給任何人看正是它作為證明的價值 |

公開頁不列任何使用者身分，只列批次。

---

## 需要使用者處理的事

**① S3 bucket policy（做到第 5 步時提醒）**
`castor-public-bucket` 的 policy 是手動維護、不在 CloudFormation 裡，目前只對 `questions/` 這個 prefix 開公開讀。證明文件要放 `donations/` prefix，需要使用者自己改或明確授權。**不要自行修改。**

**② 跟每個合作基金會確認這句話**
> 「我們會在網站公開頁面列出貴單位的名稱、簡介與官網連結，並公開本次匯款的收據／感謝狀影本，請問可以嗎？」

《公益勸募條例》管的是向公眾募集財物，這裡是平台拿自己的錢捐、使用者一毛沒付，判斷不構成勸募。要處理的就是上面那句同意。

**③ ~~`db/script/v1.1.0/` 這個資料夾名稱~~** ✅ 已解決
2026-11-09 搬進 `db/script/v1.0.0/`，`v1.1.0` 資料夾移除。那支 `ALTER` 腳本一併刪掉——
它只對「在捐款功能之前就存在的資料庫」有意義，而那個資料庫只有一個（正式庫），已經跑過了。

**④ 金額 NT$1,000 還是暫定的**
前端已經不再寫死任何金額：`SupportNote` 和選擇流程都從 API 讀，紀錄頁一律印凍結值。所以調整 `DONATION_AMOUNT` 不需要改前端。總積分與訂閱價的連動見 `POINTS.md`。

**⑤ `SupportNote` 原本宣告的「每月提撥總額以新台幣 5,000 元為上限」已從文案移除**
那個上限**沒有任何實作**——後端沒有任何每月累計或封頂邏輯，`POST /api/donation` 不看當月總額。留著它等於對使用者承諾一個系統不會執行的規則。如果這個上限是真的要有，它是一條後端規則（確認時檢查當月已確認金額），要另外做；在那之前文案不該宣稱它。

---

## 正式資料庫怎麼上

**正式庫已於 2026-11-08 套用**（使用者自行執行），本機 dev DB 也已套用。這一節留給下一個環境。

從 repo 根目錄依序跑：

```bash
mysql ... < db/table/charity_category.sql
mysql ... < db/table/charity_organization.sql
mysql ... < db/table/charity_organization_category.sql
mysql ... < db/table/donation_batch.sql
mysql ... < db/table/donation_batch_evidence.sql
mysql ... < db/script/v1.0.0/insert_charity_category.sql
mysql ... < db/table/donation.sql
```

**順序有意義**：`charity_category` 要最先（`guardian` 的外鍵指向它），`donation.sql` 要最後（它的外鍵也指向 `charity_category`）。

六支 table 檔是 `CREATE TABLE IF NOT EXISTS`，可以重複執行。
`insert_charity_category.sql` 的 INSERT 不可重跑（`uk_code` 會擋），但它的 UPDATE 本身是 idempotent 的。

> **原本還有一支 `ALTER TABLE guardian ADD COLUMN category_id` 的升級腳本，已經刪掉。**
> 它只對捐款功能之前就存在的資料庫有意義，而那個資料庫（正式庫）已經跑過了。
> `category_id` 和它的外鍵現在由 `db/table/guardian.sql` 自己帶，新環境不需要任何 ALTER。
> 外鍵名稱 `fk_guardian_category` 在那支檔案裡明寫著，**不要拿掉**——正式庫就是這個名字。

> **不要用 GUI client 跑這些檔案。** `CREATE TABLE` 括號內有空行，而 DBeaver 若開了
> 「Blank line is statement delimiter」會把一個語句切成好幾段（症狀是 `1064` 錯誤指在
> `created_at` 那一行）。另外有幾支檔案的註解裡帶分號，也是切分地雷。用 `mysql` CLI。

新環境不需要跑這些，`backend_new/docker-compose.yml` 已經掛好了：`charity_category` 是 `24a`（排在 `guardian` 的 25 之前），其餘 29–33，類別 seed 是 92（要在 guardian seed 91 之後，它靠 code 連回去）。

---

## 檔案

| 路徑 | 說明 |
| --- | --- |
| `db/table/charity_category.sql` | 新增 |
| `db/table/charity_organization.sql` | 新增 |
| `db/table/charity_organization_category.sql` | 新增 |
| `db/table/donation_batch.sql` | 新增 |
| `db/table/donation_batch_evidence.sql` | 新增 |
| `db/table/donation.sql` | 新增 |
| `db/script/v1.0.0/insert_charity_category.sql` | 新增，七個類別的 seed ＋ 依 code 連回 guardian |
| `db/table/guardian.sql` | 加 `category_id`（取代原本的 `unrestricted_category`） |
| `backend_new/src/db/schema.ts` | 加六張表 ＋ `guardian.categoryId` |
| `backend_new/src/lib/guardianLevel.ts` | 新增。`LEVEL_XP_THRESHOLDS` / `MAX_LEVEL` 從 `routes/guardian.ts` 搬出來共用——捐款要判斷滿級，而 `MAX_LEVEL` 絕不能有兩份 |
| `backend_new/src/routes/charityOrganization.ts` | 新增 |
| `backend_new/src/routes/donation.ts` | 新增 |
| `backend_new/src/routes/donationBatch.ts` | 新增。撥款作業全套，admin only |
| `backend_new/src/routes/charityCategory.ts` | 新增。唯讀類別清單，給組織維護頁的勾選框 |
| `backend_new/src/routes/guardian.ts` | 加回傳 `category`（列表與 `invest` 都要） |
| `webapp/app/box/DonationFlow.tsx` | 新增。真實 LV5 流程 |
| `webapp/app/box/donation/DonationRouteClient.tsx` | 新增。demo 與真實流程的路由分流 |
| `webapp/app/impact/` | 新增。公開徵信頁，不需登入 |
| `webapp/app/box/SupportNote.tsx` | 金額改讀 API；加公開頁連結；移除未實作的每月上限文案 |
| `webapp/app/box/BoxClient.tsx` | 改用 `DonationEntry`；本地 `GuardianDto` 改為 shared `Guardian` 的別名 |
| `webapp/styles/donation-demo.css` | 加 `/impact` 的樣式 ＋ 檔頭說明 |
| `webapp/app/admin/charity-organization/` | 新增。組織 CRUD ＋ 類別多選 |
| `webapp/app/admin/donation-batch/` | 新增。撥款流程兩個 tab |
| `webapp/app/admin/page.tsx` | 加兩個後台入口 |
| `backend_new/src/lib/donationAmount.ts` | 新增。`DONATION_AMOUNT` 從 `routes/donation.ts` 搬出來，給 `/api/info/donation` 共用 |
| `backend_new/src/routes/info.ts` | 加 `GET /donation`（公開徵信） |
| `backend_new/src/routes/species.ts` | 加回傳 `category`，讓 `/admin/species` 看得見漏綁類別的蛋 |
| `webapp/app/admin/species/SpeciesClient.tsx` | 印公益類別；未綁定時出警示 badge |
| `backend_new/docker-compose.yml` | 掛載 29–33 |

前端原型沒有被刪掉，而是降級成設計檢視用：`webapp/app/box/DonationDemo.tsx` 與
`webapp/lib/donationDemo.ts` 只在 `/box/donation/?demo=donation` 這條路徑下使用，組織是虛構的、
狀態在 localStorage。真實流程是 `webapp/app/box/DonationFlow.tsx`，由
`webapp/app/box/donation/DonationRouteClient.tsx` 在路由層分流。
**不要把兩者合併成同一個元件**——那個檔案的示範金額被當成真實承諾印出來，就是這樣發生的。
