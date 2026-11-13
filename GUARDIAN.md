# 新增一顆精靈蛋 — 完整步驟

> Keywords: add a new egg / guardian / spirit species, new charity category,
> VIP egg, `guardian.category_id` NULL, `artworkByCode`, `spiritCatalog`,
> `SpiritSpecies`, egg artwork, 新增蛋, 新增精靈, 新增公益類別.

## 快速答案

**改五個地方。① 和 ⑤ 沒有任何錯誤訊息，漏了只會無聲壞掉。**

| | 情境 1：綁定某個公益類別 | 情境 2：VIP（不綁類別） |
| --- | --- | --- |
| ① `castor.guardian` 資料列 | `category_id` = 該類別的 id，**用子查詢取、不要手打** | `category_id` = **`NULL`**（刻意的，見下） |
| ② `db/script/v1.0.0/insert_guardian.sql` | 加同一列，**明寫 `category_id`** | 加同一列，`category_id` 留 NULL |
| ③ `webapp/lib/guardianArtwork.ts` | 三處：`SpiritSpecies` 聯集 ＋ `spiritCatalog` ＋ `artworkByCode` | 同左；**沒有圖就不要加 `artworkByCode`** |
| ④ 圖檔 ×5 | `webapp/public/illustrations/guardians/<species>/lv1..lv5.webp` | 沒有圖就跳過，前端自動留白 |
| ⑤ `AGENTS.md` 的 Spirit categories 表 | 加一列 | 加一列，**務必註明它是 VIP** |

```sql
-- 情境 1
INSERT INTO castor.guardian
(code, name, theme, cost, category_id, sort_order, is_active, created_at)
SELECT 'mycode', '某某之蛋', '顯示主題', 10, c.id, 8, 1, now(3)
FROM castor.charity_category c WHERE c.code = 'children';

-- 情境 2（VIP）
INSERT INTO castor.guardian
(code, name, theme, cost, category_id, sort_order, is_active, created_at)
VALUES ('vip', 'VIP 星冠之蛋', '可任選公益類別', 10, NULL, 99, 1, now(3));
```

**驗證**：`cd backend_new && npm run typecheck` → `cd webapp && npm run build` → 開 **`/admin/species`**。

### 兩個一定會踩到的陷阱

1. **`category_id` 必須在 INSERT 裡明寫。** 種子腳本的回填是
   `JOIN charity_category c ON c.code = g.code`，而 `guardian.code` 是 UNIQUE——所以
   **同一類別的第二顆蛋 code 必然不同，那個 JOIN 永遠對不上**。漏了不會報錯，
   而 `category_id IS NULL` 的語意就是「可任選類別」，那顆蛋會直接變成一隻 VIP，
   主人可以把真實的錢導向任何類別。

2. **VIP 和「漏填」在畫面上完全一樣。** `/admin/species` 的琥珀色「未綁定類別」badge
   對真 VIP 也會亮（刻意的）。所以 **`AGENTS.md` 那張表是唯一能分辨兩者的地方**。

**不需要改**：`schema.ts`、任何後端路由、`docker-compose.yml`、
`webapp/lib/donationDemo.ts`。新增一顆蛋是加資料，不是加程式分支。

**只要新增類別、不出新蛋**：看下面的「情境 C」，答案是只跑一條 INSERT，零程式碼變更。

---

以下是完整版本與理由。

一顆蛋的身分**不是單一來源**：資料庫有一列、前端有三份硬編碼、圖檔是五個檔案、
`AGENTS.md` 有一張對照表。任何一處漏掉都不會報錯——它會**無聲地**退化成鎖住的蛋、
沒有圖、或（最糟的）變成一隻多出來的 VIP。

這份文件就是為了讓那件事不再靠記憶。

本文在 **2026-11-09** 對 `donation` 分支查證過。改動下列任一處時，連同這份文件一起更新。

---

## 一顆蛋的身分散在哪裡

| # | 位置 | 內容 | 漏掉的後果 |
| --- | --- | --- | --- |
| 1 | `castor.guardian` 資料列 | `code`、`name`、`theme`、`cost`、**`category_id`**、`sort_order`、`is_active` | 蛋不存在，商店看不到 |
| 2 | `db/script/v1.0.0/insert_guardian.sql` | 同一列的 repo 副本 | 全新環境（docker）沒有這顆蛋 |
| 3 | `webapp/lib/guardianArtwork.ts` → `SpiritSpecies` | 型別聯集加一個 key | TypeScript 編譯失敗（這是唯一會**吵**的一處） |
| 4 | 同上 → `spiritCatalog` | `name`、`category`、`artwork`、`tone`、`stages` | 型別缺 key，編譯失敗 |
| 5 | 同上 → `artworkByCode` | `guardian.code` → `SpiritSpecies` | **無聲**：顯示鎖住的蛋，名稱退回資料庫的 `name` |
| 6 | `webapp/public/illustrations/guardians/<species>/lv1..lv5.webp` | 五張圖 | **無聲**：`spiritImage()` 回 undefined，顯示鎖住的蛋 |
| 7 | `webapp/source-assets/png/illustrations/guardians/<species>/` | 原始 PNG | 之後要重壓圖時沒有來源 |
| 8 | `AGENTS.md` 的 **Spirit categories** 表 | 一列 | 下一個人（或 AI）讀到的是過期清單 |

第 3、4 項會讓 build 失敗，所以不會漏。**真正會咬人的是 1、5、6**——它們全都無聲。

---

## 情境 A：新增一顆蛋，指向某個既有的公益類別

### A-1. 資料庫（正式庫要手動跑）

```sql
SET NAMES utf8mb4;

INSERT INTO castor.guardian
(code, name, theme, cost, category_id, sort_order, is_active, created_at)
SELECT 'mycode', '某某之蛋', '顯示用主題', 10, c.id, 8, 1, now(3)
FROM castor.charity_category c
WHERE c.code = 'children';   -- ← 要綁的類別
```

用 `SELECT ... FROM charity_category WHERE code = ?` 取 `category_id`，**不要手打 id**。
id 是 auto-increment，每個環境不一樣（正式庫的 guardian id 是 7–13，因為它們取代過一組舊的）。

> ### ⚠️ 這裡是整份文件最危險的一步
>
> `db/script/v1.0.0/insert_charity_category.sql` 的回填是
> `JOIN charity_category c ON c.code = g.code`——**只在蛋的 code 和類別的 code 相同時才會對上**。
>
> 而 `guardian.code` 是 UNIQUE，所以**同一個類別的第二顆蛋，code 必然不同**，
> 那個 JOIN 永遠不會幫它填 `category_id`。
>
> 漏掉 `category_id` 的後果不是「少一個欄位」：**NULL 的語意就是「不綁類別、可任選」**，
> 也就是這顆蛋會變成一隻沉默的 VIP，它的主人可以把捐款導向任何類別。
> 沒有任何地方會報錯。
>
> 所以：**第二顆同類別的蛋，`category_id` 一定要在 INSERT 裡明寫**（像上面那樣用子查詢）。

### A-2. repo 的種子副本

`db/script/v1.0.0/insert_guardian.sql` 加一列。注意那支檔案**不寫 `category_id`**
（它靠 `insert_charity_category.sql` 回填），所以如果新蛋的 code 不等於類別的 code，
**你必須在那支檔案裡也明寫 `category_id`**，否則全新環境會長出一隻 VIP。

`cost` 目前七顆一律 **10**，刻意不做階梯價，不要「修正」成遞增。

### A-3. 前端（`webapp/lib/guardianArtwork.ts`）

```ts
export type SpiritSpecies =
  | 'cat'
  // …
  | 'myspecies'        // ← 1. 型別聯集

export const spiritCatalog: Record<SpiritSpecies, SpiritDefinition> = {
  // …
  myspecies: {         // ← 2. 目錄
    name: '某某精靈',
    category: '兒少、家庭與婦幼',          // 顯示字串，見下方說明
    artwork: '/illustrations/guardians/myspecies',   // 沒圖就整個省略這行
    tone: 'forest',    // 'forest' | 'sky'，只影響 .sp-scene-- 的背景色
    stages: ['初生', '萌芽', '探索', '茁壯', '綻放'],   // 五個，對應 LV1–LV5
  },
}

export const artworkByCode: Partial<Record<string, SpiritSpecies>> = {
  // …
  mycode: 'myspecies',  // ← 3. 資料庫 code → 畫好的精靈
}
```

四件事要知道：

- **`artworkByCode` 的 key 是 `guardian.code`，值是 `SpiritSpecies`。** 兩邊不同命名空間：
  `code` 是資料庫的、`SpiritSpecies` 是圖檔目錄的。目前七個 code 對五個物種（兩顆還沒畫）。
- **沒有圖就不要加進 `artworkByCode`。** 缺席是正常狀態——蛋會顯示鎖住的圖和資料庫的 `name`，
  一切正常運作。加了卻沒有圖檔反而更糟（`spiritImage()` 回 undefined，但其他地方以為有圖）。
- **`spiritCatalog[...].category` 是第三份類別名稱的副本**，而且**真實流程已經不讀它了**
  （`DonationFlow.tsx` 用 API 回傳的 `guardian.category.name`）。它現在只剩
  `BoxClient` 的收藏標題、`components/spirit` 的 eyebrow、和 localStorage demo 在用。
  填對是為了畫面文字一致，不是為了邏輯正確。
- **`stages` 要正好五個**，`components/spirit/index.tsx` 直接用 `stages[level - 1]`。
  給三個的話 LV4、LV5 會顯示 `undefined`。

### A-4. 圖檔

| | |
| --- | --- |
| 路徑 | `webapp/public/illustrations/guardians/<species>/lv1.webp` … `lv5.webp` |
| 尺寸 | **1254 × 1254**（現有全部都是，`locked-egg.webp` 也是） |
| 格式 | WebP，RGB |
| 原始檔 | 同步放 `webapp/source-assets/png/illustrations/guardians/<species>/lv1..lv5.png` |

**壓縮請用有損（lossy）。** 現有檔案不一致，這是既有的技術債：

| 物種 | 編碼 | LV1–LV5 大小 |
| --- | --- | --- |
| `otter` | VP8（有損） | 212–326 KB |
| `rabbit` | VP8（有損） | 198–378 KB |
| `bird` | **VP8L（無損）** | 1407–1656 KB |
| `cat` | **VP8L（無損）** | 1600–1906 KB |
| `deer` | **VP8L（無損）** | 1402–2392 KB |

無損那三個是有損的 **5–7 倍**，一個物種五張就 7–10 MB。新蛋請對齊 `otter`／`rabbit`
那一組：**壓到 200–350 KB 區間**，編碼是 VP8（有損）而非 VP8L。

具體的品質參數**沒有紀錄**——現有檔案只能看出位元組大小和編碼，反推不出當初用的設定，
所以請自己試幾個值，比對檔案大小和 1254×1254 下的畫質。repo 裡也沒有任何壓圖工具或腳本，
這一步目前完全是手動的。

### A-5. `AGENTS.md`

**Spirit categories** 那張表加一列：

```
| `mycode` | 兒少、家庭與婦幼 | 某某 | LV1-LV5 available | 某某之蛋 |
```

那張表是 repo 對「哪些 code 是活的」的紀錄。它曾經過期過——一次改名留下三個不存在的 code
在種子檔裡，同時四個活的 code 沒被 seed，而沒有任何機制會發現。

### A-6. 驗證（不要跳過）

1. `npm run typecheck`（在 `backend_new`；兩個 tsconfig 都要跑，`npx tsc --noEmit` 只檢查 `src/`）
2. `cd webapp && npm run build`
3. 開 **`/admin/species`**。這一頁是唯一同時檢查兩個方向的地方：
   - 每一列資料庫的 `guardian` 旁邊顯示它的圖；沒對上的標「尚無圖檔」
   - 前端 `spiritCatalog` 有定義但資料庫沒有對應列的，單獨列在下方
   - **`category_id` 是 NULL 的會標琥珀色「未綁定類別」**——這就是 A-1 那個陷阱的防線
4. 開 `/box`，確認商店列出新蛋、兌換後圖片正確

---

## 情境 B：新增一顆 VIP 蛋（不綁任何類別）

和情境 A 完全相同，只有一處不同：**`category_id` 故意留 NULL。**

```sql
INSERT INTO castor.guardian
(code, name, theme, cost, category_id, sort_order, is_active, created_at)
VALUES ('vip', 'VIP 星冠之蛋', '可任選公益類別', 10, NULL, 99, 1, now(3));
```

NULL 不是「忘了填」，它是一句完整的敘述：**這顆蛋的主人可以把捐款導向任何類別。**
後端據此行為：

- `GET /api/guardian` 回傳 `category: null`
- `/box/donation` 的選擇畫面**只對 `category === null` 的精靈顯示類別下拉選單**
- `POST /api/donation` 對這種精靈**要求**明寫 `categoryId`（省略回 `DONATION_CATEGORY_REQUIRED`）；
  一般精靈則相反，明寫錯的類別回 `DONATION_CATEGORY_INVALID`

### VIP 和「漏填」在畫面上一模一樣

`/admin/species` 的「未綁定類別」badge **對真正的 VIP 也會亮**，而且是刻意的：
那個 badge 的工作是讓讀的人停下來問「這顆蛋應該不綁類別嗎」。

所以 VIP 上線後，**唯一能分辨「刻意的 VIP」和「漏填的蛋」的地方就是 `AGENTS.md` 那張表**。
新增 VIP 時務必在表裡寫明它是 VIP，否則下一個人看到琥珀色 badge 會不知道該不該修。

### 圖檔

VIP 目前**沒有圖**。沒有圖時不要加進 `artworkByCode`，前端會用
`<span className="donation-vip-art-blank">` 這個留白佔位（已經在
`DonationFlow.tsx` 和 `DonationDemo.tsx` 裡）。等圖做好後照 A-3、A-4 補上即可。

---

## 情境 C：順便要新增一個公益類別

類別和蛋是**各自獨立**的（這是把 `charity_category` 拆出來的理由之一：
加類別不必出一顆新蛋，一個類別也能有多顆蛋）。

```sql
SET NAMES utf8mb4;
INSERT INTO castor.charity_category (code, name, sort_order, is_active, created_at)
VALUES ('mycat', '新類別名稱', 8, 1, now(3));
```

- `code` 和 `name` **都是 UNIQUE**。`name` 的唯一性是刻意的：舊設計曾經讓兩顆同 `theme` 的蛋
  把一個類別裂成兩個同名群組，而且沒有任何東西會發現。
- **不需要任何程式碼變更。** `GET /api/charity-category` 是從資料庫讀的，
  `/admin/charity-organization` 的勾選框和公開頁都跟著動。
- 新類別**沒有組織**，所以在 `/admin/charity-organization` 建至少一個並掛在它下面，
  否則使用者的選擇畫面會顯示「這個類別目前沒有合作組織」。
- 要退場用 `is_active = 0`，**不要 DELETE**：既有捐款指向它，公開紀錄要一直能說出它的名字。
  停用只會讓它退出選單。

---

## 不需要改的東西

避免過度操作，以下都**不用**動：

| | 為什麼 |
| --- | --- |
| `backend_new/src/db/schema.ts` | 新增一列資料不是 schema 變更 |
| 任何後端路由 | 蛋是資料，不是程式分支 |
| `backend_new/docker-compose.yml` | 種子檔已經掛好（`91_insert_guardian.sql`） |
| `webapp/lib/donationDemo.ts` | 它從 `spiritCatalog` 推導，自動跟上 |
| `webapp/app/box/DonationDemo.tsx` 的 `demoSpiritOptions` | 只影響 `?demo=donation` 的設計檢視清單。**可選**：想在 demo 裡看到新蛋才加 |

---

## 會無聲失敗的地方（總結）

這一節是這份文件存在的真正理由。以下每一項都**不會報錯、不會讓 build 失敗、log 裡什麼都沒有**：

| 漏了什麼 | 症狀 | 怎麼發現 |
| --- | --- | --- |
| `guardian.category_id` | 這顆蛋變成可任選類別的 VIP，捐款可導向任何類別 | `/admin/species` 的琥珀色 badge |
| `artworkByCode` 的那一行 | 顯示鎖住的蛋，名稱退回資料庫的 `name` | `/admin/species` 的「尚無圖檔」 |
| 五張圖中的某一張 | 那一級顯示破圖 | 逐級看 `/admin/species` 的圖卡 |
| `stages` 不足五個 | LV4／LV5 顯示 `undefined` | 開 `/box` 看成長摘要 |
| `insert_guardian.sql` 的那一列 | 正式庫正常，但重建的 docker 資料庫少一顆蛋 | 重建後開 `/box` |
| `AGENTS.md` 的那一列 | 下一個人（或 AI）照過期清單工作 | 沒有自動偵測，只能靠紀律 |

`/admin/species` 擋得住前四項，這是它存在的理由。**部署後一定要開那一頁。**
