export const tagColors = {
  type: 'bg-beige-200 text-black-500',
  exam: 'bg-green-600/20 text-green-900',
  concept: 'bg-blue-600/20 text-blue-900',
  tag: 'bg-amber-600/20 text-amber-900',
}

export default function Chip({ label, color = tagColors.type }: { label: string; color?: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}
