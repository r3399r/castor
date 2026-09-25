type FooterProps = {
  variant?: 'default' | 'learning'
}

export default function Footer({ variant = 'default' }: FooterProps) {
  const learning = variant === 'learning'

  return (
    <footer
      className={`${learning ? 'site-footer--learning' : 'noise bg-blue-700 pb-8 pt-0'} relative z-10 -mx-4 text-center sm:-mx-6`}
    >
      {!learning && <div className="mx-6 mb-8 border-t border-beige-100/25" />}
      <nav className="flex items-center justify-center gap-8">
        <a href="#" className={`text-sm transition ${learning ? '' : 'text-blue-100 hover:text-white'}`}>
          聯絡我們
        </a>
        <a href="#" className={`text-sm transition ${learning ? '' : 'text-blue-100 hover:text-white'}`}>
          使用者條款
        </a>
        <a href="#" className={`text-sm transition ${learning ? '' : 'text-blue-100 hover:text-white'}`}>
          隱私權政策
        </a>
      </nav>
      <p className={`site-footer__copyright mt-4 text-xs ${learning ? '' : 'text-blue-200'}`}>
        © 2026 celetiao studios. All rights reserved.
      </p>
    </footer>
  )
}
