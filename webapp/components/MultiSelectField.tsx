'use client'

import { useEffect, useRef, useState } from 'react'

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
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[#FCF9F5] ${checked ? 'bg-blue-50' : ''}`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked ? 'border-[#2547C5] bg-[#2547C5]' : 'border-[#C5B3A7] bg-white'
        }`}
      >
        {checked && <CheckIcon />}
      </span>
      <span className={checked ? 'font-medium text-[#2547C5]' : 'text-[#302B28]'}>{opt.label}</span>
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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
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
        ? selectedLabels.join('、')
        : `${selectedLabels.length} 項已選`

  return (
    <div className="relative flex flex-col gap-1" ref={ref}>
      <label className="text-sm font-medium text-[#4E4946]">{label}</label>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`flex items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? 'border-[#2547C5] ring-1 ring-[#2547C5]' : 'border-[#C5B3A7]'
        }`}
      >
        <span className={`truncate ${selectedLabels.length === 0 ? 'text-[#B2ADAA]' : 'text-[#302B28]'}`}>
          {triggerText}
        </span>
        <span className="ml-2 shrink-0 text-xs text-[#625D5A]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-[#C5B3A7] bg-white shadow-lg">
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full border-b border-[#E5E0DC] px-3 py-2 text-left text-xs text-[#625D5A] hover:bg-[#FCF9F5]"
            >
              清除全部選擇
            </button>
          )}
          {isGrouped(options)
            ? options.map((group) => (
                <div key={group.groupLabel}>
                  <div className="bg-[#FAF7F4] px-3 py-1.5 text-xs font-semibold text-[#625D5A]">
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
        </div>
      )}
    </div>
  )
}
