interface Ring {
  value: number
  max: number
  color: string
}

/** Apple-style concentric activity rings. Outermost ring first. */
export function Rings({ rings, size = 140, stroke = 16 }: { rings: Ring[]; size?: number; stroke?: number }) {
  const gap = 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      {rings.map((ring, i) => {
        const r = size / 2 - stroke / 2 - i * (stroke + gap)
        if (r <= stroke / 2) return null
        const circ = 2 * Math.PI * r
        const pct = ring.max > 0 ? Math.min(ring.value / ring.max, 1) : 0
        const offset = circ * (1 - pct)
        return (
          <g key={i}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.color} strokeOpacity={0.22} strokeWidth={stroke} />
            {pct > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={ring.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                className="ring-anim"
                style={{ ['--ring-circ' as string]: circ }}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
