# backend_new 架構 — Hono、route、OpenAPI

這份文件回答「這個後端長什麼形狀」：一個請求怎麼走完、一個 route 檔由哪幾塊
組成、錯誤怎麼變成 JSON、`openapi.json` 在哪條鏈上、怎麼跑起來、怎麼部署。

**不在這裡**：各功能的業務規則（`GUARDIAN.md`、`DONATION.md`、`POINTS.md`、
`QUESTION.md`）、全 repo 的規則與慣例（`AGENTS.md`）、以及 OpenAPI 遷移逐端點
挖出來的那份回應形狀記錄 —— 那份在 `AGENTS.md` 的「The OpenAPI document」，
有 17 個原始檔的註解指名引用它，不要在這裡複製第二份。

本文的數字量測於 2026-11-19。

## 30 秒版

- Hono 4 + Drizzle ORM + mysql2 + MySQL 8，打包成 AWS Lambda（arm64、nodejs24.x）。
- 一個 `app`（`src/app.ts`）掛 25 個 route group，每組前面接自己的 middleware chain。
- 四個 Lambda 入口：`api` / `facebook` / `housekeep` / `questionStat`，各自 esbuild 成一包。
- 回應的形狀寫在 route 檔裡的 zod schema；`openapi.json` 從 schema 生出來，
  webapp 的型別再從 `openapi.json` 生出來。這條鏈單向，中間沒有手寫型別。
- 沒有 migration 工具。schema 是 `db/table/*.sql`，正式庫手動跑。

## 一個請求的生命週期

```
API Gateway (REST, ANY /{proxy+})
  └─ dist/api/index.js → handle(app)              src/lambda/api.ts（4 行，全部的膠水）
       ├─ requestLogger  '*'   量時間，next() 之後丟 SQS，絕不讓請求失敗
       ├─ apiOrigin      '*'   把這次 invoke 的 API Gateway origin 記進模組狀態
       ├─ <per-prefix chain>   transaction → requireUser → requireSubscription
       ├─ route handler        zValidator → c.get('db') 查 → c.json(... satisfies schema)
       └─ onError              console.error → toErrorResponse → {status,name,message,code}
```

本機 `npm run dev` 只換掉最外層：`@hono/node-server` 直接餵 `app.fetch`。
它**不會**填 `c.env.event`，所以 `requestLogger` 和 `apiOrigin` 在本機是 no-op，
這是刻意的 —— 兩者都先檢查 `c.env?.event` 才動作。

## src/app.ts 的掛載表

`requestLogger` 和 `apiOrigin` 掛在 `'*'`，以下是每組**額外**接的東西，順序就是
`app.ts` 裡寫出來的順序：

| prefix | 額外 middleware | 誰呼叫得動 |
| --- | --- | --- |
| `/api/info` | `transaction` 只掛 `/stats`、`/popular`、`/donation`、`/charity-organization` | 公開 |
| `/api/category` `/api/subject` `/api/exam` `/api/tag` `/api/concept-group` `/api/concept` `/api/filter-dimension` `/api/filter-option` | `adminAuth` → `transaction` | **GET 完全公開**，寫入限 admin |
| `/api/charity-category` | `adminAuth` → `transaction` | 公開讀；目前沒有寫入，所以 `adminAuth` 實際上沒守到任何東西（刻意，為了下一條寫入預設被守） |
| `/api/charity-organization` | `adminAuth` → `transaction` | 公開讀（名稱／簡介／網站就是公開頁要印的），寫入限 admin |
| `/api/user` | `transaction` | gate 寫在每條 route 上，見下 |
| `/api/subscription` | `transaction` → `requireUser` | 登入者。**刻意不接 `requireSubscription`** —— 沒訂閱的人必須問得到自己的狀態 |
| `/api/payment` | `transaction` → `requireUser` | 登入者 |
| `/api/webhook` | `transaction` | ECPay 伺服器。全 app 唯一沒有任何認證 middleware 的一組，真偽靠 route 內的 `CheckMacValue` |
| `/api/analysis` | `transaction` → `requireUser` → `requireSubscription` | 訂閱者 |
| `/api/question` | `adminAuth` → `transaction`，另加 `requireUser` 於 `/adaptive`、`requireAdmin` 於 `/image/prompt` | GET 公開（含答案，已定案），寫入限 admin |
| `/api/reply` `/api/wrong-question` `/api/wallet` `/api/store` `/api/guardian` `/api/donation` | `transaction` → `requireUser` | 登入者 |
| `/api/species` | `transaction` → `requireAdmin` | admin。GET-only 的組要用 `requireAdmin`，`adminAuth` 在這裡等於沒守 |
| `/api/donation-batch` | `transaction` → `requireAdmin` | admin。`GET /unpaid` 會說出哪個使用者被欠多少，公開版是 `/api/info/donation` |

四件掛載本身的事：

- **`'/api/x/*'` 這個 wildcard 也會 match `/api/x` 本身。** 實測確認（Hono 4）：
  `GET /api/category` 會跑到 `/api/category/*` 的 middleware。所以 group 裡的 `'/'`
  route 一樣吃得到 `transaction`，不需要再補一條 `.use('/api/x', ...)`。
  反過來 `/api/category/`（多一條斜線）middleware 會跑、route 會 404。
- **順序是語意，不是風格。** `requireUser` 讀 `c.get('db')`，所以一定在
  `transaction` 之後；`requireSubscription` 讀 `c.get('user')`，所以一定在
  `requireUser` 之後。寫反了不會噴編譯錯，會在執行時拿到 undefined。
- **`/api/info` 刻意逐條路徑包 transaction**（目前四條），不是 `/api/info/*`，
  這樣 `/api/info` 的 health check 在資料庫掛掉時還答得出來。新增一條會讀資料庫的
  `/api/info/*` route 就要在 `app.ts` 多掛一行，漏掉的話 `c.get('db')` 是 undefined。
- **`/api/user` 的 gate 寫在每條 route 上**，不是 `app.ts` 的 wildcard，因為
  `POST /api/user/sync` 是唯一「user row 還不存在就要能呼叫」的 route ——
  它就是唯一會建立那一列的東西。其他每條都自己帶 `requireAdmin` 或 `requireUser`。

## Middleware 逐個

`src/middleware/*.ts`，全部用 `createMiddleware<Env>`，型別透過 `Env` 往下傳
（`TransactionEnv` → `UserEnv` → `SubscriptionEnv`，後者 extend 前者）。

### `transaction`

整個請求包在一個 Drizzle `db.transaction()` 裡，`c.set('db', tx)` 之後 route 拿到的
`c.get('db')` 是那個 transaction，不是 pool。

**不要動掉那個 `c.error` 檢查。** Hono 的 `onError` 會在錯誤冒回 Drizzle 的 callback
之前就攔下來把回應做好，`next()` 兩種情況都正常 resolve，所以 middleware 在
`next()` 之後讀 `c.error` 並重丟，Drizzle 才會 rollback 而不是 auto-commit。那個
重丟只為了讓 Drizzle 回滾，真正的回應 `onError` 已經做好了，所以外層
`catch` 把它吞掉；`c.error` 沒設時的 throw 是真的新錯誤（例如 pool 要不到連線），
要繼續往 `onError` 走。

### `adminAuth` vs `requireAdmin`

兩者都驗 Firebase ID token 並比對 `ADMIN_EMAILS`（`src/middleware/adminAuth.ts`
裡硬寫的 allowlist，資料模型裡沒有 role 概念）。差別是守備範圍：

- `adminAuth` **只守 POST/PUT/DELETE**，GET 原封不動放過。
- `requireAdmin` 守每一個 method。

這是最容易寫錯文件的一處：一個 group 掛在 `adminAuth` 後面，不等於這個 group
「admin only」—— 它的每個讀取都是無憑證可讀的。GET-only 的組掛 `adminAuth`
等於沒掛（見表中的 `charity-category` 與 `species`）。

### `requireUser`

驗 token 拿 uid，再用 `firebase_uid` 查出 `userTable` 那一列放進 `c.set('user', ...)`。
查不到也是 401 —— 「有 Firebase 帳號」和「有這個 app 的 user row」是兩件事。

### `requireSubscription`

`requireUser` 之後跑，403 + `code: 'SUBSCRIPTION_REQUIRED'`。不是 401：呼叫者
已經認證過了，只是沒有權益，回 401 會讓 client 跑去重新登入然後繞回來同一個
地方。前端靠 `code` 分流「要訂閱」和「壞了」。

### 認證的線路約定

前端把 **raw Firebase ID token 直接當 `Authorization` 的值**送，沒有 `Bearer `
前綴。`adminAuth` 和 `requireUser` 都照這個約定解。

### `requestLogger` / `apiOrigin`

兩個都只在 `c.env?.event` 有 `resource` 欄位（即 API Gateway REST event）時動作。
`requestLogger` 送到 `polaris-<env>-logger-queue`，那是別的專案擁有的 queue，所以
這裡沒有任何 template 定義它。`apiOrigin` 的存在理由見下面「部署」一節。

## 一個 route 檔長什麼樣

`src/routes/category.ts` 是範本。每個檔案都是獨立的 Hono sub-app，由六塊按這個
順序組成：

1. `import 'zod-openapi/extend';`（**檔案自己要有一份**，見下面 OpenAPI 一節）
2. request 的 zod schema（body / query），export 出去給測試用
3. response 的 zod schema，共用或值得有名字的加 `.openapi({ ref: 'Name' })`
4. `toXDto(row)` —— **一個欄位一個欄位列出來**的序列化函式
5. 一組 hoist 到檔案上層的 `describeRoute({...})` const
6. `new Hono<Env>()` 的鏈，每條 route 是 `.method(path, doc, zValidator(...), handler)`

幾條規則，每一條都是踩過才寫下來的：

- **`toXDto` 不能用 spread，也不能直接回 `db.select()`。** TypeScript 的
  excess-property 檢查只看 object literal 裡**寫出來**的屬性：它不看裸變數
  （`c.json(row satisfies S)`），也**不看 spread 進來的屬性**
  （`c.json({ ...row, x } satisfies S)`）。兩種寫法都會過。`subject` 和 `question`
  的 `duration_median_ms` 就是這樣流到六個端點的客戶端去的。
- **handler 的 `c.json({...})` 結尾要 `satisfies z.infer<typeof schema>`。**
- **`describeRoute` 要 hoist。** 它是 middleware，構造在哪裡不影響行為；hoist 是為了
  讓 handler 保留自己的縮排、每條 route 的定義維持一行（這個 workspace 沒有 prettier）。
- **每條 route 的 gate 自己寫在它的 `describeRoute` 裡**，而且要先確認是哪一種
  （見上面 `adminAuth` vs `requireAdmin`）。
- request 的驗證用 `@hono/zod-validator` 的 `zValidator`（全專案 65 處：41 個
  `'json'`、24 個 `'query'`），handler 裡用 `c.req.valid('json' | 'query')` 取。

## 錯誤

route `throw` 的是 `src/model/error/*` 裡 `HttpError` 的子類；`app.ts` 的 `onError`
呼叫 `toErrorResponse`（`src/lib/errorResponse.ts`）把它變成 JSON。

| class | status | 預設 code |
| --- | --- | --- |
| `BadRequestError` | 400 | `BAD_REQUEST` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `TooManyRequestsError` | 429 | `TOO_MANY_REQUESTS` |
| `BadGatewayError` | 502 | `BAD_GATEWAY` |
| `HttpError`（基底） | 500 | `UNKNOWN_ERROR`（`name` 是 `UnknownError`，不是 `HttpError`） |

body 一律是 `{ status, name, message, code? }`。每個 constructor 的第二個參數可以
覆寫 `code`，前端就是靠它分流（`SUBSCRIPTION_REQUIRED`、`ALREADY_OWNED`、
`INSUFFICIENT_POINTS`、`ECPAY_NOT_CONFIGURED` 之類），**所以新增一種使用者看得到
的失敗時，給它一個 code，不要只給 message**。

不是 `HttpError` 的東西一律變成通用 500，訊息固定是 `Internal Server Error`。
已知的一個後果：刪一列還被別人引用的資料回 **500 不是 409** —— cascade 是刻意
不做的，但驅動層的 foreign-key 錯誤沒有被映射，就掉到最後那個 500。文件照實寫
500；要改成 409 是行為變更，自己一個 task。

## 資料庫

- `getDb()`（`src/db/client.ts`）**lazy** 建一個 mysql2 pool，一個 warm Lambda 容器
  一個，永不拆掉。lazy 很重要：`tools/openapi.ts` 和型別檢查都 import 整個 app，
  不連線才跑得動。
- `DB_POOL_SIZE`（預設 2）是**每個容器**的上限，不是全域的 —— 調高會乘上同時
  warm 的容器數。真要解連線風暴要擺 RDS Proxy。
- `closeDb()` 只給測試收尾用，Lambda 路徑永不呼叫。
- `src/db/schema.ts` 是 Drizzle 的表定義，**是手寫的鏡像，不是 migration 的來源**。
  真正的 schema 是 `db/table/*.sql`；正式庫由人手動跑，本機靠 docker-compose 掛載。
  改欄位是兩邊都要改的事。
- 左外連接會把它帶進來的每一欄都變寬，**`NOT NULL` 的也一樣**。Drizzle 不知道
  「`batchId` 有值」能窄化它的兄弟欄位，所以 DTO 要把那幾欄一起檢查，不要用
  non-null assertion 把型別硬壓回去。`donation`、`reply`、`analysis` 都左連。

## OpenAPI

這條鏈的形狀（單向，每一層都是上一層的函式）：

```
src/routes/*.ts 的 zod schema + describeRoute
  └─ npm run openapi            tools/openapi.ts
       └─ backend_new/openapi.json         ← 進 git，CI 比對，絕不手改
            └─ npm run api:types -w webapp
                 └─ webapp/types/openapi.d.ts   ← 不進 git，四個 npm hook 重生
                      └─ webapp/types/api.ts    ← ~45 個別名
```

- **寫成檔案，不是服務出去。** 一份列出每個端點（含 admin）的文件是攻擊面地圖，
  而且執行期沒有任何東西需要它。
- **沒有 `describeRoute` 的 route 在文件裡完全不存在**（不是列出來但沒 schema）。
  所以 `npm run openapi` 印出的 path 數是遷移進度，不是這個 API 的大小。
- 2026-11-19 的狀態：73 paths / 114 operations / 42 個具名 schema / 242 KB。
  25 個 route group 裡 24 個有描述，只剩 `webhook` 沒有 —— 它回 ECPay 純文字
  `1|OK`，不是給 client 的 API，描述它只會把 callback 面放進文件。
- **`tools/openapi.ts` 第一行的 `import 'zod-openapi/extend'` 是為了副作用**：少了它
  每個 `.describe()` 都會被靜靜丟掉，文件照樣生成，只是整份沒有欄位說明。
  **每個放 `.openapi({ ref })` 的 route 檔也要自己 import 一次** —— patch 必須在
  `.openapi()` 執行前就位，而那是模組評估期，集中 import 一次會讓產出的文件
  取決於 `app.ts` 的 import 順序。
- `.extend()` 和 `.pick()` 會產生新 schema，**ref 會掉**、變成 inline。
- **請求還沒進文件**，只有回應。query 和 body 由 `zValidator` 驗，`hono-openapi`
  看不到它 —— 要納入就得把 65 處換成 `hono-openapi` 自己的 `validator`，那同時會
  改掉非法請求拿到的 400 body。值得做，但自己一個 change。
- **CI 會重跑一次然後 diff，有差就 fail**（`.github/workflows/checks.yml` 裡的一步）。
  所以**改到任何 route 的回應，就在同一個 commit 裡 `npm run openapi`**。
  這一步不需要 secret 也不需要資料庫。

為什麼是 `hono-openapi` + `zod-openapi@^4` 而不是更有名的 `@hono/zod-openapi`、
加一條 route group 的七個步驟、以及遷移時逐端點挖出來的回應形狀記錄 ——
都在 `AGENTS.md` 的「The OpenAPI document」。那一節有 17 個原始檔的註解指名
引用，是那些事實的唯一所在地。

## 測試

| 目錄 | 內容 | 指令 | 需要什麼 |
| --- | --- | --- | --- |
| `test/` | zod schema 形狀、錯誤模型、純函式（ecpay、s3、guardianLevel、subscriptionPlan） | `npm run test:unit -w backend_new` | 無。17 檔 204 個 case，約 14 秒 |
| `regression/` | 真 handler 打真資料庫，30 個檔 | `npm run test:regression -w backend_new` | 本機 MySQL（`npm run db:up`） |

- 兩套共用 `vitest.config.ts`，`--dir` 決定跑哪一套。**沒有
  `vitest.regression.config.ts`**，不要去找。
- `fileParallelism: false`：regression 共用一個連線池並在 case 之間 truncate 表，
  平行跑會互相踩。
- **CI 的閘門全部在 `.github/workflows/checks.yml`**，一個 `workflow_call` 的可重用
  workflow，`dev.yml` 和 `prod.yml` 各用一行 `uses:` 叫它、再用 `needs: checks` 擋住
  自己的 deploy job。順序是 `npm ci` → backend typecheck → backend unit tests →
  openapi 漂移 → webapp unit tests → webapp typecheck，全部不需要 AWS 憑證也不需要
  資料庫。定義一份而不是兩份：兩份閘門會漂移，而漂移的那一半永遠是守著 production 的那一半。
- **regression 不在 CI 跑**（需要帶 schema 的 MySQL service container，那是另一個
  change）。所以一次 release 擋得住的只有：後端型別錯、webapp 型別錯、任一邊的
  unit test 失敗、文件過期 —— 其餘只有 regression 蓋到的東西會原封不動上線。
- `vitest.config.ts` 把 Windows 磁碟機代號強制大寫，**那一行是所有覆蓋率數字成立
  的原因**。別改成「改寫解析路徑」的做法：`vi.mock()` 用 resolved id 當 key，同一個
  模組在兩種拼法下會註冊在一邊、查找在另一邊。
- 新增 route 的 regression test 要同時斷言**回應 parse 得過 schema**、**key set 剛好
  是 schema 列的那些**。zod 會把不認識的 key **剝掉**而不是拒絕，所以少了第二個
  斷言，一個被加進 query 又 spread 進 DTO 的欄位可以一路流到客戶端而不出現在
  任何文件裡。

## 建置與部署

四個入口，各自一包，`run-p` 並行 esbuild 進 `dist/<name>/index.js`：

| 入口 | 觸發 | 備註 |
| --- | --- | --- |
| `src/lambda/api.ts` | API Gateway `ANY /{proxy+}` | `handle(app)`，256 MB／30 s |
| `src/lambda/facebook.ts` | EventBridge `cron(*/3 * * * ? *)`，但規則**以 `State: DISABLED` 建立**：跑空了自己 `events:DisableRule`，`POST /api/question` 和每一次題目編輯再 `events:EnableRule` 把它叫起來 | Puppeteer + Chromium layer，1024 MB／60 s。`@sparticuz/chromium` 是 `--external` |
| `src/lambda/housekeep.ts` | EventBridge `cron(5 20 * * ? *)` | 三個獨立包裝的任務：資料清理、過期未付購買、被日票取代的訂單 |
| `src/lambda/questionStat.ts` | EventBridge `cron(0 19 * * ? *)` | 重算題目／科目／全域作答時間統計 |

`facebook` 一輪只做一件事，而且有兩個 queue：先發沒發過的題
（`fb_post_id IS NULL`），兩個都空了才把自己關掉。第二個 queue 是
`fb_caption_dirty`＝已經發出去、但 hashtag 被編輯改掉的貼文，走
`POST /{page-post-id}` 只改 `message`。**圖不能換** —— Graph API 沒有這種端點
—— 所以改到 content 的編輯是把 `fb_post_id` 清成 NULL 重發一篇新的，舊貼文
留著不刪（刪了留言就一起消失）。兩個欄位都寫在母題那一列。

**三個排程 Lambda 都把錯誤 log 完吞掉**，不往外丟。失敗只代表今晚這輪跳過，
明天再跑；丟出去會變成 Lambda retry 風暴和 CloudWatch 告警。`api` 相反 ——
它的錯誤要走到 `onError` 變成回應。

`api` 的 bundle 刻意和 `facebook` 分開：兩者曾共用 `dist/index.js`，於是 `api` 的冷啟動
得載入 `require('@sparticuz/chromium')`，而那個套件是 `--external`、只由 Chromium
layer 提供 —— 沒掛 layer 的 `api` 每次 invoke 都 `ImportModuleError`。

`npm run pre:deploy` = `clean` → `typecheck`（兩個 tsconfig 都檢）→ `build`。
堆疊是 `aws/cloudformation/template.yaml`，由 repo 根的 `deploy.sh` 從 CI 部署。

### `ApiFunction` 的環境變數

| 變數 | 來源 |
| --- | --- |
| `ENVR` `PROJECT` | 堆疊參數 |
| `DB_HOST` | `ImportValue celestial-studio-<env>-db-endpoint` |
| `DB_PWD` | SSM `mysql-<env>-castor-pwd` |
| `DB_POOL_SIZE` | 固定 `2`（每容器） |
| `FIREBASE_ADMIN_KEY` | SSM `castor-firebase-admin-key` |
| `LOGGER_QUEUE_URL` | `polaris-<env>-logger-queue`（別的專案的 queue） |
| `S3_BUCKET` | `castor-public-bucket`，和 `facebook` 同桶不同 prefix |
| `GOOGLE_GENAI_API_KEY` | SSM `castor-google-genai-api-key` |
| `GEMINI_MODEL` `GEMINI_FALLBACK_MODEL` | 寫在 template 裡，換模型是堆疊參數變更而非改碼重建 |
| `ECPAY_MERCHANT_ID` `ECPAY_HASH_KEY` `ECPAY_HASH_IV` | SSM `castor-<env>-ecpay-*`，一組配套，一起換或都不換 |
| `ECPAY_MODE` | SSM `castor-<env>-ecpay-mode`。**刻意不是 `!If [IsProd, ...]`** —— `dev.yml` 是故意部到 prod 堆疊的，綁堆疊名會讓一次普通 dev 部署開始刷真卡。`castor-prod-ecpay-mode` 的值是 `stage` 在上線前是正確狀態 |
| `PUBLIC_BASE_URL` | 由 CloudFront 的同一組參數推出來，瀏覽器被送回的 origin |

**`ECPAY_CALLBACK_BASE_URL` 刻意不在那裡**，它的缺席就是修正本身。ECPay 的伺服器
不能回呼 CloudFront 網域（CDN 會換來源 IP 並過濾非瀏覽器請求），所以值必須指向
API Gateway stage —— 而那只能寫成
`https://${RestApi}.execute-api...`，於是 `ApiFunction` 依賴 `RestApi`，而 SAM 已經讓
`RestApi` 依賴 `ApiFunction`（它生成的 definition body 裡有這個 function 的 ARN），
CloudFormation 直接拒收整個堆疊（circular dependency）。解法是 function 自己從
invoke event 讀出 origin：`src/middleware/apiOrigin.ts` + `src/lib/apiOrigin.ts`，
部署期什麼都不用給。設了 `ECPAY_CALLBACK_BASE_URL` 仍然優先，所以那裡還是
覆寫點，等 API 有了固定自訂網域就會變回正常路徑。

這件事錯了是無聲且昂貴的：ATM 和超商付款的回呼是學生在櫃台付完現金之後幾天才
到，漏接一通就是收了錢沒開權限，而且我們的 log 裡什麼都沒有，因為請求根本沒到。

## 本機跑起來

```
npm run db:up   -w backend_new    # docker compose，MySQL 8，掛載 db/table/*.sql 當 init
npm run dev     -w backend_new    # tsx watch local.ts，預設 :3001
npm run openapi -w backend_new    # 重生 openapi.json
```

- `docker-entrypoint-initdb.d` **只在 volume 全新時跑**，而且照檔名順序。那串編號
  是外鍵順序，不是整理癖：`24a_charity_category` 在 `25_guardian` 之前，
  `91_insert_charity_category` 在 `92_insert_guardian` 之前。改順序前先讀
  `docker-compose.yml` 裡的註解。
- `localEnv.ts` 被 `local.ts` 和 `regression/setup.ts` import（為了副作用，所以要
  **第一個** import）。優先序：明確 export 的環境變數 > `.env.local` > 它的 `??=`
  預設值（`PROJECT=castor`、`DB_HOST=127.0.0.1`、`DB_PWD=castorlocal`）。
  那三個預設值敢進 git，是因為它們已經在 `docker-compose.yml` 裡了。
  **任何 ECPay 憑證都不在也不該在那裡。**
- 從容器內跑測試：`DB_HOST=host.docker.internal npm run test:regression`。
- `tools/simulateEcpayWebhook.ts` 偽造一通 ECPay 回呼打本機，它需要真的
  HashKey/HashIV，所以只讀 `.env.local`。
- 部署中的東西**不** import `localEnv.ts`：Lambda 的環境由 CloudFormation 給，
  esbuild 也只打包 `src/lambda/*.ts` 走得到的東西。

## 我要加 X，碰哪些檔案

| 要做的事 | 碰 |
| --- | --- |
| 一個新端點，加在現有 group | 那個 `src/routes/*.ts`（schema → DTO → describeRoute → route）、`regression/routes/*.test.ts`、`npm run openapi` |
| 一個新 route group | 新 `src/routes/*.ts`、`src/app.ts`（掛載 + middleware chain）、新 regression 檔、`npm run openapi` |
| 一種新的認證／權益閘 | `src/middleware/*.ts`（新 `Env` 要 extend 現有的）、`src/app.ts`、以 stand-in route 測它（範例：`regression/routes/subscription.test.ts`） |
| 一個新欄位 | `db/table/*.sql`（正式庫人工跑）、`src/db/schema.ts`、相關 route 的 response schema + `toXDto`、`npm run openapi`、regression 的 key-set 斷言 |
| 一種新的使用者可見失敗 | `src/model/error/*` 的某個子類 + **一個 `code`**、該 route 的 `describeRoute` 把它列進 400/403 說明、前端分流 |
| 一個新的排程工作 | `src/lib/*.ts`（邏輯）、`src/lambda/*.ts`（吞錯誤的殼）、`package.json` 的 `build:*`、`template.yaml`（function + role + EventBridge rule + 權限） |
| 一個新的環境變數 | `template.yaml`（四個 function 各自的 `Environment`）、必要時 `localEnv.ts` 的預設值、讀它的 lib |

## 會無聲失敗的地方（總結）

1. middleware 順序寫反 —— 不噴編譯錯，執行時拿到 undefined。
2. 把 `adminAuth` 當成「這組 admin only」—— 它的每個 GET 都是公開的。
3. GET-only 的組掛 `adminAuth` —— 等於沒掛。
4. 拿掉 `transaction` 裡的 `c.error` 檢查 —— 失敗的請求會 commit。
5. DTO 用 spread 或直接回 `db.select()` —— excess-property 檢查看不到，欄位直接外洩。
6. regression 只斷言「parse 得過」不斷言 key set —— zod 剝掉不認識的 key，多出來的欄位照樣送出去。
7. route 檔少了自己的 `import 'zod-openapi/extend'` —— `.describe()` 被丟掉，文件照樣生成。
8. 改了回應沒跑 `npm run openapi` —— CI 會抓到（這是少數會大聲失敗的一個）。
9. 新 seed 或 DDL 的檔名編號排錯 —— 外鍵子查詢回 NULL 而不報錯。
10. `ECPAY_MODE` 綁到堆疊名 —— 一次普通 dev 部署開始刷真卡。
