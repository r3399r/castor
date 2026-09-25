import styles from './LearningFooterFoliage.module.css'

type LearningFooterFoliageProps = {
  className?: string
}

export default function LearningFooterFoliage({ className }: LearningFooterFoliageProps) {
  return (
    <div
      className={[styles.foliage, className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <img
        className={styles.image}
        src="/images/shared/learning-footer-foliage-10.png"
        alt=""
        draggable={false}
      />
    </div>
  )
}
