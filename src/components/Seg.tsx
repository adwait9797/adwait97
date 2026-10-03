import { Segmented, SegmentedButton } from 'konsta/react'

/** iOS dark-mode segmented control (Konsta's default highlight is light grey with black text). */
export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <Segmented strong rounded colors={{ strongBgIos: 'bg-white/10', strongHighlightBgIos: 'bg-[#636366]' }}>
      {options.map((o) => (
        <SegmentedButton
          key={o.value}
          active={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={value === o.value ? 'text-white! font-semibold' : 'text-white/80'}
        >
          {o.label}
        </SegmentedButton>
      ))}
    </Segmented>
  )
}
