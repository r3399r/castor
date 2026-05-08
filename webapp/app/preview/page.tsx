import Navbar from '@/components/Navbar'
import PreviewClient from './PreviewClient'

export default function PreviewPage() {
  return (
    <div className="min-h-screen bg-[#FCF9F5] py-6">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <Navbar />
        <PreviewClient />
      </div>
    </div>
  )
}
