# 新增一顆精靈蛋 — 完整步驟

> Keywords: add a new egg / guardian / spirit species, new charity category,
> VIP egg, `guardian.category_id` NULL, `requires_subscription`, `artworkFor`,
> `spiritCatalog`, `SpiritSpecies`, egg artwork, 新增蛋, 新增精靈, 新增公益類別.

## 快速答案

**六個地方，按順序。只有③ 會編譯失敗；其餘五個漏了都是無聲的。**

| | 做什麼 | 漏了會怎樣 |
| --- | --- | --- |
| ① `castor.guardian` 資料列（正式庫手跑） | 複製下方 SQL。**`category_id` 用子查詢取，不要手打 id** | 蛋不存在 |
| ② `db/script/v1.0.0/insert_guardian.sql` | 同一列的 repo 副本 | 重建的 docker 資料庫少一顆蛋 |
| ③ `webapp/lib/guardianArtwork.ts` | 兩處：`SpiritSpecies` 聯集 ＋ `spiritCatalog` 項目 | **TypeScript 編譯失敗**（唯一會吵的一處） |
| ④ `webapp/public/illustrations/guardians/<code>/lv1..lv5.webp` | 五張圖 | 顯示鎖住的蛋 |
| ⑤ `webapp/source-assets/png/illustrations/guardians/<code>/lv1..lv5.png` | 原始 PNG | 日後重壓圖沒來源 |
| ⑥ `AGENTS.md` 的 **Spirit categories** 表 | 加一列 | 下一個 agent 照過期清單工作 |

### 三條硬規則

1. **`guardian.code` 就是物種名，必須等於 `spiritCatalog` 的 key。**
   畫的是鹿就叫 `deer`，不是類別名（不是 `forest`）。`artworkFor(code)`
   直接拿 code 去查，沒有任何對應表。
2. **子查詢要對「類別」的 code，不是蛋的 code。** 兩者刻意不同名（`deer` → `forest`）。
   對錯會回 NULL，而 NULL 的語意是「可任選類別」——這顆蛋會變成一隻 VIP。
3. **同一個類別的第二顆蛋是另一隻動物。** `uk_code` 是 UNIQUE，所以是 `fox`，
   不是 `forest2`。類別與蛋是一對多。

### SQL（兩種情境，可直接複製）

```sql
SET NAMES utf8mb4;

-- 情境 A：綁定某個現有類別
INSERT INTO castor.guardian
(code, name, cost, category_id, requires_subscription, sort_order, is_active, created_at)
SELECT 'fox', '狐狸之蛋', 10, c.id, 0, 8, 1, now(3)
FROM castor.charity_category c
WHERE c.code = 'forest';          -- ← 類別的 code，不是蛋的

-- 情境 B：訂閱限定、不綁類別（目前只有 fennec）
INSERT INTO castor.guardian
(code, name, cost, category_id, requires_subscription, sort_order, is_active, created_at)
VALUES ('fennec', 'VIP 星冠之蛋', 10, NULL, 1, 99, 1, now(3));
```

`category_id IS NULL` 和 `requires_subscription = 1` 是**兩件獨立的事**：
綁了類別的蛋也可以是訂閱限定。兩者都要明寫。

沒有 `theme` 欄位（2026-11-21 刪除）。寫了會 SQL 錯誤。

### 前端（`webapp/lib/guardianArtwork.ts`，兩處）

```ts
export type SpiritSpecies = | 'cat' /* … */ | 'fox'   // ← 1. 聯集

export const spiritCatalog: Record<SpiritSpecies, SpiritDefinition> = {
  fox: {                                              // ← 2. key ＝ guardian.code
    name: '夜行狐靈',                              // 物種名，不是蛋名
    artwork: '/illustrations/guardians/fox',           // 沒圖就整行省略
    tone: 'forest',                                   // 'forest' 是預設；'sky' 有自己的背景
    stages: ['初生', '萌芽', '探索', '茁壯', '綻放'],   // 正好五個
  },
}
```

沒有第三步。`category` 欄位已刪（類別是 `guardian.category_id` 的事），
`artworkByCode` 對應表也已刪。

### 驗證（照順序，不要跳）

```bash
cd backend_new && npm run typecheck     # 兩份 tsconfig 都跑
cd webapp && npm run typecheck
cd webapp && rm -rf .next out && npm run build
```

然後開 **`/admin/species`** —— 它是唯一同時從兩個方向檢查的地方，
也是上述無聲失敗的主要防線：資料庫每一列旁邊的圖、「尚無圖檔」、
前端有定義卻沒有資料列的、以及**琥珀色「未綁定類別」**。
最後開 `/box` 確認商店列出新蛋、兌換後圖片正確。

### 不需要改

`schema.ts`、任何後端路由、`docker-compose.yml`。
新增一顆蛋是加資料，不是加程式分支。

**只新增類別、不出新蛋**：看「情境 C」，答案是一條 INSERT，零程式碼變更。

---

以下是完整版本與理由。

一顆蛋的身分**不是單一來源**：資料庫有一列、前端有兩處硬編碼、
圖檔是五個檔案（加原始 PNG 十個）、`AGENTS.md` 有一張對照表。
除了前端那兩處，其餘漏掉都不會報錯——它會**無聲地**退化成鎖住的蛋、
沒有圖、或（最糟的）變成一隻多出來的 VIP。

這份文件就是為了讓那件事不再靠記憶。

審核紀錄：**2026-11-09** 對 `donation` 分支查證過；2026-11-16 隨兩支 seed
順序反轉更新（類別先、蛋後，回填 UPDATE 移除）；2026-11-21 隨 `guardian.code`
改用物種命名、`requires_subscription` 成為欄位、`artworkByCode` 刪除、
`guardian.theme` 欄位刪除、`spiritCatalog` 的 `category` 欄位刪除、
localStorage 捐款 demo 刪除而更新。改動上述任一處時，連同這份文件一起更新。

---

## 一顆蛋的身分散在哪裡

| # | 位置 | 內容 | 漏掉的後果 |
| --- | --- | --- | --- |
| 1 | `castor.guardian` 資料列 | `code`（＝物種名）、`name`、`cost`、**`category_id`**、`requires_subscription`、`sort_order`、`is_active` | 蛋不存在，商店看不到 |
| 2 | `db/script/v1.0.0/insert_guardian.sql` | 同一列的 repo 副本 | 全新環境（docker）沒有這顆蛋 |
| 3 | `webapp/lib/guardianArtwork.ts` → `SpiritSpecies` | 型別聯集加一個 key | TypeScript 編譯失敗（這是唯一會**吵**的一處） |
| 4 | 同上 → `spiritCatalog` | `name`、`artwork`、`tone`、`stages` | 型別缺 key，編譯失敗 |
| 5 | `webapp/public/illustrations/guardians/<code>/lv1..lv5.webp` | 五張圖 | **無聲**：`artworkFor()` 回 undefined，顯示鎖住的蛋 |
| 6 | `webapp/source-assets/png/illustrations/guardians/<code>/` | 原始 PNG | 之後要重壓圖時沒有來源 |
| 7 | `AGENTS.md` 的 **Spirit categories** 表 | 一列 | 下一個人（或 AI）讀到的是過期清單 |

第 3、4 項會讓 build 失敗，所以不會漏。**真正會咬人的是 1 和 5**——它們都無聲。

（2026-11-21 之前這張表還有第 5 項 `artworkByCode`：一張 `guardian.code` → `SpiritSpecies`
的對應表。code 改成物種名之後它變成恆等映射，已刪除，改為 `artworkFor(code)`。代價是
`guardian.code` 現在**必須**等於 `spiritCatalog` 的 key，好處是少一處會無聲不一致的副本。）

---

## 情境 A：新增一顆蛋，指向某個既有的公益類別

### A-1. 資料庫（正式庫要手動跑）

```sql
SET NAMES utf8mb4;

INSERT INTO castor.guardian
(code, name, cost, category_id, requires_subscription, sort_order, is_active, created_at)
SELECT 'fox', '狐狸之蛋', 10, c.id, 0, 8, 1, now(3)
FROM castor.charity_category c
WHERE c.code = 'forest';   -- ← 要綁的類別（它的 code，不是蛋的 code）
```

用 `SELECT ... FROM charity_category WHERE code = ?` 取 `category_id`，**不要手打 id**。
id 是 auto-increment，每個環境不一樣（正式庫的 guardian id 是 7–13，因為它們取代過一組舊的）。

> ### ⚠️ 這裡是整份文件最危險的一步
>
> **`category_id` 沒有任何補救機制，漏了就是漏了。**
>
> 漏掉它的後果不是「少一個欄位」：**NULL 的語意就是「不綁類別、可任選」**，
> 也就是這顆蛋會變成一隻沉默的 VIP，它的主人可以把捐款導向任何類別。
> 沒有任何地方會報錯。
>
> 所以：**每一條 guardian 的 INSERT 都要寫 `category_id`**（像上面那樣用子查詢，
> 不要手打 id），VIP 則明寫 `NULL`。
>
> > 2026-11-16 之前 `insert_charity_category.sql` 結尾有一條
> > `UPDATE guardian g JOIN charity_category c ON c.code = g.code` 的回填，
> > 它**只在蛋的 code 和類別的 code 相同時才會對上**，而 `guardian.code` 是 UNIQUE，
> > 所以同一類別的第二顆蛋永遠不會被它填到——看起來像個防線，其實不是。
> > 那條 UPDATE 已經移除，兩支 seed 的順序也跟著反過來（類別先、蛋後）。

### A-2. repo 的種子副本

`db/script/v1.0.0/insert_guardian.sql` 加一列，**連同 `category_id` 的子查詢一起寫**——
那支檔案現在每一列都自己帶 `category_id`（`(SELECT id FROM castor.charity_category
WHERE code = '...')`），沒有任何回填會補它。新蛋的 code 不等於類別的 code 時尤其注意：
子查詢要對**類別的** code，不是蛋自己的 code，否則回 NULL，全新環境會長出一隻 VIP。

那支檔案掛在 `92_insert_guardian.sql`，排在 `91_insert_charity_category.sql` 之後，
因為它要讀類別的列。這個順序不要再換回去。

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
    name: '某某精靈',   // 物種名，不是蛋名（蛋名在 guardian.name）
    artwork: '/illustrations/guardians/myspecies',   // 沒圖就整個省略這行
    tone: 'forest',    // 'forest' 是預設（不覆寫）；只有 'sky' 有 .sp-scene--sky 規則
    stages: ['初生', '萌芽', '探索', '茁壯', '綻放'],   // 五個，對應 LV1–LV5
  },
}

```

沒有第三步了。2026-11-21 之前還要在 `artworkByCode` 加一行；現在
`artworkFor(code)` 直接拿 code 當物種名去查 `spiritCatalog`，所以
**`guardian.code` 必須等於 `spiritCatalog` 的 key**。

四件事要知道：

- **`guardian.code` 和 `SpiritSpecies` 現在是同一個命名空間**，這是刻意的：少一份會
  無聲不一致的對應表。代價是資料庫的 code 要跟著前端的物種名改。
- **沒有圖就省略 `artwork` 那一行，不要只加 key。** `artworkFor()` 查的是 `artwork` 有沒有值，
  不是 key 在不在，所以沒圖的 catalog 項目會正確地回 undefined——蛋顯示鎖住的圖和資料庫的
  `name`，一切正常運作。舊的 `artworkByCode` 允許「宣稱有圖但檔案不存在」，現在寫不出來。
- **沒有 `category` 欄位了（2026-11-21 刪除）。** 它曾是第四份
  `charity_category.name` 副本，而且 `components/spirit` 的 `SpiritStatusCard`
  **真的在渲染那份副本** —— 資料庫改了類別名稱，那行 eyebrow 就會騙人。
  現在該元件改成收 `category` prop，由已經持有 API 資料的 `BoxClient` 喂。
  「哪顆蛋支持哪個公益類別」是資料庫的事（`guardian.category_id`），
  前端目錄不該有第二種意見。（那份虛構類別清單曾經搬到
  `lib/donationDemo.ts`，幾小時後整支 demo 就跟著刪了。）
- **`stages` 要正好五個**，`components/spirit/index.tsx` 直接用 `stages[level - 1]`。
  給三個的話 LV4、LV5 會顯示 `undefined`。

### A-4. 圖檔

| | |
| --- | --- |
| 路徑 | `webapp/public/illustrations/guardians/<code>/lv1.webp` … `lv5.webp`（`<code>` ＝ `guardian.code` ＝ `spiritCatalog` 的 key，三者同一個字串）|
| 尺寸 | **1254 × 1254**（現有全部都是，`locked-egg.webp` 也是） |
| 格式 | WebP，RGB |
| 原始檔 | 同步放 `webapp/source-assets/png/illustrations/guardians/<code>/lv1..lv5.png` |

**壓縮請用有損（lossy）。** 2026-11-16 實測八個物種全部是 VP8（有損），
範圍 61–434 KB：

| 物種 | LV1–LV5 大小 |
| --- | --- |
| `penguin` | 61–145 KB |
| `fennec` | 75–141 KB |
| `bird` | 103–159 KB |
| `deer` | 109–434 KB |
| `dog` | 135–281 KB |
| `cat` | 143–254 KB |
| `rabbit` | 198–378 KB |
| `otter` | 228–326 KB |

`bird`／`cat`／`deer` 曾經是 VP8L（無損）、1400–2400 KB，一個物種五張 7–10 MB，
那筆技術債已經清掉了。新蛋**壓到 100–350 KB 區間**，編碼是 VP8（有損）而非 VP8L；
用 `RIFF` header 第 12–16 byte 可以確認是 `VP8 ` 還是 `VP8L`。

具體的品質參數**沒有紀錄**——現有檔案只能看出位元組大小和編碼，反推不出當初用的設定，
所以請自己試幾個值，比對檔案大小和 1254×1254 下的畫質。repo 裡也沒有任何壓圖工具或腳本，
這一步目前完全是手動的。

### A-5. `AGENTS.md`

**Spirit categories** 那張表加一列：

```
| `fox` | 生態環境與動物福利 (`forest`) | 狐 | LV1-LV5 available | 狐狸之蛋 |
```

第二欄括號裡是**類別自己的 code**，就是 seed 子查詢要對的那個；
它刻意不等於第一欄的蛋 code。2026-11-21 之前兩欄是同一個字串，
那正是它們看起來像同一件事的原因。

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

和情境 A 完全相同，只有兩處不同：**`category_id` 故意留 NULL**，且
**`requires_subscription` 設 1**。兩者互相獨立，不要偵一忘一。

```sql
INSERT INTO castor.guardian
(code, name, cost, category_id, requires_subscription, sort_order, is_active, created_at)
VALUES ('fennec', 'VIP 星冠之蛋', 10, NULL, 1, 99, 1, now(3));
```

NULL 不是「忘了填」，它是一句完整的敘述：**這顆蛋的主人可以把捐款導向任何類別。**
後端據此行為：

- `GET /api/guardian` 回傳 `category: null`
- `/box/donation` 的選擇畫面**只對 `category === null` 的精靈顯示類別下拉選單**
- `POST /api/donation` 對這種精靈**要求**明寫 `categoryId`（省略回 `DONATION_CATEGORY_REQUIRED`）；
  一般精靈則相反，明寫錯的類別回 `DONATION_CATEGORY_INVALID`

### 訂閱門檻在後端，認的是 `requires_subscription` 欄位

VIP 蛋限訂閱會員兌換，這件事記在 `guardian.requires_subscription`；`store.ts` 的 redeem
認這個欄位，沒有付費資格就回 `SUBSCRIPTION_REQUIRED`，判斷用 `findEntitledSubscription`，
所以「已取消自動續訂但付費期間還沒結束」仍然可以兌換。

前端 `BoxClient.tsx` 的檢查**不是門檻**，它自己的註解寫著是 frontend-only；
後端那道才是。卡片的鎖定狀態現在也讀 API 回傳的 `requiresSubscription`，不再比對 code。

> 2026-11-21 之前這是寫死的 `guardian.code === 'vip'`（常數 `VIP_GUARDIAN_CODE`）。
> 把 code 改成物種名之前**必須先**把它變成欄位，否則那次改名會在什麼都不報錯的
> 情況下把付費牆關掉。這份文件當時就寫著「第二顆訂閱限定的蛋上線時這就該變成
> 一個欄位」——提前兌現了。

**和 `category_id` 互相獨立。** 兩者剛好都落在 fennec 這一列上，但「不綁類別」和
「要訂閱」是兩件事：綁了類別的蛋也可以是訂閱限定，所以 `requires_subscription`
**不能**用來判斷下面那個琥珀色 badge 該不該亮。

### VIP 和「漏填」在畫面上一模一樣

`/admin/species` 的「未綁定類別」badge **對真正的 VIP 也會亮**，而且是刻意的：
那個 badge 的工作是讓讀的人停下來問「這顆蛋應該不綁類別嗎」。

所以 VIP 上線後，**唯一能分辨「刻意的 VIP」和「漏填的蛋」的地方就是 `AGENTS.md` 那張表**。
新增 VIP 時務必在表裡寫明它是 VIP，否則下一個人看到琥珀色 badge 會不知道該不該修。

### 圖檔

VIP 的圖**已經有了**：物種是 `fennec`（星冠狐靈），而 `guardian.code` 就是 `fennec`，
五張圖在 `webapp/public/illustrations/guardians/fennec/`（1254×1254、VP8 有損、75–141 KB）。

如果將來有蛋還沒有圖：`spiritCatalog` 項目省略 `artwork` 那一行，前端會用
`<span className="donation-vip-art-blank">` 這個留白佔位（已經在
`DonationFlow.tsx` 裡）。

---

## 情境 C：順便要新增一個公益類別

類別和蛋是**各自獨立**的（這是把 `charity_category` 拆出來的理由之一：
加類別不必出一顆新蛋，一個類別也能有多顆蛋）。

```sql
SET NAMES utf8mb4;
INSERT INTO castor.charity_category (code, name, sort_order, is_active, created_at)
VALUES ('mycat', '新類別名稱', 8, 1, now(3));
```

- `code` 和 `name` **都是 UNIQUE**。`name` 的唯一性是刻意的：舊設計讓每顆蛋自帶
  一份類別名稱（`guardian.theme`），兩顆寫成同一句就把一個類別裂成兩個同名群組，
  而且沒有任何東西會發現。那個欄位已於 2026-11-21 刪除，類別名稱只在這裡存一份。
- **不需要任何程式碼變更。** `GET /api/charity-category` 是從資料庫讀的，
  `/admin/charity-organization` 的勾選框和公開頁都跟著動。
- 新類別**沒有組織**，所以在 `/admin/charity-organization` 建至少一個並掛在它下面，
  否則使用者的選擇畫面會顯示「這個類別目前沒有可指定的組織」。
- 要退場用 `is_active = 0`，**不要 DELETE**：既有捐款指向它，公開紀錄要一直能說出它的名字。
  停用只會讓它退出選單。

---

## 不需要改的東西

避免過度操作，以下都**不用**動：

| | 為什麼 |
| --- | --- |
| `backend_new/src/db/schema.ts` | 新增一列資料不是 schema 變更 |
| 任何後端路由 | 蛋是資料，不是程式分支 |
| `backend_new/docker-compose.yml` | 種子檔已經掛好（`92_insert_guardian.sql`） |

---

## 會無聲失敗的地方（總結）

這一節是這份文件存在的真正理由。以下每一項都**不會報錯、不會讓 build 失敗、log 裡什麼都沒有**：

| 漏了什麼 | 症狀 | 怎麼發現 |
| --- | --- | --- |
| `guardian.category_id` | 這顆蛋變成可任選類別的 VIP，捐款可導向任何類別 | `/admin/species` 的琥珀色 badge |
| `guardian.code` 和 `spiritCatalog` 的 key 不一致 | 顯示鎖住的蛋，名稱退回資料庫的 `name` | `/admin/species` 的「尚無圖檔」 |
| 五張圖中的某一張 | 那一級顯示破圖 | 逐級看 `/admin/species` 的圖卡 |
| `stages` 不足五個 | LV4／LV5 顯示 `undefined` | 開 `/box` 看成長摘要 |
| `insert_guardian.sql` 的那一列 | 正式庫正常，但重建的 docker 資料庫少一顆蛋 | 重建後開 `/box` |
| `AGENTS.md` 的那一列 | 下一個人（或 AI）照過期清單工作 | 沒有自動偵測，只能靠紀律 |

`/admin/species` 擋得住前四項，這是它存在的理由。**部署後一定要開那一頁。**
