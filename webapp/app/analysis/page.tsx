import AuthGuard from '@/components/AuthGuard'
import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import Navbar from '@/components/Navbar'
import AnalysisClient from './AnalysisClient'
import styles from './analysis.module.css'

export default function AnalysisPage() {
  return (
    <div className={`${styles.page} learning-page`}>
      <div className={`${styles.header} standard-site-header`}>
        <Navbar />
      </div>
      <div className="relative z-10 px-4 md:px-10 lg:px-[70px]">
        <div className="mx-auto max-w-[1120px]">
          <AuthGuard>
            <AnalysisClient />
          </AuthGuard>
        </div>
      </div>
      <div className="px-4 sm:px-6">
        <LearningFooterFoliage />
        <Footer variant="learning" />
      </div>
    </div>
  )
}
