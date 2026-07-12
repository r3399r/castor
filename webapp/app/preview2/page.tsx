import Navbar from '@/components/Navbar'
import Preview2Client from './Preview2Client'

export default function Preview2Page() {
  return (
    <div className="min-h-screen bg-beige-100 py-6">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <Navbar />
        <Preview2Client />
      </div>
    </div>
  )
}
