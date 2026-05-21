import { cn } from '@/lib/utils'
import type { EngajamentoKpis } from '@/types/engagement'

interface Props {
  kpis: EngajamentoKpis | undefined
  isLoading?: boolean
  onReplyRateClick?: () => void
  onActiveClick?: () => void
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '·'
  return `${value.toFixed(1)}%`
}

function hours(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || value < 0) return '·'
  if (value < 1) return `${Math.round(value * 60)}min`
  if (value < 24) return `${value.toFixed(1)}h`
  return `${(value / 24).toFixed(1)}d`
}

export default function EngajamentoHeroKpis({
  kpis,
  isLoading,
  onReplyRateClick,
  onActiveClick,
}: Props) {
  const replyRate = kpis?.reply_rate ?? 0
  const responders = Math.round(((kpis?.reply_rate ?? 0) / 100) * (kpis?.total_contacts ?? 0))

  const cards = [
    {
      title: 'Taxa de Resposta',
      hero: pct(kpis?.reply_rate),
      subtitle:
        kpis && kpis.total_contacts > 0
          ? `${responders.toLocaleString('pt-BR')} de ${kpis.total_contacts.toLocaleString('pt-BR')} pessoas responderam`
          : 'sem dados no período',
      accent: 'from-emerald-50 to-white',
      ring: 'ring-emerald-100',
      bar: 'bg-emerald-500',
      progress: replyRate,
      onClick: onReplyRateClick,
      hint: 'ver quem respondeu',
    },
    {
      title: 'Tempo até nossa 1ª resposta',
      hero: hours(kpis?.frt_median_hours),
      subtitle: 'mediana: metade respondida antes disso',
      accent: 'from-sky-50 to-white',
      ring: 'ring-sky-100',
      bar: 'bg-sky-500',
      progress: null,
      onClick: undefined,
      hint: '',
    },
    {
      title: 'Conversas ativas',
      hero: (kpis?.active_count ?? 0).toLocaleString('pt-BR'),
      subtitle: 'algum movimento nos últimos 7 dias',
      accent: 'from-violet-50 to-white',
      ring: 'ring-violet-100',
      bar: 'bg-violet-500',
      progress: null,
      onClick: onActiveClick,
      hint: 'ver quem está ativo',
    },
  ]

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="h-32 bg-white border border-slate-200 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((c, idx) => {
        const Wrapper = c.onClick ? 'button' : 'div'
        return (
          <Wrapper
            key={c.title}
            onClick={c.onClick}
            className={cn(
              'group relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br p-5 ring-1 shadow-sm text-left w-full',
              c.accent,
              c.ring,
              c.onClick && 'cursor-pointer hover:shadow-md hover:border-slate-300 active:scale-[0.99] transition-all'
            )}
            style={{
              animation: `kpiEnter 360ms cubic-bezier(0.23, 1, 0.32, 1) ${idx * 60}ms both`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                {c.title}
              </p>
              {c.hint && (
                <span className="text-[10px] font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {c.hint} →
                </span>
              )}
            </div>
            <p className="text-4xl font-bold text-slate-900 mt-2 tracking-tight tabular-nums">
              {c.hero}
            </p>
            <p className="text-xs text-slate-500 mt-1">{c.subtitle}</p>

            {c.progress !== null && (
              <div className="mt-3 h-1 w-full bg-slate-200/70 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', c.bar)}
                  style={{
                    width: `${Math.min(100, c.progress)}%`,
                    transition: 'width 600ms cubic-bezier(0.23, 1, 0.32, 1)',
                  }}
                />
              </div>
            )}
          </Wrapper>
        )
      })}

      <style>{`
        @keyframes kpiEnter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
