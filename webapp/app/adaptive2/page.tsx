import AuthGuard from '@/components/AuthGuard'
import Navbar from '@/components/Navbar'
import AdaptiveClient from './AdaptiveClient'

export default function AdaptivePage() {
  return (
    <div className="m-[10px] min-h-[calc(100vh-20px)] border border-brown-700 bg-beige-100">
      <div className="px-4 sm:px-6">
        <Navbar />
        <AuthGuard>
          <AdaptiveClient />
        </AuthGuard>
      </div>
    </div>
  )
}
