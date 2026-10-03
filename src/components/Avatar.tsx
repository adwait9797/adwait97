const GRADIENTS = [
  'from-[#fa114f] to-[#ff7a59]',
  'from-[#a6ff00] to-[#2bd96b]',
  'from-[#00d8ff] to-[#5e5ce6]',
  'from-[#ff9f0a] to-[#ffd60a]',
  'from-[#bf5af2] to-[#ff375f]',
]

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function Avatar({
  url,
  name,
  size = 44,
  ring,
}: {
  url?: string | null
  name: string
  size?: number
  /** Show a green "trained today" ring around the avatar, like a story ring. */
  ring?: boolean
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  const inner = url ? (
    <img src={url} alt={name} className="h-full w-full rounded-full object-cover" />
  ) : (
    <div
      className={`flex h-full w-full items-center justify-center rounded-full bg-linear-to-br ${GRADIENTS[hash(name) % GRADIENTS.length]} font-semibold text-black`}
      style={{ fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
  return (
    <div
      className={`shrink-0 rounded-full ${ring ? 'bg-linear-to-tr from-[#a6ff00] to-[#00d8ff] p-[2.5px]' : ''}`}
      style={{ width: size, height: size }}
    >
      <div className={`h-full w-full rounded-full ${ring ? 'bg-black p-[2px]' : ''}`}>{inner}</div>
    </div>
  )
}
