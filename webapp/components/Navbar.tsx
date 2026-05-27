import NavbarMenu from './NavbarMenu'

export default function Navbar() {
  return (
    <nav className="relative border-b border-brown-700">
      <div className="flex items-center justify-between py-3">
        <a href="/" className="font-helvetica text-lg font-bold tracking-[0.02em] text-blue-700">
          PMP - Practice Makes Perfect
        </a>
        <NavbarMenu />
      </div>
    </nav>
  )
}
