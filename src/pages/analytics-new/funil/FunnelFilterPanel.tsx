import { Calendar, Repeat, User as UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DatePreset } from '@/hooks/analytics/useAnalyticsFilters'
import type { FunnelMetric, FunnelMode } from './constants'

interface Props {
  datePreset: DatePreset
  setDatePreset: (p: DatePreset) => void
  mode: FunnelMode
  setMode: (m: FunnelMode) => void
  metric: FunnelMetric
  setMetric: (m: FunnelMetric) => void
  compareEnabled: boolean
  setCompareEnabled: (b: boolean) => void
  previousRange: { start: string; end: string } | null

  profileId: string | null
  isMyFunnel: boolean
  onToggleMyFunnel: () => void
  selectedOwnerLabel: string | null
  onClearOwner: () => void
}

const DATE_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'last_3_months', label: '3 meses' },
  { value: 'last_6_months', label: '6 meses' },
  { value: 'this_year', label: 'Este ano' },
  { value: 'all_time', label: 'Tudo' },
]

const MODE_OPTIONS: { value: FunnelMode; label: string; hint: string }[] = [
  { value: 'entries', label: 'Novos leads', hint: 'Cards criados no período' },
  { value: 'stage_entry', label: 'Entraram em etapa', hint: 'Passaram por qualquer etapa' },
  { value: 'ganho_total', label: 'Ganhos', hint: 'Somente cards ganhos' },
]

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function FunnelFilterPanel({
  datePreset,
  setDatePreset,
  mode,
  setMode,
  metric,
  setMetric,
  compareEnabled,
  setCompareEnabled,
  previousRange,
  profileId,
  isMyFunnel,
  onToggleMyFunnel,
  selectedOwnerLabel,
  onClearOwner,
}: Props) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
        {/* Período */}
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            Período
          </span>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {DATE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDatePreset(opt.value)}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors',
                  datePreset === opt.value
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-6 bg-slate-200" />

        {/* Métrica */}
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

        {/* Modo */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            Analisar
          </span>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                title={opt.hint}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  mode === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        {/* Comparar */}
        <button
          onClick={() => setCompareEnabled(!compareEnabled)}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border transition-colors',
            compareEnabled
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          )}
        >
          <Repeat className="w-3.5 h-3.5" />
          Comparar com anterior
        </button>

        {/* Owner indicator */}
        {selectedOwnerLabel && !isMyFunnel && (
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

        {/* Meu Funil */}
        {profileId && (
          <button
            onClick={onToggleMyFunnel}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border transition-colors',
              isMyFunnel
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            <UserIcon className="w-3.5 h-3.5" />
            Meu Funil
          </button>
        )}
      </div>

      {/* Indicador de período comparado */}
      {compareEnabled && previousRange && (
        <div className="flex items-center gap-2 text-[11px] text-slate-500 px-4">
          <Repeat className="w-3 h-3" />
          Comparando com {formatShortDate(previousRange.start)} →{' '}
          {formatShortDate(previousRange.end)}
        </div>
      )}
    </div>
  )
}
