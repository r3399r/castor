export type SortDirection = 'asc' | 'desc'

export default function SortableTh<T extends string>({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = 'left',
}: {
  label: string
  column: T
  activeColumn: T
  direction: SortDirection
  onSort: (column: T) => void
  align?: 'left' | 'right'
}) {
  const active = activeColumn === column

  return (
    <th
      className={`select-none p-0 transition-colors ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex w-full items-center gap-1 px-4 py-3 text-spirit-muted transition-colors hover:text-spirit-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-spirit-canopy ${align === 'right' ? 'flex-row-reverse justify-start' : ''} ${active ? 'text-spirit-ink' : ''}`}
      >
        {label}
        {active && (
          <span className="text-spirit-micro text-spirit-canopy">
            {direction === 'desc' ? '▼' : '▲'}
          </span>
        )}
      </button>
    </th>
  )
}
