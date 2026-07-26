import AuthGuard from '@/components/AuthGuard'
import Navbar from '@/components/Navbar'
import ConceptGroupClient from './ConceptGroupClient'

export default function ConceptGroupPage() {
  return (
    <div className="m-[10px] min-h-[calc(100vh-20px)] border border-brown-700 bg-beige-100">
      <div className="px-4 sm:px-6">
        <Navbar />
      </div>
      <div className="px-4 md:px-10 lg:px-[70px]">
        <div className="mx-auto max-w-[1120px]">
          <AuthGuard>
            <ConceptGroupClient />
          </AuthGuard>
        </div>
      </div>
    </div>
  )
}
