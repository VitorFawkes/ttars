import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOrg } from '@/contexts/OrgContext'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useWwDiretoria, type WwDiretoriaFase, type WwDiretoriaFaseKey } from '@/hooks/analyticsWeddings/useWw2'
import { LoadingSkeleton, ErrorBanner, EmptyState } from './components/ui'
import { formatCurrency, formatNumber } from './lib/format'
import { periodToDates, formatRange, type PeriodOption } from './lib/dates'

// Cores por macro-fase (tokens ww-*). Cada fase tem ponto, barra e tinta.
const FASE_UI: Record<WwDiretoriaFaseKey, { dot: string; bar: string; ink: string }> = {
  sdr:          { dot: 'bg-ww-gold',     bar: 'bg-ww-gold',     ink: 'text-ww-gold-ink' },
  closer:       { dot: 'bg-ww-rosewood', bar: 'bg-ww-rosewood', ink: 'text-ww-rosewood' },
  planejamento: { dot: 'bg-ww-olive',    bar: 'bg-ww-olive',    ink: 'text-ww-olive-ink' },
  producao:     { dot: 'bg-ww-blush',    bar: 'bg-ww-blush',    ink: 'text-ww-rosewood' },
}

// Escada: cada barra desce e indenta um pouco à direita (só no desktop). Mobile empilha reto.
const OFFSET = ['lg:ml-0', 'lg:ml-12', 'lg:ml-24', 'lg:ml-36'] as const

// Períodos do seletor — só afetam conversão e tendência. O número de casais é sempre "agora".
const PERIODOS: { key: PeriodOption; label: string }[] = [
  { key: '30d', label: 'Últimos 30 dias' },
  { key: '90d', label: 'Últimos 90 dias' },
  { key: 'mtd', label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: '12m', label: 'Últimos 12 meses' },
  { key: 'all', label: 'Período todo' },
]

export default function DiretoriaPage() {
  const { org } = useOrg()
  const { product } = useCurrentProductMeta()
  const [periodo, setPeriodo] = useState<PeriodOption>('30d')
  const { dateStart, dateEnd } = useMemo(() => periodToDates(periodo), [periodo])
  const { data, isLoading, error } = useWwDiretoria({ dateStart, dateEnd })

  if (!product || product.slug !== 'WEDDING') {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-2xl">
          <h2 className="text-base font-semibold text-amber-900">Esta página é só para Welcome Weddings</h2>
          <p className="mt-2 text-sm text-amber-800">
            Você está na org <strong>{org?.name ?? '?'}</strong>. Troque para "Welcome Weddings" no seletor de organização (canto superior).
          </p>
        </div>
      </div>
    )
  }

  const fases = data?.fases ?? []
  const totalCasais = fases.reduce((s, f) => s + f.count, 0)
  const totalValor = fases.reduce((s, f) => s + f.valor_total, 0)

  return (
    <div className="h-full overflow-y-auto bg-ww-paper">
      <div className="max-w-[1100px] mx-auto p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="font-ww-serif text-2xl font-semibold text-ww-n700 tracking-tight">Diretoria · Estado da Operação</h1>
            <p className="text-sm text-ww-n500 mt-0.5">
              Onde estão os casais hoje, da pré-venda à produção. Conversão e tendência no período de {formatRange(dateStart, dateEnd)}.
            </p>
          </div>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as PeriodOption)}
            className="px-3 py-1.5 text-sm font-medium bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors self-start sm:self-auto"
          >
            {PERIODOS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : error ? (
          <ErrorBanner error={error as Error} />
        ) : !data || data.error ? (
          <EmptyState message={data?.error ?? 'Sem dados'} />
        ) : (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-ww-sand rounded-xl shadow-ww-lift p-4">
                <div className="text-[11px] uppercase tracking-wide text-ww-n400">Casais na operação agora</div>
                <div className="text-2xl font-semibold text-ww-n700 tabular-nums mt-1">{formatNumber(totalCasais)}</div>
              </div>
              <div className="bg-white border border-ww-sand rounded-xl shadow-ww-lift p-4">
                <div className="text-[11px] uppercase tracking-wide text-ww-n400">Valor em pipeline</div>
                <div className="text-2xl font-semibold text-ww-n700 tabular-nums mt-1">{formatCurrency(totalValor)}</div>
              </div>
            </div>

            {/* As 4 barras em escada */}
            <div className="space-y-3">
              {fases.map((fase, i) => {
                const proxima = fases[i + 1]
                return (
                  <div key={fase.key}>
                    <FaseBarra fase={fase} className={OFFSET[i]} />
                    {proxima && (
                      <div className={`flex items-center gap-2 mt-2 pl-1 ${OFFSET[i + 1]}`}>
                        <span className="text-ww-n400">↓</span>
                        <span className="text-xs text-ww-n500">
                          {fase.conversao_proxima_pct != null ? (
                            <>
                              <span className="font-semibold text-ww-n700 tabular-nums">{fase.conversao_proxima_pct}%</span> seguiram para {proxima.label} no período
                            </>
                          ) : (
                            <>sem base no período para medir a passagem para {proxima.label}</>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <p className="text-[11px] text-ww-n400 pt-2 border-t border-ww-sand">
              Cada tracinho é um casal — clique para abrir o card. O número de casais é a foto de agora;
              conversão e tendência usam o período selecionado.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Tendencia({ pct }: { pct: number | null }) {
  if (pct == null) return null
  const up = pct > 0, down = pct < 0
  const cls = up ? 'text-emerald-700 bg-emerald-50' : down ? 'text-rose-600 bg-rose-50' : 'text-slate-500 bg-slate-100'
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium tabular-nums ${cls}`} title="Variação das entradas na fase vs. período anterior">
      {up ? '↑' : down ? '↓' : '→'}{Math.abs(pct)}%
    </span>
  )
}

function FaseBarra({ fase, className = '' }: { fase: WwDiretoriaFase; className?: string }) {
  const ui = FASE_UI[fase.key]
  const truncados = fase.count - fase.deals.length
  return (
    <div className={`bg-white border border-ww-sand rounded-xl shadow-ww-lift p-4 lg:p-5 lg:max-w-[860px] ${className}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`w-2.5 h-2.5 rounded-full ${ui.dot}`} />
        <span className={`text-base font-semibold tracking-tight ${ui.ink}`}>{fase.label}</span>
        <span className="text-[11px] uppercase tracking-wide text-ww-n400">{fase.sub}</span>
        <span className="flex-1" />
        <span className="text-sm text-ww-n500 tabular-nums">
          <span className="text-xl font-semibold text-ww-n700">{formatNumber(fase.count)}</span> {fase.count === 1 ? 'casal' : 'casais'}
        </span>
        {fase.valor_total > 0 && (
          <span className="text-sm text-ww-n500 tabular-nums">· {formatCurrency(fase.valor_total)}</span>
        )}
        <Tendencia pct={fase.tendencia_pct} />
      </div>

      {fase.count === 0 ? (
        <p className="text-sm text-ww-n400 italic">Nenhum casal nesta fase agora.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-[2px]">
            {fase.deals.map((d) => (
              <Link
                key={d.card_id}
                to={`/cards/${d.card_id}`}
                title={`${d.titulo}${d.valor > 0 ? ` · ${formatCurrency(d.valor)}` : ''}`}
                className={`w-[4px] h-7 rounded-[1px] ${ui.bar} opacity-80 origin-bottom hover:opacity-100 hover:scale-y-110 transition-all`}
              />
            ))}
          </div>
          {truncados > 0 && (
            <p className="text-[11px] text-ww-n400 mt-1.5">+{formatNumber(truncados)} casais não mostrados</p>
          )}
        </>
      )}
    </div>
  )
}
