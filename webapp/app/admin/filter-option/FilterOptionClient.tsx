'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiDelete, apiFetch, apiPost, apiPut, LIMIT } from '@/lib/api'
import MultiSelectField from '@/components/MultiSelectField'
import Pagination from '@/components/Pagination'
import SortableTh, { type SortDirection } from '@/components/SortableTh'
import type { Category, Paginate } from '@/types/api'

// High enough to fetch every dimension/option/subject in one page for the
// picker dropdowns -- there's no realistic admin dataset near this size yet.
const ALL_ITEMS_LIMIT = 1000

type FilterOptionDto = {
  id: number
  name: string
  dimensionId: number
  parentId: number | null
  // Read-only summary of the option's linked subjects (many-to-many via
  // filter_subject_option). Not editable here -- comes pre-formatted as a
  // CSV string from the API.
  subjects: string | null
}

// Dimension names aren't unique across categories, so the picker needs
// each dimension's category alongside its name to tell duplicates apart.
type DimensionOption = { id: number; name: string; categoryId: number }

// Subject names aren't unique, so the picker needs each subject's
// categories alongside its name to tell duplicates apart.
type SubjectOption = { id: number; name: string; categories: string | null }

type SortColumn = 'id' | 'name' | 'dimension' | 'subjects'

export default function FilterOptionClient() {
  const [options, setOptions] = useState<FilterOptionDto[] | null>(null)
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [allDimensions, setAllDimensions] = useState<DimensionOption[]>([])
  const [allOptions, setAllOptions] = useState<FilterOptionDto[]>([])
  const [allSubjects, setAllSubjects] = useState<SubjectOption[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [newName, setNewName] = useState('')
  const [newDimensionId, setNewDimensionId] = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDimensionId, setEditDimensionId] = useState('')
  const [editParentId, setEditParentId] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [editingRelationId, setEditingRelationId] = useState<number | null>(null)
  const [loadingRelationId, setLoadingRelationId] = useState<number | null>(null)
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [savingRelationId, setSavingRelationId] = useState<number | null>(null)
  const [relationError, setRelationError] = useState<string | null>(null)

  const categoryById = useMemo(
    () => new Map(allCategories.map((c) => [c.id, c])),
    [allCategories]
  )
  const dimensionById = useMemo(
    () => new Map(allDimensions.map((d) => [d.id, d])),
    [allDimensions]
  )
  const optionById = useMemo(
    () => new Map(allOptions.map((o) => [o.id, o])),
    [allOptions]
  )
  const subjectById = useMemo(
    () => new Map(allSubjects.map((s) => [s.id, s])),
    [allSubjects]
  )

  // Flat, dash-separated label -- a single line of text is all a <select>
  // option has to disambiguate same-named dimensions/options.
  const dimensionLabel = (dimension: DimensionOption | undefined) => {
    if (!dimension) return '-'
    const categoryName = categoryById.get(dimension.categoryId)?.name
    return categoryName ? `${dimension.name} - ${categoryName}` : dimension.name
  }

  const parentLabel = (option: FilterOptionDto | undefined) => {
    if (!option) return '-'
    const dimension = dimensionById.get(option.dimensionId)
    const categoryName = dimension ? categoryById.get(dimension.categoryId)?.name : undefined
    const parts = [option.name, dimension?.name, categoryName].filter(Boolean)
    return parts.join(' - ')
  }

  const subjectOptionLabel = (subject: SubjectOption) =>
    subject.categories ? `${subject.name} - ${subject.categories}` : subject.name

  // A parent must live in the same category as the option being edited
  // (that's what makes the parent -> child cascade in the practice-page
  // filter UI meaningful), and an option can't be its own parent.
  const parentCandidates = (dimensionIdStr: string, excludeId?: number) => {
    const dimension = dimensionById.get(Number(dimensionIdStr))
    if (!dimension) return []
    return allOptions.filter((o) => {
      if (o.id === excludeId) return false
      const optDimension = dimensionById.get(o.dimensionId)
      return optDimension?.categoryId === dimension.categoryId
    })
  }

  const load = async (
    targetPage: number,
    sort: SortColumn,
    order: SortDirection
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Paginate<FilterOptionDto>>('filter-option', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        sort,
        order,
      })
      setOptions(res.data)
      setTotalPages(res.paginate.totalPages)
      setPage(targetPage)
    } catch {
      setError('無法載入篩選選項列表。')
    } finally {
      setLoading(false)
    }
  }

  const loadPickerData = () => {
    apiFetch<Paginate<Category>>('category', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setAllCategories(res.data))
      .catch(() => {})
    apiFetch<Paginate<DimensionOption>>('filter-dimension', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setAllDimensions(res.data))
      .catch(() => {})
    apiFetch<Paginate<FilterOptionDto>>('filter-option', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setAllOptions(res.data))
      .catch(() => {})
    apiFetch<Paginate<SubjectOption>>('subject', { limit: ALL_ITEMS_LIMIT })
      .then((res) => setAllSubjects(res.data))
      .catch(() => {})
  }

  useEffect(() => {
    load(1, sortColumn, sortDirection)
    loadPickerData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name || !newDimensionId) return

    setCreating(true)
    setCreateError(null)
    try {
      await apiPost<FilterOptionDto>('filter-option', {
        name,
        dimensionId: Number(newDimensionId),
        parentId: newParentId ? Number(newParentId) : null,
      })
      setNewName('')
      setNewDimensionId('')
      setNewParentId('')
      await load(page, sortColumn, sortDirection)
      loadPickerData()
    } catch {
      setCreateError('新增失敗，請稍後再試。')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (option: FilterOptionDto) => {
    setEditingId(option.id)
    setEditName(option.name)
    setEditDimensionId(String(option.dimensionId))
    setEditParentId(option.parentId ? String(option.parentId) : '')
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditDimensionId('')
    setEditParentId('')
    setEditError(null)
  }

  const handleUpdate = async (id: number) => {
    const name = editName.trim()
    if (!name || !editDimensionId) return

    setSavingId(id)
    setEditError(null)
    try {
      await apiPut<FilterOptionDto>(`filter-option/${id}`, {
        name,
        dimensionId: Number(editDimensionId),
        parentId: editParentId ? Number(editParentId) : null,
      })
      setEditingId(null)
      await load(page, sortColumn, sortDirection)
      loadPickerData()
    } catch {
      setEditError('更新失敗，請稍後再試。')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這個篩選選項嗎？以此為上層的選項將會失去上層設定。')) return

    setDeletingId(id)
    try {
      await apiDelete(`filter-option/${id}`)
      await load(page, sortColumn, sortDirection)
      loadPickerData()
    } catch {
      alert('刪除失敗，請稍後再試。')
    } finally {
      setDeletingId(null)
    }
  }

  const startEditRelation = async (id: number) => {
    setLoadingRelationId(id)
    setRelationError(null)
    try {
      const { subjectIds } = await apiFetch<{ subjectIds: number[] }>(
        `filter-option/${id}/subject`
      )
      setSelectedSubjectIds(subjectIds.map(String))
      setEditingRelationId(id)
    } catch {
      setRelationError('無法載入目前的科目關聯。')
    } finally {
      setLoadingRelationId(null)
    }
  }

  const cancelEditRelation = () => {
    setEditingRelationId(null)
    setSelectedSubjectIds([])
    setRelationError(null)
  }

  const handleSaveRelation = async (id: number) => {
    setSavingRelationId(id)
    setRelationError(null)
    try {
      await apiPut<{ subjectIds: number[] }>(`filter-option/${id}/subject`, {
        subjectIds: selectedSubjectIds.map(Number),
      })
      setEditingRelationId(null)
      await load(page, sortColumn, sortDirection)
    } catch {
      setRelationError('更新科目關聯失敗，請稍後再試。')
    } finally {
      setSavingRelationId(null)
    }
  }

  const handleSort = (column: SortColumn) => {
    const direction =
      column === sortColumn ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc'
    setSortColumn(column)
    setSortDirection(direction)
    load(1, column, direction)
  }

  if (loading && options === null) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-black-500">載入中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-[60px] rounded-[24px] border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="pb-[70px]">
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">篩選選項管理</h1>
      <p className="mb-6 text-sm text-black-500">
        篩選選項屬於某個篩選維度，可選擇上層選項以形成階層式篩選（選擇上層選項可縮小子選項範圍），並可設定此選項適用的科目。
      </p>

      <form
        onSubmit={handleCreate}
        className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-brown-300 bg-white/40 p-4"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增篩選選項名稱"
          className="flex-1 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        />
        <select
          value={newDimensionId}
          onChange={(e) => {
            setNewDimensionId(e.target.value)
            setNewParentId('')
          }}
          className="w-56 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        >
          <option value="">-- 選擇維度 --</option>
          {allDimensions.map((d) => (
            <option key={d.id} value={d.id}>
              {dimensionLabel(d)}
            </option>
          ))}
        </select>
        <select
          value={newParentId}
          onChange={(e) => setNewParentId(e.target.value)}
          disabled={!newDimensionId}
          className="w-56 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700 disabled:opacity-50"
        >
          <option value="">-- 無上層選項 --</option>
          {parentCandidates(newDimensionId).map((o) => (
            <option key={o.id} value={o.id}>
              {parentLabel(o)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={creating || newName.trim() === '' || !newDimensionId}
          className="shrink-0 rounded-md bg-blue-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
        >
          {creating ? '新增中…' : '新增'}
        </button>
      </form>
      {createError && <p className="mb-4 text-sm text-red-600">{createError}</p>}

      <div className="mt-4 overflow-x-auto rounded-lg border border-brown-300 bg-white/40">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brown-300/60 text-xs font-medium text-black-700">
              <SortableTh label="ID" column="id" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="名稱" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortableTh label="維度" column="dimension" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3">上層選項</th>
              <SortableTh label="科目" column="subjects" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(options ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-black-300">
                  尚無篩選選項
                </td>
              </tr>
            )}
            {(options ?? []).map((option) => {
              const isEditing = editingId === option.id
              return (
                <tr key={option.id} className="border-b border-brown-300/30 last:border-0">
                  <td className="px-4 py-3 text-black-500">{option.id}</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-md border border-brown-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-700"
                          autoFocus
                        />
                        {editError && <p className="mt-1 text-xs text-red-600">{editError}</p>}
                      </>
                    ) : (
                      <span className="text-black-900">{option.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {isEditing ? (
                      <select
                        value={editDimensionId}
                        onChange={(e) => {
                          setEditDimensionId(e.target.value)
                          setEditParentId('')
                        }}
                        className="w-full rounded-md border border-brown-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-700"
                      >
                        {allDimensions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {dimensionLabel(d)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      dimensionLabel(dimensionById.get(option.dimensionId))
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {isEditing ? (
                      <select
                        value={editParentId}
                        onChange={(e) => setEditParentId(e.target.value)}
                        className="w-full rounded-md border border-brown-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-700"
                      >
                        <option value="">-- 無上層選項 --</option>
                        {parentCandidates(editDimensionId, option.id).map((o) => (
                          <option key={o.id} value={o.id}>
                            {parentLabel(o)}
                          </option>
                        ))}
                      </select>
                    ) : option.parentId ? (
                      parentLabel(optionById.get(option.parentId))
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {editingRelationId === option.id ? (
                      <div className="flex min-w-55 flex-col gap-2">
                        <MultiSelectField
                          label=""
                          options={allSubjects.map((s) => ({
                            value: String(s.id),
                            label: subjectOptionLabel(s),
                          }))}
                          value={selectedSubjectIds}
                          onChange={setSelectedSubjectIds}
                        />
                        {relationError && (
                          <p className="text-xs text-red-600">{relationError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveRelation(option.id)}
                            disabled={savingRelationId === option.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
                          >
                            {savingRelationId === option.id ? '儲存中…' : '儲存'}
                          </button>
                          <button
                            onClick={cancelEditRelation}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      option.subjects ?? '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdate(option.id)}
                            disabled={savingId === option.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
                          >
                            {savingId === option.id ? '儲存中…' : '儲存'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(option)}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            編輯
                          </button>
                          {editingRelationId !== option.id && (
                            <button
                              onClick={() => startEditRelation(option.id)}
                              disabled={loadingRelationId === option.id}
                              className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200 disabled:opacity-50"
                            >
                              {loadingRelationId === option.id ? '載入中…' : '編輯科目'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(option.id)}
                            disabled={deletingId === option.id}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === option.id ? '刪除中…' : '刪除'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(p) => load(p, sortColumn, sortDirection)}
      />
    </div>
  )
}
