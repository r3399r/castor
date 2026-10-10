'use client'

import { useAuth } from '@/hooks/useAuth'
import { Button, LoadingState } from '@/components/ui'

type AuthGuardProps = {
  children: React.ReactNode
  variant?: 'default' | 'learning'
}

export default function AuthGuard({ children, variant = 'default' }: AuthGuardProps) {
  const { user, loading, login } = useAuth()
  const learning = variant === 'learning'

  if (loading) {
    if (!learning) return <LoadingState />
    return (
      <div className="learning-auth-state learning-auth-state--loading">
        <span className="learning-auth-state__message">載入中…</span>
      </div>
    )
  }

  if (!user) {
    return (
      <div className={learning ? 'learning-auth-state' : 'rounded-[24px] border border-brown-300 bg-white p-12 text-center'}>
        <p className={learning ? 'learning-auth-state__message' : 'text-base font-medium text-spirit-ink'}>請先登入以使用此功能</p>
        {learning ? (
          <button onClick={login} className="learning-auth-state__button">Google 登入</button>
        ) : (
          <Button onClick={login} className="mt-6">Google 登入</Button>
        )}
      </div>
    )
  }

  return <>{children}</>
}
