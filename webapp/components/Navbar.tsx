import Link from 'next/link'
import BrandMark from './BrandMark'
import NavbarMenu from './NavbarMenu'
import { isBetaMode } from '@/lib/beta'

export default function Navbar() {
  return (
    <header className="site-header">
      <nav className="site-header__nav">
        <div className="site-header__content flex items-center justify-between">
          <Link href="/" className="site-header__logo font-helvetica text-lg font-bold tracking-[0.02em]">
            <BrandMark className="site-header__mark" />
            學益 - Learn for Good
            {/* Inside the link rather than beside it: the row is
                justify-between, so a third flex item would be pushed to
                the middle of the header, and the logo's mobile
                max-width is measured against this row. Clicking the
                badge therefore goes home, which is the harmless
                outcome. */}
            {isBetaMode() && <span className="site-header__beta">beta</span>}
          </Link>
          <NavbarMenu />
        </div>
      </nav>
    </header>
  )
}
