import AuthGuard from '@/components/AuthGuard'
import Navbar from '@/components/Navbar'
import { Suspense } from 'react'
import { DonationFlowClient } from '../DonationDemo'

export default function DonationDemoPage() {
  return (
    <div className="spirit-theme sp-page donation-demo-page">
      <div className="standard-site-header"><Navbar /></div>
      <AuthGuard>
        <Suspense fallback={<main className="donation-flow"><p>載入示範資料…</p></main>}>
          <DonationFlowClient />
        </Suspense>
      </AuthGuard>
    </div>
  )
}
