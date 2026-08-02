'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function NavbarAuthButton() {
  const { user, loading, login } = useAuth()

  if (loading) {
    return <div className="h-9" />
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
            className="h-9 w-9 rounded-full border border-brown-300 object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-brown-300 bg-blue-700/10 text-sm font-bold text-blue-700">
            {initial}
          </span>
        )}
      </Link>
    )
  }

  return (
    <button
      onClick={login}
      className="flex h-9 items-center justify-center rounded-md border border-brown-300 px-5 text-sm text-black-900 transition hover:bg-beige-200"
    >
      Google 登入
    </button>
  )
}
