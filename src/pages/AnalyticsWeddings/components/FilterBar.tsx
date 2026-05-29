import { useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useWw2FilterOptions } from '@/hooks/analyticsWeddings/useWw2'
import { type PeriodOption, PERIOD_LABELS, periodToDates } from '../lib/dates'
import { MultiPill, ConsultorPill } from './FilterPills'

export type AppliedFilters = {
  dateStart: string
  dateEnd: string
  dateMode: 'cohort' | 'throughput'
  origins: string[]
  faixas: string[]
  destinos: string[]
  tipos: string[]
  consultorIds: string[]
  period: PeriodOption
}

function parseList(v: string | null): string[] {
  return v ? v.split(',').filter(Boolean) : []
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocado com o FilterBar (8 abas importam daqui); só afeta HMR de dev
export function useFilterParams(): AppliedFilters {
  const [params] = useSearchParams()
  const period = (params.get('period') as PeriodOption) || '30d'
  const dateMode = (params.get('dateMode') as 'cohort' | 'throughput') || 'cohort'
  const { dateStart, dateEnd } = useMemo(() => periodToDates(period), [period])
  return {
    period, dateMode, dateStart, dateEnd,
    origins: parseList(params.get('origins')),
    faixas: parseList(params.get('faixas')),
    destinos: parseList(params.get('destinos')),
    tipos: parseList(params.get('tipos')),
    consultorIds: parseList(params.get('consultorIds')),
  }
}

export function FilterBar() {
  const [params, setParams] = useSearchParams()
  const current = useFilterParams()
  const { data: options } = useWw2FilterOptions()

  const setParam = (key: string, value: string | string[] | null) => {
    const next = new URLSearchParams(params)
    if (value == null || (Array.isArray(value) && value.length === 0) || value === '') {
      next.delete(key)
    } else {
      next.set(key, Array.isArray(value) ? value.join(',') : value)
    }
    setParams(next, { replace: true })
  }

  const hasActiveFilters =
    current.origins.length + current.faixas.length + current.destinos.length + current.tipos.length + current.consultorIds.length > 0

  const clearAll = () => {
    const next = new URLSearchParams()
    next.set('period', current.period)
    next.set('dateMode', current.dateMode)
    setParams(next, { replace: true })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2 sticky top-0 z-30">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 font-medium px-1">📅</span>
        <select
          value={current.period}
          onChange={(e) => setParam('period', e.target.value)}
          className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {Object.entries(PERIOD_LABELS).filter(([k]) => k !== 'custom').map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 font-medium px-1">📊</span>
        <select
          value={current.dateMode}
          onChange={(e) => setParam('dateMode', e.target.value)}
          className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="Cohort: leads que ENTRARAM no período (onde estão hoje). Throughput: o que ACONTECEU no período (avanços, fechamentos)."
        >
          <option value="cohort">Data de criação (cohort)</option>
          <option value="throughput">Data de evento (atividade)</option>
        </select>
      </div>

      <div className="w-px h-6 bg-slate-200 mx-1" />

      <MultiPill label="🎯 Origem" options={options?.origens ?? []} selected={current.origins} onChange={(v) => setParam('origins', v)} />
      <MultiPill label="💰 Faixa" options={options?.faixas ?? []} selected={current.faixas} onChange={(v) => setParam('faixas', v)} />
      <MultiPill label="🏝️ Destino" options={options?.destinos ?? []} selected={current.destinos} onChange={(v) => setParam('destinos', v)} />
      <MultiPill label="👰 Tipo" options={options?.tipos ?? []} selected={current.tipos} onChange={(v) => setParam('tipos', v)} />
      <ConsultorPill options={options?.consultores ?? []} selected={current.consultorIds} onChange={(v) => setParam('consultorIds', v)} />

      {hasActiveFilters && (
        <button
          onClick={clearAll}
          className="ml-auto px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
        >
          ✕ Limpar
        </button>
      )}
    </div>
  )
}
