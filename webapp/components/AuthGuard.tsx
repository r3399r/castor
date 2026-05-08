'use client'

import { useAuth } from '@/hooks/useAuth'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, login } = useAuth()

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-[#625D5A]">載入中…</span>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="rounded-[24px] border border-[#C5B3A7] bg-white p-12 text-center">
        <p className="text-base font-medium text-[#302B28]">請先登入以使用此功能</p>
        <button
          onClick={login}
          className="mt-6 rounded-md bg-[#2547C5] px-8 py-3 text-sm font-bold text-white transition hover:bg-[#1f3ea3]"
        >
          Google 登入
        </button>
      </div>
    )
  }

  return <>{children}</>
}
