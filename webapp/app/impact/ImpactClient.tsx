'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import Pagination from '@/components/Pagination'
import { ContentPanel, EmptyState, ErrorState, LoadingState } from '@/components/ui'
import { apiFetch, LIMIT } from '@/lib/api'
import { formatNumber } from '@/lib/number'
import type { DonationEvidence, GetInfoDonationResponse } from '@/types/api'

/**
 * Every published payout, with the arithmetic shown rather than summarised.
 *
 * The page's only job is to be checkable, so each batch prints the three
 * numbers that make up the transfer -- donation count x unit amount, plus
 * the platform's top-up, equals what left the bank account -- next to the
 * evidence for that figure. A total with no breakdown would be a claim.
 *
 * `donationUnitAmount` is null when the batch's donations were not all the
 * same amount, and the backend is the one that decides that (via COUNT
 * DISTINCT). When it is null the "57 × NT$1,000" line is not true, so only
 * the subtotal is shown.
 */

const EVIDENCE_LABELS: Record<string, string> = {
  TRANSFER_RECEIPT: '匯款證明',
  ORG_RECEIPT: '受贈單位收據',
  THANK_YOU_LETTER: '感謝狀',
}

const formatDay = (value: string) =>
  new Intl.DateTimeFormat('zh-TW', { dateStyle: 'long' }).format(new Date(value))

function EvidenceLink({ evidence }: { evidence: DonationEvidence }) {
  return (
    <a
      className="donation-record-link"
      href={evidence.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <FileText size={15} aria-hidden="true" />
      {evidence.caption ?? EVIDENCE_LABELS[evidence.kind] ?? evidence.kind}
      <ExternalLink size={14} aria-hidden="true" />
    </a>
  )
}

export default function ImpactClient() {
  const [data, setData] = useState<GetInfoDonationResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = async (targetPage: number) => {
    setLoading(true)
    setError(false)
    try {
      // No token: this endpoint takes none, and the CloudFront behavior in
      // front of it does not forward Authorization anyway.
      const res = await apiFetch<GetInfoDonationResponse>('info/donation', {
        limit: LIMIT,
        offset: (targetPage - 1) * LIMIT,
      })
      setData(res)
      setPage(targetPage)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1)
  }, [])

  if (loading && data === null) return <LoadingState />
  if (error || data === null)
    return (
      <main className="donation-flow">
        <div className="donation-flow-inner">
          <ErrorState>暫時無法載入公益徵信紀錄，請稍後再試。</ErrorState>
        </div>
      </main>
    )

  const { summary } = data

  return (
    <main className="donation-flow">
      <div className="donation-flow-inner">
        <header className="donation-flow-heading">
          <p className="sp-eyebrow">Learn for Good</p>
          <h1>公益徵信紀錄</h1>
          <p>
            使用者把精靈養到 LV5，就能指定一個公益組織，由平台捐出款項——使用者不需付費。
            這一頁列出所有已完成的撥款，連同匯款證明，任何人都可以核對。
          </p>
        </header>

        <ContentPanel>
          <h2>累計</h2>
          <dl className="donation-impact-summary">
            <div>
              <dt>已完成撥款</dt>
              <dd>NT${formatNumber(summary.transferredAmount)}</dd>
            </div>
            <div>
              <dt>撥款批次</dt>
              <dd>{formatNumber(summary.publishedBatchCount)} 批</dd>
            </div>
            <div>
              <dt>已指定支持對象</dt>
              <dd>
                {formatNumber(summary.confirmedCount)} 筆 · NT$
                {formatNumber(summary.confirmedAmount)}
              </dd>
            </div>
            <div>
              <dt>尚未指定</dt>
              <dd>
                {formatNumber(summary.pendingCount)} 筆 · NT$
                {formatNumber(summary.pendingAmount)}
              </dd>
            </div>
            <div>
              <dt>累計應捐金額</dt>
              <dd>NT${formatNumber(summary.promisedAmount)}</dd>
            </div>
          </dl>
          {/* Spelling out how the promised total is built, because the two
              halves are priced differently: what is already chosen uses the
              amount frozen at that moment, and only the unchosen half is
              valued at today's rate. */}
          <p className="sp-description">
            「累計應捐金額」＝ 已指定的金額（確認當時凍結） ＋ 尚未指定的筆數 × 目前每筆 NT$
            {formatNumber(summary.donationAmount)}。目前共有{' '}
            {formatNumber(summary.maxedSpiritCount)} 隻精靈達到 LV5。
          </p>
        </ContentPanel>

        {data.data.length === 0 ? (
          <EmptyState>
            還沒有已公開的撥款紀錄。平台會定期彙整撥款，完成並取得證明後公布於此。
          </EmptyState>
        ) : (
          <div className="donation-impact-list">
            {data.data.map((batch) => (
              <ContentPanel key={batch.id} className="donation-record-card">
                <header>
                  <h2>
                    {batch.organization.websiteUrl ? (
                      <a
                        className="donation-record-link"
                        href={batch.organization.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {batch.organization.name}{' '}
                        <ExternalLink size={15} aria-hidden="true" />
                      </a>
                    ) : (
                      batch.organization.name
                    )}
                  </h2>
                  <p className="sp-description">{batch.organization.introduction}</p>
                </header>
                <dl>
                  <div>
                    <dt>匯款日期</dt>
                    <dd>{formatDay(batch.transferredAt)}</dd>
                  </div>
                  <div>
                    <dt>使用者指定筆數</dt>
                    <dd>
                      {batch.donationUnitAmount === null
                        ? `${formatNumber(batch.donationCount)} 筆 · 小計 NT$${formatNumber(batch.donationSubtotal)}`
                        : `${formatNumber(batch.donationCount)} 筆 × NT$${formatNumber(batch.donationUnitAmount)} = NT$${formatNumber(batch.donationSubtotal)}`}
                    </dd>
                  </div>
                  <div>
                    <dt>平台加碼</dt>
                    <dd>NT${formatNumber(batch.platformTopUp)}</dd>
                  </div>
                  <div>
                    <dt>實際匯出金額</dt>
                    <dd>
                      <strong>NT${formatNumber(batch.transferredAmount)}</strong>
                    </dd>
                  </div>
                  {batch.reference && (
                    <div>
                      <dt>交易序號</dt>
                      <dd>{batch.reference}</dd>
                    </div>
                  )}
                  <div>
                    <dt>證明文件</dt>
                    <dd>
                      {batch.evidence.length === 0 ? (
                        /* Should not happen: publishing refuses a batch
                           with no evidence. Saying so is better than
                           rendering an empty cell if it ever does. */
                        <span className="donation-record-pending">證明文件整理中</span>
                      ) : (
                        <ul className="donation-impact-evidence">
                          {batch.evidence.map((evidence) => (
                            <li key={evidence.id}>
                              <EvidenceLink evidence={evidence} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                </dl>
              </ContentPanel>
            ))}
          </div>
        )}

        <Pagination page={page} totalPages={data.paginate.totalPages} onChange={load} />

        <ContentPanel>
          <h2>關於這些捐款</h2>
          <p className="sp-description">
            款項全數由平台支付，使用者在培育精靈的過程中不需付費，也不會向使用者募集任何財物。
            因此這些捐款不屬於使用者的捐贈行為，平台不提供捐款收據或稅務抵扣憑證。
            每一筆撥款的受贈單位、金額與證明文件都列在這一頁，金額以實際匯出為準。
          </p>
        </ContentPanel>
      </div>
    </main>
  )
}
