'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch, apiPost } from '@/lib/api'
import MultiSelectField from '@/components/MultiSelectField'
import SelectField from '@/components/SelectField'
import type {
  Category,
  ConceptGroup,
  Exam,
  GetCategoryResponse,
  GetCategorySubjectResponse,
  GetSubjectConceptGroupResponse,
  GetSubjectExamResponse,
  GetSubjectTagResponse,
  PostPreviewRequest,
  PostPreviewResponse,
  PostQuestionRequest,
  PostQuestionResponse,
  Subject,
  Tag,
} from '@/types/api'


function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-blue-700"
      />
      <span className="text-sm text-black-700">{label}</span>
    </label>
  )
}

export default function PreviewClient() {
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([])
  const [selectedConceptIds, setSelectedConceptIds] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [subjectList, setSubjectList] = useState<Subject[]>([])
  const [examList, setExamList] = useState<Exam[]>([])
  const [conceptGroupList, setConceptGroupList] = useState<ConceptGroup[]>([])
  const [tagList, setTagList] = useState<Tag[]>([])

  const [selectedType, setSelectedType] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [geminiOutput, setGeminiOutput] = useState('')
  const [questionInput, setQuestionInput] = useState(
    JSON.stringify(
      {
        type: 'SINGLE',
        content: 'xxx',
        options: 'A|B|C|D',
        answer: 'B',
        difficulty: -1,
      },
      null,
      2,
    ),)
  const [needSolution, setNeedSolution] = useState(false)
  const [containImage, setContainImage] = useState(false)
  const [needCss, setNeedCss] = useState(false)
  const [loading, setLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createResult, setCreateResult] = useState<string | null>(null)

  const showConceptGroupHeader = useMemo(
    () => conceptGroupList.some((cg) => cg.concepts.length > 1),
    [conceptGroupList],
  )

  const payload = useMemo<Partial<PostQuestionRequest> | null>(() => {
    try {
      return JSON.parse(questionInput) as Partial<PostQuestionRequest>
    } catch {
      return null
    }
  }, [questionInput])

  const geminiInput = useMemo(() => {
    const categoryName = categoryList.find((c) => String(c.id) === selectedCategoryId)?.name ?? ''
    const subjectName = subjectList.find((s) => String(s.id) === selectedSubjectId)?.name ?? ''
    let text = `圖片為 ${categoryName} ${subjectName} 的一道題目，請提供以下資訊: `
    text += '- content: 轉換成 html，換行符號使用 <br/>，回傳內容不用無謂的空白鍵跟換行'
    if (needCss) text += '，css直接寫入html inline style，不改變字體設定'
    if (containImage)
      text +=
        '，請將圖片以 img 標籤的形式放在 content 中，並將圖片網址皆設為 https://to-do-url，考慮手機排版，當圖片佔一半時以上下排版。'
    else text += '。'
    if (needSolution) text += '- solution: 簡短的純文字詳解。'
    text += '- answer: 正確選項的字面值，單選題與是非題為一個選項，多選題為多個選項以OX表示如答案AC為OXOX，選填題依序填入答案如301。'
    text += '- difficulty: 難易度 (簡單=2,中等=5,困難=8)。'
    text +=
      '- conceptIds: 從下述觀念清單中選擇至少一個: (' +
      conceptGroupList.flatMap((g) => g.concepts.map((c) => `${c.name}=${c.id}`)).join(', ') +
      ')。以 json 格式回覆，格式如下: {"content": in string, '
    if (needSolution) text += '"solution": in string, '
    text += '"answer" in string, "difficulty": in number, "conceptIds": in number array'
    if (selectedType === 'GROUP')
      text +=
        ', "childQuestions": [{"type": in string, "content": in string, "sortOrder": in number start from 0, "difficulty": in number, "options": in string, "answer": in string}, ...]'
    text += '} without markdown code block. 只回覆 json，不要其他文字說明。'
    return text
  }, [
    categoryList,
    subjectList,
    selectedCategoryId,
    selectedSubjectId,
    conceptGroupList,
    needSolution,
    containImage,
    needCss,
    selectedType,
  ])

  useEffect(() => {
    apiFetch<GetCategoryResponse>('category').then(setCategoryList).catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedCategoryId) return
    setSelectedSubjectId('')
    setSelectedExamIds([])
    setSelectedConceptIds([])
    setSelectedTagIds([])
    apiFetch<GetCategorySubjectResponse>(`category/${selectedCategoryId}/subject`)
      .then(setSubjectList)
      .catch(console.error)
  }, [selectedCategoryId])

  useEffect(() => {
    if (!selectedSubjectId) return
    setSelectedExamIds([])
    setSelectedConceptIds([])
    setSelectedTagIds([])
    Promise.all([
      apiFetch<GetSubjectExamResponse>(`subject/${selectedSubjectId}/exam`),
      apiFetch<GetSubjectConceptGroupResponse>(`subject/${selectedSubjectId}/concept-group`),
      apiFetch<GetSubjectTagResponse>(`subject/${selectedSubjectId}/tag`),
    ])
      .then(([exams, conceptGroups, tags]) => {
        setExamList(exams)
        setConceptGroupList(conceptGroups)
        setTagList(tags)
      })
      .catch(console.error)
  }, [selectedSubjectId])

  useEffect(() => {
    const current = JSON.parse(questionInput)
    let options
    switch (selectedType) {
      case 'SINGLE':
        options = 'A|B|C|D'
        break;
      case 'MULTIPLE':
        options = 'A|B|C|D|E'
        break;
      case 'TRUE_FALSE':
        options = 'True|False'
        break;
      case 'FILL':
        options = '1|2|3|4|5|6|7|8|9|0|-|±'
        break;
    }
    setQuestionInput(
      JSON.stringify(
        {
          ...current,
          type: selectedType,
          subjectId: selectedSubjectId ? Number(selectedSubjectId) : undefined,
          imageUrl: imageUrl || undefined,
          options,
          examId:
            selectedExamIds.length > 0 ? Number(selectedExamIds[0]) : undefined,
          tagIds: selectedTagIds.length > 0 ? selectedTagIds.map(Number) : undefined,
          conceptIds:
            selectedConceptIds.length > 0 ? selectedConceptIds.map(Number) : undefined,
        },
        null,
        2,
      ),
    )
  }, [selectedSubjectId, imageUrl, selectedExamIds, selectedConceptIds, selectedTagIds, selectedType])

  useEffect(() => {
    if (!geminiOutput) return
    try {
      const parsed = JSON.parse(geminiOutput)
      const current = JSON.parse(questionInput)
      setQuestionInput(JSON.stringify({ ...current, ...parsed }, null, 2))
    } catch {
      // invalid JSON — skip merge
    }
  }, [geminiOutput])

  const onCreateQuestion = async () => {
    if (!payload) return
    setCreateLoading(true)
    setCreateResult(null)
    try {
      const res = await apiPost<PostQuestionResponse, PostQuestionRequest>('question', payload as PostQuestionRequest)
      setCreateResult(`成功建立 ${res.length} 題`)
    } catch (e) {
      setCreateResult(`錯誤: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCreateLoading(false)
    }
  }

  const onAskGemini = async () => {
    if (!imageUrl || !selectedSubjectId) return
    setLoading(true)
    try {
      const res = await apiPost<PostPreviewResponse, PostPreviewRequest>('preview', {
        text: geminiInput,
        imageUrl,
      })
      setGeminiOutput(JSON.stringify(res, null, 2))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-blue-700">題目預覽</h1>

      <div className="flex flex-col gap-4 rounded-[24px] border border-brown-300 bg-white p-6">
        <SelectField
          label="選擇類別"
          value={selectedCategoryId}
          onChange={setSelectedCategoryId}
        >
          {categoryList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="選擇科目"
          value={selectedSubjectId}
          onChange={setSelectedSubjectId}
          disabled={!selectedCategoryId}
        >
          {subjectList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>

        <MultiSelectField
          label="選擇試卷（可複選，可不選）"
          options={examList.map((e) => ({ value: String(e.id), label: e.name }))}
          value={selectedExamIds}
          onChange={setSelectedExamIds}
          disabled={!selectedSubjectId}
        />

        <MultiSelectField
          label="選擇觀念（可複選，可不選）"
          options={
            showConceptGroupHeader
              ? conceptGroupList.map((cg) => ({
                groupLabel: cg.name,
                options: cg.concepts.map((c) => ({ value: String(c.id), label: c.name })),
              }))
              : conceptGroupList.flatMap((cg) =>
                cg.concepts.map((c) => ({ value: String(c.id), label: c.name })),
              )
          }
          value={selectedConceptIds}
          onChange={setSelectedConceptIds}
          disabled={!selectedSubjectId}
        />

        {tagList.length > 0 && (
          <MultiSelectField
            label="選擇標籤（可複選，可不選）"
            options={tagList.map((t) => ({ value: String(t.id), label: t.name }))}
            value={selectedTagIds}
            onChange={setSelectedTagIds}
            disabled={!selectedSubjectId}
          />
        )}

        <SelectField
          label="選擇題型"
          value={selectedType}
          onChange={setSelectedType}
        >
          <option value='SINGLE'>
            單選題
          </option>
          <option value='MULTIPLE'>
            多選題
          </option>
          <option value='TRUE_FALSE'>
            是非題
          </option>
          <option value='FILL'>
            選填題
          </option>
          <option value='GROUP'>
            題組
          </option>
        </SelectField>

        <div>
          <label className="mb-1 block text-sm font-medium text-black-700">Image URL</label>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-brown-300 bg-white px-3 py-2.5 text-sm text-black-900"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <CheckboxField label="need solution?" checked={needSolution} onChange={setNeedSolution} />
          <CheckboxField label="need css?" checked={needCss} onChange={setNeedCss} />
          <CheckboxField label="contain image?" checked={containImage} onChange={setContainImage} />
        </div>
      </div>

      <hr className="my-6 border-brown-300" />

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-black-900">Gemini Input</h2>
        <div className="rounded-lg border border-brown-300 bg-[#F9F5F1] p-4 text-sm whitespace-pre-wrap text-black-700">
          {geminiInput}
        </div>
        <button
          onClick={onAskGemini}
          disabled={!imageUrl || !selectedSubjectId || loading || !selectedType}
          className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '請求中…' : 'Ask Gemini'}
        </button>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-lg font-bold text-black-900">Gemini Output</h2>
        <textarea
          className="h-48 w-full rounded-lg border border-brown-300 p-3 font-mono text-sm"
          value={geminiOutput}
          onChange={(e) => setGeminiOutput(e.target.value)}
          placeholder="Gemini JSON 輸出會自動填入…"
        />
      </section>

      <hr className="my-6 border-brown-300" />

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-black-900">Input JSON</h2>
        <textarea
          className="h-64 w-full rounded-lg border border-brown-300 p-3 font-mono text-sm"
          value={questionInput}
          onChange={(e) => setQuestionInput(e.target.value)}
          placeholder="題目 JSON"
        />
      </section>

      {payload && (
        <section className="mt-4 space-y-1 rounded-[24px] border border-brown-300 bg-white p-6">
          <h2 className="mb-3 text-lg font-bold text-black-900">Parsed Fields</h2>
          {(
            [
              ['subjectId', payload.subjectId],
              ['type', payload.type],
              ['imageUrl', payload.imageUrl],
              ['content', payload.content],
              ['options', payload.options],
              ['answer', payload.answer],
              ['solution', payload.solution],
              ['difficulty', payload.difficulty],
              ['examId', payload.examId],
              ['tagIds', payload.tagIds?.join(', ')],
              ['conceptIds', payload.conceptIds?.join(', ')],
            ] as [string, unknown][]
          ).map(([key, val]) => (
            <div key={key} className="flex gap-2 text-sm">
              <span className="w-28 shrink-0 font-medium text-black-500">{key}:</span>
              <span className="text-black-900">{val !== undefined ? String(val) : '—'}</span>
            </div>
          ))}
          {payload.type === 'GROUP' && payload.childQuestions?.length === 0 && (
            <p className="mt-2 text-sm text-red-500">題組必須有子題</p>
          )}
          {payload.childQuestions?.map((child, i) => (
            <div key={i} className="mt-3 rounded-lg border border-[#E5E0DC] p-3">
              <p className="mb-1 font-medium text-black-900">子題 {i + 1}</p>
              {(
                [
                  ['type', child.type],
                  ['sortOrder', child.sortOrder],
                  ['content', child.content],
                  ['options', child.options],
                  ['answer', child.answer],
                  ['difficulty', child.difficulty],
                ] as [string, unknown][]
              ).map(([key, val]) => (
                <div key={key} className="flex gap-2 text-sm">
                  <span className="w-24 shrink-0 font-medium text-black-500">{key}:</span>
                  <span className="text-black-900">{val !== undefined ? String(val) : '—'}</span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      <section className="mt-6 space-y-2">
        <h2 className="text-lg font-bold text-black-900">Preview</h2>
        <div className="min-h-[120px] rounded-[24px] border border-brown-300 bg-white p-6">
          {payload?.content ? (
            <>
              <div
                dangerouslySetInnerHTML={{ __html: payload.content }}
                className="prose prose-sm max-w-none"
              />
              {payload.childQuestions?.map((child, i) => (
                <div
                  key={i}
                  dangerouslySetInnerHTML={{ __html: child.content ?? '' }}
                  className="prose prose-sm mt-4 max-w-none border-t border-[#E5E0DC] pt-4"
                />
              ))}
            </>
          ) : (
            <p className="text-sm text-black-200">請在 Input JSON 中填入 content 以預覽</p>
          )}
        </div>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-lg font-bold text-black-900">Create Question</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={onCreateQuestion}
            disabled={!payload || createLoading}
            className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createLoading ? '建立中…' : '建立題目'}
          </button>
          {createResult && (
            <span className={`text-sm font-medium ${createResult.startsWith('錯誤') ? 'text-red-500' : 'text-green-600'}`}>
              {createResult}
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
