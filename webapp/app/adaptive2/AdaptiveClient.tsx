'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch, apiPost } from '@/lib/api'
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
import { MathJax } from 'better-react-mathjax'

const categoryLabel: Record<string, string> = {
  '國中': '國中會考',
}

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
            <span className="text-base font-bold text-black-700">{i + 1}.</span>
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

  const [numQuestionsTarget, setNumQuestionsTarget] = useState(5)
  const [questionCount, setQuestionCount] = useState(-1)
  const [adaptiveQuestion, setAdaptiveQuestion] = useState<Question[]>([])
  // responseOffsets[i] = starting index in replyResponse for question i
  const [responseOffsets, setResponseOffsets] = useState<number[]>([])
  const [repliedAnswer, setRepliedAnswer] = useState<Map<number, string>>(new Map())
  const [replyResponse, setReplyResponse] = useState<PostReplyResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const showConceptGroupHeader = useMemo(
    () => conceptGroupList.some((cg) => cg.concepts.length > 1),
    [conceptGroupList],
  )

  const canSubmit = useMemo(() => {
    if (!adaptiveQuestion.length) return false
    return adaptiveQuestion.every((q) => {
      if (q.type === 'GROUP') return q.children.every((c) => repliedAnswer.has(c.id))
      return repliedAnswer.has(q.id)
    })
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
    setAdaptiveQuestion([])
    setReplyResponse(null)
    setResponseOffsets([])
    setRepliedAnswer(new Map())
    setLoading(true)
    try {
      const results = await apiFetch<GetQuestionAdaptiveResponse>('question/adaptive', {
        subjectId: selectedSubjectId,
        examIds: selectedExamIds.length ? selectedExamIds.join(',') : undefined,
        conceptIds: selectedConceptIds.length ? selectedConceptIds.join(',') : undefined,
        tagIds: selectedTagIds.length ? selectedTagIds.join(',') : undefined,
        count: String(numQuestionsTarget),
      })
      setAdaptiveQuestion(results)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    try {
      const payload: PostReplyRequest = []
      const offsets: number[] = []
      for (const q of adaptiveQuestion) {
        offsets.push(payload.length)
        if (q.type === 'GROUP') {
          for (const child of q.children) {
            payload.push({ questionId: child.id, repliedAnswer: repliedAnswer.get(child.id) ?? '' })
          }
        } else {
          payload.push({ questionId: q.id, repliedAnswer: repliedAnswer.get(q.id) ?? '' })
        }
      }
      const res = await apiPost<PostReplyResponse, PostReplyRequest>('reply', payload)
      setReplyResponse(res)
      setResponseOffsets(offsets)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const onReset = () => {
    setAdaptiveQuestion([])
    setReplyResponse(null)
    setResponseOffsets([])
    setRepliedAnswer(new Map())
    setSelectedExamIds([])
    setSelectedConceptIds([])
    setSelectedTagIds([])
  }

  const filtersLocked = adaptiveQuestion.length > 0

  return (
    <div>
      <h1 className="mt-[60px] mb-2 text-3xl font-bold text-blue-700">智慧練習</h1>
      <p className="mb-10 text-sm text-black-500">制定今天的學習計畫，我們幫你挑出最適合的練習題目。</p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <span className="text-base font-bold text-black-700">考試類別</span>
          <div className={`grid grid-cols-1 md:grid-cols-3 border-t border-brown-700 divide-y md:divide-y-0 divide-x-0 md:divide-x divide-brown-700 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
            {/* 入學考試 */}
            <div className="flex flex-col gap-3 py-4 md:py-0 md:pr-6">
              <span className="border-b border-brown-700 pt-2 pb-2 text-xs font-semibold text-black-700 uppercase tracking-wide">入學考試</span>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3">
                {categoryList.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategoryId(String(c.id))}
                    className={`rounded-lg px-4 py-3 text-sm font-medium transition text-left ${
                      selectedCategoryId === String(c.id)
                        ? 'border-2 border-brown-700 bg-beige-200 text-black-900'
                        : 'border border-brown-300 bg-beige-100 text-black-900 hover:bg-beige-200'
                    }`}
                  >
                    {categoryLabel[c.name] ?? c.name}
                  </button>
                ))}
                {['分科'].map((name) => (
                  <button key={name} disabled className="rounded-lg border border-brown-300 bg-beige-100 px-4 py-3 text-sm font-medium text-black-300 cursor-not-allowed text-left">
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* 國家考試 */}
            <div className="flex flex-col gap-3 py-4 md:py-0 md:px-6">
              <span className="border-b border-brown-700 pt-2 pb-2 text-xs font-semibold text-black-700 uppercase tracking-wide">國家考試</span>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3">
                {['公務員高考三級', '公務員普考', '初等考試', '司法特考', '地方特考'].map((name) => (
                  <button key={name} disabled className="rounded-lg border border-brown-300 bg-beige-100 px-4 py-3 text-sm font-medium text-black-300 cursor-not-allowed text-left">
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* 專技證照 */}
            <div className="flex flex-col gap-3 py-4 md:py-0 md:pl-6">
              <span className="border-b border-brown-700 pt-2 pb-2 text-xs font-semibold text-black-700 uppercase tracking-wide">專技證照</span>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3">
                {['護理師執照', '律師執照', '會計師執照'].map((name) => (
                  <button key={name} disabled className="rounded-lg border border-brown-300 bg-beige-100 px-4 py-3 text-sm font-medium text-black-300 cursor-not-allowed text-left">
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {selectedCategoryId && subjectList.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-base font-bold text-black-700">選擇科目</span>
            <div className={`flex flex-wrap gap-2 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
              {subjectList.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSubjectId(String(s.id))}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    selectedSubjectId === String(s.id)
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-brown-300 bg-white text-black-900 hover:bg-blue-50'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedSubjectId && examList.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-base font-bold text-black-700">選擇試卷（可複選）</span>
            <div className={`flex flex-wrap gap-2 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
              {examList.map((e) => {
                const checked = selectedExamIds.includes(String(e.id))
                return (
                  <button
                    key={e.id}
                    onClick={() =>
                      setSelectedExamIds((prev) =>
                        checked ? prev.filter((x) => x !== String(e.id)) : [...prev, String(e.id)],
                      )
                    }
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      checked
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-brown-300 bg-white text-black-900 hover:bg-blue-50'
                    }`}
                  >
                    {e.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {selectedSubjectId && conceptGroupList.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-base font-bold text-black-700">選擇觀念（可複選）</span>
            <div className={`flex flex-col gap-3 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
              {showConceptGroupHeader
                ? conceptGroupList.map((cg) => (
                    <div key={cg.name} className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-black-500">{cg.name}</span>
                      <div className="flex flex-wrap gap-2">
                        {cg.concepts.map((c) => {
                          const checked = selectedConceptIds.includes(String(c.id))
                          return (
                            <button
                              key={c.id}
                              onClick={() =>
                                setSelectedConceptIds((prev) =>
                                  checked
                                    ? prev.filter((x) => x !== String(c.id))
                                    : [...prev, String(c.id)],
                                )
                              }
                              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                                checked
                                  ? 'border-blue-700 bg-blue-700 text-white'
                                  : 'border-brown-300 bg-white text-black-900 hover:bg-blue-50'
                              }`}
                            >
                              {c.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))
                : (
                    <div className="flex flex-wrap gap-2">
                      {conceptGroupList.flatMap((cg) =>
                        cg.concepts.map((c) => {
                          const checked = selectedConceptIds.includes(String(c.id))
                          return (
                            <button
                              key={c.id}
                              onClick={() =>
                                setSelectedConceptIds((prev) =>
                                  checked
                                    ? prev.filter((x) => x !== String(c.id))
                                    : [...prev, String(c.id)],
                                )
                              }
                              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                                checked
                                  ? 'border-blue-700 bg-blue-700 text-white'
                                  : 'border-brown-300 bg-white text-black-900 hover:bg-blue-50'
                              }`}
                            >
                              {c.name}
                            </button>
                          )
                        }),
                      )}
                    </div>
                  )}
            </div>
          </div>
        )}

        {selectedSubjectId && tagList.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-base font-bold text-black-700">選擇標籤（可複選）</span>
            <div className={`flex flex-wrap gap-2 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
              {tagList.map((t) => {
                const checked = selectedTagIds.includes(String(t.id))
                return (
                  <button
                    key={t.id}
                    onClick={() =>
                      setSelectedTagIds((prev) =>
                        checked ? prev.filter((x) => x !== String(t.id)) : [...prev, String(t.id)],
                      )
                    }
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      checked
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-brown-300 bg-white text-black-900 hover:bg-blue-50'
                    }`}
                  >
                    {t.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-black-700">練習題數</span>
          <div className="flex gap-2">
            {[1, 2, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => setNumQuestionsTarget(n)}
                disabled={filtersLocked}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  numQuestionsTarget === n
                    ? 'bg-blue-700 text-white'
                    : 'border border-brown-300 bg-white text-black-700 hover:bg-blue-50'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={fetchAdaptive}
            disabled={!selectedSubjectId || filtersLocked || questionCount <= 0 || loading}
            className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '選題中…' : 'AI 選題'}
          </button>
          {questionCount >= 0 && (
            <span className="text-sm text-black-500">共有 {questionCount} 題符合條件</span>
          )}
        </div>
      </div>

      <hr className="my-6 border-brown-300" />

      {adaptiveQuestion.length > 0 && (
        <div className="flex flex-col gap-6">
          <MathJax dynamic>
            {adaptiveQuestion.map((question, qi) => {
              const offset = responseOffsets[qi] ?? 0
              return (
                <div key={question.id} className="overflow-hidden rounded-xl border border-brown-300">
                  <div className="flex items-start justify-between gap-2 border-b border-brown-300 bg-blue-50 p-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs font-semibold text-blue-700">
                        第 {qi + 1} / {numQuestionsTarget} 題
                      </span>
                      <Chip label={typeLabel[question.type] ?? question.type} />
                      {question.exam.map((e) => (
                        <Chip key={e.id} label={e.name} color={tagColors.exam} />
                      ))}
                      {question.concept.map((c) => (
                        <Chip
                          key={c.id}
                          label={
                            c.conceptGroup.name === c.name
                              ? c.name
                              : c.conceptGroup.name + '-' + c.name
                          }
                          color={tagColors.concept}
                        />
                      ))}
                      {question.tag.map((t) => (
                        <Chip key={t.id} label={t.name} color={tagColors.tag} />
                      ))}
                    </div>
                    <DifficultyStars value={question.adjustedDifficulty} />
                  </div>

                  <div className="p-4">
                    {question.content && (
                      <div
                        dangerouslySetInnerHTML={{ __html: question.content }}
                        className="prose prose-sm max-w-none"
                      />
                    )}
                    {question.answer && (
                      <>
                        <AnswerInput
                          question={question}
                          answer={repliedAnswer.get(question.id) ?? ''}
                          onAnswer={(val) =>
                            setRepliedAnswer((prev) => new Map(prev).set(question.id, val))
                          }
                          disabled={!!replyResponse}
                        />
                        {replyResponse?.[offset] && (
                          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                            <div>解答：{replyResponse[offset].correctAnswer}</div>
                            <div>得分：{replyResponse[offset].score}</div>
                          </div>
                        )}
                      </>
                    )}

                    {question.type === 'GROUP' &&
                      question.children.map((child, i) => (
                        <div key={child.id} className="mt-4 border-t border-[#E5E0DC] pt-4">
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
                          {replyResponse?.[offset + i] && (
                            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                              <div>解答：{replyResponse[offset + i].correctAnswer}</div>
                              <div>得分：{replyResponse[offset + i].score}</div>
                            </div>
                          )}
                        </div>
                      ))}

                    {replyResponse?.[offset]?.fbPostId && (
                      <div className="mt-4">
                        <a
                          href={`https://m.facebook.com/${replyResponse[offset].fbPostId!.split('_')[0]}/posts/${replyResponse[offset].fbPostId!.split('_')[1]}`}
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
              )
            })}
          </MathJax>
        </div>
      )}

      {adaptiveQuestion.length > 0 && !replyResponse && (
        <div className="mt-6">
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
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={fetchAdaptive}
            disabled={loading}
            className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
          >
            用相同條件再練一組
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
