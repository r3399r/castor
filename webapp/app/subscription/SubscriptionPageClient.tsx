'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  BrainCircuit,
  Check,
  Gauge,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import {
  deriveSubscriptionView,
  formatTaiwanDate,
  getSubscriptionPlan,
  subscriptionPlans,
  type SubscriptionPlanCode,
  type SubscriptionView,
} from '@/lib/subscription'
import { Badge, Button, Card, ContentPanel, Modal } from '@/components/ui'
import type { GetSubscriptionHistoryResponse, SubscriptionStatus } from '@/types/api'
import styles from './subscription.module.css'

const benefitSummary = [
  { label: '完整進階學習分析', icon: BarChart3 },
  { label: '訂閱限定精靈', icon: Sparkles },
  { label: '精靈培養 XP 加成', icon: Zap },
]

const analysisFeatures = [
  {
    title: '進步曲線',
    description: '查看整體、各科與各觀念的熟練度如何隨時間改變。',
    icon: TrendingUp,
    iconClass: styles.analysisIconLeaf,
  },
  {
    title: '遺忘風險提示',
    description: '找出可能逐漸遺忘的觀念，並依優先程度安排複習。',
    icon: BrainCircuit,
    iconClass: styles.analysisIconTeal,
  },
  {
    title: '答題速度分析',
    description: '比較各科答題速度與平台中位數，理解自己的作答節奏。',
    icon: Gauge,
    iconClass: styles.analysisIconGold,
  },
]

const faqs = [
  ['訂閱後何時可以使用進階分析？', '付款功能尚未開放，實際啟用時間將於正式上線前確認。'],
  ['原本的學習紀錄會保留嗎？', '會，訂閱不會影響既有的練習紀錄與學習資料。'],
  ['如何管理訂閱？', '取消自動續訂可至個人資料頁處理；恢復續訂與變更計費週期則在本頁操作。相關功能目前尚未開放。'],
  ['10% XP 加成如何計算？', '例如投入 100 積分，訂閱期間精靈可獲得 110 XP。'],
  ['公益類別可以更改嗎？', '限定精靈完成培養後的公益選擇規則仍待確認。'],
]

function CurrentSubscriptionSummary({ view }: { view: SubscriptionView }) {
  if (view.kind === 'active') {
    const plan = getSubscriptionPlan(view.planCode)
    return (
      <div className={styles.currentSummary}>
        <Badge tone="complete">訂閱中</Badge>
        <strong>目前使用：{plan?.name ?? view.planCode}</strong>
        <span>下次扣款日：{formatTaiwanDate(view.entitlementEndsAt)}</span>
      </div>
    )
  }
  if (view.kind === 'scheduled_change') {
    const currentPlan = getSubscriptionPlan(view.planCode)
    const pendingPlan = getSubscriptionPlan(view.pendingPlanCode)
    return (
      <div className={styles.currentSummary}>
        <Badge tone="complete">訂閱中</Badge>
        <strong>目前使用：{currentPlan?.name ?? view.planCode}</strong>
        <span>
          已安排於 {formatTaiwanDate(view.pendingPlanEffectiveAt)} 變更為{' '}
          {pendingPlan?.name ?? view.pendingPlanCode}，屆時扣款 NT${view.pendingPlanAmount.toLocaleString('zh-TW')}。
        </span>
      </div>
    )
  }
  if (view.kind === 'payment_failed') {
    return (
      <div className={styles.currentSummary}>
        <Badge tone="neutral" className={styles.paymentBadge}>付款需要處理</Badge>
        <strong>請至個人資料頁查看目前訂閱狀態。</strong>
      </div>
    )
  }
  return null
}

export default function SubscriptionPageClient() {
  const { user, loading: authLoading } = useAuth()
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanCode>('monthly')
  const [view, setView] = useState<SubscriptionView | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'resume' | 'change' | 'cancel_change' | null>(null)

  const loadStatus = useCallback(async () => {
    if (!user) {
      setView({ kind: 'free', previousExpired: false })
      setStatusError(null)
      return
    }
    setStatusLoading(true)
    setStatusError(null)
    try {
      const [current, history] = await Promise.all([
        apiFetch<SubscriptionStatus>('subscription/me'),
        apiFetch<GetSubscriptionHistoryResponse>('subscription/history'),
      ])
      const nextView = deriveSubscriptionView(current, history)
      setView(nextView)
      if (nextView.kind === 'scheduled_change' && getSubscriptionPlan(nextView.pendingPlanCode))
        setSelectedPlan(nextView.pendingPlanCode as SubscriptionPlanCode)
      else if ('planCode' in nextView && getSubscriptionPlan(nextView.planCode))
        setSelectedPlan(nextView.planCode as SubscriptionPlanCode)
    } catch {
      setView(null)
      setStatusError('無法載入訂閱狀態，請重新載入後再試。')
    } finally {
      setStatusLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!authLoading) loadStatus()
  }, [authLoading, loadStatus])

  const selected = useMemo(
    () => subscriptionPlans.find((plan) => plan.code === selectedPlan) ?? subscriptionPlans[0],
    [selectedPlan],
  )
  const managedSubscription =
    view?.kind === 'active' || view?.kind === 'cancelled' || view?.kind === 'scheduled_change'
  const statePending = authLoading || statusLoading
  const canChoosePlan = !statePending && !statusError && view?.kind !== 'payment_failed'
  const renewalPeriod = selected.code === 'annual' ? '每年' : '每月'
  const currentPlanCode = managedSubscription ? view.planCode : null
  const selectedIsCurrent = selectedPlan === currentPlanCode
  const pendingPlanCode = view?.kind === 'scheduled_change' ? view.pendingPlanCode : null
  const selectedIsPending = selectedPlan === pendingPlanCode
  const actionLabel = view?.kind === 'scheduled_change'
    ? selectedIsPending
      ? '已安排變更'
      : selectedIsCurrent
        ? '取消方案變更'
        : `變更為${selected.name}`
    : view?.kind === 'active'
    ? selectedIsCurrent
      ? '目前使用此方案'
      : `變更為${selected.name}`
    : view?.kind === 'cancelled'
      ? selectedIsCurrent
        ? '恢復自動續訂'
        : `變更為${selected.name}`
      : '開始訂閱（尚未開放）'

  return (
    <>
      <ContentPanel className={styles.planCard}>
        {view && <CurrentSubscriptionSummary view={view} />}
        <section className={styles.benefitSummary} aria-labelledby="benefit-summary-title">
          <h2 id="benefit-summary-title">訂閱包含</h2>
          <ul>
            {benefitSummary.map(({ label, icon: Icon }) => (
              <li key={label}>
                <span aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
                <strong>{label}</strong>
              </li>
            ))}
          </ul>
        </section>

        <div
          className={styles.billingFieldset}
          role="radiogroup"
          aria-label="月繳或年繳方案"
          aria-disabled={!canChoosePlan}
        >
          <div className={styles.planOptions}>
            {subscriptionPlans.map((plan) => {
              const current = managedSubscription && plan.code === currentPlanCode
              const pending = view?.kind === 'scheduled_change' && plan.code === view.pendingPlanCode
              return (
                <label key={plan.code} className={`${styles.planOption} ${current ? styles.currentPlan : ''}`}>
                  <input
                    type="radio"
                    name="billing-period"
                    value={plan.code}
                    checked={selectedPlan === plan.code}
                    disabled={!canChoosePlan}
                    onChange={() => setSelectedPlan(plan.code)}
                  />
                  <span className={styles.radioMark} aria-hidden="true" />
                  <span className={styles.planOptionContent}>
                    <span className={styles.planOptionHeading}>
                      <strong>{plan.name}</strong>
                      <span className={styles.planBadges}>
                        {current && <Badge tone="growth">目前方案</Badge>}
                        {pending && <Badge tone="neutral" className={styles.pendingBadge}>已安排變更</Badge>}
                        {plan.recommended && <Badge tone="complete">推薦</Badge>}
                      </span>
                    </span>
                    <span className={styles.planOptionPrice}>
                      <strong>NT${plan.price.toLocaleString('zh-TW')}</strong>
                      <span>／{plan.periodLabel}</span>
                    </span>
                    <small>{plan.note}</small>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <div className={styles.planAction}>
            {statePending ? (
            <>
              <p role="status">正在載入訂閱狀態…</p>
              <Button className={styles.subscribeButton} size="lg" disabled>
                開始訂閱（尚未開放）
              </Button>
            </>
            ) : statusError ? (
            <div className={styles.statusError} role="alert">
              <span>{statusError}</span>
              <Button variant="secondary" size="sm" onClick={loadStatus}>
                <RefreshCw size={16} aria-hidden="true" />重新載入
              </Button>
            </div>
            ) : view?.kind === 'payment_failed' ? (
            <p>付款狀態需要處理，目前無法開始或變更方案。</p>
            ) : (
            <>
              {view?.kind === 'cancelled' ? (
                <p>選擇方案後將恢復自動續訂；原訂閱權益預計可使用至 {formatTaiwanDate(view.entitlementEndsAt)}。</p>
              ) : (
                <p>{selected.name}將{renewalPeriod}自動續訂；訂閱後可至個人資料頁取消續訂。</p>
              )}
              <Button
                className={styles.subscribeButton}
                size="lg"
                disabled={
                  !managedSubscription ||
                  (view?.kind === 'active' && selectedIsCurrent) ||
                  (view?.kind === 'scheduled_change' && selectedIsPending)
                }
                onClick={() => {
                  if (view?.kind === 'cancelled' && selectedIsCurrent) setDialog('resume')
                  else if (view?.kind === 'scheduled_change' && selectedIsCurrent) setDialog('cancel_change')
                  else if (managedSubscription) setDialog('change')
                }}
              >
                {actionLabel}
              </Button>
              {view?.kind === 'scheduled_change' && (
                <Button variant="secondary" onClick={() => setDialog('cancel_change')}>
                  取消方案變更
                </Button>
              )}
            </>
            )}
        </div>
      </ContentPanel>

      {dialog && managedSubscription && (
        <Modal
          title={dialog === 'resume'
            ? '恢復自動續訂？'
            : dialog === 'cancel_change'
              ? '取消方案變更？'
              : `變更為${selected.name}？`}
          onClose={() => setDialog(null)}
        >
          <p className={styles.dialogCopy}>
            {dialog === 'resume' ? (
              <>恢復後將於 {formatTaiwanDate(view.entitlementEndsAt)} 以 {selected.name}扣款 NT${selected.price.toLocaleString('zh-TW')}，之後{renewalPeriod}自動續訂。本次不會立即扣款。</>
            ) : dialog === 'cancel_change' && view.kind === 'scheduled_change' ? (
              <>取消後將維持 {getSubscriptionPlan(view.planCode)?.name ?? view.planCode}，並於 {formatTaiwanDate(view.entitlementEndsAt)} 按原方案自動續訂。</>
            ) : (
              <>目前方案可使用至 {formatTaiwanDate(view.entitlementEndsAt)}。{selected.name}將於本期結束後生效，屆時扣款 NT${selected.price.toLocaleString('zh-TW')}，之後{renewalPeriod}自動續訂。本次不會立即扣款。{view.kind === 'cancelled' ? '確認後將恢復自動續訂。' : ''}</>
            )}
          </p>
          <div className={styles.managementNotice} role="note">
            訂閱付款與方案管理 API 尚未串接，目前不能送出這項變更。
          </div>
          <div className="sp-dialog-actions">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {dialog === 'resume'
                ? '暫不恢復'
                : dialog === 'cancel_change'
                  ? '保留變更'
                  : '暫不變更'}
            </Button>
            <Button disabled>
              {dialog === 'resume' ? '確認恢復' : dialog === 'cancel_change' ? '確認取消變更' : '確認變更'}
            </Button>
          </div>
        </Modal>
      )}

      <section className={styles.section} aria-labelledby="analysis-title">
        <div className={styles.sectionHeading}><h2 id="analysis-title">從練習紀錄找到下一步</h2></div>
        <div className={styles.analysisGrid}>
          {analysisFeatures.map(({ title, description, icon: Icon, iconClass }) => (
            <Card key={title} className={styles.analysisCard}>
              <span className={`${styles.analysisIcon} ${iconClass}`} aria-hidden="true">
                <Icon size={22} strokeWidth={1.8} />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.spiritSection}`} aria-labelledby="spirit-title">
        <div className={styles.spiritCopy}>
          <div className={styles.sectionHeading}><h2 id="spirit-title">培養專屬於訂閱方案的精靈</h2></div>
          <p>訂閱期間可在蛋商店取得限定的蛋。培養完成後，可依正式規則選擇希望支持的公益類別。</p>
          <ul className={styles.checkList}>
            <li><Check size={18} aria-hidden="true" />訂閱限定的精靈與成長階段</li>
            <li><Check size={18} aria-hidden="true" />不預先綁定單一公益類別</li>
            <li><Check size={18} aria-hidden="true" />完成培養後選擇支持方向</li>
          </ul>
        </div>
        <div className={styles.spiritImageFrame}>
          <img
            src="/illustrations/subscription/vip-egg.webp"
            alt="金色緞帶與星光圍繞的訂閱限定精靈蛋"
            width={1254}
            height={1254}
          />
        </div>
        <div className={styles.spiritBonus}>
          <div>
            <h3>投入積分時，額外獲得 10% XP</h3>
            <p>例如投入 100 積分，精靈可獲得 110 XP。加成不影響題目分數或學習統計。</p>
          </div>
          <strong className={styles.bonusValue}>+10%</strong>
        </div>
      </section>

      <section className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-title">
        <div className={styles.sectionHeading}><h2 id="faq-title">關於訂閱方案</h2></div>
        <div className={styles.faqList}>
          {faqs.map(([question, answer]) => (
            <details key={question} className={styles.faqItem}>
              <summary>{question}</summary><p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}
