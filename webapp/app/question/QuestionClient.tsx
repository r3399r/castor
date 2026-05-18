'use client'

import { useEffect, useMemo, useState } from 'react'
import { MathJax } from 'better-react-mathjax'
import { apiFetch, LIMIT } from '@/lib/api'
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
  GetQuestionResponse,
  GetSubjectConceptGroupResponse,
  GetSubjectExamResponse,
  GetSubjectTagResponse,
  Subject,
  Tag,
} from '@/types/api'

const questionTypeLabel: Record<string, string> = {
  SINGLE: '單選題',
  MULTIPLE: '多選題',
  TRUE_FALSE: '是非題',
  FILL: '選填題',
  GROUP: '題組',
}



export default function QuestionClient() {
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

  const [result, setResult] = useState<GetQuestionResponse | null>(null)
  const [openSolutionIds, setOpenSolutionIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  const showConceptGroupHeader = useMemo(
    () => conceptGroupList.some((cg) => cg.concepts.length > 1),
    [conceptGroupList],
  )

  useEffect(() => {
    apiFetch<GetCategoryResponse>('category').then(setCategoryList).catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedCategoryId) return
    setSelectedSubjectId('')
    setSelectedExamIds([])
    setSelectedConceptIds([])
    setSelectedTagIds([])
    setResult(null)
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

  const fetchQuestions = async (offset = 0) => {
    if (!selectedSubjectId) return
    setLoading(true)
    try {
      const data = await apiFetch<GetQuestionResponse>('question', {
        subjectId: selectedSubjectId,
        examIds: selectedExamIds.length ? selectedExamIds.join(',') : undefined,
        conceptIds: selectedConceptIds.length ? selectedConceptIds.join(',') : undefined,
        tagIds: selectedTagIds.length ? selectedTagIds.join(',') : undefined,
        offset: offset > 0 ? offset : undefined,
        limit: LIMIT,
      })
      setResult(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const toggleSolution = (id: number) => {
    setOpenSolutionIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-blue-700">題庫搜尋</h1>

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

        <div>
          <button
            onClick={() => {
              setPage(1)
              fetchQuestions(0)
            }}
            disabled={!selectedSubjectId || loading}
            className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '搜尋中…' : '搜尋'}
          </button>
        </div>
      </div>

      <hr className="my-6 border-brown-300" />

      {result && result.data.length === 0 && (
        <p className="text-center text-black-500">查無題目</p>
      )}

      {result && result.data.length > 0 && (
        <div className="flex flex-col gap-4">
          {result.data.map((item) => (
            <div key={item.id} className="overflow-hidden rounded-xl border border-brown-300">
              <div className="flex items-start justify-between gap-2 border-b border-brown-300 bg-blue-50 p-3">
                <div className="flex flex-wrap gap-2">
                  <Chip label={questionTypeLabel[item.type] ?? item.type} />
                  {item.exam.map((e) => (
                    <Chip key={e.id} label={e.name} color={tagColors.exam} />
                  ))}
                  {item.concept.map((c) => (
                    <Chip key={c.id} label={c.conceptGroup.name === c.name ? c.name : c.conceptGroup.name + '-' + c.name} color={tagColors.concept} />
                  ))}
                  {item.tag.map((t) => (
                    <Chip key={t.id} label={t.name} color={tagColors.tag} />
                  ))}
                </div>
                <DifficultyStars value={item.adjustedDifficulty} />
              </div>

              <div className="p-4">
                {item.content && (
                  <MathJax dynamic>
                    <div
                      dangerouslySetInnerHTML={{ __html: item.content }}
                      className="prose prose-sm max-w-none"
                    />
                  </MathJax>
                )}

                {item.answer && (
                  <div className="mt-4">
                    <button
                      onClick={() => toggleSolution(item.id)}
                      className="rounded-md border border-blue-700 px-4 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-700/5"
                    >
                      {openSolutionIds.has(item.id) ? '收起答案' : '看答案'}
                    </button>
                    {openSolutionIds.has(item.id) && (
                      <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4">
                        <p className="mb-2 font-bold text-green-800">解答</p>
                        <MathJax dynamic>
                          <div
                            dangerouslySetInnerHTML={{ __html: item.answer }}
                            className="prose prose-sm max-w-none"
                          />
                        </MathJax>
                      </div>
                    )}
                  </div>
                )}

                {item.children.map((child) => (
                  <div key={child.id} className="mt-4 border-t border-[#E5E0DC] pt-4">
                    {child.content && (
                      <MathJax dynamic>
                        <div
                          dangerouslySetInnerHTML={{ __html: child.content }}
                          className="prose prose-sm max-w-none"
                        />
                      </MathJax>
                    )}
                    {child.answer && (
                      <div className="mt-3">
                        <button
                          onClick={() => toggleSolution(child.id)}
                          className="rounded-md border border-blue-700 px-4 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-700/5"
                        >
                          {openSolutionIds.has(child.id) ? '收起答案' : '看答案'}
                        </button>
                        {openSolutionIds.has(child.id) && (
                          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4">
                            <p className="mb-2 font-bold text-green-800">解答</p>
                            <MathJax dynamic>
                              <div
                                dangerouslySetInnerHTML={{ __html: child.answer }}
                                className="prose prose-sm max-w-none"
                              />
                            </MathJax>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {item.fbPostId && (
                  <div className="mt-4">
                    <a
                      href={`https://m.facebook.com/${item.fbPostId.split('_')[0]}/posts/${item.fbPostId.split('_')[1]}`}
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
          ))}

          {result.paginate.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  const prev = Math.max(1, page - 1)
                  setPage(prev)
                  fetchQuestions((prev - 1) * LIMIT)
                }}
                disabled={page === 1}
                className="rounded-md border border-brown-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                ←
              </button>
              <span className="text-sm text-black-500">
                第 {page} / {result.paginate.totalPages} 頁
              </span>
              <button
                onClick={() => {
                  const next = Math.min(result.paginate.totalPages, page + 1)
                  setPage(next)
                  fetchQuestions((next - 1) * LIMIT)
                }}
                disabled={page === result.paginate.totalPages}
                className="rounded-md border border-brown-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
