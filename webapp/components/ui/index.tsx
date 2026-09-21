'use client'

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet'
}) {
  return (
    <button
      type={type}
      className={`sp-button sp-button--${variant} ${className}`}
      {...props}
    />
  )
}
export function Card({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`sp-card ${className}`} {...props} />
}
export function ContentPanel({
  className = '',
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section className={`sp-panel ${className}`} {...props} />
}
export const Panel = ContentPanel
export function Badge({
  tone = 'neutral',
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'growth' | 'complete'
}) {
  return (
    <span className={`sp-badge sp-badge--${tone} ${className}`} {...props} />
  )
}
export function Progress({
  value,
  max,
  label,
}: {
  value: number
  max: number
  label: string
}) {
  const safeMax = Math.max(1, max)
  const safeValue = Math.max(0, Math.min(value, safeMax))
  return (
    <div
      className="sp-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
    >
      <span style={{ width: `${(safeValue / safeMax) * 100}%` }} />
    </div>
  )
}
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
  id,
}: {
  value: T
  onChange: (value: T) => void
  items: readonly { value: T; label: string; icon?: ReactNode }[]
  label: string
  id: string
}) {
  return (
    <div className="sp-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          id={`${id}-${item.value}`}
          aria-selected={value === item.value}
          aria-controls={`${id}-panel`}
          tabIndex={value === item.value ? 0 : -1}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => {
            let next = index
            if (event.key === 'ArrowRight') next = (index + 1) % items.length
            else if (event.key === 'ArrowLeft')
              next = (index - 1 + items.length) % items.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = items.length - 1
            else return
            event.preventDefault()
            onChange(items[next].value)
            document.getElementById(`${id}-${items[next].value}`)?.focus()
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  )
}
export function Modal({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string
  children: ReactNode
  onClose: () => void
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog?.showModal()
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  if (typeof document === 'undefined') return null
  return createPortal(
    <dialog
      ref={ref}
      className={`spirit-theme sp-modal ${className}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0)
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
      onCancel={(event) => {
        event.preventDefault()
        closeRef.current()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose()
      }}
    >
      <header className="sp-modal-header">
        <h2 id={titleId}>{title}</h2>
        <Button variant="quiet" onClick={onClose} aria-label="關閉視窗">
          <X size={20} aria-hidden="true" />
        </Button>
      </header>
      {children}
    </dialog>,
    document.body,
  )
}
