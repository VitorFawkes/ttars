import { useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useWwFunilFilterOptions } from '@/hooks/analyticsWeddings/useWw2'
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

// Props que cada aba recebe da página (filtro POR ABA, não global).
export type TabProps = {
  filters: AppliedFilters
  onFiltersChange: (next: AppliedFilters) => void
}

export function defaultFilters(period: PeriodOption = '30d', dateMode: 'cohort' | 'throughput' = 'cohort'): AppliedFilters {
  const { dateStart, dateEnd } = periodToDates(period)
  return { period, dateMode, dateStart, dateEnd, origins: [], faixas: [], destinos: [], tipos: [], consultorIds: [] }
}

function parseList(v: string | null): string[] {
  return v ? v.split(',').filter(Boolean) : []
}

// Compat: ainda lê da URL (usado por código legado/órfão). As abas vivas usam o filtro por-aba via props.
// eslint-disable-next-line react-refresh/only-export-components
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

// FilterBar CONTROLADO — cada aba passa seu próprio estado. Opções vêm do AC (ww_funil_casal).
export function FilterBar({ value, onChange }: { value: AppliedFilters; onChange: (next: AppliedFilters) => void }) {
  const { data: options } = useWwFunilFilterOptions()

  const set = (patch: Partial<AppliedFilters>) => onChange({ ...value, ...patch })
  const setPeriod = (p: PeriodOption) => {
    const { dateStart, dateEnd } = periodToDates(p)
    onChange({ ...value, period: p, dateStart, dateEnd })
  }

  const hasActiveFilters =
    value.origins.length + value.faixas.length + value.destinos.length + value.consultorIds.length > 0

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 font-medium px-1">📅</span>
        <select
          value={value.period}
          onChange={(e) => setPeriod(e.target.value as PeriodOption)}
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
          value={value.dateMode}
          onChange={(e) => set({ dateMode: e.target.value as 'cohort' | 'throughput' })}
          className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="Por safra (criação): leads que ENTRARAM no período. Por período (entrada na etapa): o que ACONTECEU no período (agendou/fez/fechou)."
        >
          <option value="cohort">Data de criação (safra)</option>
          <option value="throughput">Data de entrada na etapa (período)</option>
        </select>
      </div>

      <div className="w-px h-6 bg-slate-200 mx-1" />

      <MultiPill label="🎯 Origem" options={options?.origens ?? []} selected={value.origins} onChange={(v) => set({ origins: v })} />
      <MultiPill label="💰 Faixa" options={options?.faixas ?? []} selected={value.faixas} onChange={(v) => set({ faixas: v })} />
      <MultiPill label="🏝️ Destino" options={options?.destinos ?? []} selected={value.destinos} onChange={(v) => set({ destinos: v })} />
      <ConsultorPill options={options?.consultores ?? []} selected={value.consultorIds} onChange={(v) => set({ consultorIds: v })} />

      {hasActiveFilters && (
        <button
          onClick={() => onChange(defaultFilters(value.period, value.dateMode))}
          className="ml-auto px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
        >
          ✕ Limpar
        </button>
      )}
    </div>
  )
}
