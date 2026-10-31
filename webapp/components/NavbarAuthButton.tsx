'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function NavbarAuthButton() {
  const { user, loading, login } = useAuth()

  // Which control this becomes isn't known yet -- the avatar for a visitor
  // whose session Firebase is still restoring, the sign-in button for
  // everyone else -- so it reserves the avatar's footprint and says
  // nothing. It used to render the sign-in button disabled, which told
  // already-signed-in visitors to sign in for as long as the check took.
  // Sized to the avatar rather than the button because that's the case
  // where a late size change would be visible: the button is wider, and
  // only its own left edge moves when it appears.
  if (loading) {
    return <span aria-hidden="true" className="block h-control-nav w-control-nav shrink-0" />
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
