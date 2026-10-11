export default function DiscussionLink({
  href,
  className = '',
}: {
  href?: string | null
  className?: string
}) {
  const content = (
    <>
      討論區
      <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5.5 2.5H2.5C1.95 2.5 1.5 2.95 1.5 3.5V11.5C1.5 12.05 1.95 12.5 2.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V8.5M8.5 1.5H12.5M12.5 1.5V5.5M12.5 1.5L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </>
  )

  if (!href) {
    return (
      <span className={`discussion-link ${className}`} aria-disabled="true">
        {content}
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`discussion-link ${className}`}
    >
      {content}
    </a>
  )
}
