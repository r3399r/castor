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
  Tabs,
} from '@/components/ui'
import { ApiError, apiDelete, apiFetch, apiPost, apiPut, LIMIT } from '@/lib/api'
import { toApiImage } from '@/lib/imageFile'
import { formatNumber } from '@/lib/number'
import type {
  CharityOrganization,
  DonationBatch,
  DonationBatchDetail,
  GetDonationBatchesResponse,
  GetUnpaidDonationsResponse,
  Paginate,
} from '@/types/api'

/**
 * The payout workflow, in the order the endpoints are meant to be called.
 *
 * Two things here exist because the backend refuses them, and the screen's
 * job is to say so before the admin clicks:
 *
 *  - Publishing needs transferredAmount >= the donations' subtotal, and at
 *    least one piece of evidence. The public page reports the platform's
 *    top-up with its sign rather than clamping it at zero, on the grounds
 *    that an underpaid batch never becomes public -- so this guard is load
 *    bearing, not a nicety.
 *  - A batch's membership is frozen once created. Fixing the wrong set of
 *    donations means deleting the batch (which releases them) and building
 *    it again, so the create step warns rather than offering an edit that
 *    does not exist.
 */

type Tab = 'create' | 'batches'

const EVIDENCE_KINDS = [
  { value: 'TRANSFER_RECEIPT', label: '匯款單／轉帳證明' },
  { value: 'ORG_RECEIPT', label: '受捐單位收據' },
  { value: 'THANK_YOU_LETTER', label: '感謝狀' },
] as const

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const input =
  'w-full rounded-md border border-brown-300 bg-white px-3 py-2 text-sm text-black-900 outline-none focus:border-blue-700'

const today = () => new Date().toISOString().slice(0, 10)

const formatDate = (iso: string) => iso.slice(0, 10)

/**
 * The backend's codes, turned into what the admin should do next.
 *
 * Worth mapping rather than printing a generic failure: every one of these
 * is a different action -- fix the amount, upload a file, reload the list.
 */
const ERROR_MESSAGES: Record<string, string> = {
  BATCH_UNDERPAID: '匯出金額低於捐款小計，無法公開。請先更正金額。',
  BATCH_NO_EVIDENCE: '尚未上傳任何證明文件，無法公開。',
  BATCH_ALREADY_PUBLISHED: '這個批次已經公開了，請重新載入列表。',
  BATCH_NOT_PUBLISHED: '這個批次還沒公開。',
  BATCH_PUBLISHED: '已公開的批次不能修改或刪除，請先取消公開。',
  BATCH_FUTURE_TRANSFER: '匯款日期不能是未來。',
  DONATION_ALREADY_BATCHED: '其中有捐款已被其他批次收走，請重新載入待撥款清單。',
  DONATION_ORGANIZATION_MISMATCH: '其中有捐款是欠給別的組織的，請重新載入。',
  DONATION_NOT_FOUND: '其中有捐款已不存在，請重新載入。',
}

const describeError = (error: unknown, fallback: string) => {
  if (error instanceof ApiError && error.code && ERROR_MESSAGES[error.code])
    return ERROR_MESSAGES[error.code]
  return fallback
}

/** Why this batch cannot be published yet, or null when it can. */
const publishBlocker = (batch: DonationBatch): string | null => {
  if (batch.published) return null
  if (batch.platformTopUp < 0)
    return `匯出金額比捐款小計少 NT$${formatNumber(-batch.platformTopUp)}`
  if (batch.evidence.length === 0) return '尚未上傳證明文件'
  return null
}

export default function DonationBatchClient() {
  const [tab, setTab] = useState<Tab>('create')
  const [organizations, setOrganizations] = useState<CharityOrganization[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // --- create tab -------------------------------------------------------
  const [organizationId, setOrganizationId] = useState<string>('')
  const [unpaid, setUnpaid] = useState<GetUnpaidDonationsResponse | null>(null)
  const [unpaidPage, setUnpaidPage] = useState(1)
  const [unpaidLoading, setUnpaidLoading] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [amount, setAmount] = useState('')
  const [transferredAt, setTransferredAt] = useState(today())
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdMessage, setCreatedMessage] = useState<string | null>(null)

  // --- batches tab ------------------------------------------------------
  const [batches, setBatches] = useState<DonationBatch[] | null>(null)
  const [batchPage, setBatchPage] = useState(1)
  const [batchTotalPages, setBatchTotalPages] = useState(1)
  const [publishedFilter, setPublishedFilter] = useState<'' | 'true' | 'false'>('')
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [detail, setDetail] = useState<DonationBatchDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        // Only active organisations can receive a new donation, but a
        // retired one can still be owed money from before it was retired,
        // so the list is unfiltered on purpose.
        const res = await apiFetch<Paginate<CharityOrganization>>('charity-organization', {
          limit: 100,
        })
        setOrganizations(res.data)
      } catch {
        setError('無法載入公益組織列表。')
      }
    }
    init()
  }, [])

  const loadUnpaid = async (id: string, targetPage: number) => {
    if (id === '') {
      setUnpaid(null)
      return
    }
    setUnpaidLoading(true)
    try {
      const res = await apiFetch<GetUnpaidDonationsResponse>('donation-batch/unpaid', {
        organizationId: Number(id),
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
      })
      setUnpaid(res)
      setUnpaidPage(targetPage)
      // Selection is per page load: an id carried across a reload might
      // have been batched by then, and POST would reject the whole call.
      setSelected(res.data.map((row) => row.id))
      setAmount(String(res.data.reduce((sum, row) => sum + row.amount, 0)))
    } catch {
      setError('無法載入待撥款清單。')
    } finally {
      setUnpaidLoading(false)
    }
  }

  const loadBatches = async (targetPage: number, published: '' | 'true' | 'false') => {
    setBatchesLoading(true)
    try {
      const res = await apiFetch<GetDonationBatchesResponse>('donation-batch', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
        published: published === '' ? undefined : published,
      })
      setBatches(res.data)
      setBatchTotalPages(res.paginate.totalPages)
      setBatchPage(targetPage)
    } catch {
      setError('無法載入撥款批次。')
    } finally {
      setBatchesLoading(false)
    }
  }

  const openTab = (next: Tab) => {
    setTab(next)
    if (next === 'batches' && batches === null) loadBatches(1, publishedFilter)
  }

  const selectedSubtotal = (unpaid?.data ?? [])
    .filter((row) => selected.includes(row.id))
    .reduce((sum, row) => sum + row.amount, 0)
  const enteredAmount = Number(amount) || 0
  const topUp = enteredAmount - selectedSubtotal

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (selected.length === 0 || organizationId === '') return

    setCreating(true)
    setCreateError(null)
    setCreatedMessage(null)
    try {
      const created = await apiPost<DonationBatch>('donation-batch', {
        organizationId: Number(organizationId),
        transferredAmount: enteredAmount,
        transferredAt,
        reference: reference.trim() === '' ? null : reference.trim(),
        note: note.trim() === '' ? null : note.trim(),
        donationIds: selected,
      })
      setCreatedMessage(
        `已建立批次 #${created.id}（未公開，${created.donationCount} 筆、小計 NT$${formatNumber(created.donationSubtotal)}）。接著到「撥款批次」上傳證明再公開。`
      )
      setReference('')
      setNote('')
      await loadUnpaid(organizationId, 1)
      // Refreshed rather than left stale: the new batch belongs at the top
      // of that list, and the admin is about to go there to upload.
      await loadBatches(1, publishedFilter)
    } catch (err) {
      setCreateError(describeError(err, '建立失敗，請稍後再試。'))
    } finally {
      setCreating(false)
    }
  }

  const openDetail = async (id: number) => {
    setDetailError(null)
    try {
      setDetail(await apiFetch<DonationBatchDetail>(`donation-batch/${id}`))
    } catch {
      setError('無法載入批次內容。')
    }
  }

  const refreshDetail = async (id: number) => {
    setDetail(await apiFetch<DonationBatchDetail>(`donation-batch/${id}`))
    await loadBatches(batchPage, publishedFilter)
  }

  const handleUpload = async (batchId: number, kind: string, file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setDetailError('只接受 JPEG、PNG、WebP 或 PDF。')
      return
    }
    setBusy(true)
    setDetailError(null)
    try {
      // Shrinks an oversized photo; returns null for a file that cannot be
      // made to fit, which for a PDF means it simply is too big -- there is
      // no cheap way to compress one in the browser.
      const prepared = await toApiImage(file)
      if (!prepared) {
        setDetailError(
          file.type === 'application/pdf'
            ? 'PDF 太大（上限約 1.8MB），請先壓縮或改拍照上傳。'
            : '圖片太大且無法縮小，請改用其他檔案。'
        )
        return
      }
      await apiPost(`donation-batch/${batchId}/evidence`, { kind, ...prepared })
      await refreshDetail(batchId)
    } catch (err) {
      setDetailError(describeError(err, '上傳失敗，請稍後再試。'))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteEvidence = async (batchId: number, evidenceId: number) => {
    if (!confirm('確定要刪除這份證明嗎？S3 上的檔案會一併刪除。')) return
    setBusy(true)
    setDetailError(null)
    try {
      await apiDelete(`donation-batch/${batchId}/evidence/${evidenceId}`)
      await refreshDetail(batchId)
    } catch (err) {
      setDetailError(describeError(err, '刪除失敗，請稍後再試。'))
    } finally {
      setBusy(false)
    }
  }

  const handlePublish = async (batch: DonationBatch) => {
    if (
      !confirm(
        `確定要公開批次 #${batch.id} 嗎？\n\n公開後任何人都能在徵信頁看到這筆撥款與證明文件，而且批次內容不能再修改。`
      )
    )
      return
    setBusy(true)
    setDetailError(null)
    try {
      await apiPut(`donation-batch/${batch.id}/publish`, {})
      await refreshDetail(batch.id)
    } catch (err) {
      setDetailError(describeError(err, '公開失敗，請稍後再試。'))
    } finally {
      setBusy(false)
    }
  }

  const handleUnpublish = async (batch: DonationBatch) => {
    if (!confirm(`確定要取消公開批次 #${batch.id} 嗎？徵信頁會立刻看不到它。`)) return
    setBusy(true)
    setDetailError(null)
    try {
      await apiPut(`donation-batch/${batch.id}/unpublish`, {})
      await refreshDetail(batch.id)
    } catch (err) {
      setDetailError(describeError(err, '取消公開失敗，請稍後再試。'))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteBatch = async (batch: DonationBatch) => {
    if (
      !confirm(
        `確定要刪除批次 #${batch.id} 嗎？\n\n其中 ${batch.donationCount} 筆捐款會回到待撥款狀態，證明文件會從 S3 刪除。`
      )
    )
      return
    setBusy(true)
    setDetailError(null)
    try {
      await apiDelete(`donation-batch/${batch.id}`)
      setDetail(null)
      await loadBatches(batchPage, publishedFilter)
    } catch (err) {
      setDetailError(describeError(err, '刪除失敗，請稍後再試。'))
    } finally {
      setBusy(false)
    }
  }

  if (organizations === null && error === null) return <LoadingState />
  if (organizations === null) return <ErrorState>{error}</ErrorState>

  const hasMoreUnpaid = unpaid !== null && unpaid.summary.unpaidCount > unpaid.data.length

  return (
    <div className="pb-page-bottom">
      <PageHeader
        title="撥款管理"
        subtitle="流程：選組織 → 勾選要撥的捐款 → 填實際匯款資訊（存成未公開）→ 上傳證明 → 公開。"
      />

      <Tabs
        id="donation-batch-tabs"
        label="撥款管理"
        value={tab}
        onChange={openTab}
        items={[
          { value: 'create', label: '建立撥款' },
          { value: 'batches', label: '撥款批次' },
        ]}
      />

      {error && <ErrorState className="mt-4">{error}</ErrorState>}

      {tab === 'create' && (
        <div className="mt-4 flex flex-col gap-4">
          <Field label="公益組織" hint="已停用的組織仍可能有舊的未撥款捐款，所以一併列出。">
            <select
              value={organizationId}
              onChange={(e) => {
                setOrganizationId(e.target.value)
                setCreatedMessage(null)
                loadUnpaid(e.target.value, 1)
              }}
              className={input}
            >
              <option value="">請選擇…</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                  {organization.isActive ? '' : '（已停用）'}
                </option>
              ))}
            </select>
          </Field>

          {createdMessage && (
            <div className="rounded-md border border-[#2E6B2E]/30 bg-[#E6F2E6] px-4 py-3 text-sm text-[#2E6B2E]">
              {createdMessage}
            </div>
          )}

          {organizationId === '' && <EmptyState>請先選一個公益組織。</EmptyState>}

          {organizationId !== '' && unpaidLoading && <LoadingState />}

          {organizationId !== '' && !unpaidLoading && unpaid !== null && (
            <>
              <div className="rounded-md border border-brown-300 bg-white/40 px-4 py-3 text-sm">
                未撥款共 <strong>{unpaid.summary.unpaidCount}</strong> 筆，合計{' '}
                <strong>NT${formatNumber(unpaid.summary.unpaidAmount)}</strong>
                {hasMoreUnpaid && (
                  /* The batch can only hold what is on screen, so a second
                     page has to announce itself -- otherwise it is quietly
                     left unpaid. */
                  <span className="ml-2 text-[#7A5713]">
                    （本頁只顯示 {unpaid.data.length} 筆，其餘請分批處理）
                  </span>
                )}
              </div>

              {unpaid.data.length === 0 ? (
                <EmptyState>這個組織目前沒有待撥款的捐款。</EmptyState>
              ) : (
                <>
                  <TableFrame>
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-brown-300/60 text-xs font-medium text-black-700">
                          <th className="px-4 py-3">
                            <input
                              type="checkbox"
                              aria-label="全選本頁"
                              checked={selected.length === unpaid.data.length}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked ? unpaid.data.map((row) => row.id) : []
                                )
                              }
                            />
                          </th>
                          <th className="px-4 py-3">捐款 ID</th>
                          <th className="px-4 py-3">使用者 ID</th>
                          <th className="px-4 py-3">公益類別</th>
                          <th className="px-4 py-3">確認日期</th>
                          <th className="px-4 py-3 text-right">金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unpaid.data.map((row) => (
                          <tr key={row.id} className="border-b border-brown-300/30 last:border-0">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                aria-label={`選取捐款 ${row.id}`}
                                checked={selected.includes(row.id)}
                                onChange={(e) =>
                                  setSelected((prev) =>
                                    e.target.checked
                                      ? [...prev, row.id]
                                      : prev.filter((id) => id !== row.id)
                                  )
                                }
                              />
                            </td>
                            <td className="px-4 py-3 text-black-500">{row.id}</td>
                            <td className="px-4 py-3 text-black-500">{row.userId}</td>
                            <td className="px-4 py-3">{row.category.name}</td>
                            <td className="px-4 py-3 text-black-500">
                              {formatDate(row.confirmedAt)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              NT${formatNumber(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableFrame>

                  <Pagination
                    page={unpaidPage}
                    totalPages={unpaid.paginate.totalPages}
                    onChange={(p) => loadUnpaid(organizationId, p)}
                  />

                  <form
                    onSubmit={handleCreate}
                    className="flex flex-col gap-4 rounded-md border border-brown-300 bg-white/40 p-4"
                  >
                    <p className="text-sm text-black-700">
                      已選 <strong>{selected.length}</strong> 筆，小計{' '}
                      <strong>NT${formatNumber(selectedSubtotal)}</strong>
                    </p>

                    <Field
                      label="實際匯出金額"
                      hint="預設是小計。平台自行加碼湊整數時填實際匯出的數字。"
                    >
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className={input}
                        min={1}
                        required
                      />
                    </Field>

                    {topUp !== 0 && (
                      <p
                        className={`text-sm ${topUp < 0 ? 'text-red-600' : 'text-[#2E6B2E]'}`}
                      >
                        {topUp > 0
                          ? `平台加碼 NT$${formatNumber(topUp)}`
                          : `比小計少 NT$${formatNumber(-topUp)}——批次可以建立，但無法公開，直到金額更正。`}
                      </p>
                    )}

                    <Field label="匯款日期" hint="錢實際離開帳戶的日期，不是輸入這筆的日期。">
                      <input
                        type="date"
                        value={transferredAt}
                        onChange={(e) => setTransferredAt(e.target.value)}
                        className={input}
                        max={today()}
                        required
                      />
                    </Field>

                    <Field label="交易序號" hint="會印在公開徵信頁上，供人核對。">
                      <input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className={input}
                        maxLength={100}
                      />
                    </Field>

                    <Field label="內部備註" hint="不會出現在公開頁。">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className={`${input} min-h-20`}
                      />
                    </Field>

                    <p className="text-xs text-[#7A5713]">
                      建立後成員清單就凍結了。選錯的話只能刪掉整個批次（捐款會回到待撥款）再重建。
                    </p>

                    {createError && <ErrorState>{createError}</ErrorState>}

                    <div className="flex justify-end">
                      <Button type="submit" loading={creating} disabled={selected.length === 0}>
                        {creating ? '建立中…' : '建立批次（未公開）'}
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'batches' && (
        <div className="mt-4 flex flex-col gap-4">
          <select
            value={publishedFilter}
            onChange={(e) => {
              const next = e.target.value as '' | 'true' | 'false'
              setPublishedFilter(next)
              loadBatches(1, next)
            }}
            className={`${input} w-auto`}
            aria-label="依公開狀態篩選"
          >
            <option value="">全部</option>
            <option value="false">未公開</option>
            <option value="true">已公開</option>
          </select>

          {batchesLoading && batches === null && <LoadingState />}

          <TableFrame>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-brown-300/60 text-xs font-medium text-black-700">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">組織</th>
                  <th className="px-4 py-3">匯款日期</th>
                  <th className="px-4 py-3 text-right">筆數</th>
                  <th className="px-4 py-3 text-right">小計</th>
                  <th className="px-4 py-3 text-right">平台加碼</th>
                  <th className="px-4 py-3 text-right">匯出金額</th>
                  <th className="px-4 py-3">證明</th>
                  <th className="px-4 py-3">狀態</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {(batches ?? []).length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-black-300">
                      尚無撥款批次
                    </td>
                  </tr>
                )}
                {(batches ?? []).map((batch) => {
                  const blocker = publishBlocker(batch)
                  return (
                    <tr key={batch.id} className="border-b border-brown-300/30 last:border-0">
                      <td className="px-4 py-3 text-black-500">{batch.id}</td>
                      <td className="px-4 py-3">{batch.organization?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-black-500">
                        {formatDate(batch.transferredAt)}
                      </td>
                      <td className="px-4 py-3 text-right">{batch.donationCount}</td>
                      <td className="px-4 py-3 text-right">
                        NT${formatNumber(batch.donationSubtotal)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${batch.platformTopUp < 0 ? 'text-red-600' : ''}`}
                      >
                        {batch.platformTopUp < 0
                          ? `−NT$${formatNumber(-batch.platformTopUp)}`
                          : `NT$${formatNumber(batch.platformTopUp)}`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        NT${formatNumber(batch.transferredAmount)}
                      </td>
                      <td className="px-4 py-3 text-black-500">{batch.evidence.length}</td>
                      <td className="px-4 py-3">
                        {batch.published ? (
                          <span className="rounded bg-[#E6F2E6] px-2 py-0.5 text-xs text-[#2E6B2E]">
                            已公開
                          </span>
                        ) : (
                          <span
                            className="rounded bg-[#FBF1DE] px-2 py-0.5 text-xs text-[#7A5713]"
                            title={blocker ?? '可以公開'}
                          >
                            {blocker === null ? '待公開' : '未完備'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => openDetail(batch.id)}>
                          詳細
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableFrame>

          <Pagination
            page={batchPage}
            totalPages={batchTotalPages}
            onChange={(p) => loadBatches(p, publishedFilter)}
          />
        </div>
      )}

      {detail !== null && (
        <Modal title={`批次 #${detail.id}`} onClose={() => setDetail(null)}>
          <div className="flex flex-col gap-4 text-sm">
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-black-500">組織</dt>
              <dd>{detail.organization?.name ?? '—'}</dd>
              <dt className="text-black-500">匯款日期</dt>
              <dd>{formatDate(detail.transferredAt)}</dd>
              <dt className="text-black-500">交易序號</dt>
              <dd>{detail.reference ?? '—'}</dd>
              <dt className="text-black-500">捐款小計</dt>
              <dd>
                {detail.donationCount} 筆 · NT${formatNumber(detail.donationSubtotal)}
              </dd>
              <dt className="text-black-500">平台加碼</dt>
              <dd className={detail.platformTopUp < 0 ? 'text-red-600' : ''}>
                {detail.platformTopUp < 0
                  ? `−NT$${formatNumber(-detail.platformTopUp)}`
                  : `NT$${formatNumber(detail.platformTopUp)}`}
              </dd>
              <dt className="text-black-500">匯出金額</dt>
              <dd>NT${formatNumber(detail.transferredAmount)}</dd>
              <dt className="text-black-500">內部備註</dt>
              <dd className="whitespace-pre-wrap">{detail.note ?? '—'}</dd>
            </dl>

            <section>
              <h3 className="mb-2 font-bold text-black-900">
                證明文件（{detail.evidence.length}）
              </h3>
              {detail.evidence.length === 0 && (
                <EmptyState className="mb-2">還沒有證明文件，無法公開。</EmptyState>
              )}
              <ul className="mb-3 flex flex-col gap-2">
                {detail.evidence.map((evidence) => (
                  <li
                    key={evidence.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-brown-300 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <a
                        href={evidence.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block truncate text-blue-700 underline"
                      >
                        {EVIDENCE_KINDS.find((kind) => kind.value === evidence.kind)?.label ??
                          evidence.kind}
                      </a>
                      <span className="block truncate text-xs text-black-300">
                        {evidence.s3Key}
                      </span>
                    </div>
                    {!detail.published && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => handleDeleteEvidence(detail.id, evidence.id)}
                      >
                        刪除
                      </Button>
                    )}
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-2">
                {EVIDENCE_KINDS.map((kind) => (
                  <label key={kind.value} className="flex items-center gap-2 text-xs">
                    <span className="w-32 shrink-0 text-black-700">{kind.label}</span>
                    <input
                      type="file"
                      accept={ACCEPTED_TYPES.join(',')}
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        // Cleared so picking the same file twice still
                        // fires a change event after a failed upload.
                        e.target.value = ''
                        if (file) handleUpload(detail.id, kind.value, file)
                      }}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-black-300">
                接受 JPEG / PNG / WebP / PDF。已公開的批次仍可補上證明（收據與感謝狀常常晚到）。
              </p>
            </section>

            <section>
              <h3 className="mb-2 font-bold text-black-900">
                成員捐款（{detail.donations.length}，建立後凍結）
              </h3>
              <ul className="max-h-40 overflow-y-auto text-xs text-black-500">
                {detail.donations.map((donation) => (
                  <li key={donation.id}>
                    #{donation.id} · 使用者 {donation.userId} · {donation.category.name} · NT$
                    {formatNumber(donation.amount)}
                  </li>
                ))}
              </ul>
            </section>

            {detailError && <ErrorState>{detailError}</ErrorState>}

            <div className="flex flex-wrap justify-end gap-2">
              {detail.published ? (
                <Button variant="secondary" disabled={busy} onClick={() => handleUnpublish(detail)}>
                  取消公開
                </Button>
              ) : (
                <>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => handleDeleteBatch(detail)}
                  >
                    刪除批次
                  </Button>
                  <Button
                    disabled={busy || publishBlocker(detail) !== null}
                    title={publishBlocker(detail) ?? undefined}
                    onClick={() => handlePublish(detail)}
                  >
                    公開
                  </Button>
                </>
              )}
            </div>
            {!detail.published && publishBlocker(detail) !== null && (
              <p className="text-right text-xs text-[#7A5713]">
                無法公開：{publishBlocker(detail)}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
