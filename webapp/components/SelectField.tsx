import { Field } from '@/components/ui'

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
    <Field label={label}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="ui-control"
      >
        <option value="">-- 請選擇 --</option>
        {children}
      </select>
    </Field>
  )
}
