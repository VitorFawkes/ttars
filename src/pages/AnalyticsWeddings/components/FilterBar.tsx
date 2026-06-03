import { useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useWwFunilFilterOptions } from '@/hooks/analyticsWeddings/useWw2'
import { type PeriodOption, PERIOD_LABELS, periodToDates } from '../lib/dates'
import { MultiPill, ConsultorPill, TipoSegment } from './FilterPills'

export type AppliedFilters = {
  dateStart: string
  dateEnd: string
  dateMode: 'cohort' | 'throughput'
  origins: string[]
  faixas: string[]
  convidados: string[]
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

// eslint-disable-next-line react-refresh/only-export-components
export function defaultFilters(period: PeriodOption = '30d', dateMode: 'cohort' | 'throughput' = 'cohort'): AppliedFilters {
  const { dateStart, dateEnd } = periodToDates(period)
  return { period, dateMode, dateStart, dateEnd, origins: [], faixas: [], convidados: [], destinos: [], tipos: [], consultorIds: [] }
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
    convidados: parseList(params.get('convidados')),
    destinos: parseList(params.get('destinos')),
    tipos: parseList(params.get('tipos')),
    consultorIds: parseList(params.get('consultorIds')),
  }
}

// Chaves de filtro que uma aba pode pedir. Cada aba mostra SÓ o que responde à
// pergunta dela (regra: filtro que não muda a resposta não entra). Não é filtro
// global — cada aba tem o seu estado e o seu conjunto.
export type FilterKey = 'period' | 'dateMode' | 'origem' | 'faixa' | 'convidados' | 'destino' | 'tipo' | 'consultor'
// Conjunto padrão (compat para quem não passa `show`).
const DEFAULT_SHOW: FilterKey[] = ['period', 'dateMode', 'origem', 'faixa', 'destino', 'consultor']

// FilterBar CONTROLADO — cada aba passa seu próprio estado e o conjunto de filtros
// que faz sentido pra ela (`show`). Opções vêm do AC (ww_funil_casal).
export function FilterBar({ value, onChange, show = DEFAULT_SHOW }: { value: AppliedFilters; onChange: (next: AppliedFilters) => void; show?: FilterKey[] }) {
  const { data: options } = useWwFunilFilterOptions()
  const has = (k: FilterKey) => show.includes(k)

  const set = (patch: Partial<AppliedFilters>) => onChange({ ...value, ...patch })
  const setPeriod = (p: PeriodOption) => {
    const { dateStart, dateEnd } = periodToDates(p)
    onChange({ ...value, period: p, dateStart, dateEnd })
  }

  const activeCount =
    (has('origem') ? value.origins.length : 0) +
    (has('faixa') ? value.faixas.length : 0) +
    (has('convidados') ? value.convidados.length : 0) +
    (has('destino') ? value.destinos.length : 0) +
    (has('tipo') ? value.tipos.length : 0) +
    (has('consultor') ? value.consultorIds.length : 0)

  const hasPeriodControls = has('period') || has('dateMode')

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
      {has('period') && (
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
      )}
      {has('dateMode') && (
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
      )}

      {hasPeriodControls && <div className="w-px h-6 bg-slate-200 mx-1" />}

      {has('tipo') && <TipoSegment selected={value.tipos} onChange={(v) => set({ tipos: v })} />}
      {has('origem') && <MultiPill label="🎯 Origem" options={options?.origens ?? []} selected={value.origins} onChange={(v) => set({ origins: v })} />}
      {has('faixa') && <MultiPill label="💰 Faixa" options={options?.faixas ?? []} selected={value.faixas} onChange={(v) => set({ faixas: v })} />}
      {has('convidados') && <MultiPill label="👥 Convidados" options={options?.convidados ?? []} selected={value.convidados} onChange={(v) => set({ convidados: v })} />}
      {has('destino') && <MultiPill label="🏝️ Destino" options={options?.destinos ?? []} selected={value.destinos} onChange={(v) => set({ destinos: v })} />}
      {has('consultor') && <ConsultorPill options={options?.consultores ?? []} selected={value.consultorIds} onChange={(v) => set({ consultorIds: v })} />}

      {activeCount > 0 && (
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
