import AuthGuard from '@/components/AuthGuard'
import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import Navbar from '@/components/Navbar'
import { PageContainer } from '@/components/layout'
import AnalysisClient from './AnalysisClient'
import styles from './analysis.module.css'

export default function AnalysisPage() {
  return (
    <div className={`${styles.page} learning-page`}>
      <div className={`${styles.header} standard-site-header`}>
        <Navbar />
      </div>
      <div className="layer-content relative">
        <PageContainer>
          <AuthGuard>
            <AnalysisClient />
          </AuthGuard>
        </PageContainer>
      </div>
      <div className="px-4 sm:px-6">
        <LearningFooterFoliage className="learning-page-footer-foliage" />
        <Footer variant="learning" />
      </div>
    </div>
  )
}
