/**
 * Link to the Facebook post a question was published as.
 *
 * Takes the raw fbPostId rather than a finished href so the URL shape
 * lives in exactly one place: it was previously rebuilt by hand at every
 * call site, and a question whose id is not in Facebook's
 * `{pageId}_{postId}` form would have produced a link to
 * `.../undefined` at some of them and nothing at others.
 *
 * fbPostId is only ever set on a top-level question -- a 題組 and its
 * children are posted as one image and the id is written back to the
 * parent -- so callers pass the parent's value for a group.
 */
function toUrl(fbPostId: string | null | undefined): string | null {
  if (!fbPostId) return null
  const [pageId, postId] = fbPostId.split('_')
  if (!pageId || !postId) return null
  return `https://m.facebook.com/${pageId}/posts/${postId}`
}

export default function DiscussionLink({
  fbPostId,
  className = '',
}: {
  fbPostId?: string | null
  className?: string
}) {
  const href = toUrl(fbPostId)

  const content = (
    <>
      討論區
      <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5.5 2.5H2.5C1.95 2.5 1.5 2.95 1.5 3.5V11.5C1.5 12.05 1.95 12.5 2.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V8.5M8.5 1.5H12.5M12.5 1.5V5.5M12.5 1.5L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </>
  )

  // Shown disabled rather than hidden: the question simply has not been
  // posted yet, and a button that appears and disappears between cards
  // reads as a glitch rather than as a state.
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
