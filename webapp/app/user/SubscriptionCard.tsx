'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatNumber } from '@/lib/number'
import { CreditCard, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api'
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

type ManagementDialog = 'cancel'

function PlanLine({ planCode }: { planCode: string }) {
  const plan = getSubscriptionPlan(planCode)
  return (
    <p className={styles.subscriptionPlan}>
      {plan ? `${plan.name} · ${formatPlanPrice(plan)}` : `目前方案 · ${planCode}`}
    </p>
  )
}

function SubscriptionDetails({ view }: { view: SubscriptionView }) {
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
    const renewalPeriod = plan?.code === 'annual' ? '每年' : '每月'
    return (
      <>
        <Badge tone="complete" className={styles.subscriptionBadge}>訂閱中</Badge>
        <PlanLine planCode={view.planCode} />
        <p className={styles.subscriptionMeta}>
          本方案將{renewalPeriod}自動續訂，下一次扣款日為{' '}
          {formatTaiwanDate(view.entitlementEndsAt)}。
        </p>
      </>
    )
  }

  if (view.kind === 'scheduled_change') {
    const pendingPlan = getSubscriptionPlan(view.pendingPlanCode)
    return (
      <>
        <Badge tone="complete" className={styles.subscriptionBadge}>訂閱中</Badge>
        <PlanLine planCode={view.planCode} />
        <p className={styles.subscriptionMeta}>
          將於 {formatTaiwanDate(view.pendingPlanEffectiveAt)} 變更為{' '}
          {pendingPlan?.name ?? view.pendingPlanCode}，扣款 NT${formatNumber(view.pendingPlanAmount)}。
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
        <PlanLine planCode={view.planCode} />
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
        <PlanLine planCode={view.planCode} />
        <p className={styles.subscriptionDescription}>
          續訂付款未完成。目前沒有可用的付款管理入口，訂閱權益依後端狀態為準。
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
  const [dialog, setDialog] = useState<ManagementDialog | null>(null)

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

  const active = view?.kind === 'active' || view?.kind === 'scheduled_change'
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
            <SubscriptionDetails view={view} />
          ) : null}
        </div>
      </div>

      {!loading && !error && view && (
        <div className={styles.subscriptionActions}>
          {free && <ButtonLink href="/subscription">查看訂閱方案</ButtonLink>}
          {active && (
            <>
              <ButtonLink href="/subscription">
                {view.kind === 'scheduled_change' ? '查看／變更方案' : '變更訂閱方案'}
              </ButtonLink>
              <Button
                variant="secondary"
                className={styles.cancelSubscriptionButton}
                onClick={() => setDialog('cancel')}
              >
                取消續訂
              </Button>
            </>
          )}
          {cancelled && (
            <ButtonLink href="/subscription">查看訂閱方案</ButtonLink>
          )}
          {paymentFailed && (
            <>
              <Button disabled>更新付款方式（尚未開放）</Button>
              <ButtonLink href="/subscription" variant="secondary">查看方案</ButtonLink>
            </>
          )}
        </div>
      )}

      {dialog && view && (view.kind === 'active' || view.kind === 'scheduled_change') && (
        <Modal
          title="取消續訂？"
          onClose={() => setDialog(null)}
        >
          <p className={styles.dialogCopy}>
            取消後將不再自動扣款，並預計可使用訂閱功能至{' '}
            {formatTaiwanDate(view.entitlementEndsAt)}。
            {view.kind === 'scheduled_change' ? '已安排的方案變更也會一併取消。' : ''}
            目前線上取消功能尚未開放，無法在此變更訂閱狀態。
          </p>
          <div className={styles.managementNotice} role="note">
            訂閱管理 API 尚未串接，這個視窗目前僅供確認流程與文案。
          </div>
          <div className="sp-dialog-actions">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              維持訂閱
            </Button>
            <Button variant="danger" disabled>
              確認取消續訂
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}
