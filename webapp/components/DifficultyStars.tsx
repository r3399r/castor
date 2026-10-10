export default function DifficultyStars({ value, tone = 'default' }: { value: number; tone?: 'default' | 'forest' }) {
  const filled = value / 2
  const emptyColor = tone === 'forest' ? '#E8DDD0' : '#DBD0C8'
  const filledColor = tone === 'forest' ? '#D98A2B' : '#5B7FC4'
  return (
    <div className="flex shrink-0 items-center gap-1" aria-label={`難度 ${filled}/5`}>
      <span className="text-xs font-medium text-black-400 whitespace-nowrap">難易度：</span>
      <div className="flex gap-px">
        {Array.from({ length: 5 }).map((_, i) => {
          const fraction = Math.min(1, Math.max(0, filled - i))
          return (
            <span key={i} className="relative inline-flex items-center justify-center w-5 h-5">
              {/* empty star background */}
              <svg viewBox="0 0 20 20" className="icon-md" fill="none">
                <path
                  d="M10 2.5l2.06 4.17 4.6.67-3.33 3.24.79 4.58L10 12.77l-4.12 2.19.79-4.58L3.34 7.34l4.6-.67L10 2.5z"
                  fill={emptyColor}
                  stroke={emptyColor}
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
              </svg>
              {/* filled overlay */}
              {fraction > 0 && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fraction * 100}%` }}
                >
                  <svg viewBox="0 0 20 20" className="icon-md" fill="none">
                    <path
                      d="M10 2.5l2.06 4.17 4.6.67-3.33 3.24.79 4.58L10 12.77l-4.12 2.19.79-4.58L3.34 7.34l4.6-.67L10 2.5z"
                      fill={filledColor}
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
