import Navbar from '@/components/Navbar'
import QuestionClient from './QuestionClient'

export default function QuestionPage() {
  return (
    <div className="min-h-screen bg-[#FCF9F5] py-6">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <Navbar />
        <QuestionClient />
      </div>
    </div>
  )
}
