'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch, apiPost } from '@/lib/api'
import MultiSelectField from '@/components/MultiSelectField'
import { MathJax } from 'better-react-mathjax'

type SubjectDetail = {
  id: number
  name: string
  sortOrder: number
  createdAt: string | null
  exams: { id: number; name: string }[]
  tags: { id: number; name: string }[]
  conceptGroups: {
    id: number
    name: string
    concepts: { id: number; name: string }[]
  }[]
}

type ChildQuestionDraft = {
  type?: string
  sortOrder?: number
  content?: string
  options?: string
  answer?: string
  difficulty?: number
}

// The shape pasted into the textarea below -- everything except
// subjectId/examId/tagIds, which come from this page's own pickers and
// get merged in at submit time rather than being part of the pasted JSON.
type QuestionDraft = {
  type?: string
  content?: string
  options?: string
  answer?: string
  difficulty?: number
  conceptIds?: number[]
  childQuestions?: ChildQuestionDraft[]
}

const QUESTION_TYPES = ['GROUP', 'SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL']
const CHILD_QUESTION_TYPES = ['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL']

// Mirrors backend_new's questionBodySchema closely enough that anything
// passing here should also pass the server's own validation -- this is
// just to surface which field is missing before the round trip, not a
// replacement for the server-side check.
function missingFields(q: QuestionDraft): string[] {
  const problems: string[] = []
  if (!q.type || !QUESTION_TYPES.includes(q.type)) problems.push('type')
  if (
    typeof q.difficulty !== 'number' ||
    q.difficulty < 1 ||
    q.difficulty > 10
  )
    problems.push('difficulty（需為 1~10）')
  if (!q.conceptIds || q.conceptIds.length === 0)
    problems.push('conceptIds（至少一個）')

  if (q.type === 'GROUP') {
    if (!q.childQuestions || q.childQuestions.length === 0) {
      problems.push('childQuestions（題組需至少一個子題）')
    } else {
      q.childQuestions.forEach((child, i) => {
        if (!child.type || !CHILD_QUESTION_TYPES.includes(child.type))
          problems.push(`childQuestions[${i}].type`)
        if (typeof child.sortOrder !== 'number')
          problems.push(`childQuestions[${i}].sortOrder`)
        if (!child.content) problems.push(`childQuestions[${i}].content`)
        if (!child.options) problems.push(`childQuestions[${i}].options`)
        if (!child.answer) problems.push(`childQuestions[${i}].answer`)
        if (
          typeof child.difficulty !== 'number' ||
          child.difficulty < 1 ||
          child.difficulty > 10
        )
          problems.push(`childQuestions[${i}].difficulty（需為 1~10）`)
      })
    }
  } else {
    if (!q.content) problems.push('content')
    if (!q.options) problems.push('options')
    if (!q.answer) problems.push('answer')
  }
  return problems
}

export default function SubjectNewQuestionClient({ subjectId }: { subjectId: number }) {
  const [subject, setSubject] = useState<SubjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [questionsInput, setQuestionsInput] = useState('')
  const [selectedExamId, setSelectedExamId] = useState('')
  const [tagSelections, setTagSelections] = useState<Record<number, string[]>>({})
  const [submitStatus, setSubmitStatus] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)

  const conceptNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const group of subject?.conceptGroups ?? [])
      for (const concept of group.concepts) map.set(concept.id, concept.name)
    return map
  }, [subject])

  const { questions: parsedQuestions, error: parseError } = useMemo(() => {
    if (questionsInput.trim() === '') return { questions: [], error: null }
    try {
      const parsed: unknown = JSON.parse(questionsInput)
      if (!Array.isArray(parsed))
        return { questions: [], error: 'JSON 必須是題目物件的陣列' }
      return { questions: parsed as QuestionDraft[], error: null }
    } catch {
      return { questions: [], error: 'JSON 格式錯誤，請確認貼上的內容' }
    }
  }, [questionsInput])

  // All-or-nothing: submitting only makes sense once every question in the
  // batch is individually valid, so one bad question blocks the button
  // rather than silently skipping it.
  const hasInvalidQuestion = parsedQuestions.some((q) => missingFields(q).length > 0)

  const handleCopyAllConcepts = async (
    conceptGroups: { concepts: { id: number; name: string }[] }[]
  ) => {
    const csv = conceptGroups
      .flatMap((group) => group.concepts)
      .map((concept) => `${concept.name}=${concept.id}`)
      .join(', ')
    try {
      await navigator.clipboard.writeText(csv)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      alert('複製失敗，請手動選取複製。')
    }
  }

  const handleSubmitAll = async () => {
    if (!subject || !selectedExamId || parsedQuestions.length === 0 || hasInvalidQuestion)
      return

    setSubmitting(true)
    setSubmitStatus({})
    setBatchError(null)
    try {
      const payload = {
        subjectId: subject.id,
        examId: Number(selectedExamId),
        questions: parsedQuestions.map((question, i) => ({
          type: question.type,
          content: question.content,
          options: question.options,
          answer: question.answer,
          difficulty: question.difficulty,
          conceptIds: question.conceptIds,
          tagIds: (tagSelections[i] ?? []).map(Number),
          childQuestions: question.childQuestions,
        })),
      }
      // One request for the whole batch -- the server runs it inside a
      // single transaction, so this either creates every question or none
      // of them (matching the all-or-nothing submit button above).
      const res = await apiPost<{ id: number }[][]>('question', payload)
      const nextStatus: Record<number, string> = {}
      res.forEach((rows, i) => {
        nextStatus[i] = `成功建立 ${rows.length} 題`
      })
      setSubmitStatus(nextStatus)
    } catch (e) {
      setBatchError(`送出失敗: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiFetch<SubjectDetail>(`subject/${subjectId}`)
      .then(setSubject)
      .catch(() => setError('無法載入科目資料。'))
      .finally(() => setLoading(false))
  }, [subjectId])

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-black-500">載入中…</span>
      </div>
    )
  }

  if (error || subject === null) {
    return (
      <div className="mt-[60px] rounded-[24px] border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-600">{error ?? '找不到此科目。'}</p>
      </div>
    )
  }

  return (
    <div className="pb-[70px]">
      <h1 className="mt-[60px] mb-2 text-3xl font-bold text-blue-700">
        新增題目（{subject.name}）
      </h1>
      <p className="mb-6 text-sm text-black-500">
        選擇送出時使用的試卷，並確認此科目目前可用的標籤、觀念群組。
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-brown-300 bg-white/40 p-4">
          <h2 className="mb-2 text-sm font-bold text-black-900">試卷（送出時使用，單選）</h2>
          {subject.exams.length === 0 ? (
            <p className="text-sm text-black-300">尚無試卷</p>
          ) : (
            <div className="space-y-1 text-sm text-black-700">
              {subject.exams.map((exam) => (
                <label key={exam.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="examId"
                    checked={selectedExamId === String(exam.id)}
                    onChange={() => setSelectedExamId(String(exam.id))}
                    className="accent-blue-700"
                  />
                  {exam.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-brown-300 bg-white/40 p-4">
          <h2 className="mb-2 text-sm font-bold text-black-900">標籤</h2>
          {subject.tags.length === 0 ? (
            <p className="text-sm text-black-300">尚無標籤</p>
          ) : (
            <ul className="space-y-1 text-sm text-black-700">
              {subject.tags.map((tag) => (
                <li key={tag.id}>{tag.name}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-brown-300 bg-white/40 p-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-bold text-black-900">觀念群組</h2>
            {subject.conceptGroups.some((group) => group.concepts.length > 0) && (
              <button
                type="button"
                onClick={() => handleCopyAllConcepts(subject.conceptGroups)}
                className="shrink-0 rounded-md border border-brown-300 px-2 py-0.5 text-xs text-black-700 transition hover:bg-beige-200"
              >
                {copied ? '已複製!' : '複製全部'}
              </button>
            )}
          </div>
          {subject.conceptGroups.length === 0 ? (
            <p className="text-sm text-black-300">尚無觀念群組</p>
          ) : (
            <ul className="space-y-2 text-sm text-black-700">
              {subject.conceptGroups.map((group) => (
                <li key={group.id}>
                  <span className="font-medium text-black-900">{group.name}</span>
                  {group.concepts.length > 0 && (
                    <ul className="ml-4 list-disc text-black-500">
                      {group.concepts.map((concept) => (
                        <li key={concept.id}>{concept.name}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <hr className="my-6 border-brown-300" />

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-black-900">貼上題目 JSON 陣列</h2>
        <textarea
          value={questionsInput}
          onChange={(e) => {
            setQuestionsInput(e.target.value)
            setSubmitStatus({})
            setBatchError(null)
          }}
          placeholder='[{"type":"SINGLE","content":"...","options":"A|B|C|D","answer":"A","difficulty":5,"conceptIds":[1]}, ...]'
          className="h-48 w-full rounded-lg border border-brown-300 p-3 font-mono text-sm"
        />
        {parseError && <p className="text-sm text-red-600">{parseError}</p>}
      </section>

      {parsedQuestions.length > 0 && (
        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-bold text-black-900">預覽（共 {parsedQuestions.length} 題）</h2>

          {parsedQuestions.map((question, i) => {
            const problems = missingFields(question)
            return (
              <div key={i} className="rounded-[24px] border border-brown-300 bg-white p-6">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold text-black-900">第 {i + 1} 題</span>
                  {question.type && (
                    <span className="rounded-full bg-beige-200 px-2 py-0.5 text-xs text-black-700">
                      {question.type}
                    </span>
                  )}
                  {submitStatus[i] && (
                    <span
                      className={`text-xs font-medium ${
                        submitStatus[i].startsWith('錯誤') || submitStatus[i].startsWith('略過')
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}
                    >
                      {submitStatus[i]}
                    </span>
                  )}
                </div>

                {question.content ? (
                  <MathJax dynamic>
                    <div
                      dangerouslySetInnerHTML={{ __html: question.content }}
                      className="prose prose-sm max-w-none"
                    />
                  </MathJax>
                ) : (
                  <p className="text-sm text-black-200">此題無 content</p>
                )}

                <div className="mt-3 space-y-1 border-t border-[#E5E0DC] pt-3 text-sm">
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 font-medium text-black-500">options:</span>
                    <span className="text-black-900">{question.options ?? '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 font-medium text-black-500">answer:</span>
                    <span className="text-black-900">{question.answer ?? '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 font-medium text-black-500">difficulty:</span>
                    <span className="text-black-900">{question.difficulty ?? '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 font-medium text-black-500">concepts:</span>
                    <span className="text-black-900">
                      {question.conceptIds && question.conceptIds.length > 0
                        ? question.conceptIds
                            .map((id) => conceptNameById.get(id) ?? `#${id}`)
                            .join(', ')
                        : '—'}
                    </span>
                  </div>
                </div>

                {subject.tags.length > 0 && (
                  <div className="mt-3 border-t border-[#E5E0DC] pt-3">
                    <MultiSelectField
                      label="標籤（可複選，可不選）"
                      options={subject.tags.map((tag) => ({
                        value: String(tag.id),
                        label: tag.name,
                      }))}
                      value={tagSelections[i] ?? []}
                      onChange={(value) =>
                        setTagSelections((prev) => ({ ...prev, [i]: value }))
                      }
                    />
                  </div>
                )}

                {problems.length > 0 && (
                  <p className="mt-3 text-sm text-red-600">
                    缺少必填欄位：{problems.join('、')}
                  </p>
                )}
              </div>
            )
          })}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmitAll}
              disabled={!selectedExamId || submitting || hasInvalidQuestion}
              className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '送出中…' : '送出'}
            </button>
            {!selectedExamId && <span className="text-sm text-red-600">請先選擇試卷</span>}
            {selectedExamId && hasInvalidQuestion && (
              <span className="text-sm text-red-600">有題目缺少必填欄位，請修正後再送出</span>
            )}
            {batchError && <span className="text-sm text-red-600">{batchError}</span>}
          </div>
        </section>
      )}
    </div>
  )
}
