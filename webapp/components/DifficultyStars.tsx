export default function DifficultyStars({ value }: { value: number }) {
  const filled = value / 2
  return (
    <div className="flex gap-0.5" aria-label={`難度 ${filled}/5`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const fraction = Math.min(1, Math.max(0, filled - i))
        return (
          <span key={i} className="relative inline-block text-gray-200">
            ★
            <span
              className="absolute inset-0 overflow-hidden text-yellow-400"
              style={{ width: `${fraction * 100}%` }}
            >
              ★
            </span>
          </span>
        )
      })}
    </div>
  )
}
