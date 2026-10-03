/** Flat dumbbell mark, same geometry as public/icon.svg. */
export function DumbbellMark({ width = 120 }: { width?: number }) {
  return (
    <svg width={width} viewBox="96 122 320 140" fill="#a6ff00" aria-hidden="true">
      <rect x="96" y="148" width="36" height="88" rx="10" />
      <rect x="136" y="122" width="40" height="140" rx="12" />
      <rect x="172" y="179" width="168" height="26" rx="6" />
      <rect x="336" y="122" width="40" height="140" rx="12" />
      <rect x="380" y="148" width="36" height="88" rx="10" />
    </svg>
  )
}

export function Logo() {
  return (
    <div className="flex flex-col items-center">
      <DumbbellMark />
      <h1 className="mt-5 text-[40px] leading-none font-extrabold tracking-tight">GymBuddies</h1>
      <span className="mt-1.5 text-[17px] font-semibold text-muted">by 97</span>
    </div>
  )
}
