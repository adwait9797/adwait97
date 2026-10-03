import { IconPlus } from './icons'

/** iOS-style − / + stepper. */
export function NumStepper({ onMinus, onPlus, minusDisabled, plusDisabled }: {
  onMinus: () => void
  onPlus: () => void
  minusDisabled?: boolean
  plusDisabled?: boolean
}) {
  const btn = 'flex h-9 w-12 items-center justify-center active:bg-white/10 disabled:opacity-30'
  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-[10px] bg-card-2">
      <button type="button" aria-label="Decrease" className={btn} disabled={minusDisabled} onClick={onMinus}>
        <span className="block h-[2.5px] w-4 rounded-full bg-white" />
      </button>
      <span className="h-5 w-px bg-white/20" />
      <button type="button" aria-label="Increase" className={btn} disabled={plusDisabled} onClick={onPlus}>
        <IconPlus size={20} strokeWidth={2.5} />
      </button>
    </div>
  )
}
