# 公益捐款功能 — 設計與進度

分支 `donation`。這份文件是中斷點的交接紀錄：設計已經定案、資料層已經寫完，API 和前端還沒開始。
回來接手時先讀「現在的狀態」和「接下來的順序」兩節。

---

## 現在的狀態

| 層 | 狀態 |
| --- | --- |
| 資料表 DDL | ✅ 完成，五支新表 ＋ `guardian` 一個新欄位 |
| drizzle schema | ✅ 完成，對真實資料庫 smoke 測過 |
| `packages/shared` 型別 | ❌ 未開始 |
| API 路由 | ❌ 未開始 |
| admin 介面 | ❌ 未開始 |
| 前端（`/box/donation`、公開頁） | ❌ 未開始，目前仍是 localStorage 原型 |

已驗證：五支 SQL 實際灌進本機 dev DB、五條 FK 建立成功、`ALTER` 實際跑過、drizzle 欄位名對得上真實資料庫、後端全套測試 753 全過。

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

### 類別就是 guardian，沒有另外的 category 表

`guardian.theme` 存的就是那七個公益類別名稱（`兒少、家庭與婦幼` 等），而 `guardian.code` 同時是 `webapp/lib/guardianArtwork.ts` 的 join key。
所以「公益類別」不需要新表，直接 FK 到 `guardian`。參見 `AGENTS.md` 的 Spirit categories 表。

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

### 建列時機的後果（重要）

因為是確認時才建列，「滿級但還沒選對象」的那些人在 `donation` 表裡**不存在**。
所以公開頁的「累積應捐金額」**不能**用 `SUM(donation.amount)`，要用：

```sql
SELECT COUNT(*) FROM user_guardian WHERE level = 5   -- × DONATION_AMOUNT
```

我曾提議把建列搬到滿級時好讓這個數字精確，使用者否決了。這個算法在「每筆金額一致」的前提下是準的；**若金額之後分級，這裡要重新設計。**

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

1. **`packages/shared` 型別** — 組織、批次、捐款、公開頁 response
2. **`/api/charity-organization`** — 公開讀（依類別列出），admin 寫
3. **`/api/donation`** — 使用者確認選擇、查自己的紀錄
4. **`/api/info/donation`** — 公開徵信頁的資料。掛在 `/api/info/*` 底下可直接吃到既有的 5 分鐘 CloudFront TTL，且那條 behavior 本來就不轉送 `Authorization`，公開端點完全相符
5. **admin 介面** — 組織維護、批次建立、證明上傳 ← **做到這裡要先處理 S3，見下**
6. **前端** — `/box/donation` 從 localStorage 換成真資料；新增公開頁（`/impact` 之類，**不需登入**）

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

**③ `db/script/v1.1.0/` 這個資料夾名稱是我取的**
既有只有 `v1.0.0`，backend package 是 `0.1.0`、webapp 是 `1.0.0`，看不出慣例。有規則的話改名。

**④ 金額 NT$1,000 還是暫定的**

---

## 正式資料庫怎麼上

本機 dev DB（docker）已經套用過了。**正式庫一個字都還沒碰。**

從 repo 根目錄依序跑：

```bash
mysql ... < db/table/charity_organization.sql
mysql ... < db/table/charity_organization_guardian.sql
mysql ... < db/table/donation_batch.sql
mysql ... < db/table/donation_batch_evidence.sql
mysql ... < db/table/donation.sql
mysql ... < db/script/v1.1.0/donation.sql
```

前五支是 `CREATE TABLE IF NOT EXISTS`，可以重複執行。
最後一支**不可以**重複執行——MySQL 沒有 `ADD COLUMN IF NOT EXISTS`，跑第二次會在 `Duplicate column name` 停住。那是刻意的：它會停下來，而不是靜悄悄改了什麼。

新環境不需要跑這些，`backend_new/docker-compose.yml` 已經把五支掛成 29–33。

---

## 檔案

| 路徑 | 說明 |
| --- | --- |
| `db/table/charity_organization.sql` | 新增 |
| `db/table/charity_organization_guardian.sql` | 新增 |
| `db/table/donation_batch.sql` | 新增 |
| `db/table/donation_batch_evidence.sql` | 新增 |
| `db/table/donation.sql` | 新增 |
| `db/script/v1.1.0/donation.sql` | 新增，既有資料庫的 `ALTER` |
| `db/table/guardian.sql` | 加 `unrestricted_category` |
| `backend_new/src/db/schema.ts` | 加五張表 ＋ `unrestrictedCategory` |
| `backend_new/docker-compose.yml` | 掛載 29–33 |

現有的前端原型（之後要換掉的）：
`webapp/app/box/DonationDemo.tsx`、`webapp/lib/donationDemo.ts`、`webapp/app/box/donation/page.tsx`
