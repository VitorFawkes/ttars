import { User as UserIcon } from 'lucide-react'
import PhaseSummaryCard from '@/components/analytics/PhaseSummaryCard'
import { cn } from '@/lib/utils'
import type { DateRef } from '@/hooks/analytics/usePipelineCurrent'
import { PHASE_COLORS, type MetricMode, type PhaseFilter } from './constants'

interface PhaseSummary {
  slug: PhaseFilter
  label: string
  color: string
  count: number
  value: number
  receita: number
  avgDays: number
}

interface Props {
  // Filtros da página
  dateRef: DateRef
  setDateRef: (v: DateRef) => void
  metric: MetricMode
  setMetric: (v: MetricMode) => void
  valueMinInput: string
  setValueMinInput: (v: string) => void
  valueMaxInput: string
  setValueMaxInput: (v: string) => void

  // Meu Pipeline
  profileId: string | null
  isMyPipeline: boolean
  onToggleMyPipeline: () => void

  // Owner indicator
  selectedOwnerLabel: string | null
  onClearOwner: () => void

  // Phase summaries + filter
  phaseSummaries: PhaseSummary[]
  phaseFilter: PhaseFilter
  setPhaseFilter: (v: PhaseFilter) => void
  phaseLabel: (slug: string | null | undefined) => string
}

const PHASE_FILTER_VALUES: PhaseFilter[] = ['all', 'sdr', 'planner', 'pos-venda']

export default function PipelineFilterPanel({
  dateRef,
  setDateRef,
  metric,
  setMetric,
  valueMinInput,
  setValueMinInput,
  valueMaxInput,
  setValueMaxInput,
  profileId,
  isMyPipeline,
  onToggleMyPipeline,
  selectedOwnerLabel,
  onClearOwner,
  phaseSummaries,
  phaseFilter,
  setPhaseFilter,
  phaseLabel,
}: Props) {
  const phaseFilterLabel = (v: PhaseFilter) => (v === 'all' ? 'Todos' : phaseLabel(v))

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
        {/* Date reference */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            Referência
          </span>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(
              [
                ['stage', 'Na Etapa'],
                ['created', 'Criação'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setDateRef(val)}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  dateRef === val
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-6 bg-slate-200" />

        {/* Metric */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            Métrica
          </span>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {(
              [
                ['cards', 'Qtd'],
                ['faturamento', 'Fat.'],
                ['receita', 'Receita'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setMetric(v)}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors',
                  metric === v
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-6 bg-slate-200" />

        {/* Value range */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            Valor
          </span>
          <span className="text-[10px] text-slate-400">R$</span>
          <input
            type="number"
            placeholder="Min"
            value={valueMinInput}
            onChange={e => setValueMinInput(e.target.value)}
            className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
          />
          <span className="text-[10px] text-slate-400">a</span>
          <input
            type="number"
            placeholder="Max"
            value={valueMaxInput}
            onChange={e => setValueMaxInput(e.target.value)}
            className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
          />
          {(valueMinInput || valueMaxInput) && (
            <button
              onClick={() => {
                setValueMinInput('')
                setValueMaxInput('')
              }}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Owner indicator */}
        {selectedOwnerLabel && !isMyPipeline && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
            <UserIcon className="w-3.5 h-3.5 text-violet-600" />
            <span className="text-xs font-medium text-violet-700 max-w-[120px] truncate">
              {selectedOwnerLabel}
            </span>
            <button
              onClick={onClearOwner}
              className="text-[10px] text-violet-500 hover:text-violet-700 font-bold ml-0.5"
            >
              &times;
            </button>
          </div>
        )}

        {/* Meu Pipeline */}
        {profileId && (
          <button
            onClick={onToggleMyPipeline}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border transition-colors',
              isMyPipeline
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            <UserIcon className="w-3.5 h-3.5" />
            Meu Pipeline
          </button>
        )}
      </div>

      {/* Phase summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {phaseSummaries.map(ps => (
          <PhaseSummaryCard
            key={ps.slug}
            label={ps.label}
            color={ps.color}
            cardCount={ps.count}
            totalValue={metric === 'receita' ? ps.receita : ps.value}
            avgDays={ps.avgDays}
            isActive={phaseFilter === ps.slug}
            onClick={() => setPhaseFilter(phaseFilter === ps.slug ? 'all' : ps.slug)}
          />
        ))}
      </div>

      {/* Phase filter toggle */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {PHASE_FILTER_VALUES.map(opt => (
          <button
            key={opt}
            onClick={() => setPhaseFilter(opt)}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
              phaseFilter === opt
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {opt !== 'all' && (
              <span
                className="inline-block w-2 h-2 rounded-full mr-1.5"
                style={{ background: PHASE_COLORS[opt] }}
              />
            )}
            {phaseFilterLabel(opt)}
          </button>
        ))}
      </div>
    </>
  )
}
