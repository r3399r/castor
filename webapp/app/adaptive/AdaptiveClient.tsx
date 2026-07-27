'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Goal, BookOpenText, Brain, FunnelPlus, NotebookPen } from 'lucide-react'
import { apiFetch, apiPost } from '@/lib/api'
import Chip, { tagColors } from '@/components/Chip'
import DifficultyStars from '@/components/DifficultyStars'
import type {
  GetQuestionAdaptiveResponse,
  GetQuestionResponse,
  Paginate,
  PostReplyRequest,
  PostReplyResponse,
  Question,
} from '@/types/api'
import { MathJax } from 'better-react-mathjax'

// High enough to fetch every category in one page -- there's no realistic
// dataset near this size yet.
const ALL_ITEMS_LIMIT = 1000

type CategoryOption = { id: number; name: string }
type SubjectOption = { id: number; name: string; sortOrder: number }
type NamedOption = { id: number; name: string }
type ConceptGroupOption = { id: number; name: string; concepts: NamedOption[] }
type SubjectDetail = {
  id: number
  name: string
  exams: NamedOption[]
  tags: NamedOption[]
  conceptGroups: ConceptGroupOption[]
}
type FilterDimensionWithOptions = {
  id: number
  name: string
  sortOrder: number
  options: { id: number; name: string; parentId: number | null; subjectIds: number[] }[]
}

const typeLabel: Record<string, string> = {
  SINGLE: '單選題',
  MULTIPLE: '多選題',
  TRUE_FALSE: '是非題',
  FILL: '選填題',
  GROUP: '題組',
}



function ResultBox({ result }: { result: { correctAnswer: string; score: number; fbPostId?: string | null } }) {
  const correct = result.score > 0
  const fbUrl = result.fbPostId
    ? `https://m.facebook.com/${result.fbPostId.split('_')[0]}/posts/${result.fbPostId.split('_')[1]}`
    : null
  return (
    <div className="px-5 pb-5">
      <div
        className={`rounded-md border px-5 py-4 ${
          correct ? 'border-green-700/30 bg-green-700/10' : 'border-orange-700/30 bg-orange-700/10'
        }`}
      >
        <div className="flex flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
          <div
            className={`flex items-center gap-1.5 text-[18px] font-semibold ${
              correct ? 'text-green-700' : 'text-orange-700'
            }`}
          >
            {correct ? (
              <>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-700">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                答對了！
              </>
            ) : (
              <>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-700">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3L9 9M9 3L3 9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </span>
                答錯了
              </>
            )}
          </div>
          <div className="flex items-center gap-4 sm:contents">
            <div className="text-base text-black-700">
              正確答案：<span className={`inline-block rounded border bg-white/60 px-2 py-0.5 font-semibold ${correct ? 'border-green-700/30' : 'border-orange-700/30'}`}>{result.correctAnswer}</span>
            </div>
            <div className="text-base text-black-500">得分：<span className={`inline-block rounded border bg-white/60 px-2 py-0.5 font-semibold ${correct ? 'border-green-700/30' : 'border-orange-700/30'}`}>{result.score}</span></div>
          </div>
          {fbUrl && (
            <a
              href={fbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-brown-900 px-3 py-1.5 text-sm font-medium text-brown-900 transition hover:bg-brown-900/10 sm:mt-0 sm:ml-auto sm:w-auto sm:justify-start"
            >
              討論區
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5.5 2.5H2.5C1.95 2.5 1.5 2.95 1.5 3.5V11.5C1.5 12.05 1.95 12.5 2.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V8.5M8.5 1.5H12.5M12.5 1.5V5.5M12.5 1.5L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

const CorrectIcon = () => (
  <span className="absolute -top-1 -right-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-700 sm:relative sm:inset-auto sm:ml-auto sm:h-6 sm:w-6">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </span>
)

const WrongIcon = () => (
  <span className="absolute -top-1 -right-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-700 sm:relative sm:inset-auto sm:ml-auto sm:h-6 sm:w-6">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 3L9 9M9 3L3 9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </span>
)

function AnswerInput({
  question,
  answer,
  onAnswer,
  disabled,
  correctAnswer,
}: {
  question: Question
  answer: string
  onAnswer: (val: string) => void
  disabled: boolean
  correctAnswer?: string
}) {
  const options = question.options?.split('|') ?? []
  const submitted = !!correctAnswer

  const getOptClass = (opt: string) => {
    const base = 'relative flex flex-1 items-center justify-center rounded-md border-2 p-1 text-[20px] font-bold select-none transition sm:justify-start sm:px-4 sm:py-2.5'
    if (submitted) {
      const isCorrect = opt === correctAnswer
      const isWrongSelected = opt === answer && opt !== correctAnswer
      if (isCorrect) return `${base} cursor-default border-2 border-green-700 bg-green-700/10 text-green-700`
      if (isWrongSelected) return `${base} cursor-default border-2 border-orange-700/60 bg-orange-700/10 text-orange-700`
      return `${base} cursor-default border-brown-300 bg-beige-200 text-black-400 opacity-40`
    }
    return `${base} cursor-pointer ${
      opt === answer
        ? 'border-2 border-blue-700 bg-blue-700/20 text-blue-700'
        : 'border-[#E3D1C5] bg-beige-200/80 text-black-700 hover:border-brown-700 active:scale-[0.97]'
    } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`
  }

  const getTFClass = (val: string) => {
    const base = 'relative flex flex-1 items-center justify-center rounded-md border-2 p-1 text-[20px] font-bold select-none transition sm:justify-start sm:px-4 sm:py-2.5'
    if (submitted) {
      const isCorrect = val === correctAnswer
      const isWrongSelected = val === answer && val !== correctAnswer
      if (isCorrect) return `${base} cursor-default border-2 border-green-700 bg-green-700/10 text-green-700`
      if (isWrongSelected) return `${base} cursor-default border-2 border-orange-700/60 bg-orange-700/10 text-orange-700`
      return `${base} cursor-default border-brown-300 bg-beige-200 text-black-400 opacity-40`
    }
    return `${base} cursor-pointer ${
      val === answer
        ? 'border-2 border-blue-700 bg-blue-700/20 text-blue-700'
        : 'border-[#E3D1C5] bg-beige-200/80 text-black-700 hover:border-brown-700 active:scale-[0.97]'
    } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`
  }

  if (question.type === 'TRUE_FALSE') {
    return (
      <div className="flex gap-2">
        {['True', 'False'].map((val) => (
          <label key={val} className={getTFClass(val)}>
            <input
              type="radio"
              name={`q-${question.id}`}
              value={val}
              checked={answer === val}
              onChange={() => !submitted && onAnswer(val)}
              disabled={disabled}
              className="sr-only"
            />
            {val === 'True' ? '是' : '非'}
            {submitted && val === correctAnswer && <CorrectIcon />}
            {submitted && val === answer && val !== correctAnswer && <WrongIcon />}
          </label>
        ))}
      </div>
    )
  }

  if (question.type === 'SINGLE') {
    return (
      <div className="flex gap-2">
        {options.map((opt) => (
          <label key={opt} className={getOptClass(opt)}>
            <input
              type="radio"
              name={`q-${question.id}`}
              value={opt}
              checked={answer === opt}
              onChange={() => !submitted && onAnswer(opt)}
              disabled={disabled}
              className="sr-only"
            />
            {opt}
            {submitted && opt === correctAnswer && <CorrectIcon />}
            {submitted && opt === answer && opt !== correctAnswer && <WrongIcon />}
          </label>
        ))}
      </div>
    )
  }

  if (question.type === 'MULTIPLE') {
    const base = answer || 'X'.repeat(options.length)
    return (
      <div className="flex gap-2">
        {options.map((opt, i) => (
          <label key={opt} className={getOptClass(opt)}>
            <input
              type="checkbox"
              checked={base[i] === 'O'}
              onChange={(e) => {
                if (submitted) return
                const next =
                  base.substring(0, i) + (e.target.checked ? 'O' : 'X') + base.substring(i + 1)
                onAnswer(next)
              }}
              disabled={disabled}
              className="sr-only"
            />
            {opt}
            {submitted && opt === correctAnswer && <CorrectIcon />}
            {submitted && opt === answer && opt !== correctAnswer && <WrongIcon />}
          </label>
        ))}
      </div>
    )
  }

  if (question.type === 'FILL') {
    const blanks = question.answer?.length ?? 0
    const base = answer || '@'.repeat(blanks)
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: blanks }).map((_, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-black-700">{i + 1}.</span>
            {options.map((opt) => (
              <label key={opt} className={getOptClass(opt)}>
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
                  className="sr-only"
                />
                {opt}
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
  const [activeTab, setActiveTab] = useState('入學考試')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([])
  const [selectedConceptIds, setSelectedConceptIds] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  const [selectedFilterOptionByDim, setSelectedFilterOptionByDim] = useState<Record<number, number>>({})

  const [categoryList, setCategoryList] = useState<CategoryOption[]>([])
  const [subjectList, setSubjectList] = useState<SubjectOption[]>([])
  const [filterDimensions, setFilterDimensions] = useState<FilterDimensionWithOptions[]>([])
  const [examList, setExamList] = useState<NamedOption[]>([])
  const [conceptGroupList, setConceptGroupList] = useState<ConceptGroupOption[]>([])
  const [tagList, setTagList] = useState<NamedOption[]>([])

  const [numQuestionsTarget, setNumQuestionsTarget] = useState(5)
  const [questionCount, setQuestionCount] = useState(-1)
  const [adaptiveQuestion, setAdaptiveQuestion] = useState<Question[]>([])
  // responseOffsets[i] = starting index in replyResponse for question i
  const [responseOffsets, setResponseOffsets] = useState<number[]>([])
  const [repliedAnswer, setRepliedAnswer] = useState<Map<number, string>>(new Map())
  const [replyResponse, setReplyResponse] = useState<PostReplyResponse | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [loading, setLoading] = useState(false)

  const totalScore = useMemo(() => replyResponse?.reduce((sum, r) => sum + r.score, 0) ?? 0, [replyResponse])
  const correctCount = useMemo(() => replyResponse?.filter((r) => r.score > 0).length ?? 0, [replyResponse])
  const wrongCount = useMemo(() => replyResponse?.filter((r) => r.score <= 0).length ?? 0, [replyResponse])

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
    apiFetch<Paginate<CategoryOption>>('category', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setCategoryList(res.data))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedCategoryId) return
    setSelectedSubjectId('')
    setSelectedFilterOptionByDim({})
    setSelectedExamIds([])
    setSelectedConceptIds([])
    setSelectedTagIds([])

    Promise.all([
      apiFetch<SubjectOption[]>(`category/${selectedCategoryId}/subject`),
      apiFetch<FilterDimensionWithOptions[]>(`category/${selectedCategoryId}/filter`),
    ])
      .then(([subjects, dimensions]) => {
        setSubjectList(subjects)
        setFilterDimensions(dimensions)
      })
      .catch(console.error)
  }, [selectedCategoryId])

  const { filteredSubjectList, visibleOptionsByDim } = useMemo(() => {
    const sortedDims = [...filterDimensions].sort((a, b) => a.sortOrder - b.sortOrder)
    const visibleOptionsByDim: Record<number, FilterDimensionWithOptions['options']> = {}

    // cascade display: track which parentIds are valid for the next dimension
    let validParentIds: Set<number | null> = new Set([null])
    for (const dim of sortedDims) {
      visibleOptionsByDim[dim.id] = dim.options.filter((o) => validParentIds.has(o.parentId))
      const selectedOptId = selectedFilterOptionByDim[dim.id]
      validParentIds = selectedOptId !== undefined
        ? new Set([selectedOptId])
        : new Set(visibleOptionsByDim[dim.id].map((o) => o.id))
    }

    // filter subjects: intersect selected options' subjectIds across all dims
    let currentIds = new Set(subjectList.map((s) => s.id))
    for (const dim of sortedDims) {
      const selectedOptId = selectedFilterOptionByDim[dim.id]
      if (selectedOptId !== undefined) {
        const opt = dim.options.find((o) => o.id === selectedOptId)
        if (opt) currentIds = new Set(opt.subjectIds.filter((id) => currentIds.has(id)))
      }
    }

    return { filteredSubjectList: subjectList.filter((s) => currentIds.has(s.id)), visibleOptionsByDim }
  }, [subjectList, filterDimensions, selectedFilterOptionByDim])

  useEffect(() => {
    if (!selectedSubjectId) return
    setSelectedExamIds([])
    setSelectedConceptIds([])
    setSelectedTagIds([])
    apiFetch<SubjectDetail>(`subject/${selectedSubjectId}`)
      .then((detail) => {
        setExamList(detail.exams)
        setConceptGroupList(detail.conceptGroups)
        setTagList(detail.tags)
      })
      .catch(console.error)
  }, [selectedSubjectId])

  const prevSubjectIdForCountRef = useRef(selectedSubjectId)

  useEffect(() => {
    const subjectJustChanged = prevSubjectIdForCountRef.current !== selectedSubjectId
    prevSubjectIdForCountRef.current = selectedSubjectId
    if (!selectedSubjectId) return
    // when the subject changes, the effect above resets the filter arrays right after this
    // render, which will re-trigger this effect with the cleared filters — skip this pass to
    // avoid firing the request twice (once with the previous subject's stale filters)
    if (subjectJustChanged) return
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
      setShowResultModal(true)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedSubjectId) return
    if (!filteredSubjectList.some((s) => String(s.id) === selectedSubjectId))
      setSelectedSubjectId('')
  }, [filteredSubjectList])

  useEffect(() => {
    setSelectedFilterOptionByDim((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [dimId, optId] of Object.entries(prev)) {
        const visible = visibleOptionsByDim[Number(dimId)]
        if (visible && !visible.some((o) => o.id === optId)) {
          delete next[Number(dimId)]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [visibleOptionsByDim])

  const onReset = () => {
    setAdaptiveQuestion([])
    setReplyResponse(null)
    setResponseOffsets([])
    setRepliedAnswer(new Map())
    setSelectedFilterOptionByDim({})
    setSelectedExamIds([])
    setSelectedConceptIds([])
    setSelectedTagIds([])
  }

  const filtersLocked = adaptiveQuestion.length > 0

  return (
    <div>
      {adaptiveQuestion.length === 0 && !loading ? (
        <>
          <h1 className="mt-[60px] mb-2 text-3xl font-bold text-blue-700">智慧練習</h1>
          <p className="mb-10 text-sm text-black-500">制定今天的學習計畫，我們幫你挑出最適合的練習題目。</p>
        </>
      ) : (
        <button
          onClick={() => (!replyResponse ? setShowLeaveModal(true) : onReset())}
          className="mt-[60px] mb-6 flex items-center gap-2 rounded-lg px-3 py-1.5 text-lg font-bold text-black-700 hover:bg-beige-200 hover:text-black-900 transition cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 10H4M4 10L9 5M4 10L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          返回
        </button>
      )}

      {adaptiveQuestion.length === 0 && !loading && <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Goal size={20} strokeWidth={2.5} className="text-orange-700/70 shrink-0" />
            <span className="text-xl font-bold text-black-700">考試類別</span>
          </div>
          <div className={`rounded-lg border border-brown-700 overflow-hidden bg-white/60 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
            {/* Mobile tabs */}
            <div className="flex md:hidden border-b border-brown-700">
              {(['入學考試', '國家考試', '專技證照'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-xs font-semibold transition ${
                    activeTab === tab
                      ? 'bg-brown-700/20 text-brown-900'
                      : 'text-black-500 hover:bg-beige-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          <div className="px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-brown-700">
            {/* 入學考試 */}
            <div className={`${activeTab !== '入學考試' ? 'hidden md:flex' : 'flex'} flex-col gap-3 py-4 md:pt-0 md:pb-6 md:pr-6`}>
              <span className="border-b border-brown-700 pt-2 pb-2 text-sm font-semibold text-black-700 uppercase tracking-wide hidden md:block">入學考試</span>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3">
                {categoryList.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategoryId(String(c.id))}
                    className={`rounded-lg px-4 py-3 text-sm font-medium transition text-left ${
                      selectedCategoryId === String(c.id)
                        ? 'border-2 border-blue-700 bg-blue-700/10 text-blue-700'
                        : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700 active:scale-[0.97]'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
                {['分科'].map((name) => (
                  <button key={name} disabled className="rounded-lg border border-brown-300 bg-beige-200/80 px-4 py-3 text-sm font-medium text-black-300 cursor-not-allowed text-left">
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* 國家考試 */}
            <div className={`${activeTab !== '國家考試' ? 'hidden md:flex' : 'flex'} flex-col gap-3 py-4 md:pt-0 md:pb-6 md:px-6`}>
              <span className="border-b border-brown-700 pt-2 pb-2 text-sm font-semibold text-black-700 uppercase tracking-wide hidden md:block">國家考試</span>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3">
                {['公務員高考三級', '公務員普考', '初等考試', '司法特考', '地方特考'].map((name) => (
                  <button key={name} disabled className="rounded-lg border border-brown-300 bg-beige-200/80 px-4 py-3 text-sm font-medium text-black-300 cursor-not-allowed text-left">
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* 專技證照 */}
            <div className={`${activeTab !== '專技證照' ? 'hidden md:flex' : 'flex'} flex-col gap-3 py-4 md:pt-0 md:pb-6 md:pl-6`}>
              <span className="border-b border-brown-700 pt-2 pb-2 text-sm font-semibold text-black-700 uppercase tracking-wide hidden md:block">專技證照</span>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3">
                {['護理師執照', '律師執照', '會計師執照'].map((name) => (
                  <button key={name} disabled className="rounded-lg border border-brown-300 bg-beige-200/80 px-4 py-3 text-sm font-medium text-black-300 cursor-not-allowed text-left">
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          </div>
          </div>
        </div>

        {selectedCategoryId && filterDimensions.length > 0 && (
          <div className="flex flex-col gap-4 mt-6">
            <div className="flex items-center gap-2">
              <Brain size={20} strokeWidth={2.5} className="text-orange-700/70 shrink-0" />
              <span className="text-xl font-bold text-black-700">篩選條件</span>
            </div>
            <div className={`rounded-lg border border-brown-700 divide-y divide-brown-300 bg-white/60 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
              {filterDimensions.map((dim) => (
                <div key={dim.id} className="px-6 py-4">
                  <span className="mb-3 block text-sm font-bold text-black-700">{dim.name}</span>
                  <div className="flex flex-wrap gap-2">
                    {(visibleOptionsByDim[dim.id] ?? dim.options).map((opt) => {
                      const checked = selectedFilterOptionByDim[dim.id] === opt.id
                      return (
                        <button
                          key={opt.id}
                          onClick={() =>
                            setSelectedFilterOptionByDim((prev) =>
                              checked
                                ? (({ [dim.id]: _, ...rest }) => rest)(prev)
                                : { ...prev, [dim.id]: opt.id },
                            )
                          }
                          className={`rounded-lg px-4 py-1 text-sm font-medium transition text-left ${
                            checked
                              ? 'border-2 border-teal-700 bg-teal-700/10 text-teal-700'
                              : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700 active:scale-[0.97]'
                          }`}
                        >
                          {opt.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedCategoryId && filteredSubjectList.length > 0 && (
          <div className="flex flex-col gap-4 mt-6">
            <div className="flex items-center gap-2">
              <BookOpenText size={20} strokeWidth={2.5} className="text-orange-700/70 shrink-0" />
              <span className="text-xl font-bold text-black-700">選擇科目</span>
            </div>
            <div className={`rounded-lg border border-brown-700 px-6 py-4 bg-white/60 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
              <div className="flex flex-wrap gap-2">
                {filteredSubjectList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSubjectId(String(s.id))}
                    className={`rounded-lg px-4 py-3 text-sm font-medium transition text-left ${
                      selectedSubjectId === String(s.id)
                        ? 'border-2 border-green-700 bg-green-700/10 text-green-700'
                        : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700 active:scale-[0.97]'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedSubjectId && (examList.length > 0 || conceptGroupList.length > 0 || tagList.length > 0) && (
          <div className="flex flex-col gap-4 mt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <FunnelPlus size={20} strokeWidth={2.5} className="text-orange-700/70 shrink-0" />
                <span className="text-xl font-bold text-black-700">進階篩選</span>
              </div>
              {(selectedExamIds.length > 0 || selectedConceptIds.length > 0 || selectedTagIds.length > 0) && !filtersLocked && (
                <button
                  onClick={() => { setSelectedExamIds([]); setSelectedConceptIds([]); setSelectedTagIds([]) }}
                  className="flex items-center gap-1 rounded-md border border-brown-300 px-2.5 py-1 text-sm text-black-500 hover:bg-beige-200 transition"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  清空
                </button>
              )}
            </div>
            <div className={`rounded-lg border border-brown-700 bg-white/60 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>

              {/* 選擇試卷 */}
              {examList.length > 0 && (
                <div className="px-6 py-4">
                  <span className="mb-3 block text-sm font-bold text-black-700">選擇試卷（可複選）</span>
                  <div className="flex flex-wrap gap-2">
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
                          className={`rounded-lg px-4 py-1 text-sm font-medium transition text-left ${
                            checked
                              ? 'border-2 border-purple-700 bg-purple-700/10 text-purple-700'
                              : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700 active:scale-[0.97]'
                          }`}
                        >
                          {e.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 分隔線 */}
              {examList.length > 0 && conceptGroupList.length > 0 && (
                <hr className="border-brown-300" />
              )}

              {/* 選擇觀念 */}
              {conceptGroupList.length > 0 && (
                <div className="px-6 py-4">
                  <span className="mb-3 block text-sm font-bold text-black-700">選擇觀念（可複選）</span>
                  <div className="flex flex-col gap-6">
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
                                    className={`rounded-full px-4 py-1 text-sm font-medium transition ${
                                      checked
                                        ? 'border-2 border-orange-700 bg-orange-700/10 text-orange-700'
                                        : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700 active:scale-[0.97]'
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
                                    className={`rounded-full px-4 py-1 text-sm font-medium transition ${
                                      checked
                                        ? 'border-2 border-orange-700 bg-orange-700/10 text-orange-700'
                                        : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700 active:scale-[0.97]'
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

              {/* 分隔線 */}
              {(examList.length > 0 || conceptGroupList.length > 0) && tagList.length > 0 && (
                <hr className="border-brown-300" />
              )}

              {/* 選擇標籤 */}
              {tagList.length > 0 && (
                <div className="px-6 py-4">
                  <span className="mb-3 block text-sm font-bold text-black-700">選擇標籤（可複選）</span>
                  <div className="flex flex-wrap gap-2">
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
                          className={`rounded-lg px-4 py-1 text-sm font-medium transition ${
                            checked
                              ? 'border-2 border-blue-700 bg-blue-700/10 text-blue-700'
                              : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700 active:scale-[0.97]'
                          }`}
                        >
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        <hr className="my-6 border-brown-300" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <NotebookPen size={20} strokeWidth={2.5} className="text-orange-700/70 shrink-0" />
              <span className="text-xl font-bold text-black-700">練習題數</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setNumQuestionsTarget(n)}
                  disabled={filtersLocked}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                    numQuestionsTarget === n
                      ? 'border-2 border-blue-700 bg-blue-700/10 text-blue-700'
                      : 'border border-brown-300 text-black-700 hover:bg-beige-200 active:scale-[0.97]'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {questionCount >= 0 && (
              <span className="text-sm text-black-500">共有 {questionCount} 題符合條件</span>
            )}
            <button
              onClick={fetchAdaptive}
              disabled={!selectedSubjectId || filtersLocked || questionCount <= 0 || loading}
              className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '選題中…' : (
                <span className="flex items-center gap-1.5">
                  開始作答
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              )}
            </button>
          </div>
        </div>
      </div>}

      {loading && adaptiveQuestion.length === 0 && (
        <div className="flex items-center justify-center py-20 text-sm text-black-500">選題中…</div>
      )}

      {adaptiveQuestion.length > 0 && (
        <div>
          <MathJax dynamic>
            <div className="flex flex-col gap-[40px]">
            {adaptiveQuestion.map((question, qi) => {
              const offset = responseOffsets[qi] ?? 0
              return (
                <div key={question.id} className="overflow-hidden rounded-lg border border-brown-700 bg-white/60">
                  <div className="border-b border-[#E3D1C5] px-5 pt-3 pb-2">
                    {/* 題號 + 難易度（同一行）*/}
                    <div className="flex items-center justify-between gap-3 sm:hidden">
                      <span className="shrink-0 font-bold text-blue-700">
                        <span className="text-[20px]">Q{qi + 1}</span>
                        <span className="text-base"> / {numQuestionsTarget}</span>
                      </span>
                      <DifficultyStars value={question.adjustedDifficulty} />
                    </div>
                    {/* 標籤（第二行，mobile only）*/}
                    <div className="mt-1.5 flex flex-wrap gap-2 sm:hidden">
                      <Chip label={typeLabel[question.type] ?? question.type} />
                      {question.exam.map((e) => (
                        <Chip key={e.id} label={e.name} color={tagColors.exam} />
                      ))}
                      {question.concept.map((c) => (
                        <Chip
                          key={c.id}
                          label={c.conceptGroup.name === c.name ? c.name : c.conceptGroup.name + '-' + c.name}
                          color={tagColors.concept}
                        />
                      ))}
                      {question.tag.map((t) => (
                        <Chip key={t.id} label={t.name} color={tagColors.tag} />
                      ))}
                    </div>
                    {/* Desktop：題號 + 標籤靠左，難易度靠右 */}
                    <div className="hidden sm:flex sm:items-start sm:justify-between sm:gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="shrink-0 font-bold text-blue-700">
                          <span className="text-[20px]">Q{qi + 1}</span>
                          <span className="text-base"> / {numQuestionsTarget}</span>
                        </span>
                        <Chip label={typeLabel[question.type] ?? question.type} />
                        {question.exam.map((e) => (
                          <Chip key={e.id} label={e.name} color={tagColors.exam} />
                        ))}
                        {question.concept.map((c) => (
                          <Chip
                            key={c.id}
                            label={c.conceptGroup.name === c.name ? c.name : c.conceptGroup.name + '-' + c.name}
                            color={tagColors.concept}
                          />
                        ))}
                        {question.tag.map((t) => (
                          <Chip key={t.id} label={t.name} color={tagColors.tag} />
                        ))}
                      </div>
                      <DifficultyStars value={question.adjustedDifficulty} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 px-5 lg:px-[40px] py-7">
                    {question.content && (
                      <div
                        dangerouslySetInnerHTML={{ __html: question.content }}
                        className="prose max-w-none text-[18px] font-medium text-black-800 [&>*:last-child]:mb-0"
                      />
                    )}
                    {question.answer && (
                      <AnswerInput
                        question={question}
                        answer={repliedAnswer.get(question.id) ?? ''}
                        onAnswer={(val) =>
                          setRepliedAnswer((prev) => new Map(prev).set(question.id, val))
                        }
                        disabled={!!replyResponse}
                        correctAnswer={replyResponse?.[offset]?.correctAnswer}
                      />
                    )}
                  </div>

                  {question.type !== 'GROUP' && replyResponse?.[offset] && (
                    <ResultBox result={replyResponse[offset]} />
                  )}

                  {question.type === 'GROUP' &&
                    question.children.map((child, i) => (
                      <Fragment key={child.id}>
                        <div className="flex flex-col gap-4 border-t border-brown-300 px-5 lg:px-[40px] pt-5 pb-7">
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
                            correctAnswer={replyResponse?.[offset + i]?.correctAnswer}
                          />
                        </div>
                        {replyResponse?.[offset + i] && (
                          <ResultBox result={replyResponse[offset + i]} />
                        )}
                      </Fragment>
                    ))}
                </div>
              )
            })}
            </div>
          </MathJax>
        </div>
      )}

      {adaptiveQuestion.length > 0 && !replyResponse && (
        <div className="mt-[40px] mb-[70px] flex lg:justify-end">
          <button
            onClick={onSubmit}
            disabled={!canSubmit || loading}
            className="flex w-full items-center justify-center gap-3 rounded-md bg-blue-700 px-6 py-3.5 text-base font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50 lg:w-[320px]"
          >
            {loading ? '送出中…' : (
              <>
                確認送出
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </div>
      )}

      {replyResponse && (
        <div className="mt-[40px] mb-[70px] flex flex-wrap justify-end gap-3">
          <button
            onClick={fetchAdaptive}
            disabled={loading}
            className="rounded-md border border-blue-700 px-6 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-700/10 disabled:opacity-50"
          >
            用相同條件再練一組
          </button>
          <button
            onClick={onReset}
            className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3]"
          >
            重新篩選
          </button>
        </div>
      )}

      {showLeaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowLeaveModal(false)}
        >
          <div
            className="mx-4 w-full max-w-xs rounded-xl bg-beige-100 p-[10px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-6 rounded border border-brown-700 px-6 py-8">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-black-700">
                <circle cx="20" cy="20" r="19" stroke="currentColor" strokeWidth="2"/>
                <line x1="20" y1="12" x2="20" y2="24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="20" cy="29" r="1.5" fill="currentColor"/>
              </svg>
              <p className="w-full text-center text-base font-normal text-black-700">
                尚有題目未完成，下次回來時再繼續挑戰。
              </p>
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setShowLeaveModal(false)}
                  className="flex-1 rounded-md border border-brown-300 py-2.5 text-sm text-black-900 transition hover:bg-beige-200"
                >
                  取消
                </button>
                <button
                  onClick={() => { setShowLeaveModal(false); onReset() }}
                  className="flex-1 rounded-md border border-brown-300 py-2.5 text-sm text-black-900 transition hover:bg-beige-200"
                >
                  仍要離開
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showResultModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowResultModal(false)}
        >
          <div
            className="mx-4 w-full max-w-xs rounded-xl bg-beige-100 p-[10px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-6 rounded border border-brown-700 px-6 py-8">
              <div className="w-full text-center">
                <p className="text-base font-normal text-black-700">此次練習一共獲得</p>
                <div className="mt-1 flex justify-center">
                  <span className="relative text-[64px] font-bold leading-tight text-blue-700">
                    {totalScore}
                    <span className="absolute bottom-3 left-full ml-1 text-base font-normal text-black-700">分</span>
                  </span>
                </div>
                <hr className="mt-2 border-brown-700" />
              </div>
              <div className="flex w-full gap-4">
                <div className="flex-1 rounded-lg bg-green-700/10 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-black-700">{correctCount}</p>
                  <p className="mt-1 text-sm font-medium text-green-700">正確</p>
                </div>
                <div className="flex-1 rounded-lg bg-orange-700/10 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-black-700">{wrongCount}</p>
                  <p className="mt-1 text-sm font-medium text-orange-700">錯誤</p>
                </div>
              </div>
              <button
                onClick={() => setShowResultModal(false)}
                className="w-full rounded-md border border-brown-300 py-2.5 text-sm text-black-900 transition hover:bg-beige-200"
              >
                好
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
