import AuthGuard from '@/components/AuthGuard'
import Navbar from '@/components/Navbar'
import AnalysisClient from './AnalysisClient'
import styles from './analysis.module.css'

export default function AnalysisPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Navbar />
      </div>
      <div className="px-4 md:px-10 lg:px-[70px]">
        <div className="mx-auto max-w-[1120px]">
          <AuthGuard>
            <AnalysisClient />
          </AuthGuard>
        </div>
      </div>
    </div>
  )
}
