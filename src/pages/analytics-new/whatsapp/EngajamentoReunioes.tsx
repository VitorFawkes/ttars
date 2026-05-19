import { Calendar, CheckCircle2, FileText, Award } from 'lucide-react'
import type { EngajamentoMeetingKpis } from '@/types/engagement'

interface Props {
  metrics: EngajamentoMeetingKpis | undefined
  totalContacts: number
  isLoading?: boolean
}

function pct(num: number, denom: number): string {
  if (!denom) return '—'
  return `${((num / denom) * 100).toFixed(1)}%`
}

export default function EngajamentoReunioes({ metrics, totalContacts, isLoading }: Props) {
  const m = metrics ?? {
    meetings_scheduled: 0,
    meetings_done: 0,
    proposals_sent: 0,
    contracts_signed: 0,
  }

  const cards = [
    {
      title: 'Reuniões agendadas',
      value: m.meetings_scheduled,
      subtitle: 'aceitaram marcar, ainda não aconteceu',
      icon: Calendar,
      fg: 'text-violet-700',
      bg: 'bg-violet-100',
    },
    {
      title: 'Reuniões feitas',
      value: m.meetings_done,
      subtitle: `${pct(m.meetings_done, totalContacts)} dos contatos do período`,
      icon: CheckCircle2,
      fg: 'text-emerald-700',
      bg: 'bg-emerald-100',
    },
    {
      title: 'Propostas enviadas',
      value: m.proposals_sent,
      subtitle: `${pct(m.proposals_sent, m.meetings_done)} das reuniões viraram proposta`,
      icon: FileText,
      fg: 'text-sky-700',
      bg: 'bg-sky-100',
    },
    {
      title: 'Contratos assinados',
      value: m.contracts_signed,
      subtitle: `${pct(m.contracts_signed, m.proposals_sent)} das propostas fecharam`,
      icon: Award,
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
          Reuniões e fechamento
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          A SDR move o card no funil conforme o lead avança — sem integração com Active Campaign
          (que só roda no Trips). Esses números vêm direto do pipeline interno.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, idx) => (
          <div
            key={c.title}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"
            style={{
              animation: `meetEnter 320ms cubic-bezier(0.23, 1, 0.32, 1) ${idx * 50}ms both`,
            }}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.bg} ${c.fg}`}>
              <c.icon className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-slate-500 mt-3">{c.title}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5 tabular-nums tracking-tight">
              {c.value.toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{c.subtitle}</p>
          </div>
        ))}
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
