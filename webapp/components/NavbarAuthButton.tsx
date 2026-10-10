'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function NavbarAuthButton() {
  const { user, loading, login } = useAuth()

  if (loading) {
    return (
      <button
        type="button"
        disabled
        aria-busy="true"
        className="flex h-control-nav items-center justify-center rounded-md border border-brown-300 px-5 text-sm text-black-900 opacity-70"
      >
        Google 登入
      </button>
    )
  }

  if (user) {
    const initial = (user.displayName ?? user.email ?? '?').charAt(0).toUpperCase()

    return (
      <Link href="/user" aria-label="個人資料" className="block shrink-0 rounded-full transition hover:opacity-80">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName ?? '使用者頭像'}
            referrerPolicy="no-referrer"
            className="h-control-nav w-control-nav rounded-full border border-brown-300 object-cover"
          />
        ) : (
          <span className="flex h-control-nav w-control-nav items-center justify-center rounded-full border border-brown-300 bg-blue-700/10 text-sm font-bold text-blue-700">
            {initial}
          </span>
        )}
      </Link>
    )
  }

  return (
    <button
      onClick={login}
      className="flex h-control-nav items-center justify-center rounded-md border border-brown-300 px-5 text-sm text-black-900 transition hover:bg-beige-200"
    >
      Google 登入
    </button>
  )
}
