export default function Footer() {
  return (
    <footer className="noise -mx-4 bg-blue-700 pb-8 pt-0 text-center sm:-mx-6">
      <div className="mx-6 border-t border-blue-400 mb-8" />
      <nav className="flex items-center justify-center gap-8">
        <a href="#" className="text-sm text-blue-100 transition hover:text-white">
          聯絡我們
        </a>
        <a href="#" className="text-sm text-blue-100 transition hover:text-white">
          使用者條款
        </a>
        <a href="#" className="text-sm text-blue-100 transition hover:text-white">
          隱私權政策
        </a>
      </nav>
      <p className="mt-4 text-xs text-blue-200">
        © 2026 celetiao studios. All rights reserved.
      </p>
    </footer>
  )
}
