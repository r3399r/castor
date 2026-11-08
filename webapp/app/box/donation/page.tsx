import AuthGuard from '@/components/AuthGuard'
import Navbar from '@/components/Navbar'
import { Suspense } from 'react'
import DonationRouteClient from './DonationRouteClient'

export default function DonationPage() {
  return (
    <div className="spirit-theme sp-page donation-demo-page">
      <div className="standard-site-header"><Navbar /></div>
      <AuthGuard>
        <Suspense fallback={<main className="donation-flow"><p>載入公益支持資料…</p></main>}>
          <DonationRouteClient />
        </Suspense>
      </AuthGuard>
    </div>
  )
}
