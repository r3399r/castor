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
      onClick={() => onSort(column)}
      className={`cursor-pointer select-none px-4 py-3 transition-colors hover:text-black-900 ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-black-900' : ''}`}>
        {label}
        {active && (
          <span className="text-[10px] text-blue-700">
            {direction === 'desc' ? '▼' : '▲'}
          </span>
        )}
      </span>
    </th>
  )
}
