import NavbarAuthButton from './NavbarAuthButton'

const navItems = [
  { label: '題庫', href: '/question' },
  { label: '智慧練習', href: '/adaptive' },
  { label: '作答記錄', href: '/reply' },
  { label: '學習分析', href: '/user' },
]

export default function Navbar() {
  return (
    <nav className="rounded-[28px] border border-brown-700 bg-beige-100 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <a href="/" className="font-helvetica text-lg font-bold tracking-[0.02em] text-blue-700">
          PMP.test2
        </a>
        <div className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="rounded-full px-4 py-3 text-sm text-black-500 transition hover:bg-beige-200"
            >
              {item.label}
            </a>
          ))}
          <NavbarAuthButton />
        </div>
      </div>
    </nav>
  )
}
