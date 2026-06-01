'use client'

import { useState } from 'react'
import NavbarAuthButton from './NavbarAuthButton'

const navItems = [
  // { label: '題庫', href: '/question' },
  { label: '智慧練習', href: '/adaptive' },
  { label: '作答記錄', href: '/reply' },
  { label: '學習分析', href: '/user' },
]

export default function NavbarMenu() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="hidden items-center gap-2 lg:flex">
        {navItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="rounded-[6px] px-4 py-3 text-sm text-black-500 transition hover:bg-beige-200 hover:text-black-700 focus:text-blue-700 focus:outline-none"
          >
            {item.label}
          </a>
        ))}
        <div className="ml-4">
          <NavbarAuthButton />
        </div>
      </div>

      <button
        className="flex h-8 w-8 items-center justify-center text-black-500 lg:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-label="選單"
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

      {open && (
        <div className="absolute -left-4 -right-4 top-full z-50 border-b border-brown-700 bg-beige-100 px-4 py-3 sm:-left-6 sm:-right-6 sm:px-6 lg:hidden">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="rounded-[6px] px-4 py-3 text-center text-sm text-black-500 transition hover:text-black-700 focus:text-blue-700 focus:outline-none active:bg-beige-200"
              >
                {item.label}
              </a>
            ))}
            <div className="pt-2">
              <NavbarAuthButton fullWidth />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
