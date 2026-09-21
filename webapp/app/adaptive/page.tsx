import AuthGuard from '@/components/AuthGuard'
import Navbar from '@/components/Navbar'
import AdaptiveClient from './AdaptiveClient'

export default function AdaptivePage() {
  return (
    <div className="min-h-screen bg-beige-100">
      <div className="standard-site-header">
        <Navbar />
      </div>
      <div className="px-4 md:px-10 lg:px-[70px]">
        <div className="mx-auto max-w-[1120px]">
          <AuthGuard>
            <AdaptiveClient />
          </AuthGuard>
        </div>
      </div>
    </div>
  )
}
