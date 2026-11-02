import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import Navbar from '@/components/Navbar'
import { PageContainer } from '@/components/layout'
import { PageHeader } from '@/components/ui'
import SubscriptionResultClient from './SubscriptionResultClient'
import styles from '../subscription.module.css'

/**
 * Where ECPay sends the browser back to after payment.
 *
 * It is reached by a plain GET (ClientBackURL), not by the form POST
 * ECPay's OrderResultURL would use -- the webapp is a static export on
 * S3 and cannot answer a POST at all. Nothing on this page is told
 * whether the payment worked: that arrives separately, on the webhook,
 * and this page finds out by asking our own API.
 */
export default function SubscriptionResultPage() {
  return (
    <div className={`${styles.page} learning-page`}>
      <div className="standard-site-header"><Navbar /></div>
      <main className={styles.main}>
        <PageContainer>
          <PageHeader className={styles.pageHeader} title="訂閱結果" />
          <SubscriptionResultClient />
        </PageContainer>
      </main>
      <div className="px-4 sm:px-6">
        <LearningFooterFoliage className="learning-page-footer-foliage" />
        <Footer variant="learning" />
      </div>
    </div>
  )
}
