'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Goal, BookOpenText, Brain, Coins, FunnelPlus, NotebookPen } from 'lucide-react'
import { apiFetch, apiPost } from '@/lib/api'
import Chip from '@/components/Chip'
import DifficultyStars from '@/components/DifficultyStars'
import type {
  GetQuestionAdaptiveResponse,
  Paginate,
  PostReplyRequest,
  PostReplyResponse,
  Question,
} from '@/types/api'
import { MathJax } from 'better-react-mathjax'
import styles from './adaptive.module.css'

// High enough to fetch every category in one page -- there's no realistic
// dataset near this size yet.
const ALL_ITEMS_LIMIT = 1000
const examCategoryTabs = ['admission', 'national', 'license'] as const
type ExamCategoryTab = (typeof examCategoryTabs)[number]

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
        className={`${styles.resultNotice} ${correct ? styles.resultCorrect : styles.resultWrong}`}
      >
        <div className="flex flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
          <div
            className={styles.resultHeading}
          >
            {correct ? (
              <>
                <span className={styles.resultIcon}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                答對了！
              </>
            ) : (
              <>
                <span className={styles.resultIcon}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </span>
                答錯了
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:contents">
            <div className="text-base text-black-700">
              正確答案：<span className={styles.resultValue}>{result.correctAnswer}</span>
            </div>
            <div className="text-base text-black-500">得分：<span className={styles.resultValue}>{result.score}</span></div>
          </div>
          {fbUrl && (
            <a
              href={fbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.discussionButton}
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
  <span className={`${styles.answerResultIcon} ${styles.answerCorrectIcon}`}>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </span>
)

const WrongIcon = () => (
  <span className={`${styles.answerResultIcon} ${styles.answerWrongIcon}`}>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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
    const base = styles.answerOption
    if (submitted) {
      const isCorrect = opt === correctAnswer
      const isWrongSelected = opt === answer && opt !== correctAnswer
      if (isCorrect) return `${base} ${styles.answerCorrect}`
      if (isWrongSelected) return `${base} ${styles.answerWrong}`
      return `${base} ${styles.answerDisabled}`
    }
    return `${base} ${opt === answer ? styles.answerSelected : ''} ${disabled ? styles.answerDisabled : ''}`
  }

  const getTFClass = (val: string) => {
    const base = styles.answerOption
    if (submitted) {
      const isCorrect = val === correctAnswer
      const isWrongSelected = val === answer && val !== correctAnswer
      if (isCorrect) return `${base} ${styles.answerCorrect}`
      if (isWrongSelected) return `${base} ${styles.answerWrong}`
      return `${base} ${styles.answerDisabled}`
    }
    return `${base} ${val === answer ? styles.answerSelected : ''} ${disabled ? styles.answerDisabled : ''}`
  }

  if (question.type === 'TRUE_FALSE') {
    return (
      <div className={styles.answerGrid}>
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
      <div className={styles.answerGrid}>
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
      <div className={styles.answerGrid}>
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
            <div className={`${styles.answerGrid} flex-1`}>{options.map((opt) => (
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
            ))}</div>
          </div>
        ))}
      </div>
    )
  }

  return null
}

export default function AdaptiveClient({
  onPracticeStateChange,
}: {
  onPracticeStateChange?: (active: boolean) => void
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [activeExamCategoryTab, setActiveExamCategoryTab] = useState<ExamCategoryTab>('admission')
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
  const [showBottomNav, setShowBottomNav] = useState(false)
  const [loading, setLoading] = useState(false)

  const changeExamCategoryTab = (tab: ExamCategoryTab) => {
    setActiveExamCategoryTab(tab)
    if (tab === 'admission') return
    setSelectedCategoryId('')
    setSelectedSubjectId('')
    setSelectedFilterOptionByDim({})
    setSelectedExamIds([])
    setSelectedConceptIds([])
    setSelectedTagIds([])
    setSubjectList([])
    setFilterDimensions([])
    setExamList([])
    setConceptGroupList([])
    setTagList([])
  }

  const handleExamCategoryTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: ExamCategoryTab) => {
    const currentIndex = examCategoryTabs.indexOf(currentTab)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % examCategoryTabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + examCategoryTabs.length) % examCategoryTabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = examCategoryTabs.length - 1
    else return

    event.preventDefault()
    const nextTab = examCategoryTabs[nextIndex]
    changeExamCategoryTab(nextTab)
    requestAnimationFrame(() => document.getElementById(`exam-tab-${nextTab}`)?.focus())
  }

  // Single-question view: currentIndex is a page index into adaptiveQuestion
  // (a GROUP question and all its children share one page). Dwell time is
  // tracked in refs, not state, so accumulating it on every render/tick
  // doesn't trigger re-renders -- it's only read when leaving a page.
  const [currentIndex, setCurrentIndex] = useState(0)
  const questionNavRef = useRef<HTMLDivElement>(null)
  const questionNumberListRef = useRef<HTMLDivElement>(null)
  const questionNumberRefs = useRef<Array<HTMLButtonElement | null>>([])
  const pageEnteredAtRef = useRef<number>(Date.now())
  const pageTimeMsRef = useRef<Map<number, number>>(new Map())
  const submittingRef = useRef(false)

  const flushCurrentPageTime = () => {
    const now = Date.now()
    const elapsed = now - pageEnteredAtRef.current
    pageTimeMsRef.current.set(currentIndex, (pageTimeMsRef.current.get(currentIndex) ?? 0) + elapsed)
    pageEnteredAtRef.current = now
  }

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= adaptiveQuestion.length || idx === currentIndex) return
    flushCurrentPageTime()
    setCurrentIndex(idx)
  }

  const currentQuestion = adaptiveQuestion[currentIndex]
  const currentOffset = responseOffsets[currentIndex] ?? 0

  const totalScore = useMemo(() => replyResponse?.reduce((sum, r) => sum + r.score, 0) ?? 0, [replyResponse])
  const correctCount = useMemo(() => replyResponse?.filter((r) => r.score > 0).length ?? 0, [replyResponse])
  const wrongCount = useMemo(() => replyResponse?.filter((r) => r.score <= 0).length ?? 0, [replyResponse])
  const totalAwardedPoints = useMemo(
    () => replyResponse?.reduce((sum, r) => sum + r.awardedPoints, 0) ?? 0,
    [replyResponse],
  )

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

  const firstUnansweredIndex = useMemo(
    () => adaptiveQuestion.findIndex((q) =>
      q.type === 'GROUP'
        ? !q.children.every((child) => repliedAnswer.has(child.id))
        : !repliedAnswer.has(q.id),
    ),
    [adaptiveQuestion, repliedAnswer],
  )

  useEffect(() => {
    const list = questionNumberListRef.current
    const current = questionNumberRefs.current[currentIndex]
    if (!list || !current) return
    const nextLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollTo({ left: Math.max(0, nextLeft), behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [currentIndex])

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

    apiFetch<{ subjects: SubjectOption[]; filterDimensions: FilterDimensionWithOptions[] }>(
      `category/${selectedCategoryId}/subject`,
    )
      .then(({ subjects, filterDimensions }) => {
        setSubjectList(subjects)
        setFilterDimensions(filterDimensions)
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
    apiFetch<{ total: number }>('question/count', {
      subjectId: selectedSubjectId,
      examIds: selectedExamIds.length ? selectedExamIds.join(',') : undefined,
      conceptIds: selectedConceptIds.length ? selectedConceptIds.join(',') : undefined,
      tagIds: selectedTagIds.length ? selectedTagIds.join(',') : undefined,
    })
      .then((res) => setQuestionCount(res.total))
      .catch(console.error)
  }, [selectedSubjectId, selectedExamIds, selectedConceptIds, selectedTagIds])

  const fetchAdaptive = async () => {
    if (!selectedSubjectId) return
    onPracticeStateChange?.(true)
    setAdaptiveQuestion([])
    setReplyResponse(null)
    setResponseOffsets([])
    setRepliedAnswer(new Map())
    setCurrentIndex(0)
    pageTimeMsRef.current = new Map()
    pageEnteredAtRef.current = Date.now()
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
      onPracticeStateChange?.(false)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async () => {
    if (!canSubmit || submittingRef.current) return
    submittingRef.current = true
    flushCurrentPageTime()
    setLoading(true)
    try {
      const payload: PostReplyRequest = []
      const offsets: number[] = []
      adaptiveQuestion.forEach((q, qi) => {
        offsets.push(payload.length)
        const pageMs = pageTimeMsRef.current.get(qi) ?? 0
        if (q.type === 'GROUP') {
          const childMs = Math.round(pageMs / q.children.length)
          for (const child of q.children) {
            payload.push({ questionId: child.id, repliedAnswer: repliedAnswer.get(child.id) ?? '', durationMs: childMs })
          }
        } else {
          payload.push({ questionId: q.id, repliedAnswer: repliedAnswer.get(q.id) ?? '', durationMs: pageMs })
        }
      })
      const res = await apiPost<PostReplyResponse, PostReplyRequest>('reply', payload)
      setReplyResponse(res)
      setResponseOffsets(offsets)
      setShowResultModal(true)
    } catch (e) {
      console.error(e)
    } finally {
      submittingRef.current = false
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
    onPracticeStateChange?.(false)
    setAdaptiveQuestion([])
    setReplyResponse(null)
    setResponseOffsets([])
    setRepliedAnswer(new Map())
    setCurrentIndex(0)
    pageTimeMsRef.current = new Map()
    pageEnteredAtRef.current = Date.now()
    setSelectedFilterOptionByDim({})
    setSelectedExamIds([])
    setSelectedConceptIds([])
    setSelectedTagIds([])
  }

  const filtersLocked = adaptiveQuestion.length > 0
  const isLastQuestion = currentIndex === adaptiveQuestion.length - 1

  const handlePrimaryAction = () => {
    if (loading) return
    if (replyResponse) {
      goTo(currentIndex + 1)
      return
    }
    if (canSubmit) {
      void onSubmit()
      return
    }
    if (!isLastQuestion) {
      goTo(currentIndex + 1)
      return
    }
    if (firstUnansweredIndex >= 0) goTo(firstUnansweredIndex)
  }

  const primaryActionLabel = replyResponse
    ? '下一題'
    : canSubmit
      ? '確認送出'
      : isLastQuestion
        ? '前往未答題'
        : '下一題'

  useEffect(() => {
    const nav = questionNavRef.current
    if (!nav || adaptiveQuestion.length === 0) {
      setShowBottomNav(false)
      return
    }

    const wideScreen = window.matchMedia('(min-width: 48rem)')
    const update = (rect = nav.getBoundingClientRect()) => {
      setShowBottomNav(wideScreen.matches && rect.bottom <= 0)
    }
    const observer = new IntersectionObserver(([entry]) => update(entry.boundingClientRect), { threshold: 0 })
    const resizeObserver = new ResizeObserver(() => update())
    const handleBreakpointChange = () => update()

    observer.observe(nav)
    resizeObserver.observe(nav)
    wideScreen.addEventListener('change', handleBreakpointChange)
    update()

    return () => {
      observer.disconnect()
      resizeObserver.disconnect()
      wideScreen.removeEventListener('change', handleBreakpointChange)
    }
  }, [adaptiveQuestion.length, currentIndex])

  return (
    <div className={adaptiveQuestion.length > 0 ? styles.practiceActive : undefined}>
      {adaptiveQuestion.length === 0 && !loading ? (
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>智慧練習</h1>
          <p className={styles.pageSubtitle}>制定今天的學習計畫，我們幫你挑出最適合的練習題目。</p>
        </header>
      ) : (
        <button
          onClick={() => (!replyResponse ? setShowLeaveModal(true) : onReset())}
          disabled={loading}
          className={styles.backButton}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 10H4M4 10L9 5M4 10L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          返回
        </button>
      )}

      {adaptiveQuestion.length === 0 && !loading && <div className={styles.settings}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <Goal size={20} strokeWidth={2.5} className={styles.sectionIcon} />
            <h2>考試類別</h2>
          </div>
          <div className={`${styles.examGrid} ${filtersLocked ? styles.locked : ''}`}>
            <div className={`${styles.card} ${styles.examCard}`}>
              <h3 className={styles.examCardTitle}>入學考試</h3>
              <div className={styles.optionGrid}>
                {categoryList.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategoryId(String(c.id))}
                    aria-pressed={selectedCategoryId === String(c.id)}
                    className={`${styles.option} ${styles.categoryTone} ${selectedCategoryId === String(c.id) ? styles.selected : ''}`}
                  >
                    {c.name}
                  </button>
                ))}
                {['分科'].map((name) => (
                  <button key={name} disabled className={`${styles.option} ${styles.categoryTone}`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className={`${styles.card} ${styles.examCard}`}>
              <h3 className={styles.examCardTitle}>國家考試</h3>
              <div className={styles.optionGrid}>
                {['公務員高考三級', '公務員普考', '初等考試', '司法特考', '地方特考'].map((name) => (
                  <button key={name} disabled className={`${styles.option} ${styles.categoryTone}`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className={`${styles.card} ${styles.examCard}`}>
              <h3 className={styles.examCardTitle}>專技證照</h3>
              <div className={styles.optionGrid}>
                {['護理師執照', '律師執照', '會計師執照'].map((name) => (
                  <button key={name} disabled className={`${styles.option} ${styles.categoryTone}`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={`${styles.card} ${styles.examTabbedCard} ${filtersLocked ? styles.locked : ''}`}>
            <div className={styles.examTabs} role="tablist" aria-label="考試類別">
              <button
                type="button"
                role="tab"
                id="exam-tab-admission"
                aria-selected={activeExamCategoryTab === 'admission'}
                aria-controls="exam-panel-admission"
                tabIndex={activeExamCategoryTab === 'admission' ? 0 : -1}
                className={styles.examTab}
                onClick={() => changeExamCategoryTab('admission')}
                onKeyDown={(event) => handleExamCategoryTabKeyDown(event, 'admission')}
              >
                入學考試
              </button>
              <button
                type="button"
                role="tab"
                id="exam-tab-national"
                aria-selected={activeExamCategoryTab === 'national'}
                aria-controls="exam-panel-national"
                tabIndex={activeExamCategoryTab === 'national' ? 0 : -1}
                className={styles.examTab}
                onClick={() => changeExamCategoryTab('national')}
                onKeyDown={(event) => handleExamCategoryTabKeyDown(event, 'national')}
              >
                國家考試
              </button>
              <button
                type="button"
                role="tab"
                id="exam-tab-license"
                aria-selected={activeExamCategoryTab === 'license'}
                aria-controls="exam-panel-license"
                tabIndex={activeExamCategoryTab === 'license' ? 0 : -1}
                className={styles.examTab}
                onClick={() => changeExamCategoryTab('license')}
                onKeyDown={(event) => handleExamCategoryTabKeyDown(event, 'license')}
              >
                專技證照
              </button>
            </div>

            {activeExamCategoryTab === 'admission' && (
              <div
                id="exam-panel-admission"
                role="tabpanel"
                aria-labelledby="exam-tab-admission"
                className={styles.examTabPanel}
              >
                <div className={styles.optionGrid}>
                  {categoryList.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategoryId(String(c.id))}
                      aria-pressed={selectedCategoryId === String(c.id)}
                      className={`${styles.option} ${styles.categoryTone} ${selectedCategoryId === String(c.id) ? styles.selected : ''}`}
                    >
                      {c.name}
                    </button>
                  ))}
                  <button disabled className={`${styles.option} ${styles.categoryTone}`}>
                    分科
                  </button>
                </div>
              </div>
            )}

            {activeExamCategoryTab === 'national' && (
              <div
                id="exam-panel-national"
                role="tabpanel"
                aria-labelledby="exam-tab-national"
                className={styles.examTabPanel}
              >
                <div className={styles.optionGrid}>
                  {['公務員高考三級', '公務員普考', '初等考試', '司法特考', '地方特考'].map((name) => (
                    <button key={name} disabled className={`${styles.option} ${styles.categoryTone}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeExamCategoryTab === 'license' && (
              <div
                id="exam-panel-license"
                role="tabpanel"
                aria-labelledby="exam-tab-license"
                className={styles.examTabPanel}
              >
                <div className={styles.optionGrid}>
                  {['護理師執照', '律師執照', '會計師執照'].map((name) => (
                    <button key={name} disabled className={`${styles.option} ${styles.categoryTone}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {selectedCategoryId && filterDimensions.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <Brain size={20} strokeWidth={2.5} className={styles.sectionIcon} />
              <h2>篩選條件</h2>
            </div>
            <div className={`${styles.card} ${styles.filterCard} ${filtersLocked ? styles.locked : ''}`}>
              {filterDimensions.map((dim) => (
                <div key={dim.id} className={styles.filterGroup}>
                  <span className={styles.filterLabel}>{dim.name}</span>
                  <div className={styles.optionWrap}>
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
                          aria-pressed={checked}
                          className={`${styles.option} ${styles.categoryTone} ${checked ? styles.selected : ''}`}
                        >
                          {opt.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {selectedCategoryId && filteredSubjectList.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <BookOpenText size={20} strokeWidth={2.5} className={styles.sectionIcon} />
              <h2>選擇科目</h2>
            </div>
            <div className={`${styles.card} ${styles.filterGroup} ${filtersLocked ? styles.locked : ''}`}>
              <div className={styles.optionWrap}>
                {filteredSubjectList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSubjectId(String(s.id))}
                    aria-pressed={selectedSubjectId === String(s.id)}
                    className={`${styles.option} ${styles.subjectTone} ${selectedSubjectId === String(s.id) ? styles.selected : ''}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {selectedSubjectId && (examList.length > 0 || conceptGroupList.length > 0 || tagList.length > 0) && (
          <section className={styles.section}>
            <div className="flex items-center gap-3">
              <div className={styles.sectionHeading}>
                <FunnelPlus size={20} strokeWidth={2.5} className={styles.sectionIcon} />
                <h2>進階篩選</h2>
              </div>
              {(selectedExamIds.length > 0 || selectedConceptIds.length > 0 || selectedTagIds.length > 0) && !filtersLocked && (
                <button
                  onClick={() => { setSelectedExamIds([]); setSelectedConceptIds([]); setSelectedTagIds([]) }}
                  className={`${styles.clearButton} flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm transition`}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  清空
                </button>
              )}
            </div>
            <div className={`${styles.card} ${styles.filterCard} ${filtersLocked ? styles.locked : ''}`}>

              {/* 選擇試卷 */}
              {examList.length > 0 && (
                <div className={styles.filterGroup}>
                  <span className={styles.filterLabel}>選擇試卷 <span className={styles.filterHint}>（可複選）</span></span>
                  <div className={styles.optionWrap}>
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
                          aria-pressed={checked}
                          className={`${styles.option} ${styles.examTone} ${checked ? styles.selected : ''}`}
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
                <span aria-hidden="true" />
              )}

              {/* 選擇觀念 */}
              {conceptGroupList.length > 0 && (
                <div className={styles.filterGroup}>
                  <span className={styles.filterLabel}>選擇觀念 <span className={styles.filterHint}>（可複選）</span></span>
                  <div className={styles.conceptGroups}>
                    {showConceptGroupHeader
                      ? conceptGroupList.map((cg) => (
                          <div key={cg.name}>
                            <span className={styles.conceptTitle}>{cg.name}</span>
                            <div className={styles.optionWrap}>
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
                                    aria-pressed={checked}
                                    className={`${styles.pillOption} ${styles.conceptTone} ${checked ? styles.selected : ''}`}
                                  >
                                    {c.name}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))
                      : (
                          <div className={styles.optionWrap}>
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
                                    aria-pressed={checked}
                                    className={`${styles.pillOption} ${styles.conceptTone} ${checked ? styles.selected : ''}`}
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
                <span aria-hidden="true" />
              )}

              {/* 選擇標籤 */}
              {tagList.length > 0 && (
                <div className={styles.filterGroup}>
                  <span className={styles.filterLabel}>選擇標籤 <span className={styles.filterHint}>（可複選）</span></span>
                  <div className={styles.optionWrap}>
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
                          aria-pressed={checked}
                          className={`${styles.pillOption} ${styles.tagTone} ${checked ? styles.selected : ''}`}
                        >
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          </section>
        )}

        <section className={`${styles.card} ${styles.actionCard}`}>
          <div className={styles.countGroup}>
            <div className={styles.sectionHeading}>
              <NotebookPen size={20} strokeWidth={2.5} className={styles.sectionIcon} />
              <h2>練習題數</h2>
            </div>
            <div className={styles.segments}>
              {[1, 2, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setNumQuestionsTarget(n)}
                  disabled={filtersLocked}
                  aria-pressed={numQuestionsTarget === n}
                  className={`${styles.segmentOption} ${numQuestionsTarget === n ? styles.selected : ''}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.startGroup}>
            {questionCount >= 0 && (
              <span className={styles.countText}>共有 {questionCount} 題符合條件</span>
            )}
            <button
              onClick={fetchAdaptive}
              disabled={!selectedSubjectId || filtersLocked || questionCount <= 0 || loading}
              className={styles.primaryButton}
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
        </section>
      </div>}

      {loading && adaptiveQuestion.length === 0 && (
        <div className="flex items-center justify-center py-20 text-sm text-black-500">選題中…</div>
      )}

      {adaptiveQuestion.length > 0 && currentQuestion && (
        <div className={styles.practiceQuestion}>
          {/* 導覽列：上一題／跳題／下一題 -- 可自由前後切換，不受作答狀態限制 */}
          <div ref={questionNavRef} className={styles.questionNav}>
            <button
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0 || loading}
              className={styles.navButton}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              上一題
            </button>

            <div className={styles.navCenter}>
              <div ref={questionNumberListRef} className={styles.questionNumbers}>
              <div className={styles.questionNumberTrack}>
              {adaptiveQuestion.map((q, i) => {
                const off = responseOffsets[i] ?? 0
                const leafResults = q.type === 'GROUP'
                  ? q.children.map((_, ci) => replyResponse?.[off + ci])
                  : [replyResponse?.[off]]
                const graded = !!replyResponse && leafResults.every((r) => !!r)
                const anyWrong = graded && leafResults.some((r) => (r?.score ?? 0) <= 0)
                const answered = q.type === 'GROUP'
                  ? q.children.every((c) => repliedAnswer.has(c.id))
                  : repliedAnswer.has(q.id)
                const stateLabel = graded
                  ? anyWrong ? '答錯' : '答對'
                  : answered ? '已作答' : '未作答'
                return (
                  <button
                    key={q.id}
                    ref={(node) => { questionNumberRefs.current[i] = node }}
                    onClick={() => goTo(i)}
                    disabled={loading}
                    aria-current={i === currentIndex ? 'step' : undefined}
                    aria-label={`第 ${i + 1} 題，${stateLabel}${i === currentIndex ? '，目前題目' : ''}`}
                    className={`${styles.questionNumber} ${
                      graded
                        ? anyWrong
                          ? styles.questionNumberWrong
                          : styles.questionNumberCorrect
                        : answered
                          ? styles.questionNumberAnswered
                          : ''
                    } ${i === currentIndex ? styles.questionNumberCurrent : ''}`}
                  >
                    {graded ? (
                      <svg
                        className={styles.questionResultIcon}
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        {anyWrong ? (
                          <path
                            d="M4 4L12 12M12 4L4 12"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        ) : (
                          <path
                            d="M3 8L6.5 11.5L13 4.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </button>
                )
              })}
              </div>
              </div>
            </div>

            <button
              onClick={handlePrimaryAction}
              disabled={loading || (!!replyResponse && isLastQuestion)}
              className={`${styles.primaryButton} ${styles.navPrimaryButton}`}
            >
              {loading && canSubmit ? '送出中…' : primaryActionLabel}
              {!loading && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </div>

          <MathJax dynamic>
            <div className={styles.questionCard}>
              <div className={styles.questionMeta}>
                {/* 題號 + 難易度（同一行）*/}
                <div className="flex items-center justify-between gap-3 sm:hidden">
                  <span className={`${styles.questionIndex} shrink-0 font-bold`}>
                    <span className="text-spirit-heading">Q{currentIndex + 1}</span>
                    <span className="text-base"> / {numQuestionsTarget}</span>
                  </span>
                  <DifficultyStars value={currentQuestion.adjustedDifficulty} tone="forest" />
                </div>
                {/* 標籤（第二行，mobile only）*/}
                <div className="mt-1.5 flex flex-wrap gap-2 sm:hidden">
                  <Chip label={typeLabel[currentQuestion.type] ?? currentQuestion.type} color="bg-badge-neutral text-badge-neutral-text" />
                  {currentQuestion.exam.map((e) => (
                    <Chip key={e.id} label={e.name} color="bg-success-border text-success-text" />
                  ))}
                  {currentQuestion.concept.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.conceptGroup.name === c.name ? c.name : c.conceptGroup.name + '-' + c.name}
                      color="bg-badge-purple text-badge-purple-text"
                    />
                  ))}
                  {currentQuestion.tag.map((t) => (
                    <Chip key={t.id} label={t.name} color="bg-badge-amber text-badge-amber-text" />
                  ))}
                </div>
                {/* Desktop：題號 + 標籤靠左，難易度靠右 */}
                <div className="hidden sm:flex sm:items-start sm:justify-between sm:gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${styles.questionIndex} shrink-0 font-bold`}>
                      <span className="text-spirit-heading">Q{currentIndex + 1}</span>
                      <span className="text-base"> / {numQuestionsTarget}</span>
                    </span>
                    <Chip label={typeLabel[currentQuestion.type] ?? currentQuestion.type} color="bg-badge-neutral text-badge-neutral-text" />
                    {currentQuestion.exam.map((e) => (
                      <Chip key={e.id} label={e.name} color="bg-success-border text-success-text" />
                    ))}
                    {currentQuestion.concept.map((c) => (
                      <Chip
                        key={c.id}
                        label={c.conceptGroup.name === c.name ? c.name : c.conceptGroup.name + '-' + c.name}
                        color="bg-badge-purple text-badge-purple-text"
                      />
                    ))}
                    {currentQuestion.tag.map((t) => (
                      <Chip key={t.id} label={t.name} color="bg-badge-amber text-badge-amber-text" />
                    ))}
                  </div>
                  <DifficultyStars value={currentQuestion.adjustedDifficulty} tone="forest" />
                </div>
              </div>

              <div className={styles.questionBody}>
                {currentQuestion.content && (
                  <div
                    dangerouslySetInnerHTML={{ __html: currentQuestion.content }}
                    className="prose max-w-none text-spirit-reading font-medium leading-relaxed text-black-800 [&>*:last-child]:mb-0"
                  />
                )}
                {currentQuestion.answer && (
                  <AnswerInput
                    question={currentQuestion}
                    answer={repliedAnswer.get(currentQuestion.id) ?? ''}
                    onAnswer={(val) =>
                      setRepliedAnswer((prev) => new Map(prev).set(currentQuestion.id, val))
                    }
                    disabled={!!replyResponse}
                    correctAnswer={replyResponse?.[currentOffset]?.correctAnswer}
                  />
                )}
              </div>

              {currentQuestion.type !== 'GROUP' && replyResponse?.[currentOffset] && (
                <ResultBox result={replyResponse[currentOffset]} />
              )}

              {currentQuestion.type === 'GROUP' &&
                currentQuestion.children.map((child, i) => (
                  <Fragment key={child.id}>
                    <div className={`${styles.questionBody} border-t border-spirit-line`}>
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
                        correctAnswer={replyResponse?.[currentOffset + i]?.correctAnswer}
                      />
                    </div>
                    {replyResponse?.[currentOffset + i] && (
                      <ResultBox result={replyResponse[currentOffset + i]} />
                    )}
                  </Fragment>
                ))}
            </div>
          </MathJax>
          {showBottomNav && <div className={styles.questionBottomNav}>
            <button
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0 || loading}
              className={styles.navButton}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              上一題
            </button>
            <button
              onClick={handlePrimaryAction}
              disabled={loading || (!!replyResponse && isLastQuestion)}
              className={`${styles.primaryButton} ${styles.navPrimaryButton}`}
            >
              {loading && canSubmit ? '送出中…' : primaryActionLabel}
              {!loading && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </div>}
        </div>
      )}

      {replyResponse && (
        <div className={styles.postActions}>
          <button
            onClick={fetchAdaptive}
            disabled={loading}
            className={styles.secondaryButton}
          >
            用相同條件再練一組
          </button>
          <button
            onClick={onReset}
            className={styles.primaryButton}
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
            className={`${styles.card} mx-4 w-full max-w-xs p-2`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-6 rounded-xl px-6 py-8">
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
                  className={`${styles.secondaryButton} flex-1`}
                >
                  取消
                </button>
                <button
                  onClick={() => { setShowLeaveModal(false); onReset() }}
                  className={`${styles.primaryButton} flex-1`}
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
            className={`${styles.card} mx-4 w-full max-w-xs p-2`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-6 rounded-xl px-6 py-8">
              <div className="w-full text-center">
                <p className="text-base font-normal text-black-700">此次練習一共獲得</p>
                <div className="mt-1 flex justify-center">
                  <span className={`${styles.questionIndex} relative text-[64px] font-bold leading-tight`}>
                    {totalScore}
                    <span className="absolute bottom-3 left-full ml-1 text-base font-normal text-black-700">分</span>
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-center gap-1 text-sm font-semibold text-amber-700">
                  <Coins size={16} strokeWidth={2.5} />
                  +{totalAwardedPoints} 積分
                </div>
                <hr className="mt-2 border-spirit-line" />
              </div>
              <div className="flex w-full gap-4">
                <div className={`${styles.scoreCorrect} flex-1 rounded-lg px-4 py-3 text-center`}>
                  <p className="text-2xl font-bold">{correctCount}</p>
                  <p className="mt-1 text-sm font-semibold">正確</p>
                </div>
                <div className={`${styles.scoreWrong} flex-1 rounded-lg px-4 py-3 text-center`}>
                  <p className="text-2xl font-bold">{wrongCount}</p>
                  <p className="mt-1 text-sm font-semibold">錯誤</p>
                </div>
              </div>
              <button
                onClick={() => setShowResultModal(false)}
                className={`${styles.primaryButton} w-full`}
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
