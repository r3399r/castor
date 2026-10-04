'use client'

import { useState } from 'react'
import AuthGuard from '@/components/AuthGuard'
import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import AdaptiveClient from './AdaptiveClient'
import styles from './adaptive.module.css'

export default function AdaptivePageClient() {
  const [practiceActive, setPracticeActive] = useState(false)

  return (
    <>
      <div className="relative z-10 px-4 md:px-10 lg:px-[70px]">
        <div className={`${styles.content} mx-auto max-w-[1120px]`}>
          <AuthGuard>
            <AdaptiveClient onPracticeStateChange={setPracticeActive} />
          </AuthGuard>
        </div>
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
