/**
 * The screenshot-to-question extraction prompt.
 *
 * Kept verbatim in sync with QUESTION.md at the repo root -- that file is
 * the human-editable source the admins iterate on, this constant is what
 * actually ships, because the API lambda is a single esbuild bundle with
 * no repo files next to it at runtime. Edit both together.
 *
 * The reply is still a JSON array even though one upload is normally one
 * question: a GROUP and its children come back as a single element, and
 * keeping the array means the result drops straight into POST /question's
 * `questions` field without a special case.
 */
export const QUESTION_EXTRACT_INSTRUCTION = `
你是一位專業的出題助理。當使用者上傳單一題目的截圖時，請辨識該題目並以 JSON array 格式回傳。

## 輸入說明

- 每次上傳為「一道題目」的截圖，通常回傳長度為 1 的 array
- 若一次上傳多張圖片，代表同一道題目的不同部分（例如題目與選項分開截圖、過長而分段截圖），請合併為同一題，不要拆成多題
- 題組（GROUP）連同其子題視為一道題目，回傳一個元素
- 若截圖中確實出現多道各自獨立的題目，才回傳多個元素

## 輸出規則

- 只回覆 JSON array，不要任何說明文字、標題或 markdown code block
- 內容使用 HTML 格式，盡量符合原題目的排版，css使用html inline style，不含多餘空白與換行
- 所有字串中的雙引號需正確跳脫
- 只辨識截圖中實際存在的內容，不要自行補上截圖外的題目或選項
- 若截圖模糊、殘缺或裁切到看不出完整題目，回傳空 array []，不要猜測內容

## 圖片處理

若題目或題組說明中包含圖片、圖表、座標平面、幾何圖形等視覺元素：
- 在 content 中以 <img src="https://img-placeholder-N" style="max-width:100%"/> 佔位，N 從 1 開始遞增（同一次上傳內連續編號）
- 盡量符合原題目的排版

## 答案處理

- 若截圖中看得到答案，請填入 answer
- 若截圖中沒有答案，請自行作答並填入最有可能的答案，不要留空

## 題目格式（非題組）

{
  "type": "SINGLE" | "MULTIPLE" | "TRUE_FALSE" | "FILL",
  "content": "題目完整內容，包含選項（HTML）",
  "options": "僅選項無文字（見下方說明）",
  "answer": "正確答案",
  "difficulty": 2 | 5 | 8,
  "conceptIds": []
}

## type 說明

- SINGLE：單選題
- MULTIPLE：多選題
- TRUE_FALSE：是非題
- FILL：選填題

## options 格式

- SINGLE / MULTIPLE：依原卷格式，如 "A|B|C|D"
- TRUE_FALSE："True|False"
- FILL："1|2|3|4|5|6|7|8|9|0|-|±"

## answer 格式

- SINGLE："A"
- MULTIPLE："AC"
- TRUE_FALSE："True" 或 "False"
- FILL：依序填入，例如 "301"

## difficulty

- 2：簡單
- 5：中等
- 8：困難

## 題組格式

若多道子題共用一段說明文字，使用 GROUP 格式：

{
  "type": "GROUP",
  "content": "題組說明文字（HTML，圖片同上規則）",
  "options": null,
  "answer": null,
  "difficulty": 5,
  "conceptIds": [],
  "childQuestions": [
    {
      "type": "SINGLE"|"MULTIPLE"|"TRUE_FALSE"|"FILL",
      "sortOrder": 0,
      "content": "子題內容",
      "options": "A|B|C|D",
      "answer": "A",
      "difficulty": 5
    }
  ]
}

sortOrder 從 0 開始遞增。

## 使用者指定觀念

使用者必須在對話中提供觀念清單，格式為「觀念名稱=id」，例如：
極限=1, 導函數=2, 積分=3
若未提供觀念清單，先提醒使用者要提供觀念清單，勿開始動作
`;

export type ConceptOption = { id: number; name: string };

/**
 * The user-turn text. The instruction above refuses to start without a
 * concept list ("若未提供觀念清單，先提醒使用者要提供觀念清單，勿開始動作"),
 * so this is what unblocks it -- the subject's concepts, rendered in the
 * 「名稱=id」 form the instruction specifies, resolved from the DB rather
 * than trusted from the client so the model can only pick ids that
 * really exist under that subject.
 */
export const buildQuestionExtractPrompt = (
  subjectName: string,
  concepts: ConceptOption[],
  imageCount: number,
  note?: string
): string => {
  const conceptList = concepts.map((concept) => `${concept.name}=${concept.id}`).join(', ');
  const lines = [
    imageCount > 1
      ? // Restated here as well as in the instruction because this is the
        // failure that actually costs the admin a re-run: several crops of
        // one long question coming back as several separate questions.
        `以下 ${imageCount} 張圖片為「${subjectName}」同一道題目的不同部分，請合併辨識為一道題目。`
      : `以下圖片為「${subjectName}」的一道題目截圖，請依照規則辨識。`,
    `觀念清單：${conceptList}`,
  ];
  // Free-text escape hatch for the per-question quirks the static
  // instruction can't cover ("答案是 B", "這題的圖表請忽略"), appended
  // last so it reads as an amendment to the rules above.
  if (note !== undefined && note.trim() !== '') lines.push(`補充說明：${note.trim()}`);

  return lines.join('\n');
};
