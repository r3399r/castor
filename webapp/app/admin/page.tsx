import AuthGuard from '@/components/AuthGuard'
import { PageContainer, StandardPageLayout } from '@/components/layout'
import { PageHeader } from '@/components/ui'

const ADMIN_FUNCTIONS = [
  { label: '類別管理', description: '新增、編輯、刪除考試類別', href: '/admin/category' },
  { label: '科目管理', description: '新增、編輯、刪除科目、新增題目', href: '/admin/subject' },
  { label: '題目管理', description: '檢視、編輯、刪除題目', href: '/admin/question' },
  { label: '考試管理', description: '新增、編輯、刪除考試', href: '/admin/exam' },
  { label: '標籤管理', description: '新增、編輯、刪除標籤', href: '/admin/tag' },
  { label: '觀念群組管理', description: '新增、編輯、刪除觀念群組', href: '/admin/concept-group' },
  { label: '觀念管理', description: '新增、編輯、刪除觀念', href: '/admin/concept' },
  { label: '篩選維度管理', description: '新增、編輯、刪除篩選維度', href: '/admin/filter-dimension' },
  { label: '篩選選項管理', description: '新增、編輯、刪除篩選選項', href: '/admin/filter-option' },
  { label: '使用者管理', description: '檢視使用者列表', href: '/admin/user' },
]

export default function AdminPage() {
  return (
    <StandardPageLayout>
      <PageContainer>
        <AuthGuard>
          <div className="pb-[70px]">
              <PageHeader title="管理後台" />
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
      </PageContainer>
    </StandardPageLayout>
  )
}
