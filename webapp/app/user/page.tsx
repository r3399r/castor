import AuthGuard from '@/components/AuthGuard'
import Navbar from '@/components/Navbar'
import UserClient from './UserClient'

export default function UserPage() {
  return (
    <div className="min-h-screen bg-beige-100 py-6">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <Navbar />
        <AuthGuard>
          <UserClient />
        </AuthGuard>
      </div>
    </div>
  )
}
