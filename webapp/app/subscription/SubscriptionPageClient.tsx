'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatNumber } from '@/lib/number'
import {
  BrainCircuit,
  Check,
  Gauge,
  NotebookPen,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePlanAmounts } from '@/hooks/usePlanAmounts'
import { useGrowthBonus } from '@/hooks/useGrowthBonus'
import { investmentXp } from '@/lib/invest'
import { ApiError, apiFetch, apiPost } from '@/lib/api'
import { submitCheckout } from '@/lib/checkout'
import {
  planOffer,
  dayPassPaymentMethods,
  deriveSubscriptionView,
  formatPlanPrice,
  formatTaiwanDate,
  getSubscriptionPlan,
  subscriptionPlans,
  type DayPassPaymentMethod,
  type SubscriptionPlanCode,
  type SubscriptionView,
} from '@/lib/subscription'
import { Badge, Button, Card, ContentPanel, Modal } from '@/components/ui'
import type {
  GetSubscriptionHistoryResponse,
  PostPaymentCheckoutResponse,
  SubscriptionStatus,
} from '@/types/api'
import { benefitSummary } from './benefits'
import styles from './subscription.module.css'

/**
 * What to say when the server refuses a checkout.
 *
 * `planOffer` already hides the buttons the server would refuse, so this
 * is not a second copy of that rule but the other half of it: the codes
 * here are the ones the page cannot predict from its own state.
 *
 * PENDING_DAY_PASS is why it exists. An unpaid day-pass slip is invisible
 * to this page -- it would have to fetch the purchase list to know -- so
 * a user holding one was told to try again later, advice that came true
 * only once the slip expired, and never at all while a `created` row
 * could not expire.
 */
const CHECKOUT_ERRORS: Record<string, string | undefined> = {
  ALREADY_SUBSCRIBED: '你已經在使用這個方案了。',
  PENDING_DAY_PASS:
    '你有一筆天數方案的款項還沒付完。請先完成付款，或等繳費期限過了再訂閱。',
  ALREADY_ENTITLED: '你目前的付費期間還沒結束，到期後才能開始自動續訂。',
  CANCEL_AUTORENEW_FIRST: '請先關閉自動續訂，再購買天數方案。',
  PAYMENT_METHOD_REQUIRED: '請先選擇付款方式。',
}

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
  {
    title: '錯題筆記',
    description: '在錯題本的每一題寫下自己錯在哪裡，下次複習時先看自己的提醒。',
    icon: NotebookPen,
    iconClass: styles.analysisIconClay,
  },
]

/**
 * Takes the rate rather than writing it down.
 *
 * The XP-bonus entry both asks about the rate and answers with a worked
 * example, so it was two more places a number could advertise something
 * the server does not grant. It is dropped entirely until the rate
 * arrives: a question about a rate reads as nonsense with a placeholder
 * in it, and unlike the benefit section, no part of this list is what the
 * page is for.
 */
const faqsFor = (bonusPercent: number | null): [string, string][] => [
  ['訂閱後何時可以使用進階分析？', '刷卡完成、收到綠界的付款結果後就會開通，通常是幾秒內。若畫面尚未更新，重新整理即可。'],
  ['可以用什麼方式付款？', '目前只支援信用卡。自動續訂是透過綠界的信用卡定期定額，刷一次卡之後由綠界按週期扣款，不支援銀聯卡。'],
  ['可以同時有月繳訂閱和天數型方案嗎？', '不行，一次只會有一種。月繳訂閱期間無法加購天數型方案；想改用天數型，請先到個人資料頁取消自動續訂，已付費的天數不會損失，取消後購買的天數會接在到期日之後。'],
  ['持有天數型方案期間，可以改訂月繳嗎？', '要等天數用完才能開始月繳訂閱。這段期間可以直接加購天數型方案，新購的天數會接在目前的到期日之後，不會浪費。'],
  ['原本的學習紀錄會保留嗎？', '會，訂閱不會影響既有的練習紀錄與學習資料。'],
  ['如何取消訂閱？', '到個人資料頁點「取消續訂」即可。取消後不再扣款，但已付費的這一期仍可使用到期末。'],
  ['取消後想再訂閱呢？', '可以隨時恢復自動續訂。綠界無法重啟已取消的合約，所以會是一份全新的訂閱，需要重新刷卡且當下就會扣款；新的訂閱期間會接在原本已付費的期間之後開始，不會浪費你已付的天數。'],
  ['中途換方案會怎麼計費？', '會立即停止原本的自動續訂、重新刷卡，新方案當下就扣款；新的訂閱期間一樣接在目前期間結束後才開始。'],
  ...(bonusPercent === null
    ? []
    : [
        [
          `${bonusPercent}% XP 加成如何計算？`,
          `例如投入 100 積分，訂閱期間精靈可獲得 ${formatNumber(
            investmentXp(100, bonusPercent)
          )} XP。`,
        ] as [string, string],
      ]),
  ['公益類別可以更改嗎？', '限定精靈完成培養後的公益選擇規則仍待確認。'],
]

function CurrentSubscriptionSummary({ view }: { view: SubscriptionView }) {
  if (view.kind === 'active') {
    const plan = getSubscriptionPlan(view.planCode)
    return (
      <div className={styles.currentSummary}>
        <Badge tone="complete">訂閱中</Badge>
        <strong>目前使用：{plan?.name ?? view.planCode}</strong>
        {/* nextChargeAt, never entitlementEndsAt: the latter carries the
            renewal grace, so it is three days past any charge. */}
        <span>
          {view.nextChargeAt === null
            ? `可使用至 ${formatTaiwanDate(view.entitlementEndsAt)}`
            : `下次扣款日：${formatTaiwanDate(view.nextChargeAt)}`}
        </span>
      </div>
    )
  }
  if (view.kind === 'cancelled') {
    const plan = getSubscriptionPlan(view.planCode)
    return (
      <div className={styles.currentSummary}>
        <Badge tone="neutral">已取消續訂</Badge>
        <strong>目前使用：{plan?.name ?? view.planCode}</strong>
        <span>可使用至 {formatTaiwanDate(view.entitlementEndsAt)}，不會再自動扣款。</span>
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
  // Only sent for a day pass. The recurring plan takes none -- ECPay's
  // 定期定額 is credit-card only, which is the reason the passes exist.
  const [selectedMethod, setSelectedMethod] = useState<DayPassPaymentMethod>('Credit')
  const [view, setView] = useState<SubscriptionView | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  // Only one confirmation exists now, and it guards the one irreversible
  // step: starting a new agreement stops the current one for good.
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { amounts, failed: amountsFailed } = usePlanAmounts()

  /**
   * The plans this page offers: the ones the server says it sells.
   *
   * `subscriptionPlans` holds how a plan *reads* -- its name, period
   * label and note, which are Chinese copy and belong here. What it must
   * not be is a second opinion on which plans exist, and that is what
   * this filter removes. The server decides:
   *
   *   offered there, unknown here  -- no card. Someone has to write the
   *     copy; until they do, nothing is shown rather than something
   *     unlabelled. (`testDaily`, offered only while ECPAY_MODE is not
   *     'production', reaches the page exactly this way -- with no flag
   *     of its own on this side, so the two cannot disagree.)
   *   known here, not offered there -- no card either. This is the
   *     direction that used to bite: a retired plan left a card with no
   *     price and a button that could never be pressed, because
   *     `canSubscribe` needs an amount the server never sent.
   *
   * Until `amounts` arrives everything renders, priceless and on
   * purpose: filtering during the load would blank the page on every
   * visit. A failed fetch leaves `amounts` null, so the cards stay up
   * unbuyable beside the price warning, which is the existing behaviour.
   */
  const plans = useMemo(
    () =>
      amounts === null
        ? subscriptionPlans
        : subscriptionPlans.filter((plan) => amounts[plan.code] !== undefined),
    [amounts],
  )
  const { bonusPercent, failed: bonusFailed } = useGrowthBonus()

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
      if ('planCode' in nextView && getSubscriptionPlan(nextView.planCode))
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
    () => plans.find((plan) => plan.code === selectedPlan) ?? plans[0],
    [plans, selectedPlan],
  )
  const managedSubscription = view?.kind === 'active' || view?.kind === 'cancelled'
  const statePending = authLoading || statusLoading
  const canChoosePlan = !statePending && !statusError && view?.kind !== 'payment_failed'
  const currentPlanCode = managedSubscription ? view.planCode : null
  const selectedIsCurrent = selectedPlan === currentPlanCode
  const selectedAmount = amounts?.[selected.code] ?? null

  // One kind of paid access at a time, decided per plan by the same
  // rule the server enforces -- see planOffer. null while the state is
  // still loading, which is not the same as "refused".
  const offers = useMemo(
    () =>
      view === null
        ? null
        : new Map(plans.map((plan) => [plan.code, planOffer(view, plan)])),
    [plans, view],
  )
  const offer = offers?.get(selected.code) ?? null
  // The day paid access runs out, for the three views that have one.
  // Narrowed here rather than inside the JSX, where the compiler cannot
  // see that `resume` implies one of those views.
  const entitlementEndsAt =
    view?.kind === 'active' || view?.kind === 'cancelled' || view?.kind === 'unmanaged'
      ? view.entitlementEndsAt
      : null

  // The default selection is the monthly plan, which a pass holder is
  // not allowed to buy. Landing on a disabled card with a disabled
  // button reads as a broken page, so move to the first plan that is
  // actually on offer once the state is known.
  useEffect(() => {
    if (offers === null || offers.get(selectedPlan)?.allowed !== false) return
    const open = plans.find((plan) => offers.get(plan.code)?.allowed)
    if (open !== undefined) setSelectedPlan(open.code)
  }, [offers, plans, selectedPlan])

  const resuming = offer?.allowed === true && offer.action === 'resume'
  const alreadyOnThisPlan =
    view?.kind === 'active' && selectedIsCurrent && selected.kind === 'recurring'
  const actionLabel = alreadyOnThisPlan
    ? '目前使用此方案'
    : resuming
      ? '恢復自動續訂'
      : selected.kind === 'dayPass'
        ? `購買 ${selected.name}`
        : '開始訂閱'

  // A purchase is never offered at a price the server has not confirmed:
  // the amount shown has to be the amount that gets charged.
  const canSubscribe =
    !!user && !statePending && !statusError && offer?.allowed === true &&
    selectedAmount !== null && !submitting

  /**
   * Hands the browser to ECPay. Replacing an existing agreement is
   * confirmed first, because stopping it is irreversible -- ECPay cannot
   * re-enable one, and abandoning the payment page afterwards leaves the
   * user with no auto-renew at all.
   */
  const startCheckout = useCallback(async () => {
    setSubmitting(true)
    setActionError(null)
    try {
      const checkout = await apiPost<PostPaymentCheckoutResponse>('payment/checkout', {
        plan: selected.code,
        // Omitted for the recurring plan, where it is meaningless, and
        // required for a pass -- the backend refuses one without it
        // rather than guessing, because the order's expiry parameter
        // depends on which method it is.
        ...(selected.kind === 'dayPass' ? { method: selectedMethod } : {}),
      })
      // Leaves the page, so nothing after this runs on success.
      submitCheckout(checkout)
    } catch (e) {
      setSubmitting(false)
      setConfirming(false)
      setActionError(
        (e instanceof ApiError && e.code !== undefined ? CHECKOUT_ERRORS[e.code] : undefined) ??
          '無法前往付款頁面，請稍後再試。',
      )
    }
  }, [selected.code, selected.kind, selectedMethod])

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

        {/*
          Headed and ruled off because the payment-method group below uses
          the same card grid: without a heading the two read as one list,
          and a payment method looks like another plan. The heading is also
          the group's accessible name -- the aria-label here used to say
          "月繳或年繳方案", and there is no annual plan.
        */}
        <section className={styles.choiceBlock} aria-labelledby="plan-choice-title">
          <h2 className={styles.choiceHeading} id="plan-choice-title">方案</h2>
          <div
            className={styles.billingFieldset}
            role="radiogroup"
            aria-labelledby="plan-choice-title"
            aria-disabled={!canChoosePlan}
          >
            <div className={styles.planOptions}>
              {plans.map((plan) => {
                const current = managedSubscription && plan.code === currentPlanCode
                const amount = amounts?.[plan.code]
                // Still selectable while the state loads: `offers` is
                // null then, and disabling everything would make the
                // page flicker shut and open again.
                const blocked = offers?.get(plan.code)?.allowed === false
                return (
                  <label
                    key={plan.code}
                    className={`${styles.planOption} ${current ? styles.currentPlan : ''} ${blocked ? styles.planOptionBlocked : ''}`}
                  >
                    <input
                      type="radio"
                      name="billing-period"
                      value={plan.code}
                      checked={selectedPlan === plan.code}
                      disabled={!canChoosePlan || blocked}
                      onChange={() => setSelectedPlan(plan.code)}
                    />
                    <span className={styles.radioMark} aria-hidden="true" />
                    <span className={styles.planOptionContent}>
                      <span className={styles.planOptionHeading}>
                        <strong>{plan.name}</strong>
                        <span className={styles.planBadges}>
                          {current && <Badge tone="growth">目前方案</Badge>}
                          {plan.recommended && <Badge tone="complete">推薦</Badge>}
                        </span>
                      </span>
                      {/*
                        The price comes from the API, never from a constant
                        here: this number has to be the one the server signs
                        into the ECPay order. Until it arrives the plan is
                        shown without a price rather than with a guess.
                      */}
                      <span className={styles.planOptionPrice}>
                        {typeof amount === 'number' ? (
                          <>
                            <strong>NT${formatNumber(amount)}</strong>
                            <span>／{plan.periodLabel}</span>
                          </>
                        ) : (
                          <span>{amountsFailed ? '價格暫時無法顯示' : '讀取價格…'}</span>
                        )}
                      </span>
                      <small>{plan.note}</small>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        </section>

        {/*
          Shown only for a day pass, and the choice is sent to ECPay as a
          fixed ChoosePayment rather than letting their page offer
          everything. Two reasons, both from their own documentation: they
          add and change payment methods over time, so a fixed value keeps
          the result notifications predictable; and the expiry parameter
          differs per method -- StoreExpireDate means minutes for a store
          code but days for a barcode -- so the order cannot be built
          correctly until the method is known.
        */}
        {selected.kind === 'dayPass' && (
          <section className={styles.choiceBlock} aria-labelledby="payment-choice-title">
            <h2 className={styles.choiceHeading} id="payment-choice-title">付款方式</h2>
            <div
              className={styles.billingFieldset}
              role="radiogroup"
              aria-labelledby="payment-choice-title"
              aria-disabled={!canChoosePlan}
            >
              <div className={styles.planOptions}>
                {dayPassPaymentMethods.map((method) => (
                  <label key={method.value} className={styles.planOption}>
                    <input
                      type="radio"
                      name="payment-method"
                      value={method.value}
                      checked={selectedMethod === method.value}
                      disabled={!canChoosePlan}
                      onChange={() => setSelectedMethod(method.value)}
                    />
                    <span className={styles.radioMark} aria-hidden="true" />
                    <span className={styles.planOptionContent}>
                      <span className={styles.planOptionHeading}>
                        <strong>{method.label}</strong>
                      </span>
                      <small>{method.note}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </section>
        )}

        <div className={styles.planAction}>
            {statePending ? (
            <>
              <p role="status">正在載入訂閱狀態…</p>
              <Button className={styles.subscribeButton} size="lg" disabled>
                開始訂閱
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
              {/*
                Ordered by what is being bought, not by what the user
                already has: a day pass behaves the same whatever state
                they are in, and testing `cancelled` first used to show
                somebody buying a pass the copy for resubscribing.
              */}
              {!user ? (
                <p>請先登入，才能開始訂閱。</p>
              ) : offer?.allowed === false ? (
                /* Refused by the same rule the server enforces. Each
                   one names the way out, because a disabled card that
                   explains nothing reads as a broken page. */
                <p>
                  {offer.reason === 'autoRenewLive' ? (
                    <>
                      目前是<strong>自動續訂中</strong>，無法同時購買天數型方案。
                      請先到<strong>個人資料頁</strong>取消自動續訂 ——
                      已付費的天數不會損失，取消後購買的天數會接在到期日之後。
                    </>
                  ) : entitlementEndsAt !== null ? (
                    <>
                      目前的權益可使用至 {formatTaiwanDate(entitlementEndsAt)}，
                      這段期間無法另外開始月繳訂閱。想延長使用期限可以直接加購天數型方案，
                      天數會接在到期日之後。
                    </>
                  ) : (
                    <>目前的訂閱狀態無法購買這個方案。</>
                  )}
                </p>
              ) : selected.kind === 'dayPass' ? (
                <>
                  <p>
                    {selected.name}為一次付費，<strong>不會自動續訂</strong>。
                    天數會接在你目前的期限之後，已付費的天數不會損失。
                  </p>
                  {selectedMethod !== 'Credit' && (
                    <p>
                      繳費後才會開通，可能需要幾分鐘到幾小時。代碼或虛擬帳號可在
                      <strong>個人資料頁</strong>再次查看，逾期未繳則自動失效。
                      {/* ECPay's refund API covers credit card only; a
                          counter or transfer payment can be refunded by
                          hand in their back office at best, so saying so
                          before the money moves is the honest order. */}
                      非信用卡付款恕不提供線上退款。
                    </p>
                  )}
                </>
              ) : resuming ? (
                /* Restarting the plan whose paid period is still
                   running. A new agreement either way -- ECPay cannot
                   restart a cancelled one -- so the charge is immediate
                   and the period it buys queues behind the one already
                   paid for. */
                <p>
                  {entitlementEndsAt !== null && (
                    <>原訂閱權益可使用至 {formatTaiwanDate(entitlementEndsAt)}，這些天數不會損失。</>
                  )}
                  恢復自動續訂會立即扣款，新的訂閱期間接在原本的到期日之後開始。
                </p>
              ) : view?.kind === 'active' ? (
                <p>{`${selected.name}將${selected.renewalLabel}自動續訂；可至個人資料頁取消續訂。`}</p>
              ) : (
                <p>{selected.name}將{selected.renewalLabel}自動續訂；訂閱後可至個人資料頁取消續訂。</p>
              )}
              {amountsFailed && <p role="alert">暫時無法取得方案價格，請重新整理後再試。</p>}
              {actionError && <p role="alert">{actionError}</p>}
              <Button
                className={styles.subscribeButton}
                size="lg"
                disabled={!canSubscribe}
                onClick={() => {
                  // Resuming charges today for a period that starts
                  // when the one already paid for runs out, which is
                  // worth saying before the card is taken. Everything
                  // else goes straight on: ECPay's own payment page is
                  // the next step and nothing here is irreversible.
                  if (resuming) setConfirming(true)
                  else startCheckout()
                }}
              >
                {submitting ? '前往付款…' : actionLabel}
              </Button>
            </>
            )}
        </div>
      </ContentPanel>

      {/*
        Everything this dialog says has to match what ECPay actually
        does. It cannot amend an agreement and cannot un-cancel one, so
        there is no "takes effect at the end of the period" and no "you
        will not be charged now" -- both were true of the provider this
        screen was first drafted against, and neither is true here.
      */}
      {confirming && resuming && (
        <Modal title="恢復自動續訂？" onClose={() => setConfirming(false)}>
          <p className={styles.dialogCopy}>
            {entitlementEndsAt !== null && (
              <>原訂閱權益可使用至 {formatTaiwanDate(entitlementEndsAt)}，這些天數不會損失。</>
            )}
            {' '}
            綠界無法重啟已取消的合約，所以確認後會前往綠界重新刷卡，
            {selectedAmount !== null && <>本次就會扣款 NT${formatNumber(selectedAmount)}，</>}
            新的訂閱期間接在上述日期之後開始，之後{selected.renewalLabel}自動續訂。
          </p>
          {actionError && <p role="alert">{actionError}</p>}
          <div className="sp-dialog-actions">
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={submitting}>
              暫不變更
            </Button>
            <Button onClick={startCheckout} disabled={submitting || selectedAmount === null}>
              {submitting ? '前往付款…' : '前往付款'}
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
        {/*
          The rate comes from the API, never from a constant here, for the
          same reason the prices above do: this page advertises the
          benefit, the box screen states the XP an investment will earn,
          and the server grants it -- so a number written in here could
          advertise one thing while another is granted, and the user sees
          both. The worked example is derived from the same rate rather
          than written out beside it.
        */}
        <div className={styles.spiritBonus}>
          <div>
            {bonusPercent === null ? (
              <>
                <h3>{bonusFailed ? '加成幅度暫時無法顯示' : '讀取加成幅度…'}</h3>
                <p>加成不影響題目分數或學習統計。</p>
              </>
            ) : (
              <>
                <h3>投入積分時，額外獲得 {bonusPercent}% XP</h3>
                <p>
                  例如投入 100 積分，精靈可獲得{' '}
                  {formatNumber(investmentXp(100, bonusPercent))} XP。加成不影響題目分數或學習統計。
                </p>
              </>
            )}
          </div>
          <strong className={styles.bonusValue}>
            {bonusPercent === null ? '—' : `+${bonusPercent}%`}
          </strong>
        </div>
      </section>

      <section className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-title">
        <div className={styles.sectionHeading}><h2 id="faq-title">關於訂閱方案</h2></div>
        <div className={styles.faqList}>
          {faqsFor(bonusPercent).map(([question, answer]) => (
            <details key={question} className={styles.faqItem}>
              <summary>{question}</summary><p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}
