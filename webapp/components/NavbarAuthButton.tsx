'use client'

import { useAuth } from '@/hooks/useAuth'

export default function NavbarAuthButton() {
  const { user, loading, login, logout } = useAuth()

  if (loading) {
    return <div className="h-9 w-24 rounded-md border border-brown-300 bg-white" />
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={logout}
          className="rounded-md border border-brown-300 bg-white px-5 py-2.5 text-sm text-black-900 transition hover:bg-beige-100"
        >
          登出
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={login}
      className="rounded-md border border-brown-300 bg-white px-5 py-2.5 text-sm text-black-900 transition hover:bg-beige-100"
    >
      Google 登入
    </button>
  )
}
