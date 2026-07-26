export default function BackToAdminLink({
  href = '/admin',
  label = '← 返回管理後台',
}: {
  href?: string
  label?: string
}) {
  return (
    <a
      href={href}
      className="mt-6 inline-flex items-center gap-1 text-sm text-black-500 transition hover:text-blue-700"
    >
      {label}
    </a>
  )
}
