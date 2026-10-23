import AdaptivePageClient from './AdaptivePageClient'
import styles from './adaptive.module.css'

export default function AdaptivePage() {
  return (
    <div className={`${styles.page} learning-page`}>
      <AdaptivePageClient />
    </div>
  )
}
