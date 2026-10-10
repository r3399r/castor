import AuthGuard from '@/components/AuthGuard'
import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import Navbar from '@/components/Navbar'
import { PageContainer } from '@/components/layout'
import ReplyTabsClient from './ReplyTabsClient'
import styles from './reply.module.css'

export default function ReplyPage() {
  return (
    <div className={`${styles.page} learning-page`}>
      <div className="standard-site-header">
        <Navbar />
      </div>
      <div className="relative z-10">
        <PageContainer>
          <AuthGuard>
            <ReplyTabsClient />
          </AuthGuard>
        </PageContainer>
      </div>
      <div className="px-4 sm:px-6">
        <LearningFooterFoliage />
        <Footer variant="learning" />
      </div>
    </div>
  )
}
