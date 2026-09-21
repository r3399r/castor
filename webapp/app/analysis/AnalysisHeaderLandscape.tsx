import styles from './analysis.module.css'

const desktopFallback = '/images/learning-history-header-landscape-05.webp'

export default function AnalysisHeaderLandscape() {
  return (
    <picture className={styles.titleLandscape} aria-hidden="true">
      <img
        className={styles.titleLandscapeImage}
        src={desktopFallback}
        alt=""
      />
    </picture>
  )
}
