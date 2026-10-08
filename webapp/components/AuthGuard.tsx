'use client'

import { useAuth } from '@/hooks/useAuth'

type AuthGuardProps = {
  children: React.ReactNode
  variant?: 'default' | 'learning'
}

export default function AuthGuard({ children, variant = 'default' }: AuthGuardProps) {
  const { user, loading, login } = useAuth()
  const learning = variant === 'learning'

  if (loading) {
    return (
      <div className={learning ? 'learning-auth-state learning-auth-state--loading' : 'flex h-48 items-center justify-center'}>
        <span className={learning ? 'learning-auth-state__message' : 'text-sm text-black-500'}>載入中…</span>
      </div>
    )
  }

  if (!user) {
    return (
      <div className={learning ? 'learning-auth-state' : 'rounded-[24px] border border-brown-300 bg-white p-12 text-center'}>
        <p className={learning ? 'learning-auth-state__message' : 'text-base font-medium text-black-900'}>請先登入以使用此功能</p>
        <button
          onClick={login}
          className={learning ? 'learning-auth-state__button' : 'mt-6 rounded-md bg-blue-700 px-8 py-3 text-sm font-bold text-white transition hover:bg-[#1f3ea3]'}
        >
          Google 登入
        </button>
      </div>
    )
  }

  return <>{children}</>
}
