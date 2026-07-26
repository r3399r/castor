'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiDelete, apiFetch, apiPost, apiPut } from '@/lib/api'
import SortableTh, { type SortDirection } from '@/components/SortableTh'

type TagDto = {
  id: number
  name: string
  subjectId: number
  createdAt: string | null
}

// Subject names aren't unique, so the picker needs each subject's
// categories alongside its name to tell duplicates apart.
type SubjectOption = { id: number; name: string; categories: string | null }

type SortColumn = 'id' | 'name' | 'subject'

const subjectLabel = (subject: SubjectOption | undefined) => {
  if (!subject) return '-'
  return subject.categories ? `${subject.name}（${subject.categories}）` : subject.name
}

export default function TagClient() {
  const [tags, setTags] = useState<TagDto[]>([])
  const [allSubjects, setAllSubjects] = useState<SubjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [newName, setNewName] = useState('')
  const [newSubjectId, setNewSubjectId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editSubjectId, setEditSubjectId] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      apiFetch<TagDto[]>('tag'),
      apiFetch<SubjectOption[]>('subject'),
    ])
      .then(([tags, subjects]) => {
        setTags(tags)
        setAllSubjects(subjects)
      })
      .catch(() => setError('無法載入標籤列表。'))
      .finally(() => setLoading(false))
  }, [])

  const subjectById = useMemo(
    () => new Map(allSubjects.map((s) => [s.id, s])),
    [allSubjects]
  )

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name || !newSubjectId) return

    setCreating(true)
    setCreateError(null)
    try {
      const created = await apiPost<TagDto>('tag', {
        name,
        subjectId: Number(newSubjectId),
      })
      setTags((prev) => [...prev, created])
      setNewName('')
      setNewSubjectId('')
    } catch {
      setCreateError('新增失敗，請確認名稱在該科目下未重複。')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (tag: TagDto) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditSubjectId(String(tag.subjectId))
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditSubjectId('')
    setEditError(null)
  }

  const handleUpdate = async (id: number) => {
    const name = editName.trim()
    if (!name || !editSubjectId) return

    setSavingId(id)
    setEditError(null)
    try {
      const updated = await apiPut<TagDto>(`tag/${id}`, {
        name,
        subjectId: Number(editSubjectId),
      })
      setTags((prev) => prev.map((t) => (t.id === id ? updated : t)))
      setEditingId(null)
    } catch {
      setEditError('更新失敗，請確認名稱在該科目下未重複。')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這個標籤嗎？')) return

    setDeletingId(id)
    try {
      await apiDelete(`tag/${id}`)
      setTags((prev) => prev.filter((t) => t.id !== id))
    } catch {
      alert('刪除失敗，請稍後再試。')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const sortedTags = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1
    return [...tags].sort((a, b) => {
      if (sortColumn === 'id') return (a.id - b.id) * dir
      if (sortColumn === 'subject')
        return (
          subjectLabel(subjectById.get(a.subjectId)).localeCompare(
            subjectLabel(subjectById.get(b.subjectId))
          ) * dir
        )
      return a.name.localeCompare(b.name) * dir
    })
  }, [tags, sortColumn, sortDirection, subjectById])

  if (loading) {
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
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">標籤管理</h1>

      <form
        onSubmit={handleCreate}
        className="mb-2 flex items-center gap-3 rounded-lg border border-brown-300 bg-white/40 p-4"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增標籤名稱"
          className="flex-1 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        />
        <select
          value={newSubjectId}
          onChange={(e) => setNewSubjectId(e.target.value)}
          className="w-56 rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700"
        >
          <option value="">-- 選擇科目 --</option>
          {allSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {subjectLabel(s)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={creating || newName.trim() === '' || !newSubjectId}
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
              <SortableTh label="科目" column="subject" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedTags.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-black-300">
                  尚無標籤
                </td>
              </tr>
            )}
            {sortedTags.map((tag) => {
              const isEditing = editingId === tag.id
              return (
                <tr key={tag.id} className="border-b border-brown-300/30 last:border-0">
                  <td className="px-4 py-3 text-black-500">{tag.id}</td>
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
                      <span className="text-black-900">{tag.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-black-500">
                    {isEditing ? (
                      <select
                        value={editSubjectId}
                        onChange={(e) => setEditSubjectId(e.target.value)}
                        className="w-full rounded-md border border-brown-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-700"
                      >
                        {allSubjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {subjectLabel(s)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      subjectLabel(subjectById.get(tag.subjectId))
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdate(tag.id)}
                            disabled={savingId === tag.id}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1f3ea3] disabled:opacity-50"
                          >
                            {savingId === tag.id ? '儲存中…' : '儲存'}
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
                            onClick={() => startEdit(tag)}
                            className="rounded-md border border-brown-300 px-3 py-1.5 text-xs text-black-700 transition hover:bg-beige-200"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(tag.id)}
                            disabled={deletingId === tag.id}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === tag.id ? '刪除中…' : '刪除'}
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
    </div>
  )
}
