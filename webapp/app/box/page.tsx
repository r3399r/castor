import AuthGuard from '@/components/AuthGuard'
import Navbar from '@/components/Navbar'
import BoxClient from './BoxClient'

export default function BoxPage() {
  return (
    <div className="m-[10px] min-h-[calc(100vh-20px)] border border-brown-700 bg-beige-100">
      <div className="px-4 sm:px-6">
        <Navbar />
      </div>
      <div className="px-4 md:px-10 lg:px-[70px]">
        <div className="mx-auto max-w-[1120px]">
          <AuthGuard>
            <BoxClient />
          </AuthGuard>
        </div>
      </div>
    </div>
  )
}
