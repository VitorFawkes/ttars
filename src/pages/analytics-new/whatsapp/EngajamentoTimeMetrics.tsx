import { Clock, Calendar, Inbox, AlertTriangle } from 'lucide-react'
import type { EngajamentoTimeMetrics as TimeMetrics } from '@/types/engagement'

interface Props {
  metrics: TimeMetrics | undefined
  isLoading?: boolean
}

function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || value < 0) return '—'
  if (value < 1) return `${Math.round(value * 24)}h`
  return `${value.toFixed(1)}d`
}

function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return Math.round(value).toLocaleString('pt-BR')
}

export default function EngajamentoTimeMetrics({ metrics, isLoading }: Props) {
  const cards = [
    {
      title: 'Duração das conversas',
      value: formatDays(metrics?.median_conversation_duration_days),
      subtitle: 'mediana — da 1ª nossa até a última',
      icon: Calendar,
      fg: 'text-sky-700',
      bg: 'bg-sky-100',
    },
    {
      title: 'Duração até virar venda',
      value: formatDays(metrics?.median_conversation_duration_days_won),
      subtitle: 'mediana das conversas ganhas',
      icon: Clock,
      fg: 'text-emerald-700',
      bg: 'bg-emerald-100',
    },
    {
      title: 'Msgs nossas até desistir',
      value: formatInt(metrics?.median_outbounds_no_reply),
      subtitle: 'mediana de outbounds em quem nunca respondeu',
      icon: Inbox,
      fg: 'text-violet-700',
      bg: 'bg-violet-100',
    },
    {
      title: 'Mais persistente',
      value: formatInt(metrics?.max_outbounds_no_reply),
      subtitle: 'msgs nossas pro lead que mais insistimos sem resposta',
      icon: AlertTriangle,
      fg: 'text-amber-700',
      bg: 'bg-amber-100',
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
    <div>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-900 tracking-tight">
          Tempo e ritmo
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Quanto cada conversa dura, quanto insistimos antes de desistir
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, idx) => (
          <div
            key={c.title}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"
            style={{
              animation: `tmEnter 320ms cubic-bezier(0.23, 1, 0.32, 1) ${idx * 50}ms both`,
            }}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.bg} ${c.fg}`}>
              <c.icon className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-slate-500 mt-3">{c.title}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5 tabular-nums tracking-tight">
              {c.value}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{c.subtitle}</p>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes tmEnter {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
