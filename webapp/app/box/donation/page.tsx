import AuthGuard from '@/components/AuthGuard'
import Navbar from '@/components/Navbar'
import { Suspense } from 'react'
import { DonationFlowClient } from '../DonationFlow'

export default function DonationPage() {
  return (
    <div className="spirit-theme sp-page donation-page">
      <div className="standard-site-header"><Navbar /></div>
      <AuthGuard>
        <Suspense fallback={<main className="donation-flow"><p>載入公益支持資料…</p></main>}>
          <DonationFlowClient />
        </Suspense>
      </AuthGuard>
    </div>
  )
}
