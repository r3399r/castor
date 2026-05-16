'use client'

import { useAuth } from '@/hooks/useAuth'

export default function NavbarAuthButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { user, loading, login, logout } = useAuth()

  const btnClass = `rounded-md border border-brown-300 py-2.5 text-sm text-black-900 transition hover:bg-beige-200 ${fullWidth ? 'w-full px-4' : 'px-5'}`

  if (loading) {
    return <div className={`h-9 rounded-md border border-brown-300 ${fullWidth ? 'w-full' : 'w-24'}`} />
  }

  if (user) {
    return (
      <button onClick={logout} className={btnClass}>
        登出
      </button>
    )
  }

  return (
    <button onClick={login} className={btnClass}>
      Google 登入
    </button>
  )
}
