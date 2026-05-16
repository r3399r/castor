'use client'

import { MathJaxContext } from 'better-react-mathjax'
import type { ReactNode } from 'react'

const config = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
  },
}

export default function MathJaxProvider({ children }: { children: ReactNode }) {
  return <MathJaxContext config={config}>{children}</MathJaxContext>
}
