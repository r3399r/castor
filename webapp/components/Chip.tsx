export const tagColors = {
  type: 'bg-beige-200 text-black-500',
  exam: 'bg-beige-200 text-green-700',
  concept: 'bg-beige-200 text-blue-700',
  tag: 'bg-beige-200 text-amber-700',
}

export default function Chip({ label, color = tagColors.type }: { label: string; color?: string }) {
  return (
    <span className={`inline-block rounded-full border border-beige-300 px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}
