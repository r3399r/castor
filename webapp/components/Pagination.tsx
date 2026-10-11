import { Button } from '@/components/ui'

export default function Pagination({
  page,
  totalPages,
  onChange,
  disabled = false,
  className = '',
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
  disabled?: boolean
  className?: string
}) {
  if (totalPages <= 1) return null

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2 sm:gap-3 ${className || 'mt-4'}`}
      aria-busy={disabled || undefined}
    >
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={disabled || page === 1}
      >
        ← 上一頁
      </Button>
      <span className="whitespace-nowrap text-sm text-spirit-muted">
        第 {page} / {totalPages} 頁
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={disabled || page === totalPages}
      >
        下一頁 →
      </Button>
    </div>
  )
}
