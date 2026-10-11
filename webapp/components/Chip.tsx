export const tagColors = {
  type: 'bg-badge-type text-badge-type-text',
  exam: 'bg-badge-exam text-badge-exam-text',
  concept: 'bg-badge-concept text-badge-concept-text',
  tag: 'bg-badge-tag text-badge-tag-text',
}

export default function Chip({ label, color = tagColors.type }: { label: string; color?: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}
