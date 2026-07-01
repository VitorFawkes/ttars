import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  AlertTriangle,
  DollarSign,
  CalendarClock,
  ArrowLeft,
  Loader2,
  Heart,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { brl, daysUntil } from '../../lib/planejamento/format'
import { usePlanejamentoWeddings } from '../../hooks/planejamento/usePlanejamentoWeddings'
import {
  PLANEJAMENTO_ORDER,
  PLANEJAMENTO_LABEL,
  PLANEJ_FIELD,
  type EtapaPlanejamento,
} from '../../hooks/planejamento/types'

function hasSinal(pd: Record<string, unknown> | null): boolean {
  if (!pd) return false
  const v = pd[PLANEJ_FIELD.sinalPagoEm]
  return typeof v === 'string' && v.trim().length > 0
}

function num(pd: Record<string, unknown> | null, key: string): number {
  if (!pd) return 0
  const v = pd[key]
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

export default function PlanejamentoPortfolioPage() {
  const { data, isLoading } = usePlanejamentoWeddings()

  const stats = useMemo(() => {
    const porEtapa = new Map<EtapaPlanejamento, number>()
    for (const e of PLANEJAMENTO_ORDER) porEtapa.set(e, 0)
    let travados = 0
    let semData = 0
    let pertoSemSinal = 0
    let fornPago = 0
    let fornTotal = 0
    let sinais = 0

    for (const w of data) {
      porEtapa.set(w.planejamentoEtapa, (porEtapa.get(w.planejamentoEtapa) ?? 0) + 1)
      // "travado" = a MESMA régua da tela do casamento e do quadro: a etapa tem
      // tarefa-trava 🔒 pendente (Fase 4). Antes usava o gate legado (computeGate),
      // que dava número diferente do que o usuário via na tela → confiança quebrada.
      if (w.travaPendentes.length > 0) travados += 1
      if (!w.wedding_date) semData += 1
      const d = daysUntil(w.wedding_date)
      if (d != null && d >= 0 && d <= 90 && !hasSinal(w.produto_data)) pertoSemSinal += 1
      for (const f of w.fornecedores) {
        fornTotal += f.valor ?? 0
        if (f.status === 'pago') fornPago += f.valor ?? 0
      }
      sinais += num(w.produto_data, PLANEJ_FIELD.sinalValor)
    }

    const proximos = data
      .map((w) => ({ w, d: daysUntil(w.wedding_date) }))
      .filter((x) => x.d != null && x.d >= 0)
      .sort((a, b) => (a.d as number) - (b.d as number))
      .slice(0, 8)

    return { porEtapa, travados, semData, pertoSemSinal, fornPago, fornTotal, sinais, proximos }
  }, [data])

  const maxEtapa = Math.max(1, ...PLANEJAMENTO_ORDER.map((e) => stats.porEtapa.get(e) ?? 0))

  if (isLoading) {
    return (
      <div className="px-6 py-8 flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando portfólio…
      </div>
    )
  }

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      <header className="flex items-center gap-2.5">
        <Link to="/planejamento" className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" aria-label="Voltar">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 text-amber-600">
          <BarChart3 className="w-4 h-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Painel do gestor — Planejamento</h1>
          <p className="text-sm text-slate-500">{data.length} {data.length === 1 ? 'casamento' : 'casamentos'} em planejamento.</p>
        </div>
      </header>

      {/* Funil por etapa */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Casamentos por etapa</h2>
        <div className="space-y-2">
          {PLANEJAMENTO_ORDER.map((e) => {
            const n = stats.porEtapa.get(e) ?? 0
            return (
              <div key={e} className="flex items-center gap-3">
                <span className="w-56 shrink-0 text-sm text-slate-600 truncate" title={PLANEJAMENTO_LABEL[e]}>
                  {PLANEJAMENTO_LABEL[e]}
                </span>
                <div className="flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-amber-400/80 rounded-md transition-all"
                    style={{ width: `${(n / maxEtapa) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-semibold text-slate-700 tabular-nums">{n}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Alertas + Financeiro */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Alertas
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Alerta n={stats.travados} label="travados (trava não cumprida)" tone="amber" />
            <Alerta n={stats.pertoSemSinal} label="perto da data sem sinal (≤90d)" tone="rose" />
            <Alerta n={stats.semData} label="sem data do casamento" tone="slate" />
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-500" /> Financeiro (carteira)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Money label="Fornecedores pagos" value={stats.fornPago} sub={`de ${brl.format(stats.fornTotal)} lançados`} />
            <Money label="Sinais recebidos" value={stats.sinais} sub="soma dos sinais" />
          </div>
        </section>
      </div>

      {/* Próximos casamentos */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-slate-500" /> Próximos casamentos
        </h2>
        {stats.proximos.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-2">Nenhum casamento com data futura cadastrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stats.proximos.map(({ w, d }) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link to={`/planejamento/casamento/${w.id}`} className="flex items-center gap-2 min-w-0 group">
                  <Heart className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-800 truncate group-hover:text-[#8A6A33]">{w.titulo}</span>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-slate-500">{PLANEJAMENTO_LABEL[w.planejamentoEtapa]}</span>
                  <span
                    className={cn(
                      'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                      w.travaPendentes.length > 0
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : w.checklist.atrasados > 0
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    )}
                  >
                    {w.travaPendentes.length > 0
                      ? 'travado'
                      : w.checklist.atrasados > 0
                        ? `${w.checklist.atrasados} atrasada${w.checklist.atrasados > 1 ? 's' : ''}`
                        : 'em dia'}
                  </span>
                  <span className="text-xs font-semibold text-slate-600 tabular-nums w-16 text-right">
                    {d === 0 ? 'hoje' : `${d}d`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const ALERTA_TONE: Record<string, string> = {
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  rose: 'text-rose-700 bg-rose-50 border-rose-200',
  slate: 'text-slate-600 bg-slate-50 border-slate-200',
}

function Alerta({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className={cn('rounded-lg border p-3 text-center', ALERTA_TONE[tone])}>
      <p className="text-2xl font-bold tabular-nums">{n}</p>
      <p className="text-[11px] mt-0.5 leading-tight">{label}</p>
    </div>
  )
}

function Money({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-0.5">{brl.format(value)}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}
