import AuthGuard from '@/components/AuthGuard'
import BackToAdminLink from '@/components/BackToAdminLink'
import Navbar from '@/components/Navbar'
import SubjectClient from './SubjectClient'

export default function SubjectPage() {
  return (
    <div className="m-[10px] min-h-[calc(100vh-20px)] border border-brown-700 bg-beige-100">
      <div className="px-4 sm:px-6">
        <Navbar />
      </div>
      <div className="px-4 md:px-10 lg:px-[70px]">
        <div className="mx-auto max-w-[1120px]">
          <BackToAdminLink />
          <AuthGuard>
            <SubjectClient />
          </AuthGuard>
        </div>
      </div>
    </div>
  )
}
