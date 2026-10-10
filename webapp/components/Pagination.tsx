import { Button } from '@/components/ui'

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
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
      >
        ← 上一頁
      </Button>
      <span className="text-sm text-spirit-muted">
        第 {page} / {totalPages} 頁
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
      >
        下一頁 →
      </Button>
    </div>
  )
}
