import { Calendar, CheckCircle2, FileText, Award } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EngajamentoMeetingKpis } from '@/types/engagement'

interface Props {
  metrics: EngajamentoMeetingKpis | undefined
  totalContacts: number
  isLoading?: boolean
  onCardClick?: (key: 'scheduled' | 'done' | 'proposals' | 'contracts') => void
  activeKey?: 'scheduled' | 'done' | 'proposals' | 'contracts' | null
}

function pct(num: number, denom: number): string {
  if (!denom) return '·'
  return `${((num / denom) * 100).toFixed(1)}%`
}

export default function EngajamentoReunioes({
  metrics,
  totalContacts,
  isLoading,
  onCardClick,
  activeKey,
}: Props) {
  const m = metrics ?? {
    meetings_scheduled: 0,
    meetings_done: 0,
    proposals_sent: 0,
    contracts_signed: 0,
  }

  const cards: Array<{
    key: 'scheduled' | 'done' | 'proposals' | 'contracts'
    title: string
    value: number
    subtitle: string
    icon: typeof Calendar
    fg: string
    bg: string
    ring: string
  }> = [
    {
      key: 'scheduled',
      title: 'Reuniões agendadas',
      value: m.meetings_scheduled,
      subtitle: 'aceitaram marcar, ainda não aconteceu',
      icon: Calendar,
      fg: 'text-violet-700',
      bg: 'bg-violet-100',
      ring: 'ring-violet-200',
    },
    {
      key: 'done',
      title: 'Reuniões feitas',
      value: m.meetings_done,
      subtitle: `${pct(m.meetings_done, totalContacts)} dos contatos do período`,
      icon: CheckCircle2,
      fg: 'text-emerald-700',
      bg: 'bg-emerald-100',
      ring: 'ring-emerald-200',
    },
    {
      key: 'proposals',
      title: 'Propostas enviadas',
      value: m.proposals_sent,
      subtitle: `${pct(m.proposals_sent, m.meetings_done)} das reuniões viraram proposta`,
      icon: FileText,
      fg: 'text-sky-700',
      bg: 'bg-sky-100',
      ring: 'ring-sky-200',
    },
    {
      key: 'contracts',
      title: 'Contratos assinados',
      value: m.contracts_signed,
      subtitle: `${pct(m.contracts_signed, m.proposals_sent)} das propostas fecharam`,
      icon: Award,
      fg: 'text-amber-700',
      bg: 'bg-amber-100',
      ring: 'ring-amber-200',
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
          Reuniões e fechamento
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Clique num card pra filtrar a tabela. A SDR move o card no funil conforme o lead avança.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, idx) => {
          const clickable = !!onCardClick
          const isActive = activeKey === c.key
          const Wrapper = clickable ? 'button' : 'div'
          return (
            <Wrapper
              key={c.title}
              onClick={clickable ? () => onCardClick!(c.key) : undefined}
              className={cn(
                'group bg-white border rounded-xl p-4 shadow-sm text-left w-full transition-all duration-150',
                isActive
                  ? `border-slate-400 ring-2 ${c.ring}`
                  : 'border-slate-200',
                clickable && 'cursor-pointer hover:shadow-md hover:border-slate-300 active:scale-[0.98]'
              )}
              style={{
                animation: `meetEnter 320ms cubic-bezier(0.23, 1, 0.32, 1) ${idx * 50}ms both`,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.bg} ${c.fg}`}>
                  <c.icon className="w-4 h-4" />
                </div>
                {clickable && (
                  <span
                    className={cn(
                      'text-[10px] font-medium transition-opacity',
                      isActive
                        ? 'opacity-100 text-slate-600'
                        : 'opacity-0 group-hover:opacity-100 text-slate-400'
                    )}
                  >
                    {isActive ? 'filtrado' : 'filtrar →'}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-500 mt-3">{c.title}</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5 tabular-nums tracking-tight">
                {c.value.toLocaleString('pt-BR')}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{c.subtitle}</p>
            </Wrapper>
          )
        })}
      </div>
      <style>{`
        @keyframes meetEnter {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
