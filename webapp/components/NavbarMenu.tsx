'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import NavbarAuthButton from './NavbarAuthButton'

const navItems = [
  // { label: '題庫', href: '/question' },
  { label: '智慧練習', href: '/adaptive' },
  { label: '作答記錄', href: '/reply' },
  { label: '學習分析', href: '/analysis' },
  { label: '精靈養成', href: '/box' },
]

export default function NavbarMenu() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { user } = useAuth()

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      {/* Desktop */}
      <div className="site-header__desktop-actions hidden items-center gap-2 lg:flex">
        {user &&
          navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className="site-header__nav-link flex h-9 items-center rounded-[6px] px-4 text-sm transition focus:outline-none"
            >
              {item.label}
            </Link>
          ))}
        <div className="ml-4">
          <NavbarAuthButton />
        </div>
      </div>

      {/* Small screens: show sign-in before authentication, then expose the
          authenticated navigation alongside the profile control. */}
      <div className="site-header__mobile-actions flex items-center gap-3 lg:hidden">
        <NavbarAuthButton />
        {user && (
          <button
            type="button"
            className="site-header__menu-toggle flex h-8 w-8 items-center justify-center"
            onClick={() => setOpen((v) => !v)}
            aria-label="選單"
            aria-expanded={open}
            aria-controls="site-header-mobile-menu"
          >
            {open ? (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <line x1="10" y1="10" x2="22" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="22" y1="10" x2="10" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <line x1="6" y1="11" x2="26" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="6" y1="16" x2="26" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="6" y1="21" x2="26" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}
      </div>

      {open && user && (
        <div
          id="site-header-mobile-menu"
          className="site-header__mobile-menu absolute -left-4 -right-4 top-full z-50 px-4 py-3 sm:-left-6 sm:-right-6 sm:px-6 lg:hidden"
        >
          <div className="flex flex-col gap-3 sm:gap-4">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className="site-header__nav-link rounded-[6px] px-4 py-4 text-center text-sm transition focus:outline-none"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
