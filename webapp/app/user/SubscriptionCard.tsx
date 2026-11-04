'use client'

import { useCallback, useEffect, useState } from 'react'
import { CreditCard, RefreshCw } from 'lucide-react'
import { apiFetch, apiPost } from '@/lib/api'
import { usePlanAmounts, type PlanAmounts } from '@/hooks/usePlanAmounts'
import {
  deriveSubscriptionView,
  formatPlanPrice,
  formatTaiwanDate,
  getSubscriptionPlan,
  type SubscriptionView,
} from '@/lib/subscription'
import {
  Badge,
  Button,
  ButtonLink,
  ErrorState,
  Modal,
} from '@/components/ui'
import type {
  GetSubscriptionHistoryResponse,
  SubscriptionStatus,
} from '@/types/api'
import styles from './user.module.css'

function PlanLine({ planCode, amounts }: { planCode: string; amounts: PlanAmounts | null }) {
  const plan = getSubscriptionPlan(planCode)
  return (
    <p className={styles.subscriptionPlan}>
      {plan ? `${plan.name} · ${formatPlanPrice(plan, amounts?.[plan.code])}` : `目前方案 · ${planCode}`}
    </p>
  )
}

function SubscriptionDetails({
  view,
  amounts,
}: {
  view: SubscriptionView
  amounts: PlanAmounts | null
}) {
  if (view.kind === 'free') {
    return (
      <>
        <Badge tone="neutral" className={styles.subscriptionBadge}>免費會員</Badge>
        <p className={styles.subscriptionDescription}>
          目前未訂閱。訂閱後可解鎖完整功能。
        </p>
      </>
    )
  }

  if (view.kind === 'active') {
    const plan = getSubscriptionPlan(view.planCode)
    return (
      <>
        <Badge tone="complete" className={styles.subscriptionBadge}>訂閱中</Badge>
        <PlanLine planCode={view.planCode} amounts={amounts} />
        <p className={styles.subscriptionMeta}>
          本方案將{plan?.renewalLabel ?? '每月'}自動續訂，下一次扣款日約為{' '}
          {formatTaiwanDate(view.entitlementEndsAt)}。
        </p>
      </>
    )
  }

  if (view.kind === 'cancelled') {
    return (
      <>
        <Badge tone="neutral" className={`${styles.subscriptionBadge} ${styles.cancelledBadge}`}>
          已取消續訂
        </Badge>
        <PlanLine planCode={view.planCode} amounts={amounts} />
        <p className={styles.subscriptionMeta}>
          訂閱權益可使用至：{formatTaiwanDate(view.entitlementEndsAt)}。到期後恢復免費會員，不再自動扣款。
        </p>
      </>
    )
  }

  if (view.kind === 'payment_failed') {
    return (
      <>
        <Badge tone="neutral" className={`${styles.subscriptionBadge} ${styles.paymentBadge}`}>
          付款需要處理
        </Badge>
        <PlanLine planCode={view.planCode} amounts={amounts} />
        <p className={styles.subscriptionDescription}>
          續訂付款未完成。可至訂閱頁重新建立訂閱，訂閱權益依後端狀態為準。
        </p>
      </>
    )
  }

  return (
    <>
      <Badge tone="neutral" className={styles.subscriptionBadge}>免費會員</Badge>
      <p className={styles.subscriptionDescription}>目前未訂閱。訂閱後可解鎖完整功能。</p>
    </>
  )
}

export default function SubscriptionCard() {
  const [view, setView] = useState<SubscriptionView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const { amounts } = usePlanAmounts()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [current, history] = await Promise.all([
        apiFetch<SubscriptionStatus>('subscription/me'),
        apiFetch<GetSubscriptionHistoryResponse>('subscription/history'),
      ])
      setView(deriveSubscriptionView(current, history))
    } catch {
      setError('無法載入訂閱資料，請稍後再試。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /**
   * Turns auto-renew off. Access is not revoked -- the period already
   * paid for runs to its end -- but it cannot be undone at the provider,
   * so resubscribing later is a fresh agreement charged on the spot.
   *
   * The cancel and the refresh are deliberately separate try blocks: a
   * failed refresh after a successful cancel must not be reported as a
   * failed cancel, or the user retries something that already happened.
   */
  const cancel = useCallback(async () => {
    setCancelling(true)
    setCancelError(null)
    try {
      await apiPost('subscription/cancel', {})
    } catch {
      setCancelling(false)
      setCancelError('取消失敗，請稍後再試。若狀況持續，請與我們聯絡。')
      return
    }
    setConfirming(false)
    try {
      await load()
    } catch {
      setError('已取消續訂，但畫面上的狀態可能不是最新的，請重新載入。')
    } finally {
      setCancelling(false)
    }
  }, [load])

  const active = view?.kind === 'active'
  const cancelled = view?.kind === 'cancelled'
  const free = view?.kind === 'free' || view?.kind === 'expired'
  const paymentFailed = view?.kind === 'payment_failed'

  return (
    <section id="subscription" className={`${styles.card} ${styles.subscriptionCard}`}>
      <div className={styles.subscriptionInfo}>
        <span className={styles.subscriptionIcon} aria-hidden="true">
          <CreditCard size={24} strokeWidth={1.8} />
        </span>
        <div className={styles.subscriptionCopy}>
          <h2>訂閱狀態</h2>
          {loading ? (
            <div className={styles.subscriptionSkeleton} role="status" aria-label="載入訂閱資料">
              <span />
              <span />
            </div>
          ) : error ? (
            <ErrorState className={styles.subscriptionError}>
              <p>{error}</p>
              <Button variant="secondary" size="sm" onClick={load}>
                <RefreshCw size={16} aria-hidden="true" />
                重新載入
              </Button>
            </ErrorState>
          ) : view ? (
            <SubscriptionDetails view={view} amounts={amounts} />
          ) : null}
        </div>
      </div>

      {!loading && !error && view && (
        <div className={styles.subscriptionActions}>
          {free && <ButtonLink href="/subscription">查看訂閱方案</ButtonLink>}
          {active && (
            <>
              <ButtonLink href="/subscription">變更訂閱方案</ButtonLink>
              <Button
                variant="secondary"
                className={styles.cancelSubscriptionButton}
                onClick={() => setConfirming(true)}
              >
                取消續訂
              </Button>
            </>
          )}
          {cancelled && (
            <ButtonLink href="/subscription">重新訂閱</ButtonLink>
          )}
          {paymentFailed && (
            <ButtonLink href="/subscription">重新建立訂閱</ButtonLink>
          )}
        </div>
      )}

      {confirming && view?.kind === 'active' && (
        <Modal title="取消續訂？" onClose={() => (cancelling ? undefined : setConfirming(false))}>
          <p className={styles.dialogCopy}>
            取消後不會再自動扣款，訂閱功能仍可使用至{' '}
            {formatTaiwanDate(view.entitlementEndsAt)}。
          </p>
          {/*
            Not a scare notice but a fact about the provider: ECPay
            cannot re-enable a cancelled agreement, so "undo" means
            buying again, and that charges immediately.
          */}
          <div className={styles.managementNotice} role="note">
            取消後無法直接恢復。若之後想繼續訂閱，需要重新刷卡建立新的訂閱，並於當下扣款；不過新的訂閱期間會接在上述日期之後，已付的天數不會損失。
          </div>
          {cancelError && <p role="alert">{cancelError}</p>}
          <div className="sp-dialog-actions">
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={cancelling}>
              維持訂閱
            </Button>
            <Button variant="danger" onClick={cancel} disabled={cancelling}>
              {cancelling ? '處理中…' : '確認取消續訂'}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}
