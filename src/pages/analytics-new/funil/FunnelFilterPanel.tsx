import { useMemo } from 'react'
import { Calendar, Repeat, User as UserIcon, GitBranch, Tag, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DatePreset } from '@/hooks/analytics/useAnalyticsFilters'
import {
  GANHO_FASE_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  type DateRef,
  type FunnelMetric,
  type FunnelStatus,
  type GanhoFase,
} from './constants'
import MultiPickerPopover, { type PickerOption, type PickerSection } from './MultiPickerPopover'

export interface StageOption {
  id: string
  nome: string
  ordem: number
}

interface Props {
  /** Período */
  datePreset: DatePreset
  setDatePreset: (p: DatePreset) => void

  /** Referência temporal (Na Etapa | Criação) */
  dateRef: DateRef
  setDateRef: (v: DateRef) => void

  /** Métrica 3-way (cards | faturamento | receita) */
  metric: FunnelMetric
  setMetric: (v: FunnelMetric) => void

  /** Status + sub-filtro de ganhos */
  status: FunnelStatus
  setStatus: (v: FunnelStatus) => void
  ganhoFase: GanhoFase
  setGanhoFase: (v: GanhoFase) => void

  /** Comparativo */
  compareEnabled: boolean
  setCompareEnabled: (v: boolean) => void
  previousRange: { start: string; end: string } | null

  /** "Meu Funil" (atalho do próprio usuário) */
  profileId: string | null
  isMyFunnel: boolean
  onToggleMyFunnel: () => void

  /** Picker de consultores (owners) — em seções (Times + Pessoas) */
  ownerSections: PickerSection[]
  selectedOwnerIds: string[]
  onToggleOwner: (id: string, expandTo?: string[]) => void
  onClearOwners: () => void

  /** Picker de tags */
  tagOptions: PickerOption[]
  selectedTagIds: string[]
  onToggleTag: (id: string) => void
  onClearTags: () => void

  /** Etapa raiz */
  stageOptions: StageOption[]
  rootStageId: string | null
  setRootStageId: (id: string | null) => void
}

const DATE_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'last_3_months', label: '3 meses' },
  { value: 'last_6_months', label: '6 meses' },
  { value: 'this_year', label: 'Este ano' },
  { value: 'all_time', label: 'Tudo' },
]

const STATUS_OPTIONS: FunnelStatus[] = ['all', 'open', 'won', 'lost']
const GANHO_FASE_OPTIONS: GanhoFase[] = ['any', 'sdr', 'planner', 'pos']

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function FunnelFilterPanel({
  datePreset,
  setDatePreset,
  dateRef,
  setDateRef,
  metric,
  setMetric,
  status,
  setStatus,
  ganhoFase,
  setGanhoFase,
  compareEnabled,
  setCompareEnabled,
  previousRange,
  profileId,
  isMyFunnel,
  onToggleMyFunnel,
  ownerSections,
  selectedOwnerIds,
  onToggleOwner,
  onClearOwners,
  tagOptions,
  selectedTagIds,
  onToggleTag,
  onClearTags,
  stageOptions,
  rootStageId,
  setRootStageId,
}: Props) {
  const hasStages = stageOptions.length > 0
  const showGanhoFaseToggle = status === 'won'

  // Remove o próprio usuário das seções quando "Meu Funil" estiver ativo.
  const visibleOwnerSections: PickerSection[] = useMemo(() => {
    if (!isMyFunnel || !profileId) return ownerSections
    return ownerSections
      .map(s => ({ ...s, options: s.options.filter(o => o.id !== profileId) }))
      .filter(s => s.options.length > 0)
  }, [ownerSections, isMyFunnel, profileId])

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

        {/* Referência: Na Etapa | Criação (plano mestre princípio #3) */}
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
                title={
                  val === 'stage'
                    ? 'Conta o card pelo momento em que entrou na etapa, via transição no período'
                    : 'Conta o card pelo momento em que foi criado, independente de onde ele está agora'
                }
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

        {/* Status (plano mestre princípio #5) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            Status
          </span>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => setStatus(opt)}
                title={STATUS_HINTS[opt]}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors',
                  status === opt
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                )}
              >
                {STATUS_LABELS[opt]}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-filtro: Por quem fechou (só aparece quando Ganhos) */}
        {showGanhoFaseToggle && (
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">
              Por quem fechou
            </span>
            <div className="flex rounded-lg border border-emerald-200 overflow-hidden">
              {GANHO_FASE_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setGanhoFase(opt)}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-medium transition-colors',
                    ganhoFase === opt
                      ? 'bg-emerald-600 text-white'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  )}
                >
                  {GANHO_FASE_LABELS[opt]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="w-px h-6 bg-slate-200" />

        {/* Métrica (3-way, plano mestre princípio #4) */}
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

        {hasStages && (
          <>
            <div className="w-px h-6 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                Desde
              </span>
              <select
                value={rootStageId ?? ''}
                onChange={e => setRootStageId(e.target.value || null)}
                className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none max-w-[220px]"
              >
                <option value="">Primeira etapa</option>
                {stageOptions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* Comparar */}
        <button
          onClick={() => setCompareEnabled(!compareEnabled)}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap',
            compareEnabled
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          )}
        >
          <Repeat className="w-3.5 h-3.5" />
          Comparar
        </button>

        {/* Picker de tags */}
        {tagOptions.length > 0 && (
          <MultiPickerPopover
            label="Tags"
            icon={<Tag className="w-3.5 h-3.5" />}
            options={tagOptions}
            selectedIds={selectedTagIds}
            onToggle={onToggleTag}
            onClear={onClearTags}
            singularNoun="tag"
            pluralNoun="tags"
          />
        )}

        {/* Picker de consultores (multi) — inclui times e pessoas em seções */}
        <MultiPickerPopover
          label="Consultores"
          icon={<UserIcon className="w-3.5 h-3.5" />}
          sections={visibleOwnerSections}
          selectedIds={selectedOwnerIds.filter(id => id !== profileId || !isMyFunnel)}
          onToggle={onToggleOwner}
          onClear={onClearOwners}
          singularNoun="consultor"
          pluralNoun="consultores"
        />

        {/* Meu Funil */}
        {profileId && (
          <button
            onClick={onToggleMyFunnel}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap',
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
          Comparando com {formatShortDate(previousRange.start)} → {formatShortDate(previousRange.end)}
        </div>
      )}
    </div>
  )
}
