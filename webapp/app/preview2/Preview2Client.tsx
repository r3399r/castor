'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api'
import SelectField from '@/components/SelectField'
import type {
  Category,
  Exam,
  GetCategoryResponse,
  GetCategorySubjectResponse,
  GetSubjectConceptGroupResponse,
  GetSubjectExamResponse,
  PostQuestionRequest,
} from '@/types/api'
import { MathJax } from 'better-react-mathjax'

function getMissingQuestionFields(item: Partial<PostQuestionRequest>): string[] {
  const missing: string[] = []
  if (!item.type) missing.push('type')
  if (item.difficulty === undefined) missing.push('difficulty')
  if (!item.conceptIds || item.conceptIds.length === 0) missing.push('conceptIds')
  if (item.type === 'GROUP') {
    if (!item.childQuestions || item.childQuestions.length === 0) {
      missing.push('childQuestions')
    } else {
      item.childQuestions.forEach((child, i) => {
        if (!child.type) missing.push(`childQuestions[${i}].type`)
        if (child.sortOrder === undefined) missing.push(`childQuestions[${i}].sortOrder`)
        if (!child.content) missing.push(`childQuestions[${i}].content`)
        if (!child.options) missing.push(`childQuestions[${i}].options`)
        if (!child.answer) missing.push(`childQuestions[${i}].answer`)
      })
    }
  } else {
    if (!item.content) missing.push('content')
    if (!item.options) missing.push('options')
    if (!item.answer) missing.push('answer')
  }
  return missing
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={!text}
      className="rounded-md border border-blue-700 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-700/5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {copied ? '已複製' : '複製'}
    </button>
  )
}

function CopyList({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-medium text-black-700">{label}</label>
        <CopyButton text={text} />
      </div>
      <div className="min-h-[2.5rem] rounded-lg border border-brown-300 bg-[#F9F5F1] p-3 text-sm whitespace-pre-wrap text-black-700">
        {text || '—'}
      </div>
    </div>
  )
}

export default function Preview2Client() {
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedExamId, setSelectedExamId] = useState('')

  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [subjectList, setSubjectList] = useState<GetCategorySubjectResponse['subjects']>([])
  const [examList, setExamList] = useState<Exam[]>([])
  const [conceptGroupList, setConceptGroupList] = useState<GetSubjectConceptGroupResponse>([])

  const [questionInput, setQuestionInput] = useState('')

  const conceptListText = useMemo(
    () => conceptGroupList.flatMap((g) => g.concepts.map((c) => `${c.name}=${c.id}`)).join(', '),
    [conceptGroupList],
  )

  const payload = useMemo<Partial<PostQuestionRequest> | Partial<PostQuestionRequest>[] | null>(() => {
    if (!questionInput.trim()) return null
    try {
      return JSON.parse(questionInput) as
        | Partial<PostQuestionRequest>
        | Partial<PostQuestionRequest>[]
    } catch {
      return null
    }
  }, [questionInput])

  const parseError = questionInput.trim().length > 0 && payload === null

  const questions = useMemo(
    () => (payload ? (Array.isArray(payload) ? payload : [payload]) : []),
    [payload],
  )

  const outputQuestions = useMemo(
    () =>
      questions.map((q) => ({
        ...q,
        subjectId: selectedSubjectId ? Number(selectedSubjectId) : undefined,
        examId: selectedExamId ? Number(selectedExamId) : undefined,
      })),
    [questions, selectedSubjectId, selectedExamId],
  )

  const outputJson = useMemo(() => {
    if (outputQuestions.length === 0) return ''
    return JSON.stringify(Array.isArray(payload) ? outputQuestions : outputQuestions[0], null, 2)
  }, [outputQuestions, payload])

  useEffect(() => {
    apiFetch<GetCategoryResponse>('category').then(setCategoryList).catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedCategoryId) return
    setSelectedSubjectId('')
    setSelectedExamId('')
    setExamList([])
    setConceptGroupList([])
    apiFetch<GetCategorySubjectResponse>(`category/${selectedCategoryId}/subject`)
      .then((res) => setSubjectList(res.subjects))
      .catch(console.error)
  }, [selectedCategoryId])

  useEffect(() => {
    if (!selectedSubjectId) return
    setSelectedExamId('')
    Promise.all([
      apiFetch<GetSubjectExamResponse>(`subject/${selectedSubjectId}/exam`),
      apiFetch<GetSubjectConceptGroupResponse>(`subject/${selectedSubjectId}/concept-group`),
    ])
      .then(([exams, conceptGroups]) => {
        setExamList(exams)
        setConceptGroupList(conceptGroups)
      })
      .catch(console.error)
  }, [selectedSubjectId])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-blue-700">題目預覽 2</h1>

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

        <CopyList label="觀念清單" text={conceptListText} />

        <div>
          <label className="mb-1 block text-sm font-medium text-black-700">選擇試卷</label>
          <div className="flex flex-col gap-2 rounded-lg border border-brown-300 bg-white p-3">
            {examList.length === 0 && (
              <p className="text-sm text-black-200">請先選擇科目</p>
            )}
            {examList.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-2 text-sm text-black-700">
                <input
                  type="radio"
                  name="examId"
                  value={e.id}
                  checked={selectedExamId === String(e.id)}
                  onChange={() => setSelectedExamId(String(e.id))}
                  className="accent-blue-700"
                />
                {e.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <hr className="my-6 border-brown-300" />

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-black-900">Input JSON（貼上題目陣列）</h2>
        <textarea
          className="h-64 w-full rounded-lg border border-brown-300 p-3 font-mono text-sm"
          value={questionInput}
          onChange={(e) => setQuestionInput(e.target.value)}
          placeholder="貼上 array of questions（PostQuestionRequest[]）"
        />
      </section>

      <hr className="my-6 border-brown-300" />

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-black-900">格式檢查</h2>
        {parseError && <p className="text-sm text-red-500">JSON 格式錯誤，無法解析</p>}
        {!parseError && questions.length === 0 && (
          <p className="text-sm text-black-200">請在上方貼上題目 JSON</p>
        )}
        {questions.length > 0 && (
          <div className="rounded-[24px] border border-brown-300 bg-white p-6">
            <p className="mb-3 font-medium text-black-900">共 {questions.length} 題</p>
            {questions.map((q, qi) => {
              const missing = getMissingQuestionFields(q)
              return (
                <div key={qi} className={qi > 0 ? 'mt-3 border-t border-[#E5E0DC] pt-3' : ''}>
                  <p className="text-sm font-medium text-black-900">
                    題目 {qi + 1}{' '}
                    {missing.length === 0 ? (
                      <span className="text-green-600">✓ 符合格式</span>
                    ) : (
                      <span className="text-red-500">缺少必要欄位: {missing.join(', ')}</span>
                    )}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-lg font-bold text-black-900">Preview</h2>
        {questions.length === 0 ? (
          <div className="min-h-[120px] rounded-[24px] border border-brown-300 bg-white p-6">
            <p className="text-sm text-black-200">請在 Input JSON 中填入 content 以預覽</p>
          </div>
        ) : (
          questions.map((q, qi) => (
            <div
              key={qi}
              className="mb-4 min-h-[120px] rounded-[24px] border border-brown-300 bg-white p-6"
            >
              {questions.length > 1 && (
                <p className="mb-2 font-medium text-black-900">題目 {qi + 1}</p>
              )}
              {q.content ? (
                <MathJax dynamic>
                  <div
                    dangerouslySetInnerHTML={{ __html: q.content }}
                    className="prose prose-sm max-w-none"
                  />
                </MathJax>
              ) : (
                <p className="text-sm text-black-200">缺少 content，無法預覽</p>
              )}
              {q.childQuestions?.map((child, i) => (
                <MathJax dynamic key={i}>
                  <div
                    dangerouslySetInnerHTML={{ __html: child.content ?? '' }}
                    className="prose prose-sm mt-4 max-w-none border-t border-[#E5E0DC] pt-4"
                  />
                </MathJax>
              ))}
            </div>
          ))
        )}
      </section>

      <hr className="my-6 border-brown-300" />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-black-900">Output JSON</h2>
          <div className="flex items-center gap-2">
            {!selectedExamId && (
              <span className="text-xs font-medium text-red-500">尚未選擇試卷，examId 未填入</span>
            )}
            <CopyButton text={outputJson} />
          </div>
        </div>
        <textarea
          readOnly
          className="h-64 w-full rounded-lg border border-brown-300 bg-[#F9F5F1] p-3 font-mono text-sm"
          value={outputJson}
          placeholder="Output JSON 會依上方選擇的科目及試卷自動填入 subjectId 及 examId"
        />
      </section>
    </div>
  )
}
