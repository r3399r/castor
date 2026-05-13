'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch, apiPost } from '@/lib/api'
import MultiSelectField from '@/components/MultiSelectField'
import SelectField from '@/components/SelectField'
import Chip, { tagColors } from '@/components/Chip'
import DifficultyStars from '@/components/DifficultyStars'
import type {
  Category,
  ConceptGroup,
  Exam,
  GetCategoryResponse,
  GetCategorySubjectResponse,
  GetQuestionAdaptiveResponse,
  GetQuestionResponse,
  GetSubjectConceptGroupResponse,
  GetSubjectExamResponse,
  GetSubjectTagResponse,
  PostReplyRequest,
  PostReplyResponse,
  Question,
  Subject,
  Tag,
} from '@/types/api'

const typeLabel: Record<string, string> = {
  SINGLE: '單選題',
  MULTIPLE: '多選題',
  TRUE_FALSE: '是非題',
  FILL: '選填題',
  GROUP: '題組',
}



function AnswerInput({
  question,
  answer,
  onAnswer,
  disabled,
}: {
  question: Question
  answer: string
  onAnswer: (val: string) => void
  disabled: boolean
}) {
  const options = question.options?.split('|') ?? []

  if (question.type === 'TRUE_FALSE') {
    return (
      <div className="mt-3 flex gap-6">
        {['True', 'False'].map((val) => (
          <label key={val} className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name={`q-${question.id}`}
              value={val}
              checked={answer === val}
              onChange={() => onAnswer(val)}
              disabled={disabled}
              className="accent-blue-700"
            />
            <span className="text-sm">{val === 'True' ? '是' : '非'}</span>
          </label>
        ))}
      </div>
    )
  }

  if (question.type === 'SINGLE') {
    return (
      <div className="mt-3 flex flex-wrap gap-4">
        {options.map((opt) => (
          <label key={opt} className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name={`q-${question.id}`}
              value={opt}
              checked={answer === opt}
              onChange={() => onAnswer(opt)}
              disabled={disabled}
              className="accent-blue-700"
            />
            <span className="text-sm">{opt}</span>
          </label>
        ))}
      </div>
    )
  }

  if (question.type === 'MULTIPLE') {
    const base = answer || 'X'.repeat(options.length)
    return (
      <div className="mt-3 flex flex-wrap gap-4">
        {options.map((opt, i) => (
          <label key={opt} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={base[i] === 'O'}
              onChange={(e) => {
                const next =
                  base.substring(0, i) + (e.target.checked ? 'O' : 'X') + base.substring(i + 1)
                onAnswer(next)
              }}
              disabled={disabled}
              className="accent-blue-700"
            />
            <span className="text-sm">{opt}</span>
          </label>
        ))}
      </div>
    )
  }

  if (question.type === 'FILL') {
    const blanks = question.answer?.length ?? 0
    const base = answer || '@'.repeat(blanks)
    return (
      <div className="mt-3 flex flex-col gap-3">
        {Array.from({ length: blanks }).map((_, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-black-700">{i + 1}.</span>
            {options.map((opt) => (
              <label key={opt} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name={`q-${question.id}-blank-${i}`}
                  value={opt}
                  checked={base[i] === opt}
                  onChange={() => {
                    const next = base.substring(0, i) + opt + base.substring(i + 1)
                    onAnswer(next)
                  }}
                  disabled={disabled}
                  className="accent-blue-700"
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    )
  }

  return null
}

export default function AdaptiveClient() {
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

  const [questionCount, setQuestionCount] = useState(-1)
  const [adaptiveQuestion, setAdaptiveQuestion] = useState<Question | null>(null)
  const [repliedAnswer, setRepliedAnswer] = useState<Map<number, string>>(new Map())
  const [replyResponse, setReplyResponse] = useState<PostReplyResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const showConceptGroupHeader = useMemo(
    () => conceptGroupList.some((cg) => cg.concepts.length > 1),
    [conceptGroupList],
  )

  const canSubmit = useMemo(() => {
    if (!adaptiveQuestion) return false
    if (adaptiveQuestion.type === 'GROUP')
      return repliedAnswer.size === adaptiveQuestion.children.length
    return repliedAnswer.size === 1
  }, [adaptiveQuestion, repliedAnswer])

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
    if (!selectedSubjectId) return
    setQuestionCount(-1)
    apiFetch<GetQuestionResponse>('question', {
      subjectId: selectedSubjectId,
      examIds: selectedExamIds.length ? selectedExamIds.join(',') : undefined,
      conceptIds: selectedConceptIds.length ? selectedConceptIds.join(',') : undefined,
      tagIds: selectedTagIds.length ? selectedTagIds.join(',') : undefined,
      limit: 1,
    })
      .then((res) => setQuestionCount(res.paginate.total))
      .catch(console.error)
  }, [selectedSubjectId, selectedExamIds, selectedConceptIds, selectedTagIds])

  const fetchAdaptive = async () => {
    if (!selectedSubjectId) return
    setAdaptiveQuestion(null)
    setReplyResponse(null)
    setRepliedAnswer(new Map())
    setLoading(true)
    try {
      const q = await apiFetch<GetQuestionAdaptiveResponse>('question/adaptive', {
        subjectId: selectedSubjectId,
        examIds: selectedExamIds.length ? selectedExamIds.join(',') : undefined,
        conceptIds: selectedConceptIds.length ? selectedConceptIds.join(',') : undefined,
        tagIds: selectedTagIds.length ? selectedTagIds.join(',') : undefined,
      })
      setAdaptiveQuestion(q)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async () => {
    if (!repliedAnswer.size) return
    setLoading(true)
    try {
      const payload: PostReplyRequest = [...repliedAnswer].map(([id, answer]) => ({
        questionId: id,
        repliedAnswer: answer,
      }))
      const res = await apiPost<PostReplyResponse, PostReplyRequest>('reply', payload)
      setReplyResponse(res)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const onReset = () => {
    setAdaptiveQuestion(null)
    setReplyResponse(null)
    setRepliedAnswer(new Map())
    setSelectedExamIds([])
    setSelectedConceptIds([])
    setSelectedTagIds([])
  }

  const filtersLocked = !!adaptiveQuestion

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-blue-700">智慧練習</h1>

      <div className="flex flex-col gap-4 rounded-[24px] border border-brown-300 bg-white p-6">
        <SelectField
          label="選擇類別"
          value={selectedCategoryId}
          onChange={setSelectedCategoryId}
          disabled={filtersLocked}
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
          disabled={!selectedCategoryId || filtersLocked}
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
          disabled={!selectedSubjectId || filtersLocked}
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
          disabled={!selectedSubjectId || filtersLocked}
        />

        {tagList.length > 0 && (
          <MultiSelectField
            label="選擇標籤（可複選，可不選）"
            options={tagList.map((t) => ({ value: String(t.id), label: t.name }))}
            value={selectedTagIds}
            onChange={setSelectedTagIds}
            disabled={!selectedSubjectId || filtersLocked}
          />
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={fetchAdaptive}
            disabled={!selectedSubjectId || filtersLocked || questionCount <= 0 || loading}
            className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && !adaptiveQuestion ? '選題中…' : 'AI 選題'}
          </button>
          {questionCount >= 0 && (
            <span className="text-sm text-black-500">共有 {questionCount} 題符合條件</span>
          )}
        </div>
      </div>

      <hr className="my-6 border-brown-300" />

      {adaptiveQuestion && (
        <div className="overflow-hidden rounded-xl border border-brown-300">
          <div className="flex items-start justify-between gap-2 border-b border-brown-300 bg-blue-50 p-3">
            <div className="flex flex-wrap gap-2">
              <Chip label={typeLabel[adaptiveQuestion.type] ?? adaptiveQuestion.type} />
              {adaptiveQuestion.exam.map((e) => (
                <Chip key={e.id} label={e.name} color={tagColors.exam} />
              ))}
              {adaptiveQuestion.concept.map((c) => (
                <Chip key={c.id} label={c.name} color={tagColors.concept} />
              ))}
              {adaptiveQuestion.tag.map((t) => (
                <Chip key={t.id} label={t.name} color={tagColors.tag} />
              ))}
            </div>
            <DifficultyStars value={adaptiveQuestion.adjustedDifficulty} />
          </div>

          <div className="p-4">
            {adaptiveQuestion.type !== 'GROUP' && adaptiveQuestion.content && (
              <>
                <div
                  dangerouslySetInnerHTML={{ __html: adaptiveQuestion.content }}
                  className="prose prose-sm max-w-none"
                />
                <AnswerInput
                  question={adaptiveQuestion}
                  answer={repliedAnswer.get(adaptiveQuestion.id) ?? ''}
                  onAnswer={(val) =>
                    setRepliedAnswer((prev) => new Map(prev).set(adaptiveQuestion.id, val))
                  }
                  disabled={!!replyResponse}
                />
                {replyResponse?.[0] && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                    <div>解答：{replyResponse[0].correctAnswer}</div>
                    <div>得分：{replyResponse[0].score}</div>
                  </div>
                )}
              </>
            )}

            {adaptiveQuestion.type === 'GROUP' &&
              adaptiveQuestion.children.map((child, i) => (
                <div key={child.id} className={i > 0 ? 'mt-4 border-t border-[#E5E0DC] pt-4' : ''}>
                  {child.content && (
                    <div
                      dangerouslySetInnerHTML={{ __html: child.content }}
                      className="prose prose-sm max-w-none"
                    />
                  )}
                  <AnswerInput
                    question={child}
                    answer={repliedAnswer.get(child.id) ?? ''}
                    onAnswer={(val) =>
                      setRepliedAnswer((prev) => new Map(prev).set(child.id, val))
                    }
                    disabled={!!replyResponse}
                  />
                  {replyResponse?.[i] && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                      <div>解答：{replyResponse[i].correctAnswer}</div>
                      <div>得分：{replyResponse[i].score}</div>
                    </div>
                  )}
                </div>
              ))}

            {replyResponse?.[0]?.fbPostId && (
              <div className="mt-4">
                <a
                  href={`https://m.facebook.com/${replyResponse[0].fbPostId.split('_')[0]}/posts/${replyResponse[0].fbPostId.split('_')[1]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 underline hover:text-blue-800"
                >
                  討論區
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {adaptiveQuestion && !replyResponse && (
        <div className="mt-4">
          <button
            onClick={onSubmit}
            disabled={!canSubmit || loading}
            className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '送出中…' : '確認送出'}
          </button>
        </div>
      )}

      {replyResponse && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={fetchAdaptive}
            disabled={loading}
            className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
          >
            用相同條件再選下一題
          </button>
          <button
            onClick={onReset}
            className="rounded-md bg-red-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-600"
          >
            清除篩選條件
          </button>
        </div>
      )}
    </div>
  )
}
