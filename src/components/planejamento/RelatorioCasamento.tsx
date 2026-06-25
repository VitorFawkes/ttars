import { CalendarClock, DollarSign, BedDouble, ListChecks, Landmark } from 'lucide-react'
import { brl, daysUntil } from '../../lib/planejamento/format'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { PLANEJ_FIELD, PLANEJAMENTO_LABEL } from '../../hooks/planejamento/types'

function num(pd: Record<string, unknown> | null, key: string): number | null {
  if (!pd) return null
  const v = pd[key]
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
    return Number.isNaN(n) ? null : n
  }
  return null
}

export function RelatorioCasamento({ wedding }: { wedding: WeddingPlanejamento }) {
  const days = daysUntil(wedding.wedding_date)

  const pacoteValor = num(wedding.produto_data, PLANEJ_FIELD.pacoteValor)
  const sinal = num(wedding.produto_data, PLANEJ_FIELD.sinalValor)
  const valorTotal = num(wedding.produto_data, PLANEJ_FIELD.valorTotal)
  const evento = valorTotal ?? pacoteValor
  const hosp = wedding.hotelTarifa != null && wedding.hotelQuartos != null
    ? wedding.hotelTarifa * wedding.hotelQuartos
    : null

  const checklistPct = wedding.checklist.total > 0
    ? Math.round((wedding.checklist.feitos / wedding.checklist.total) * 100)
    : 0

  return (
    <div className="pt-3">

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={<CalendarClock className="w-4 h-4" />}
          label="Etapa atual"
          value={PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]}
          sub={days == null ? 'sem data' : days < 0 ? 'casamento passou' : days === 0 ? 'é hoje!' : `faltam ${days} dias`}
        />
        <Stat
          icon={<Landmark className="w-4 h-4" />}
          label="Casamento (evento)"
          value={evento != null ? brl.format(evento) : '—'}
          sub={valorTotal != null ? 'valor total' : pacoteValor != null ? 'valor do pacote' : 'a definir'}
        />
        <Stat
          icon={<BedDouble className="w-4 h-4" />}
          label="Hospedagem"
          value={hosp != null ? `${brl.format(hosp)}/noite` : '—'}
          sub="tarifa × quartos do bloco"
        />
        <Stat
          icon={<DollarSign className="w-4 h-4" />}
          label="Sinal recebido"
          value={sinal != null ? brl.format(sinal) : '—'}
          sub="do contrato do casamento"
        />
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Bar
          icon={<ListChecks className="w-4 h-4" />}
          label="Trava da etapa"
          done={wedding.gate.met}
          total={wedding.gate.total}
          tone={wedding.gate.allOk ? 'emerald' : 'amber'}
        />
        <Bar
          icon={<ListChecks className="w-4 h-4" />}
          label={`Cronograma & checklist (${checklistPct}%)`}
          done={wedding.checklist.feitos}
          total={wedding.checklist.total}
          tone="indigo"
        />
      </div>
    </div>
  )
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
        <span className="text-slate-400">{icon}</span> {label}
      </p>
      <p className="text-sm font-semibold text-slate-900 mt-1 truncate" title={value}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}

const BAR_TONE: Record<string, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  indigo: 'bg-indigo-500',
}

function Bar({ icon, label, done, total, tone }: { icon: React.ReactNode; label: string; done: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-slate-600 inline-flex items-center gap-1.5">
          <span className="text-slate-400">{icon}</span> {label}
        </span>
        <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{done}/{total}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={BAR_TONE[tone] ?? 'bg-slate-400'} style={{ width: `${pct}%`, height: '100%' }} />
      </div>
    </div>
  )
}
