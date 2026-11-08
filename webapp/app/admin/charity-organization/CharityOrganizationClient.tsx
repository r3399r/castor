'use client'

import { FormEvent, useEffect, useState } from 'react'
import Pagination from '@/components/Pagination'
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  TableFrame,
} from '@/components/ui'
import { ApiError, apiDelete, apiFetch, apiPost, apiPut, LIMIT } from '@/lib/api'
import type {
  CharityCategoryRow,
  CharityOrganization,
  GetCharityCategoriesResponse,
  Paginate,
} from '@/types/api'

/**
 * The organisations a user can direct their LV5 donation at.
 *
 * Why there is no hard delete button for an organisation that has been
 * chosen: the backend answers DELETE with 400 once a donation or a batch
 * points at it, because losing the row would orphan a real payout record.
 * Retiring one is `isActive = false`, which takes it out of the picker and
 * leaves the public record intact -- so the UI leads with that and keeps
 * delete for a row entered by mistake.
 */

type FormState = {
  name: string
  taxId: string
  introduction: string
  websiteUrl: string
  logoUrl: string
  sortOrder: string
  isActive: boolean
  categoryIds: number[]
}

const emptyForm = (): FormState => ({
  name: '',
  taxId: '',
  introduction: '',
  websiteUrl: '',
  logoUrl: '',
  sortOrder: '0',
  isActive: true,
  categoryIds: [],
})

const toForm = (organization: CharityOrganization): FormState => ({
  name: organization.name,
  taxId: organization.taxId ?? '',
  introduction: organization.introduction,
  websiteUrl: organization.websiteUrl ?? '',
  logoUrl: organization.logoUrl ?? '',
  sortOrder: String(organization.sortOrder),
  isActive: organization.isActive,
  categoryIds: organization.categories.map((category) => category.id),
})

// Empty string means "not provided" for every optional text field here.
// Sending "" instead would store an empty 統編 and an empty URL, and the
// public page renders a link whenever websiteUrl is truthy.
const orNull = (value: string) => {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const input =
  'w-full rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700'

/** The backend's codes, which say what the admin should actually change. */
const CREATE_ERRORS: Record<string, string> = {
  BAD_REQUEST: '資料有誤，請檢查統編是否重複、網址是否以 http(s):// 開頭。',
}

const describeError = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    if (error.code && CREATE_ERRORS[error.code]) return CREATE_ERRORS[error.code]
    if (error.status === 400) return '資料有誤，請檢查統編是否重複、類別是否已停用。'
    if (error.status === 404) return '找不到這筆資料，可能已被刪除。'
  }
  return fallback
}

export default function CharityOrganizationClient() {
  const [organizations, setOrganizations] = useState<CharityOrganization[] | null>(null)
  const [categories, setCategories] = useState<CharityCategoryRow[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('')

  const [editing, setEditing] = useState<CharityOrganization | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [busyId, setBusyId] = useState<number | null>(null)

  const load = async (
    targetPage: number,
    filters: { categoryId: string; isActive: '' | 'true' | 'false' }
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<Paginate<CharityOrganization>>('charity-organization', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        categoryId: filters.categoryId === '' ? undefined : Number(filters.categoryId),
        isActive: filters.isActive === '' ? undefined : filters.isActive,
      })
      setOrganizations(res.data)
      setTotalPages(res.paginate.totalPages)
      setPage(targetPage)
    } catch {
      setError('無法載入公益組織列表。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Both at once: the form cannot offer a category picker without the
    // category list, so a failure here is a failure of the whole page.
    const init = async () => {
      try {
        const res = await apiFetch<GetCharityCategoriesResponse>('charity-category', {
          limit: 100,
        })
        setCategories(res.data)
      } catch {
        setError('無法載入公益類別，組織無法編輯。')
        setLoading(false)
        return
      }
      await load(1, { categoryId: '', isActive: '' })
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reload = () => load(page, { categoryId: categoryFilter, isActive: activeFilter })

  const applyFilters = (categoryId: string, isActive: '' | 'true' | 'false') => {
    setCategoryFilter(categoryId)
    setActiveFilter(isActive)
    load(1, { categoryId, isActive })
  }

  const openCreate = () => {
    setEditing('new')
    setForm(emptyForm())
    setFormError(null)
  }

  const openEdit = (organization: CharityOrganization) => {
    setEditing(organization)
    setForm(toForm(organization))
    setFormError(null)
  }

  const toggleCategory = (id: number) => {
    setForm((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id)
        ? prev.categoryIds.filter((categoryId) => categoryId !== id)
        : [...prev.categoryIds, id],
    }))
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (form.name.trim() === '' || form.introduction.trim() === '') return
    // The backend requires at least one: an organisation filed under no
    // category is offered to nobody, which is a mistake rather than a
    // meaningful state. Saying so here avoids a round trip.
    if (form.categoryIds.length === 0) {
      setFormError('請至少勾選一個公益類別，否則沒有任何精靈能選到這個組織。')
      return
    }

    const body = {
      name: form.name.trim(),
      taxId: orNull(form.taxId),
      introduction: form.introduction.trim(),
      websiteUrl: orNull(form.websiteUrl),
      logoUrl: orNull(form.logoUrl),
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
      categoryIds: form.categoryIds,
    }

    setSaving(true)
    setFormError(null)
    try {
      if (editing === 'new') await apiPost('charity-organization', body)
      else if (editing) await apiPut(`charity-organization/${editing.id}`, body)
      setEditing(null)
      await reload()
    } catch (err) {
      setFormError(describeError(err, '儲存失敗，請稍後再試。'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (organization: CharityOrganization) => {
    setBusyId(organization.id)
    try {
      await apiPut(`charity-organization/${organization.id}`, {
        name: organization.name,
        taxId: organization.taxId,
        introduction: organization.introduction,
        websiteUrl: organization.websiteUrl,
        logoUrl: organization.logoUrl,
        sortOrder: organization.sortOrder,
        isActive: !organization.isActive,
        categoryIds: organization.categories.map((category) => category.id),
      })
      await reload()
    } catch (err) {
      alert(describeError(err, '切換失敗，請稍後再試。'))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (organization: CharityOrganization) => {
    if (
      !confirm(
        `確定要刪除「${organization.name}」嗎？\n\n如果已經有人捐給它，刪除會被拒絕——請改用「停用」。`
      )
    )
      return

    setBusyId(organization.id)
    try {
      await apiDelete(`charity-organization/${organization.id}`)
      await reload()
    } catch (err) {
      alert(
        describeError(
          err,
          '刪除失敗。若此組織已有捐款或撥款紀錄，請改用「停用」保留紀錄。'
        )
      )
    } finally {
      setBusyId(null)
    }
  }

  if (loading && organizations === null && error === null) return <LoadingState />
  if (error && organizations === null) return <ErrorState>{error}</ErrorState>

  const activeCategories = categories.filter((category) => category.isActive)

  return (
    <div className="pb-page-bottom">
      <PageHeader
        title="公益組織管理"
        subtitle="使用者把精靈養到 LV5 後，會從這裡選一個組織。停用只會讓它退出選單，既有紀錄不受影響。"
        actions={<Button onClick={openCreate}>新增組織</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={categoryFilter}
          onChange={(e) => applyFilters(e.target.value, activeFilter)}
          className={`${input} w-auto`}
          aria-label="依公益類別篩選"
        >
          <option value="">所有類別</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.isActive ? '' : '（已停用）'}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => applyFilters(categoryFilter, e.target.value as '' | 'true' | 'false')}
          className={`${input} w-auto`}
          aria-label="依狀態篩選"
        >
          <option value="">上架與停用</option>
          <option value="true">僅上架中</option>
          <option value="false">僅已停用</option>
        </select>
      </div>

      {error && <ErrorState className="mb-4">{error}</ErrorState>}

      <TableFrame>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brown-300/60 text-xs font-medium text-black-700">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">名稱</th>
              <th className="px-4 py-3">公益類別</th>
              <th className="px-4 py-3">統編</th>
              <th className="px-4 py-3">排序</th>
              <th className="px-4 py-3">狀態</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(organizations ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-black-300">
                  尚無公益組織
                </td>
              </tr>
            )}
            {(organizations ?? []).map((organization) => (
              <tr key={organization.id} className="border-b border-brown-300/30 last:border-0">
                <td className="px-4 py-3 text-black-500">{organization.id}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-black-900">{organization.name}</div>
                  {organization.websiteUrl && (
                    <a
                      href={organization.websiteUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-blue-700 underline"
                    >
                      {organization.websiteUrl}
                    </a>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {organization.categories.map((category) => (
                      <span
                        key={category.id}
                        className="rounded bg-beige-200 px-2 py-0.5 text-xs text-black-700"
                      >
                        {category.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-black-500">{organization.taxId ?? '—'}</td>
                <td className="px-4 py-3 text-black-500">{organization.sortOrder}</td>
                <td className="px-4 py-3">
                  {organization.isActive ? (
                    <span className="rounded bg-[#E6F2E6] px-2 py-0.5 text-xs text-[#2E6B2E]">
                      上架中
                    </span>
                  ) : (
                    <span className="rounded bg-beige-200 px-2 py-0.5 text-xs text-black-500">
                      已停用
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(organization)}>
                      編輯
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      disabled={busyId === organization.id}
                      onClick={() => handleToggleActive(organization)}
                    >
                      {organization.isActive ? '停用' : '啟用'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId === organization.id}
                      onClick={() => handleDelete(organization)}
                    >
                      刪除
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(p) => load(p, { categoryId: categoryFilter, isActive: activeFilter })}
      />

      {editing !== null && (
        <Modal
          title={editing === 'new' ? '新增公益組織' : `編輯「${editing.name}」`}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <Field label="名稱">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={input}
                maxLength={100}
                required
                autoFocus
              />
            </Field>

            <Field
              label="統編"
              hint="八位數字。小型協會不一定有，留空即可。重複會被拒絕。"
            >
              <input
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                className={input}
                inputMode="numeric"
                pattern="\d{8}"
                maxLength={8}
              />
            </Field>

            <Field label="簡介" hint="會印在公開徵信頁上。">
              <textarea
                value={form.introduction}
                onChange={(e) => setForm({ ...form, introduction: e.target.value })}
                className={`${input} min-h-24`}
                required
              />
            </Field>

            <Field label="官網" hint="要以 http:// 或 https:// 開頭，否則公開頁會出現死連結。">
              <input
                value={form.websiteUrl}
                onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                className={input}
                placeholder="https://example.org"
                maxLength={500}
              />
            </Field>

            <Field label="Logo 圖片網址">
              <input
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                className={input}
                placeholder="https://example.org/logo.png"
                maxLength={500}
              />
            </Field>

            <Field
              label="公益類別"
              hint="至少一個。使用者只能把精靈的捐款導向該精靈所屬類別下的組織。"
            >
              <div className="flex flex-col gap-2">
                {activeCategories.length === 0 && (
                  <EmptyState>沒有可用的公益類別，請先在資料庫新增。</EmptyState>
                )}
                {activeCategories.map((category) => (
                  <label key={category.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={form.categoryIds.includes(category.id)}
                      onChange={() => toggleCategory(category.id)}
                    />
                    <span>{category.name}</span>
                  </label>
                ))}
                {/* An inactive category the row is already filed under
                    stays visible and uncheckable: the backend refuses to
                    file anything new under one, so silently dropping it
                    from this list would make an unrelated save fail with
                    nothing on screen to explain it. */}
                {categories
                  .filter(
                    (category) => !category.isActive && form.categoryIds.includes(category.id)
                  )
                  .map((category) => (
                    <label key={category.id} className="flex items-start gap-2 text-sm opacity-60">
                      {/* items-start, not center: this label wraps to two
                          lines at form width, and a centred box floats
                          away from the text it belongs to. */}
                      <input type="checkbox" className="mt-1 shrink-0" checked disabled />
                      <span>
                        {category.name}（類別已停用，儲存時會被拒絕——請取消勾選）
                      </span>
                    </label>
                  ))}
              </div>
            </Field>

            <Field label="排序" hint="數字小的排前面。0 到 32767。">
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                className={input}
                min={0}
                max={32767}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span>上架中（取消勾選＝退出選單，既有紀錄不變）</span>
            </label>

            {formError && <ErrorState>{formError}</ErrorState>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                取消
              </Button>
              <Button type="submit" loading={saving}>
                {saving ? '儲存中…' : '儲存'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
