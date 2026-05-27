type Props = {
  lift: number | null | undefined
  size?: 'sm' | 'md'
  showDelta?: boolean
}

/**
 * Mostra o lift de uma categoria (taxa de fechamento relativa à média).
 * - lift >= 1.2  → verde "fecha mais que a média"
 * - lift 0.8-1.2 → cinza "na média"
 * - lift < 0.8   → rosa "fecha menos que a média"
 * - lift null    → traço (amostra insuficiente)
 */
export function LiftBadge({ lift, size = 'sm', showDelta = true }: Props) {
  if (lift === null || lift === undefined) {
    return <span className="text-slate-300 text-xs">—</span>
  }

  const sizeClass = size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs'

  let bg = 'bg-slate-100 text-slate-700 border-slate-200'
  let icon = '·'
  let label = 'na média'
  if (lift >= 1.5) {
    bg = 'bg-emerald-100 text-emerald-800 border-emerald-200'
    icon = '↑↑'
    label = 'fecha muito mais'
  } else if (lift >= 1.2) {
    bg = 'bg-emerald-50 text-emerald-700 border-emerald-200'
    icon = '↑'
    label = 'fecha mais'
  } else if (lift < 0.5) {
    bg = 'bg-rose-100 text-rose-800 border-rose-200'
    icon = '↓↓'
    label = 'fecha bem menos'
  } else if (lift < 0.8) {
    bg = 'bg-rose-50 text-rose-700 border-rose-200'
    icon = '↓'
    label = 'fecha menos'
  }

  const delta = showDelta ? ` ${formatDelta(lift)}` : ''
  return (
    <span
      title={`Lift = ${lift.toFixed(2)} (${label} que a média)`}
      className={`inline-flex items-center gap-1 ${sizeClass} rounded-md border font-medium tabular-nums ${bg}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{lift.toFixed(2)}x</span>
      {showDelta && <span className="opacity-70">{delta}</span>}
    </span>
  )
}

function formatDelta(lift: number): string {
  const pct = Math.round((lift - 1) * 100)
  if (pct === 0) return ''
  return pct > 0 ? `(+${pct}%)` : `(${pct}%)`
}
