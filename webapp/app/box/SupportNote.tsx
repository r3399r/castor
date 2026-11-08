'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Sprout } from 'lucide-react'
import { ContentPanel } from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { formatNumber } from '@/lib/number'
import type { GetInfoDonationResponse } from '@/types/api'

/**
 * The panel that explains the second half of "Learn for Good".
 *
 * The amount is read from the API, not written here. It used to be a
 * hardcoded `NT$10`, which went stale the moment the backend's
 * DONATION_AMOUNT moved -- and a figure quoted next to a promise is the
 * worst place to keep a second copy of it. `/api/info/donation` is the
 * public endpoint, so this works whether or not the request is signed in,
 * and the number it reports is the same one POST /api/donation would
 * freeze into a new row.
 *
 * Nothing is rendered in place of the amount while it loads, rather than a
 * placeholder figure: a wrong number here reads as a commitment.
 */
export default function SupportNote() {
  const [amount, setAmount] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        // limit=1 because only `summary` is wanted; the batch list on this
        // response is what the public page is for.
        const res = await apiFetch<GetInfoDonationResponse>('info/donation', { limit: 1 })
        setAmount(res.summary.donationAmount)
      } catch {
        // Left null: the panel still explains the mechanism, it just does
        // not quote a figure it could not confirm.
      }
    }
    load()
  }, [])

  return (
    <ContentPanel className="sp-support">
      <div className="sp-support-summary">
        <div className="sp-support-copy">
          {/* The brand line verbatim -- this section is where the name's
              second half is actually explained. */}
          <p className="sp-support-eyebrow">Learn for Good</p>
          <h2>讓學習成果，成為一份真實的支持</h2>
          <p>
            每完成一隻精靈的最高階段，平台就會提撥資金，支持與精靈主題相關的公益機構。
          </p>
          <p>
            <a
              className="donation-record-link"
              href="/impact/"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看公開徵信紀錄 <ExternalLink size={14} aria-hidden="true" />
            </a>
          </p>
        </div>
        <div
          className="sp-support-result"
          aria-label={
            amount === null ? '完成 LV5，平台提撥' : `完成 LV5，平台提撥新台幣 ${amount} 元`
          }
        >
          <Sprout size={22} aria-hidden="true" />
          <span>完成 LV5</span>
          <span>平台提撥</span>
          <strong>{amount === null ? 'NT$—' : `NT$${formatNumber(amount)}`}</strong>
        </div>
      </div>
      <div className="sp-support-rules">
        <p>
          實際受贈機構、捐款時間與執行方式，將依當期公益計畫及合作條件為準。
          平台會定期彙整撥款，完成並取得證明文件後公布於公開徵信頁。
          本活動中的積分與培育行為不等同於使用者直接捐款，亦不提供捐款收據或稅務抵扣憑證。
          每筆提撥金額以確認支持對象的當下為準，後續調整不影響已確認的紀錄。
        </p>
      </div>
    </ContentPanel>
  )
}
