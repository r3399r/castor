import { Card, ButtonLink } from '@/components/ui'
import { benefitSummary } from './benefits'
import styles from './subscription.module.css'

/**
 * What /subscription is while NEXT_PUBLIC_BETA_MODE is on.
 *
 * The route stays, rather than the page 404ing or redirecting: the
 * subscription link is in the footer, in search results and in anyone's
 * bookmarks, and an existing URL that explains itself is worth more than
 * one that disappears. It also answers the question someone arriving
 * here actually has -- "how much is it?" -- with the true answer for
 * now, which is nothing.
 *
 * Deliberately offers no way to pay. Beta is the state where every paid
 * feature is already open, so a price would be a charge for something
 * the user already has.
 *
 * Says no launch date and names no price. Both would be a promise this
 * page cannot keep, and both would still be here, stale, after launch.
 */
export default function BetaNotice() {
  return (
    <Card className={styles.planCard}>
      <section className={styles.benefitSummary} aria-labelledby="beta-benefit-title">
        <h2 id="beta-benefit-title">beta 期間，付費功能全部免費開放</h2>
        <ul>
          {benefitSummary.map(({ label, icon: Icon }) => (
            <li key={label}>
              <span aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
              <strong>{label}</strong>
            </li>
          ))}
        </ul>
      </section>

      <p className={styles.managementNotice}>
        公開測試期間不開放訂閱，也不會向你收取任何費用。上方功能現在就能直接使用，
        不需要訂閱或付款。正式推出訂閱方案前，我們會另行公告。
      </p>

      <div className={styles.planAction}>
        <p>想先試用的話，從這裡開始：</p>
        <ButtonLink href="/analysis">查看學習分析</ButtonLink>
      </div>
    </Card>
  )
}
