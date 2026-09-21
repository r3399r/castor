import Link from 'next/link'
import NavbarMenu from './NavbarMenu'

export default function Navbar() {
  return (
    <header className="site-header">
      <nav className="site-header__nav">
        <div className="site-header__content flex items-center justify-between">
          <Link href="/" className="site-header__logo font-helvetica text-lg font-bold tracking-[0.02em]">
            PMP - Practice Makes Perfect
          </Link>
          <NavbarMenu />
        </div>
      </nav>
    </header>
  )
}
