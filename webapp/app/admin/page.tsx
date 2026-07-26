import AuthGuard from '@/components/AuthGuard'
import Navbar from '@/components/Navbar'

const ADMIN_FUNCTIONS = [
  { label: '類別管理', description: '新增、編輯、刪除考試類別', href: '/admin/category' },
  { label: '科目管理', description: '新增、編輯、刪除科目', href: '/admin/subject' },
  { label: '考試管理', description: '新增、編輯、刪除考試', href: '/admin/exam' },
  { label: '標籤管理', description: '新增、編輯、刪除標籤', href: '/admin/tag' },
]

export default function AdminPage() {
  return (
    <div className="m-[10px] min-h-[calc(100vh-20px)] border border-brown-700 bg-beige-100">
      <div className="px-4 sm:px-6">
        <Navbar />
      </div>
      <div className="px-4 md:px-10 lg:px-[70px]">
        <div className="mx-auto max-w-[1120px]">
          <AuthGuard>
            <div className="pb-[70px]">
              <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">管理後台</h1>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ADMIN_FUNCTIONS.map((fn) => (
                  <a
                    key={fn.href}
                    href={fn.href}
                    className="rounded-lg border border-brown-300 bg-white/40 p-6 transition hover:border-blue-700 hover:bg-white"
                  >
                    <h2 className="text-base font-bold text-black-900">{fn.label}</h2>
                    <p className="mt-1 text-sm text-black-500">{fn.description}</p>
                  </a>
                ))}
              </div>
            </div>
          </AuthGuard>
        </div>
      </div>
    </div>
  )
}
