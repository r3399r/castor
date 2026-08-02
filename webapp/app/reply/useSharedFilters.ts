'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api'
import type { Paginate } from '@/types/api'

// High enough to fetch every category/subject in one page -- there's no
// realistic dataset near this size yet (mirrors /adaptive's constant).
const ALL_ITEMS_LIMIT = 1000

export type CategoryOption = { id: number; name: string }
export type SubjectOption = { id: number; name: string; sortOrder: number }
export type NamedOption = { id: number; name: string }
export type SubjectDetail = { id: number; name: string; exams: NamedOption[]; tags: NamedOption[] }
export type FilterDimensionWithOptions = {
  id: number
  name: string
  sortOrder: number
  options: { id: number; name: string; parentId: number | null; subjectIds: number[] }[]
}

// The subset of shared filter state that actually drives list queries --
// both ReplyClient and WrongClient take this as a prop so they refetch
// whenever it changes, regardless of which tab is currently visible.
export type QueryFilters = {
  categoryId: string
  subjectId: string
  examIds: string[]
  tagIds: string[]
  hasActiveFilters: boolean
}

// Owns the filter selection + option lists shared between the 錯題本 and
// 歷史紀錄 tabs (ReplyTabsClient renders one FilterPanel against this, and
// both list components fetch off of its resolved QueryFilters) so switching
// tabs never requires re-selecting filters.
export function useSharedFilters() {
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [selectedFilterOptionByDim, setSelectedFilterOptionByDim] = useState<Record<number, number>>({})

  const [categoryList, setCategoryList] = useState<CategoryOption[]>([])
  const [subjectList, setSubjectList] = useState<SubjectOption[]>([])
  const [filterDimensions, setFilterDimensions] = useState<FilterDimensionWithOptions[]>([])
  const [examList, setExamList] = useState<NamedOption[]>([])
  const [tagList, setTagList] = useState<NamedOption[]>([])

  const hasActiveFilters =
    !!selectedCategoryId || !!selectedSubjectId || selectedExamIds.length > 0 || selectedTagIds.length > 0

  useEffect(() => {
    apiFetch<Paginate<CategoryOption>>('category', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setCategoryList(res.data))
      .catch(console.error)
  }, [])

  // Category/subject selection resets their dependent filters synchronously,
  // in the same handler call rather than in a useEffect reacting to the id
  // change -- React batches all of these setState calls into one commit, so
  // by the time each list's fetch effect runs, subjectId/examIds/tagIds are
  // already mutually consistent. (An effect-based reset would land one
  // commit later, letting the fetch effect fire once in between with a new
  // subjectId but the previous subject's stale exam/tag ids.)
  const selectCategory = (id: string) => {
    const next = selectedCategoryId === id ? '' : id
    setSelectedCategoryId(next)
    setSelectedSubjectId('')
    setSelectedFilterOptionByDim({})
    setSelectedExamIds([])
    setSelectedTagIds([])
    setExamList([])
    setTagList([])
    if (!next) {
      setSubjectList([])
      setFilterDimensions([])
      return
    }
    apiFetch<{ subjects: SubjectOption[]; filterDimensions: FilterDimensionWithOptions[] }>(`category/${next}/subject`)
      .then(({ subjects, filterDimensions }) => {
        setSubjectList(subjects)
        setFilterDimensions(filterDimensions)
      })
      .catch(console.error)
  }

  const selectSubject = (id: string) => {
    const next = selectedSubjectId === id ? '' : id
    setSelectedSubjectId(next)
    setSelectedExamIds([])
    setSelectedTagIds([])
    if (!next) {
      setExamList([])
      setTagList([])
      return
    }
    apiFetch<SubjectDetail>(`subject/${next}`)
      .then((detail) => {
        setExamList(detail.exams)
        setTagList(detail.tags)
      })
      .catch(console.error)
  }

  const toggleFilterOption = (dimId: number, optId: number) => {
    setSelectedFilterOptionByDim((prev) =>
      prev[dimId] === optId
        ? (({ [dimId]: _removed, ...rest }) => rest)(prev)
        : { ...prev, [dimId]: optId },
    )
  }

  const toggleExam = (id: string) => {
    setSelectedExamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

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

  // A filter-dimension pick can narrow filteredSubjectList out from under the
  // currently selected subject -- when that happens, clear it and its exam/tag
  // filters together in this one effect call, so this is the only reset that's
  // still effect-driven (there's no click handler to put it in) and it stays
  // just as atomic as the handlers above.
  useEffect(() => {
    if (!selectedSubjectId) return
    if (filteredSubjectList.some((s) => String(s.id) === selectedSubjectId)) return
    setSelectedSubjectId('')
    setSelectedExamIds([])
    setSelectedTagIds([])
    setExamList([])
    setTagList([])
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

  const clearFilters = () => {
    setSelectedCategoryId('')
    setSelectedSubjectId('')
    setSelectedFilterOptionByDim({})
    setSelectedExamIds([])
    setSelectedTagIds([])
    setSubjectList([])
    setFilterDimensions([])
    setExamList([])
    setTagList([])
  }

  const queryFilters: QueryFilters = {
    categoryId: selectedCategoryId,
    subjectId: selectedSubjectId,
    examIds: selectedExamIds,
    tagIds: selectedTagIds,
    hasActiveFilters,
  }

  return {
    selectedCategoryId,
    selectedSubjectId,
    selectedExamIds,
    selectedTagIds,
    selectedFilterOptionByDim,
    categoryList,
    filterDimensions,
    filteredSubjectList,
    visibleOptionsByDim,
    examList,
    tagList,
    hasActiveFilters,
    selectCategory,
    selectSubject,
    toggleFilterOption,
    toggleExam,
    toggleTag,
    clearFilters,
    queryFilters,
  }
}

export type SharedFilters = ReturnType<typeof useSharedFilters>
