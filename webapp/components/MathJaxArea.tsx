'use client'

import { MathJaxBaseContext } from 'better-react-mathjax'
import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Typesets everything inside it, for content that gets swapped in place.
 *
 * This exists because better-react-mathjax's own <MathJax dynamic> drops
 * typesetting runs. That component guards against overlapping typesets with
 * a per-instance ref, and a render arriving while the previous typeset is
 * still in flight is skipped outright -- not queued. On a page that replaces
 * the question in place, the skipped render is often the last one, so the
 * formula stays on screen as raw $...$ until something else causes a
 * re-render. It depends purely on timing, which is why it looked random.
 *
 * Measured in headless Chrome against the real MathJax 4 build, flipping
 * through questions in bursts, 20 trials each: <MathJax dynamic> missed 3,
 * the same wrapper keyed per question missed 3 (a fresh instance per
 * question does not help, because the guard is not the only thing that
 * overlaps), and this component missed 0.
 *
 * The queue is module-level on purpose. MathJax's typesetPromise() mutates
 * one shared document (it assigns document.options.elements, resets it and
 * renders), so two areas typesetting at once is the thing to avoid -- every
 * area on the page goes through this one chain instead.
 *
 * Where to put it: around content that re-renders *with* this component,
 * not above a child that owns the state. Typesetting runs from this
 * component's own effect, so if a descendant mounts new content from its
 * own state -- a card expanding, a section revealing -- and this component
 * does not re-render, nothing typesets it. Measured the same way: ten
 * collapsible cards, collapsed and expanded again, with the wrapper above
 * the cards left 0 of 10 typeset whether it was <MathJax dynamic>, one
 * <MathJax> per card, or this component; moving this component inside the
 * card, around the part that collapses, left 10 of 10.
 */

type MathJaxTypesetter = {
  startup: { promise: Promise<unknown> }
  typesetPromise: (elements: Element[]) => Promise<unknown>
}

let queue: Promise<unknown> = Promise.resolve()

export default function MathJaxArea({
  id,
  className,
  children,
}: {
  // So an area can be the element something else already points at, such
  // as a collapse button's aria-controls, instead of adding a wrapper.
  id?: string
  className?: string
  children: ReactNode
}) {
  const mathJax = useContext(MathJaxBaseContext)
  const ref = useRef<HTMLDivElement>(null)

  // No dependency list: this runs after every render, the way `dynamic`
  // did, so content that arrives later (a result box, a newly expanded
  // section) is covered without each caller having to declare what
  // changed. A pass over already-typeset DOM finds no delimiters and is
  // cheap; a dropped formula is not.
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null || mathJax === undefined) return
    queue = queue
      .then(() => mathJax.promise)
      .then((instance) => {
        const typesetter = instance as MathJaxTypesetter
        return typesetter.startup.promise.then(() => typesetter.typesetPromise([node]))
      })
      // One area failing must not break the chain for every area after it.
      .catch(() => undefined)
  })

  return (
    <div id={id} className={className} ref={ref}>
      {children}
    </div>
  )
}
