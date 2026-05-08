export const tagColors = {
  type: 'bg-gray-100 text-gray-700',
  exam: 'bg-green-100 text-green-700',
  concept: 'bg-blue-100 text-blue-700',
  tag: 'bg-yellow-100 text-yellow-700',
}

export default function Chip({ label, color = tagColors.type }: { label: string; color?: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}
