import { useMemo, useState } from 'react'
import { useWwDiretoria, useWwDiretoriaTempos } from '@/hooks/analyticsWeddings/useWw2'
import { DiretoriaSnapshot } from '../components/DiretoriaSnapshot'
import { DiretoriaTempos } from '../components/DiretoriaTempos'
import { StageHistoryModal } from '../components/StageHistoryModal'
import { LoadingSkeleton, ErrorBanner, EmptyState } from '../components/ui'
import { formatCurrency, formatNumber } from '../lib/format'
import { periodToDates, formatRange, type PeriodOption } from '../lib/dates'

// Períodos do seletor — afetam conversão, tendência e os tempos (coorte). O nº de casais é sempre "agora".
const PERIODOS: { key: PeriodOption; label: string }[] = [
  { key: '30d', label: 'Últimos 30 dias' },
  { key: '90d', label: 'Últimos 90 dias' },
  { key: 'mtd', label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: '12m', label: 'Últimos 12 meses' },
  { key: 'all', label: 'Período todo' },
]

// Filtro por tipo de casamento — DW (destination) × Elopement × todos.
type TipoFiltro = 'all' | 'DW' | 'Elopement'
const TIPOS: { key: TipoFiltro; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'DW', label: 'DW' },
  { key: 'Elopement', label: 'Elopement' },
]

export function Diretoria() {
  const [periodo, setPeriodo] = useState<PeriodOption>('90d')
  const [tipo, setTipo] = useState<TipoFiltro>('all')
  const [histCardId, setHistCardId] = useState<string | null>(null)
  const { dateStart, dateEnd } = useMemo(() => periodToDates(periodo), [periodo])
  const tipoParam = tipo === 'all' ? null : tipo
  const overview = useWwDiretoria({ dateStart, dateEnd, tipo: tipoParam })
  const tempos = useWwDiretoriaTempos({ dateStart, dateEnd, tipo: tipoParam })

  const fases = overview.data?.fases ?? []
  const totalCasais = fases.reduce((s, f) => s + f.count, 0)
  const totalValor = fases.reduce((s, f) => s + f.valor_total, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-ww-n500">
          Onde estão os casais hoje, da pré-venda à produção — e quanto tempo levam em cada parte.
          Tempos e tendência no período de {formatRange(dateStart, dateEnd)}.
        </p>
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <div className="inline-flex rounded-lg border border-ww-sand bg-white p-0.5" role="group" aria-label="Filtrar por tipo de casamento">
            {TIPOS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTipo(t.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${tipo === t.key ? 'bg-ww-gold-soft text-ww-gold-ink' : 'text-ww-n500 hover:text-ww-n700'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as PeriodOption)}
            className="px-3 py-1.5 text-sm font-medium bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors"
          >
            {PERIODOS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {overview.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : overview.error ? (
        <ErrorBanner error={overview.error as Error} />
      ) : !overview.data || overview.data.error ? (
        <EmptyState message={overview.data?.error ?? 'Sem dados'} />
      ) : (
        <>
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

          <DiretoriaSnapshot fases={fases} onSelectCard={setHistCardId} />

          {tempos.isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : tempos.error ? (
            <ErrorBanner error={tempos.error as Error} />
          ) : tempos.data && !tempos.data.error ? (
            <DiretoriaTempos tempos={tempos.data} onSelectCard={setHistCardId} />
          ) : null}

          <p className="text-[11px] text-ww-n400 pt-2 border-t border-ww-sand">
            O número de casais por fase é a foto de agora (etapa atual no CRM). Conversão, tendência e os tempos de SDR/Closer
            usam o funil próprio (coorte por data de entrada do lead), então podem não bater exatamente com os Indicadores de vendas.
            Planejamento e Produção mostram a ocupação atual; a duração só conta quem já tem carimbo de entrada e vai
            preenchendo conforme os casais avançam.
          </p>
        </>
      )}

      <StageHistoryModal cardId={histCardId} onClose={() => setHistCardId(null)} />
    </div>
  )
}
