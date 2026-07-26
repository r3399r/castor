import AuthGuard from '@/components/AuthGuard'
import BackToAdminLink from '@/components/BackToAdminLink'
import Navbar from '@/components/Navbar'

export default async function SubjectNewQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="m-[10px] min-h-[calc(100vh-20px)] border border-brown-700 bg-beige-100">
      <div className="px-4 sm:px-6">
        <Navbar />
      </div>
      <div className="px-4 md:px-10 lg:px-[70px]">
        <div className="mx-auto max-w-[1120px]">
          <BackToAdminLink href="/admin/subject" label="← 返回科目管理" />
          <AuthGuard>
            <div className="pb-[70px]">
              <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">
                新增題目（科目 #{id}）
              </h1>
              <p className="text-sm text-black-500">此頁面開發中。</p>
            </div>
          </AuthGuard>
        </div>
      </div>
    </div>
  )
}
