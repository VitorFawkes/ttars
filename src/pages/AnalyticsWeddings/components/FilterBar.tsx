import { useSearchParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useWwFunilFilterOptions, type StatusLead } from '@/hooks/analyticsWeddings/useWw2'
import { type PeriodOption, periodOptions, periodToDates } from '../lib/dates'
import { MultiPill, ConsultorPill, TipoSegment } from './FilterPills'

// Helpers de período custom — ISO ↔ YYYY-MM-DD pra input[type=date]
const toDateInput = (iso: string) => iso.slice(0, 10)
const fromDateInputStart = (s: string) => new Date(s + 'T00:00:00').toISOString()
const fromDateInputEnd = (s: string) => new Date(s + 'T23:59:59').toISOString()

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
  canalSdr: string[]
  canalCloser: string[]
  /** '' = todos · 'aberto' = nem ganhou nem perdeu · 'perdido' */
  statusLead: StatusLead | ''
  period: PeriodOption
}

// Props que cada aba recebe da página (filtro POR ABA, não global).
export type TabProps = {
  filters: AppliedFilters
  onFiltersChange: (next: AppliedFilters) => void
}

// tipo (DW × Elopement) é uma LENTE primária — como período/modo, sempre tem valor. Padrão: DW
// (foco do negócio Weddings). Elopement/Todos são escolha explícita. `defaultFilters` mantém o
// tipo passado para que "Limpar filtros" não tire o usuário da lente atual.
// eslint-disable-next-line react-refresh/only-export-components
export function defaultFilters(period: PeriodOption = '30d', dateMode: 'cohort' | 'throughput' = 'cohort', tipos: string[] = ['DW']): AppliedFilters {
  const { dateStart, dateEnd } = periodToDates(period)
  return { period, dateMode, dateStart, dateEnd, origins: [], faixas: [], convidados: [], destinos: [], tipos, consultorIds: [], canalSdr: [], canalCloser: [], statusLead: '' }
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
    canalSdr: parseList(params.get('canalSdr')),
    canalCloser: parseList(params.get('canalCloser')),
    statusLead: (params.get('statusLead') as StatusLead) || '',
  }
}

// Chaves de filtro que uma aba pode pedir. Cada aba mostra SÓ o que responde à
// pergunta dela (regra: filtro que não muda a resposta não entra). Não é filtro
// global — cada aba tem o seu estado e o seu conjunto.
export type FilterKey = 'period' | 'dateMode' | 'origem' | 'faixa' | 'convidados' | 'destino' | 'tipo' | 'consultor' | 'canal_sdr' | 'canal_closer' | 'status'
// Conjunto padrão (compat para quem não passa `show`).
const DEFAULT_SHOW: FilterKey[] = ['period', 'dateMode', 'origem', 'faixa', 'destino', 'consultor']

// Quantos filtros de RECORTE estão ativos (período/modo/tipo não contam — são lentes, sempre existem).
// eslint-disable-next-line react-refresh/only-export-components
export function countActiveFilters(f: AppliedFilters): number {
  return f.origins.length + f.faixas.length + f.convidados.length + f.destinos.length +
    f.consultorIds.length + f.canalSdr.length + f.canalCloser.length +
    (f.statusLead ? 1 : 0)
}

// FilterBar CONTROLADO — cada aba passa seu próprio estado e o conjunto de filtros
// que faz sentido pra ela (`show`). Opções vêm do AC (ww_funil_casal).
export function FilterBar({ value, onChange, show = DEFAULT_SHOW }: { value: AppliedFilters; onChange: (next: AppliedFilters) => void; show?: FilterKey[] }) {
  const { data: options } = useWwFunilFilterOptions()
  const has = (k: FilterKey) => show.includes(k)
  // Mobile: a pilha de 8 chips ocupava a tela inteira antes de qualquer dado aparecer.
  // Recortes ficam colapsados num botão "Recortes (N)"; período/modo sempre visíveis.
  const [recortesAbertoMobile, setRecortesAbertoMobile] = useState(false)

  const set = (patch: Partial<AppliedFilters>) => onChange({ ...value, ...patch })
  const setPeriod = (p: PeriodOption) => {
    // 'custom' mantém o intervalo atual pra você editar; presets recalculam as datas
    if (p === 'custom') { onChange({ ...value, period: 'custom' }); return }
    const { dateStart, dateEnd } = periodToDates(p)
    onChange({ ...value, period: p, dateStart, dateEnd })
  }

  const activeCount =
    (has('origem') ? value.origins.length : 0) +
    (has('faixa') ? value.faixas.length : 0) +
    (has('convidados') ? value.convidados.length : 0) +
    (has('destino') ? value.destinos.length : 0) +
    // tipo (DW/Elopement) é lente, não recorte — não entra na contagem
    (has('consultor') ? value.consultorIds.length : 0) +
    (has('canal_sdr') ? value.canalSdr.length : 0) +
    (has('canal_closer') ? value.canalCloser.length : 0) +
    (has('status') && value.statusLead ? 1 : 0)

  const hasPeriodControls = has('period') || has('dateMode')

  // Identidade da barra: deixa explícito que o filtro vale SÓ pra aba aberta.
  const identidade = (
    <div
      className="flex items-center gap-2 pr-3 border-r border-ww-sand select-none"
      title="Estes filtros valem só para esta aba. Cada aba tem os filtros que fazem sentido para a pergunta dela."
    >
      <SlidersHorizontal className="w-4 h-4 text-ww-gold" strokeWidth={2.2} />
      <span className="text-sm font-semibold text-ww-n700 tracking-tight">Filtros</span>
      <span className="text-[11px] text-ww-n500">valem só nesta aba</span>
    </div>
  )

  const statusSeg = (st: StatusLead | '', rotulo: string, titulo: string) => (
    <button
      onClick={() => set({ statusLead: st })}
      title={titulo}
      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold ${(value.statusLead || '') === st ? 'bg-ww-gold text-white shadow-sm' : 'text-ww-n600 hover:text-ww-n700'}`}
    >
      {rotulo}
    </button>
  )

  const chips = (
    <>
      {has('status') && (
        <div className="inline-flex items-center gap-0.5 bg-ww-cream rounded-lg p-0.5" title="Status do lead">
          {statusSeg('', 'Todos', 'Todos os leads do recorte')}
          {statusSeg('aberto', 'Abertos', 'Só quem ainda não ganhou nem perdeu')}
          {statusSeg('perdido', 'Perdidos', 'Só quem foi perdido')}
        </div>
      )}
      {has('tipo') && <TipoSegment selected={value.tipos} onChange={(v) => set({ tipos: v })} />}
      {has('origem') && <MultiPill label="Origem" options={options?.origens ?? []} selected={value.origins} onChange={(v) => set({ origins: v })} />}
      {has('faixa') && <MultiPill label="Faixa" options={options?.faixas ?? []} selected={value.faixas} onChange={(v) => set({ faixas: v })} />}
      {has('convidados') && <MultiPill label="Convidados" options={options?.convidados ?? []} selected={value.convidados} onChange={(v) => set({ convidados: v })} />}
      {has('destino') && <MultiPill label="Destino" options={options?.destinos ?? []} selected={value.destinos} onChange={(v) => set({ destinos: v })} />}
      {has('consultor') && <ConsultorPill options={options?.consultores ?? []} selected={value.consultorIds} onChange={(v) => set({ consultorIds: v })} />}
      {has('canal_sdr') && <MultiPill label="1ª reunião" options={options?.canais_sdr ?? []} selected={value.canalSdr} onChange={(v) => set({ canalSdr: v })} />}
      {has('canal_closer') && <MultiPill label="Reunião fechamento" options={options?.canais_closer ?? []} selected={value.canalCloser} onChange={(v) => set({ canalCloser: v })} />}
      {activeCount > 0 && (
        <button
          onClick={() => onChange(defaultFilters(value.period, value.dateMode, value.tipos))}
          className="ml-auto px-3 py-1.5 text-xs font-medium text-ww-n500 hover:text-ww-n700 hover:bg-ww-cream rounded-lg transition-colors active:scale-[0.98]"
        >
          Limpar filtros
        </button>
      )}
    </>
  )

  return (
    <div className="bg-white border border-ww-sand rounded-xl shadow-ww-lift">
      {/* Fila 1 — contexto: quando e como contar */}
      <div className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {identidade}

        {has('period') && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-ww-n600 font-medium">Período</span>
            <span className="relative inline-flex items-center">
              <select
                value={value.period}
                onChange={(e) => setPeriod(e.target.value as PeriodOption)}
                className="appearance-none pl-2.5 pr-7 py-1.5 text-xs font-medium bg-white border border-ww-sand rounded-lg text-ww-n700 hover:border-ww-sand-dk focus:outline-none focus:ring-2 focus:ring-ww-gold transition-colors cursor-pointer"
              >
                {periodOptions().map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-ww-n400 absolute right-2 pointer-events-none" strokeWidth={2.2} />
            </span>
            {value.period === 'custom' && (
              <div className="inline-flex items-center gap-1.5">
                <input
                  type="date"
                  value={toDateInput(value.dateStart)}
                  onChange={(e) => e.target.value && set({ dateStart: fromDateInputStart(e.target.value) })}
                  className="px-2 py-1.5 text-xs bg-white border border-ww-sand rounded-lg text-ww-n700 focus:outline-none focus:ring-2 focus:ring-ww-gold"
                />
                <span className="text-xs text-ww-n400">até</span>
                <input
                  type="date"
                  value={toDateInput(value.dateEnd)}
                  onChange={(e) => e.target.value && set({ dateEnd: fromDateInputEnd(e.target.value) })}
                  className="px-2 py-1.5 text-xs bg-white border border-ww-sand rounded-lg text-ww-n700 focus:outline-none focus:ring-2 focus:ring-ww-gold"
                />
              </div>
            )}
          </div>
        )}
        {has('dateMode') && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ww-n600 font-medium">Contar</span>
            <div className="inline-flex items-center gap-0.5 bg-ww-cream rounded-lg p-0.5">
              <button
                onClick={() => set({ dateMode: 'cohort' })}
                title="Conta os casais que CHEGARAM no período escolhido e acompanha o que aconteceu com eles depois (mesmo fora do período)."
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold ${value.dateMode === 'cohort' ? 'bg-ww-gold text-white shadow-sm' : 'text-ww-n600 hover:text-ww-n700'}`}
              >
                Leads do período
              </button>
              <button
                onClick={() => set({ dateMode: 'throughput' })}
                title="Conta o que ACONTECEU dentro do período (reuniões feitas, fechamentos), não importa quando o lead chegou."
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold ${value.dateMode === 'throughput' ? 'bg-ww-gold text-white shadow-sm' : 'text-ww-n600 hover:text-ww-n700'}`}
              >
                O que aconteceu no período
              </button>
            </div>
          </div>
        )}

        {/* Sem controles de período (ex.: Lead ideal) — recortes sobem pra fila única */}
        {!hasPeriodControls && chips}
      </div>

      {/* Fila 2 — recortes de perfil (zona própria, levemente champagne).
          Desktop: sempre aberta. Mobile: colapsada num botão "Recortes (N)". */}
      {hasPeriodControls && (
        <>
          <div className="sm:hidden px-3 py-2 border-t border-ww-sand/70 bg-ww-paper/60 rounded-b-xl">
            <button
              onClick={() => setRecortesAbertoMobile(v => !v)}
              className="w-full flex items-center justify-between text-xs font-medium text-ww-n600 active:scale-[0.99] transition-transform"
            >
              <span className={`inline-flex items-center gap-1.5 ${activeCount > 0 ? 'text-ww-gold-ink font-semibold' : ''}`}>
                <SlidersHorizontal className={`w-3.5 h-3.5 ${activeCount > 0 ? 'text-ww-gold' : 'text-ww-n400'}`} strokeWidth={2.2} />
                {activeCount > 0 ? `Recortes · ${activeCount} ativo${activeCount > 1 ? 's' : ''}` : 'Recortes'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-ww-n400 transition-transform duration-150 ease-out ${recortesAbertoMobile ? 'rotate-180' : ''}`} strokeWidth={2.2} />
            </button>
            {recortesAbertoMobile && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {chips}
              </div>
            )}
          </div>
          <div className="hidden sm:flex px-3 py-2 border-t border-ww-sand/70 bg-ww-paper/60 rounded-b-xl flex-wrap items-center gap-2">
            {chips}
          </div>
        </>
      )}
    </div>
  )
}
