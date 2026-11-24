import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import Navbar from '@/components/Navbar'
import { PageContainer } from '@/components/layout'
import { PageHeader } from '@/components/ui'
import { isBetaMode } from '@/lib/beta'
import BetaNotice from './BetaNotice'
import SubscriptionPageClient from './SubscriptionPageClient'
import styles from './subscription.module.css'

/**
 * Beta closes this page rather than removing it -- see BetaNotice for
 * why the route stays. Decided here, in the server component, so the
 * choice is made once at build time: the webapp is a static export, so
 * under beta the plan page's markup is never generated and its client
 * bundle is never reached.
 */
export default function SubscriptionPage() {
  const beta = isBetaMode()
  return (
    <div className={`${styles.page} learning-page`}>
      <div className="standard-site-header"><Navbar /></div>
      <main className={styles.main}>
        <PageContainer>
          <PageHeader
            className={styles.pageHeader}
            title={beta ? '公開測試中' : '訂閱方案'}
          />
          {beta ? <BetaNotice /> : <SubscriptionPageClient />}
        </PageContainer>
      </main>
      <div className="px-4 sm:px-6">
        <LearningFooterFoliage className="learning-page-footer-foliage" />
        <Footer variant="learning" />
      </div>
    </div>
  )
}
