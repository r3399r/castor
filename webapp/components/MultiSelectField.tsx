'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Matches the panel's max-h-60 (15rem). Used to decide whether there is
// room to open downwards before committing to a position.
const PANEL_MAX_PX = 240
const PANEL_GAP_PX = 4

/** Viewport coordinates for the portalled panel. */
type Anchor = { left: number; width: number; top?: number; bottom?: number }

export type SelectOption = { value: string; label: string }
export type SelectGroup = { groupLabel: string; options: SelectOption[] }

function isGrouped(opts: SelectOption[] | SelectGroup[]): opts is SelectGroup[] {
  return opts.length > 0 && 'groupLabel' in opts[0]
}

function CheckIcon() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
      <path
        d="M1 4L3.5 6.5L9 1"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function OptionRow({
  opt,
  checked,
  onToggle,
}: {
  opt: SelectOption
  checked: boolean
  onToggle: (v: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(opt.value)}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-beige-100 ${checked ? 'bg-blue-50' : ''}`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked ? 'border-blue-700 bg-blue-700' : 'border-brown-300 bg-white'
        }`}
      >
        {checked && <CheckIcon />}
      </span>
      <span className={checked ? 'font-medium text-blue-700' : 'text-black-900'}>{opt.label}</span>
    </button>
  )
}

export default function MultiSelectField({
  label,
  options,
  value,
  onChange,
  disabled,
  placeholder = '-- 請選擇（可複選）--',
}: {
  label: string
  options: SelectOption[] | SelectGroup[]
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Measured from the trigger in viewport coordinates, because the panel
  // is rendered into document.body rather than next to the trigger -- see
  // the portal below for why.
  const measure = useCallback((): Anchor | null => {
    const el = triggerRef.current
    if (el === null) return null
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    // Flip above the trigger only when below is too tight *and* above is
    // roomier, so a short list near the bottom still opens downwards.
    const openUp = spaceBelow < PANEL_MAX_PX && rect.top > spaceBelow
    return {
      left: rect.left,
      width: rect.width,
      top: openUp ? undefined : rect.bottom + PANEL_GAP_PX,
      bottom: openUp ? window.innerHeight - rect.top + PANEL_GAP_PX : undefined,
    }
  }, [])

  // Measured before opening rather than in an effect afterwards, so the
  // panel never paints for a frame at the wrong position.
  const handleToggle = () => {
    if (disabled === true) return
    if (open) {
      setOpen(false)
      return
    }
    setAnchor(measure())
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const reposition = () => setAnchor(measure())
    // Capture phase: the trigger usually sits inside a scrolling table
    // wrapper, and a scroll there does not bubble to window.
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      // The panel is no longer a DOM descendant of `ref`, so it has to be
      // excluded explicitly -- otherwise mousedown closes the dropdown and
      // unmounts the option before its click can fire, and nothing is ever
      // selectable.
      if (ref.current?.contains(target) === true) return
      if (panelRef.current?.contains(target) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  const allFlat: SelectOption[] = isGrouped(options)
    ? options.flatMap((g) => g.options)
    : options

  const selectedLabels = allFlat.filter((o) => value.includes(o.value)).map((o) => o.label)
  const triggerText =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(', ')
        : `${selectedLabels.length} 項已選`

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      <label className="text-sm font-medium text-black-700">{label}</label>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`flex items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? 'border-blue-700 ring-1 ring-blue-700' : 'border-brown-300'
        }`}
      >
        <span className={`truncate ${selectedLabels.length === 0 ? 'text-black-200' : 'text-black-900'}`}>
          {triggerText}
        </span>
        <span className="ml-2 shrink-0 text-xs text-black-500">{open ? '▲' : '▼'}</span>
      </button>

      {/*
        Rendered into document.body instead of beside the trigger. These
        selects sit inside table wrappers carrying `overflow-x-auto`, and
        CSS has no way to scroll one axis while leaving the other visible:
        a non-visible overflow-x forces overflow-y to compute to auto. That
        made the wrapper a scroll container in both directions, so an
        absolutely positioned panel was clipped at the table's edge and its
        height pushed a second, inner vertical scrollbar onto the table.
        A portal escapes the wrapper's clipping entirely; the cost is that
        the position has to be measured and kept in step by hand.
      */}
      {open && anchor !== null && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: anchor.left,
              width: anchor.width,
              top: anchor.top,
              bottom: anchor.bottom,
            }}
            className="z-50 max-h-60 overflow-y-auto rounded-lg border border-brown-300 bg-white shadow-lg">
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full border-b border-[#E5E0DC] px-3 py-2 text-left text-xs text-black-500 hover:bg-beige-100"
            >
              清除全部選擇
            </button>
          )}
          {isGrouped(options)
            ? options.map((group) => (
                <div key={group.groupLabel}>
                  <div className="bg-[#FAF7F4] px-3 py-1.5 text-xs font-semibold text-black-500">
                    {group.groupLabel}
                  </div>
                  {group.options.map((opt) => (
                    <OptionRow
                      key={opt.value}
                      opt={opt}
                      checked={value.includes(opt.value)}
                      onToggle={toggle}
                    />
                  ))}
                </div>
              ))
            : (options as SelectOption[]).map((opt) => (
                <OptionRow
                  key={opt.value}
                  opt={opt}
                  checked={value.includes(opt.value)}
                  onToggle={toggle}
                />
              ))}
          </div>,
          document.body
        )}
    </div>
  )
}
