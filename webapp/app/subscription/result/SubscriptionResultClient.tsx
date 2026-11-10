'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import { formatTaiwanDate, getSubscriptionPlan } from '@/lib/subscription'
import { Button, ButtonLink, ContentPanel } from '@/components/ui'
import DayPassInstructions from '@/components/DayPassInstructions'
import type {
  DayPassPurchase,
  GetPaymentPurchasesResponse,
  SubscriptionStatus,
} from '@/types/api'
import styles from '../subscription.module.css'

/**
 * How long to keep asking whether the payment landed.
 *
 * ECPay sends the browser back and notifies our server separately, and
 * the two races: the redirect usually wins. So "not subscribed" a moment
 * after paying is the normal case, not an error, and the page waits
 * rather than announcing a failure it cannot know about. Giving up only
 * stops the polling -- it never claims the payment failed, because from
 * here that is indistinguishable from a slow webhook.
 */
const POLL_ATTEMPTS = 12
const POLL_INTERVAL_MS = 1500

type Outcome =
  | { kind: 'waiting' }
  | { kind: 'active'; plan: string | null; expiresAt: string | null }
  /**
   * A day pass whose code has been issued and not yet paid. A terminal
   * state for this page: nothing is coming for hours or days, so polling
   * would only burn requests and end on a timeout message that reads as
   * a failure.
   */
  | { kind: 'awaiting'; purchase: DayPassPurchase }
  | { kind: 'timeout' }

/**
 * The newest day-pass purchase still waiting to be paid, if any.
 *
 * Checked before the subscription poll because for ATM and store
 * payments that poll can only ever time out -- the money has not moved,
 * and "尚未收到付款結果" is the wrong thing to tell somebody who has not
 * been to the counter yet.
 *
 * `created` counts as waiting too: ECPay posts the code to our server a
 * moment after the order, so this is the gap between the redirect and
 * that notification, and the right answer is to look again rather than
 * to conclude anything.
 */
const findUnpaidPass = (purchases: DayPassPurchase[]): DayPassPurchase | undefined =>
  purchases.find(
    (purchase) =>
      purchase.choosePayment !== 'Credit' &&
      (purchase.status === 'awaiting' || purchase.status === 'created')
  )

export default function SubscriptionResultClient() {
  const { user, loading: authLoading, refreshSubscription } = useAuth()
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'waiting' })
  // Survives re-renders so a retry does not race the previous run.
  const runRef = useRef(0)

  const poll = useCallback(async () => {
    const run = runRef.current + 1
    runRef.current = run
    setOutcome({ kind: 'waiting' })

    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      if (runRef.current !== run) return
      try {
        const status = await apiFetch<SubscriptionStatus>('subscription/me')
        if (status?.active) {
          if (runRef.current !== run) return
          setOutcome({ kind: 'active', plan: status.plan, expiresAt: status.expiresAt })
          // So every gated block elsewhere stops showing its locked
          // state without the user having to reload the site.
          await refreshSubscription()
          return
        }

        // Not subscribed yet -- which for a counter or transfer payment
        // is simply the truth, and will stay true until they go and pay.
        // Showing them the number beats telling them nothing arrived.
        const purchases = await apiFetch<GetPaymentPurchasesResponse>('payment/purchases')
        const unpaid = findUnpaidPass(purchases?.data ?? [])
        // Only once the code exists: a `created` row has nothing to show
        // yet, so the loop keeps waiting for ECPay to issue one.
        if (unpaid !== undefined && unpaid.status === 'awaiting') {
          if (runRef.current !== run) return
          setOutcome({ kind: 'awaiting', purchase: unpaid })
          return
        }
      } catch {
        // Keep polling: one failed read says nothing about the payment.
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    if (runRef.current === run) setOutcome({ kind: 'timeout' })
  }, [refreshSubscription])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setOutcome({ kind: 'timeout' })
      return
    }
    poll()
    return () => {
      // Abandons the in-flight run rather than letting it write state
      // into an unmounted page.
      runRef.current += 1
    }
  }, [authLoading, user, poll])

  if (authLoading || outcome.kind === 'waiting') {
    return (
      <ContentPanel className={styles.planCard}>
        <p role="status">
          <Clock size={18} aria-hidden="true" /> 正在確認付款結果，請稍候…
        </p>
        <p>這個頁面會自動更新，請不要關閉或重新整理。</p>
      </ContentPanel>
    )
  }

  if (outcome.kind === 'awaiting') return <DayPassInstructions purchase={outcome.purchase} />

  if (outcome.kind === 'active') {
    const plan = getSubscriptionPlan(outcome.plan)
    return (
      <ContentPanel className={styles.planCard}>
        <p role="status">
          <CheckCircle2 size={18} aria-hidden="true" /> 訂閱已開通，謝謝你的支持。
        </p>
        <p>
          目前方案：{plan?.name ?? outcome.plan ?? '訂閱方案'}
          {outcome.expiresAt && <>，本期可使用至 {formatTaiwanDate(outcome.expiresAt)}。</>}
        </p>
        <div className="sp-dialog-actions">
          <ButtonLink href="/analysis">看看進階學習分析</ButtonLink>
          <ButtonLink href="/user" variant="secondary">管理訂閱</ButtonLink>
        </div>
      </ContentPanel>
    )
  }

  return (
    <ContentPanel className={styles.planCard}>
      <p role="status">尚未收到付款結果。</p>
      <p>如果你已經完成刷卡，款項通常會在幾分鐘內確認，可以稍後再回到個人資料頁查看；若你在付款頁面取消，則不會有任何扣款。</p>
      <div className="sp-dialog-actions">
        <Button variant="secondary" onClick={poll}>
          <RefreshCw size={16} aria-hidden="true" />再確認一次
        </Button>
        <ButtonLink href="/subscription" variant="secondary">回到訂閱方案</ButtonLink>
      </div>
    </ContentPanel>
  )
}
