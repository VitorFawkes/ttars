import { Snowflake, Trophy, TrendingDown, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConversationState, EngajamentoKpis } from '@/types/engagement'

interface Props {
  kpis: EngajamentoKpis | undefined
  isLoading?: boolean
  activeState: ConversationState | null
  onToggleState: (state: ConversationState) => void
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)}%`
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(1)
}

export default function EngajamentoSecondaryKpis({
  kpis,
  isLoading,
  activeState,
  onToggleState,
}: Props) {
  const cards: Array<{
    key: ConversationState | null
    title: string
    value: string
    subtitle: string
    icon: typeof Snowflake
    fg: string
    bg: string
    hover: string
  }> = [
    {
      key: null,
      title: 'Profundidade média',
      value: num(kpis?.depth_avg),
      subtitle: 'mensagens recebidas por pessoa',
      icon: MessageSquare,
      fg: 'text-slate-700',
      bg: 'bg-slate-100',
      hover: '',
    },
    {
      key: 'lost',
      title: 'Respondeu e sumiu',
      value: pct(kpis?.responded_once_left_pct),
      subtitle: '1 inbound e parou 48h+',
      icon: TrendingDown,
      fg: 'text-amber-700',
      bg: 'bg-amber-100',
      hover: 'hover:bg-amber-50',
    },
    {
      key: 'cold',
      title: 'Nunca respondeu',
      value: pct(kpis?.cold_pct),
      subtitle: 'sem nenhum inbound',
      icon: Snowflake,
      fg: 'text-slate-600',
      bg: 'bg-slate-100',
      hover: 'hover:bg-slate-50',
    },
    {
      key: 'won',
      title: 'Virou venda',
      value: pct(kpis?.win_rate),
      subtitle: 'ganho no SDR ou comercial',
      icon: Trophy,
      fg: 'text-emerald-700',
      bg: 'bg-emerald-100',
      hover: 'hover:bg-emerald-50',
    },
  ]

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c, idx) => {
        const isActive = c.key && activeState === c.key
        const clickable = c.key !== null
        const Wrapper = clickable ? 'button' : 'div'
        return (
          <Wrapper
            key={c.title}
            onClick={clickable ? () => onToggleState(c.key as ConversationState) : undefined}
            className={cn(
              'group relative bg-white border rounded-xl p-4 text-left transition-all duration-150',
              isActive
                ? 'border-indigo-300 ring-2 ring-indigo-100 shadow-sm'
                : 'border-slate-200 shadow-sm',
              clickable && 'active:scale-[0.98] cursor-pointer',
              clickable && c.hover
            )}
            style={{
              animation: `kpiSecEnter 320ms cubic-bezier(0.23, 1, 0.32, 1) ${idx * 50 + 200}ms both`,
            }}
          >
            <div className="flex items-start justify-between">
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  c.bg,
                  c.fg
                )}
              >
                <c.icon className="w-4 h-4" />
              </div>
              {clickable && (
                <span
                  className={cn(
                    'text-[10px] font-medium opacity-0 transition-opacity',
                    isActive
                      ? 'opacity-100 text-indigo-600'
                      : 'group-hover:opacity-100 text-slate-400'
                  )}
                >
                  {isActive ? 'filtrado' : 'filtrar →'}
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-slate-500 mt-3">{c.title}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5 tabular-nums tracking-tight">
              {c.value}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{c.subtitle}</p>
          </Wrapper>
        )
      })}
      <style>{`
        @keyframes kpiSecEnter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
