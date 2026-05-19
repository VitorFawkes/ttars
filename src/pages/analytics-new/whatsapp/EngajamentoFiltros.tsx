import { Calendar, Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import type {
  AttributionMode,
  ConversationState,
  EngajamentoFilters,
  EngajamentoLineOption,
} from '@/types/engagement'

interface Props {
  filters: EngajamentoFilters
  onChange: (updates: Partial<EngajamentoFilters>) => void
  lines: EngajamentoLineOption[]
  isLoading?: boolean
}

const PRESETS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '60 dias', days: 60 },
  { label: '90 dias', days: 90 },
  { label: '6 meses', days: 180 },
]

const ATTRIBUTION_OPTIONS: { value: AttributionMode; label: string }[] = [
  { value: 'ai_agent', label: 'IA (Patricia / Estela)' },
  { value: 'human', label: 'Humano da equipe' },
  { value: 'cadence', label: 'Cadência automática' },
  { value: 'unknown', label: 'Origem desconhecida' },
]

const STATE_OPTIONS: { value: ConversationState; label: string }[] = [
  { value: 'hot', label: 'Quente (24h)' },
  { value: 'warm', label: 'Morna (7 dias)' },
  { value: 'lost', label: 'Sumiu (48h+)' },
  { value: 'cold', label: 'Nunca respondeu' },
  { value: 'won', label: 'Ganha' },
]

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export default function EngajamentoFiltros({ filters, onChange, lines, isLoading }: Props) {
  const currentDays = daysBetween(filters.dateFrom, filters.dateTo)
  const activePreset = PRESETS.find(p => p.days === currentDays)

  const selectedLineLabels =
    filters.lineLabels.length === 0 ? 'Todas as linhas' : filters.lineLabels.join(', ')

  function setPreset(days: number) {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
    onChange({ dateFrom: isoDate(from), dateTo: isoDate(to) })
  }

  function toggleLine(label: string) {
    const set = new Set(filters.lineLabels)
    if (set.has(label)) set.delete(label)
    else set.add(label)
    onChange({ lineLabels: Array.from(set) })
  }

  function toggleAttribution(mode: AttributionMode) {
    const set = new Set(filters.attributionModes)
    if (set.has(mode)) set.delete(mode)
    else set.add(mode)
    onChange({ attributionModes: Array.from(set) })
  }

  function toggleState(state: ConversationState) {
    const set = new Set(filters.stateFilter)
    if (set.has(state)) set.delete(state)
    else set.add(state)
    onChange({ stateFilter: Array.from(set) })
  }

  const hasAnyFilter =
    filters.lineLabels.length > 0 ||
    filters.attributionModes.length > 0 ||
    filters.stateFilter.length > 0 ||
    filters.includeTestLines

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Período */}
        <div className="flex items-center gap-1 text-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          {PRESETS.map(p => (
            <button
              key={p.days}
              onClick={() => setPreset(p.days)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                activePreset?.days === p.days
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-slate-200 mx-1" />

        {/* Linha */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-50">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate max-w-[200px]">{selectedLineLabels}</span>
            {filters.lineLabels.length > 0 && (
              <span className="ml-1 px-1.5 rounded bg-indigo-100 text-indigo-700 text-[10px]">
                {filters.lineLabels.length}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Linhas WhatsApp</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {lines.map(line => (
              <DropdownMenuCheckboxItem
                key={line.label}
                checked={filters.lineLabels.includes(line.label)}
                onCheckedChange={() => toggleLine(line.label)}
                onSelect={e => e.preventDefault()}
              >
                {line.label}
                {line.is_test && <span className="ml-1 text-[10px] text-slate-400">(teste)</span>}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={filters.includeTestLines}
              onCheckedChange={v => onChange({ includeTestLines: !!v })}
              onSelect={e => e.preventDefault()}
            >
              Incluir linhas de teste
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Atribuição */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-50">
            <span>Quem enviou</span>
            {filters.attributionModes.length > 0 && (
              <span className="ml-1 px-1.5 rounded bg-indigo-100 text-indigo-700 text-[10px]">
                {filters.attributionModes.length}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Origem da nossa mensagem</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ATTRIBUTION_OPTIONS.map(opt => (
              <DropdownMenuCheckboxItem
                key={opt.value}
                checked={filters.attributionModes.includes(opt.value)}
                onCheckedChange={() => toggleAttribution(opt.value)}
                onSelect={e => e.preventDefault()}
              >
                {opt.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Estado */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-50">
            <span>Estado</span>
            {filters.stateFilter.length > 0 && (
              <span className="ml-1 px-1.5 rounded bg-indigo-100 text-indigo-700 text-[10px]">
                {filters.stateFilter.length}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Como a conversa está</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATE_OPTIONS.map(opt => (
              <DropdownMenuCheckboxItem
                key={opt.value}
                checked={filters.stateFilter.includes(opt.value)}
                onCheckedChange={() => toggleState(opt.value)}
                onSelect={e => e.preventDefault()}
              >
                {opt.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasAnyFilter && (
          <button
            onClick={() =>
              onChange({
                lineLabels: [],
                attributionModes: [],
                stateFilter: [],
                includeTestLines: false,
              })
            }
            className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 px-2 py-1"
          >
            <X className="w-3 h-3" />
            Limpar filtros
          </button>
        )}

        {isLoading && <div className="ml-auto text-xs text-slate-400">Carregando…</div>}
      </div>
    </div>
  )
}
