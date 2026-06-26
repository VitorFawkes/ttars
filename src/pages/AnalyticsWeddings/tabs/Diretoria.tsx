import { useMemo, useState } from 'react'
import { useWwDiretoria, useWwDiretoriaTempos } from '@/hooks/analyticsWeddings/useWw2'
import { DiretoriaSnapshot } from '../components/DiretoriaSnapshot'
import { DiretoriaTempos } from '../components/DiretoriaTempos'
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

export function Diretoria() {
  const [periodo, setPeriodo] = useState<PeriodOption>('90d')
  const { dateStart, dateEnd } = useMemo(() => periodToDates(periodo), [periodo])
  const overview = useWwDiretoria({ dateStart, dateEnd })
  const tempos = useWwDiretoriaTempos({ dateStart, dateEnd })

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
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as PeriodOption)}
          className="px-3 py-1.5 text-sm font-medium bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors self-start sm:self-auto shrink-0"
        >
          {PERIODOS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
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

          <DiretoriaSnapshot fases={fases} />

          {tempos.isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : tempos.error ? (
            <ErrorBanner error={tempos.error as Error} />
          ) : tempos.data && !tempos.data.error ? (
            <DiretoriaTempos tempos={tempos.data} />
          ) : null}

          <p className="text-[11px] text-ww-n400 pt-2 border-t border-ww-sand">
            O número de casais por fase é a foto de agora (etapa atual no CRM). Conversão, tendência e tempos usam o
            funil próprio (coorte por data de entrada do lead), então podem não bater exatamente com os Indicadores de vendas.
            Planejamento e Produção ainda não têm carimbo de tempo — por isso aparecem sem tempos.
          </p>
        </>
      )}
    </div>
  )
}
