import AuthGuard from '@/components/AuthGuard'
import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import Navbar from '@/components/Navbar'
import UserClient from './UserClient'
import styles from './user.module.css'

export default function UserPage() {
  return (
    <div className={`${styles.page} learning-page`}>
      <div className="standard-site-header">
        <Navbar />
      </div>
      <main className={`${styles.main} relative z-10 px-4 md:px-10 lg:px-[70px]`}>
        <div className="mx-auto max-w-[1120px]">
          <AuthGuard variant="learning">
            <UserClient />
          </AuthGuard>
        </div>
      </main>
      <div className="px-4 sm:px-6">
        <LearningFooterFoliage className="learning-page-footer-foliage" />
        <Footer variant="learning" />
      </div>
    </div>
  )
}
