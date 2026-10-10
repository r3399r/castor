type FooterProps = {
  variant?: 'default' | 'learning'
}

export default function Footer({ variant = 'default' }: FooterProps) {
  const learning = variant === 'learning'

  return (
    <footer
      className={`${learning ? 'site-footer--learning' : 'noise bg-spirit-deep py-8'} relative z-10 -mx-4 text-center sm:-mx-6`}
    >
      <nav className="flex items-center justify-center gap-8">
        <a href="#" className={`text-sm transition ${learning ? '' : 'text-spirit-on-dark hover:text-spirit-gold'}`}>
          聯絡我們
        </a>
        <a href="#" className={`text-sm transition ${learning ? '' : 'text-spirit-on-dark hover:text-spirit-gold'}`}>
          使用者條款
        </a>
        <a href="#" className={`text-sm transition ${learning ? '' : 'text-spirit-on-dark hover:text-spirit-gold'}`}>
          隱私權政策
        </a>
      </nav>
      <p className={`site-footer__copyright mt-4 text-xs ${learning ? '' : 'text-spirit-on-dark/75'}`}>
        © 2026 celetiao studios. All rights reserved.
      </p>
    </footer>
  )
}
