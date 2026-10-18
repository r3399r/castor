import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import Navbar from '@/components/Navbar'
import { PageContainer } from '@/components/layout'
import { PageHeader } from '@/components/ui'
import SubscriptionPageClient from './SubscriptionPageClient'
import styles from './subscription.module.css'

export default function SubscriptionPage() {
  return (
    <div className={`${styles.page} learning-page`}>
      <div className="standard-site-header"><Navbar /></div>
      <main className={styles.main}>
        <PageContainer>
          <PageHeader
            className={styles.pageHeader}
            title="訂閱方案"
            subtitle="解鎖完整學習分析，讓精靈陪你一起成長。"
          />
          <SubscriptionPageClient />
        </PageContainer>
      </main>
      <div className="px-4 sm:px-6">
        <LearningFooterFoliage className="learning-page-footer-foliage" />
        <Footer variant="learning" />
      </div>
    </div>
  )
}
