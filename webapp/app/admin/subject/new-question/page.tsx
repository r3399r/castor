import { Suspense } from 'react'
import AuthGuard from '@/components/AuthGuard'
import BackToAdminLink from '@/components/BackToAdminLink'
import Navbar from '@/components/Navbar'
import SubjectNewQuestionClient from './SubjectNewQuestionClient'

export default function SubjectNewQuestionPage() {
  return (
    <div className="m-[10px] min-h-[calc(100vh-20px)] border border-brown-700 bg-beige-100">
      <div className="px-4 sm:px-6">
        <Navbar />
      </div>
      <div className="px-4 md:px-10 lg:px-[70px]">
        <div className="mx-auto max-w-[1120px]">
          <BackToAdminLink href="/admin/subject" label="← 返回科目管理" />
          <AuthGuard>
            {/* useSearchParams() requires a Suspense boundary in the app
                router, since this is a static export -- the subject id
                comes from a query param (?id=), not a dynamic route
                segment, precisely so this page doesn't need
                generateStaticParams() for every possible subject id. */}
            <Suspense
              fallback={
                <div className="flex h-48 items-center justify-center">
                  <span className="text-sm text-black-500">載入中…</span>
                </div>
              }
            >
              <SubjectNewQuestionClient />
            </Suspense>
          </AuthGuard>
        </div>
      </div>
    </div>
  )
}
