export const tagColors = {
  type: 'bg-spirit-mist text-spirit-muted',
  exam: 'bg-spirit-leaf/15 text-spirit-leaf',
  concept: 'bg-spirit-teal/15 text-spirit-teal-hover',
  tag: 'bg-badge-amber text-badge-amber-text',
}

export default function Chip({ label, color = tagColors.type }: { label: string; color?: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}
