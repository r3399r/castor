export default function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-black-700">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-brown-300 bg-white px-3 py-2.5 text-sm text-black-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">-- 請選擇 --</option>
        {children}
      </select>
    </div>
  )
}
