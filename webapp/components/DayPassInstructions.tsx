'use client'

import { Clock, Copy } from 'lucide-react'
import { useState } from 'react'
import { ButtonLink, ContentPanel } from '@/components/ui'
import { formatNumber } from '@/lib/number'
import { getSubscriptionPlan } from '@/lib/subscription'
import type { DayPassPurchase } from '@/types/api'

/**
 * What to pay, and where.
 *
 * This is the whole reason the ATM and convenience-store methods can be
 * offered at all: ECPay issues a number and the money arrives whenever
 * the person gets round to paying it, so the number has to survive the
 * page that first showed it. It is rendered from our own API rather than
 * from anything ECPay passes through the browser, which also means it
 * works days later and on another device.
 */

const DEADLINE_FORMAT = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const formatDeadline = (value: string | null) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : DEADLINE_FORMAT.format(date)
}

/** A number the user has to retype into an ATM or read to a clerk. */
function CopyableNumber({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="daypass-number">
      <span className="daypass-number__label">{label}</span>
      {/* Spaced in groups so it can be read aloud and checked by eye.
          The copy button carries the unspaced value, because that is
          what an ATM accepts. */}
      <strong className="daypass-number__value">{value}</strong>
      <button
        type="button"
        className="daypass-number__copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            // No clipboard permission, or an insecure context. The number
            // is on screen either way, so this is a convenience and not
            // worth an error message.
          }
        }}
        aria-label={`複製${label}`}
      >
        <Copy size={14} aria-hidden="true" />
        {copied ? '已複製' : '複製'}
      </button>
    </div>
  )
}

/**
 * `showActions` is false where this panel is not the whole screen --
 * on the profile page it sits under the subscription card, where a
 * "個人資料頁" button would link to the page it is already on.
 */
export default function DayPassInstructions({
  purchase,
  showActions = true,
  className = '',
}: {
  purchase: DayPassPurchase
  showActions?: boolean
  className?: string
}) {
  const plan = getSubscriptionPlan(purchase.plan)
  const deadline = formatDeadline(purchase.expireAt)

  return (
    <ContentPanel className={`daypass-instructions ${className}`}>
      <p role="status">
        <Clock size={18} aria-hidden="true" /> 已取得繳費資訊，尚未完成付款。
      </p>
      <p>
        {plan?.name ?? purchase.plan} · NT${formatNumber(purchase.amount)}
        {/* The days are stated here because they are what was bought, and
            because they start counting from payment rather than from now. */}
        （繳費完成後開通 {purchase.days} 天）
      </p>

      {purchase.choosePayment === 'ATM' && purchase.vAccount && (
        <>
          <CopyableNumber label="銀行代碼" value={purchase.bankCode ?? ''} />
          <CopyableNumber label="虛擬帳號" value={purchase.vAccount} />
          <p className="sp-description">
            可用網路銀行或實體 ATM 轉帳。這組帳號只對這一筆付款有效，金額必須完全相同。
          </p>
        </>
      )}

      {purchase.choosePayment === 'CVS' && purchase.paymentNo && (
        <>
          <CopyableNumber label="繳費代碼" value={purchase.paymentNo} />
          <p className="sp-description">
            到 7-ELEVEN、全家、萊爾富或 OK 的櫃台出示代碼繳費。
          </p>
        </>
      )}

      {purchase.choosePayment === 'BARCODE' && purchase.barcode1 && (
        <>
          <CopyableNumber label="條碼一" value={purchase.barcode1} />
          <CopyableNumber label="條碼二" value={purchase.barcode2 ?? ''} />
          <CopyableNumber label="條碼三" value={purchase.barcode3 ?? ''} />
          {/* ECPay returns the digits only, not a barcode image, and
              turning them into a scannable Code39 is the client's job --
              not done here, so the store keys them in instead. */}
          <p className="sp-description">
            到超商櫃台請店員以這三段號碼繳費。
          </p>
        </>
      )}

      {deadline && (
        <p className="donation-final-warning">
          請在 {deadline} 前完成繳費，逾期這組號碼就會失效，需要重新購買。
        </p>
      )}

      <p className="sp-description">
        繳費後開通需要幾分鐘到幾小時
        {showActions && '，不需要再回到這個頁面。這組號碼隨時可以在個人資料頁再次查看'}。
      </p>

      {showActions && (
        <div className="sp-dialog-actions">
          <ButtonLink href="/user">個人資料頁</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            先去練習
          </ButtonLink>
        </div>
      )}
    </ContentPanel>
  )
}
