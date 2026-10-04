import Navbar from '@/components/Navbar'
import AdaptivePageClient from './AdaptivePageClient'
import styles from './adaptive.module.css'

export default function AdaptivePage() {
  return (
    <div className={`${styles.page} learning-page`}>
      <div className="standard-site-header">
        <Navbar />
      </div>
      <AdaptivePageClient />
    </div>
  )
}
