import AuthGuard from '@/components/AuthGuard'
import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import Navbar from '@/components/Navbar'
import { PageContainer } from '@/components/layout'
import UserClient from './UserClient'
import styles from './user.module.css'

export default function UserPage() {
  return (
    <div className={`${styles.page} learning-page`}>
      <div className="standard-site-header">
        <Navbar />
      </div>
      <main className={`${styles.main} layer-content relative`}>
        <PageContainer>
          <AuthGuard variant="learning">
            <UserClient />
          </AuthGuard>
        </PageContainer>
      </main>
      <div className="px-4 sm:px-6">
        <LearningFooterFoliage className="learning-page-footer-foliage" />
        <Footer variant="learning" />
      </div>
    </div>
  )
}
