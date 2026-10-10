'use client'

import { useState } from 'react'
import AuthGuard from '@/components/AuthGuard'
import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import { PageContainer } from '@/components/layout'
import AdaptiveClient from './AdaptiveClient'
import styles from './adaptive.module.css'

export default function AdaptivePageClient() {
  const [practiceActive, setPracticeActive] = useState(false)

  return (
    <>
      <div className="relative z-10">
        <PageContainer className={styles.content}>
          <AuthGuard>
            <AdaptiveClient onPracticeStateChange={setPracticeActive} />
          </AuthGuard>
        </PageContainer>
      </div>
      {!practiceActive && (
        <div className="px-4 sm:px-6">
          <LearningFooterFoliage />
          <Footer variant="learning" />
        </div>
      )}
    </>
  )
}
