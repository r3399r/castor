export default function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="rounded-md border border-brown-300 px-4 py-2 text-sm disabled:opacity-40"
      >
        ← 上一頁
      </button>
      <span className="text-sm text-black-500">
        第 {page} / {totalPages} 頁
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="rounded-md border border-brown-300 px-4 py-2 text-sm disabled:opacity-40"
      >
        下一頁 →
      </button>
    </div>
  )
}
