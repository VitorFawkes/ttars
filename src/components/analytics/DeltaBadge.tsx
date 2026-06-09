import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DeltaBadgeProps {
  current: number
  previous: number | null | undefined
  /** Quando true, queda é boa (ex: perdidos, tarefas vencidas) */
  inverse?: boolean
  /** Texto curto após a porcentagem (ex: "vs semana passada") */
  hint?: string
}

/**
 * Mostra delta % entre o valor atual e o anterior. Verde quando bom, vermelho quando ruim.
 * - Sem dado anterior: mostra "—" sem cor.
 * - previous === 0 e current > 0: mostra "novo" em vez de Infinity%.
 */
export default function DeltaBadge({ current, previous, inverse, hint }: DeltaBadgeProps) {
  if (previous === null || previous === undefined || Number.isNaN(previous) || Number.isNaN(current)) {
    return <span className="text-xs text-slate-300">—</span>
  }

  if (previous === 0 && current === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <Minus className="w-3 h-3" />
        {hint ?? 'sem mudança'}
      </span>
    )
  }

  if (previous === 0 && current > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
        <TrendingUp className="w-3 h-3" />
        novo {hint && <span className="text-slate-400 font-normal">({hint})</span>}
      </span>
    )
  }

  const deltaPct = ((current - previous) / Math.abs(previous)) * 100
  // Rede de segurança: divisão degenerada (0/0, valores não-numéricos) → não mostra "NaN%".
  if (!Number.isFinite(deltaPct)) {
    return <span className="text-xs text-slate-300">—</span>
  }
  const isPositive = deltaPct > 0
  const isNeutral = Math.abs(deltaPct) < 1

  const good = inverse ? !isPositive : isPositive

  const tone = isNeutral
    ? 'text-slate-400'
    : good
      ? 'text-emerald-700'
      : 'text-rose-700'

  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium tabular-nums', tone)}>
      <Icon className="w-3 h-3" />
      {deltaPct > 0 ? '+' : ''}
      {deltaPct.toFixed(0)}%
      {hint && <span className="text-slate-400 font-normal ml-0.5">{hint}</span>}
    </span>
  )
}
