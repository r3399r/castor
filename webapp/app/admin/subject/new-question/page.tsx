import { Suspense } from 'react'
import { AdminPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/ui'
import SubjectNewQuestionClient from './SubjectNewQuestionClient'

export default function SubjectNewQuestionPage() {
  return (
    <AdminPageLayout backHref="/admin/subject" backLabel="← 返回科目管理">
            {/* useSearchParams() requires a Suspense boundary in the app
                router, since this is a static export -- the subject id
                comes from a query param (?id=), not a dynamic route
                segment, precisely so this page doesn't need
                generateStaticParams() for every possible subject id. */}
            <Suspense fallback={<LoadingState />}>
              <SubjectNewQuestionClient />
            </Suspense>
    </AdminPageLayout>
  )
}
