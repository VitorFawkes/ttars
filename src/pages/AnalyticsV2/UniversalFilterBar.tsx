import { useState, useRef, useEffect } from 'react'
import {
  Calendar, Filter, RotateCcw, ChevronDown, Check, Search, X,
} from 'lucide-react'
import {
  useAnalyticsV2Filters,
  type DatePresetV2,
  type PhaseSlugV2,
  type LeadEntryPathV2,
  type TemporalLensV2,
  type WinPointV2,
} from '@/hooks/analyticsV2/useAnalyticsV2Filters'
import { cn } from '@/lib/utils'
import {
  useFilterProfiles,
  useFilterOrigens,
  useFilterDestinations,
  useFilterTags,
} from '@/hooks/analyticsV2/useFilterOptions'

const PRESETS: Array<{ key: DatePresetV2; label: string }> = [
  { key: 'last_7d', label: 'Últ. 7 dias' },
  { key: 'last_30d', label: 'Últ. 30 dias' },
  { key: 'last_90d', label: 'Últ. 90 dias' },
  { key: 'this_quarter', label: 'Trimestre' },
  { key: 'this_year', label: 'Ano' },
]

const PHASES: { slug: PhaseSlugV2; label: string }[] = [
  { slug: 'sdr', label: 'Pré-Venda' },
  { slug: 'planner', label: 'Planejar' },
  { slug: 'pos_venda', label: 'Pós-Venda' },
  { slug: 'resolucao', label: 'Resolução' },
]

const ENTRY_PATHS: { value: LeadEntryPathV2; label: string }[] = [
  { value: 'full_funnel', label: 'Funil Completo' },
  { value: 'direct_planner', label: 'Direto Planner' },
  { value: 'returning', label: 'Retornante' },
  { value: 'referred', label: 'Referência' },
]

const TEMPORAL_LENS: { value: TemporalLensV2; label: string }[] = [
  { value: 'events', label: 'Eventos' },
  { value: 'cohort', label: 'Coorte' },
  { value: 'snapshot', label: 'Snapshot' },
]

const WIN_POINTS: { value: WinPointV2; label: string }[] = [
  { value: 'any', label: 'Qualquer ganho' },
  { value: 'sdr_handoff', label: 'SDR handoff' },
  { value: 'planner_closed', label: 'Planner fechou' },
  { value: 'delivery_done', label: 'Entrega concluída' },
]

function MultiSelectPopover({
  label,
  values,
  allOptions,
  onChange,
  isLoading,
}: {
  label: string
  values: string[]
  allOptions: Array<{ id: string; label: string }>
  onChange: (vals: string[]) => void
  isLoading: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = allOptions.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()),
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const toggleValue = (id: string) => {
    onChange(
      values.includes(id)
        ? values.filter(v => v !== id)
        : [...values, id],
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
          values.length > 0
            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
            : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900',
        )}
        disabled={isLoading}
      >
        <span>{label}</span>
        {values.length > 0 && <span className="font-bold">{values.length}</span>}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {isLoading ? (
              <div className="p-2 text-xs text-slate-500">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-2 text-xs text-slate-500">Nenhum resultado</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => toggleValue(opt.id)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={values.includes(opt.id)}
                    onChange={() => {}}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <span>{opt.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function OwnerSelect({
  value,
  onChange,
  options,
  isLoading,
}: {
  value: string | null
  onChange: (val: string | null) => void
  options: Array<{ id: string; label: string }>
  isLoading: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()),
  )

  const selectedLabel = options.find(o => o.id === value)?.label

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors max-w-xs',
          value
            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
            : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900',
        )}
        disabled={isLoading}
      >
        <span className="truncate">{selectedLabel || 'Dono'}</span>
        {value && (
          <X
            className="w-3 h-3 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
          />
        )}
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {isLoading ? (
              <div className="p-2 text-xs text-slate-500">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-2 text-xs text-slate-500">Nenhum resultado</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onChange(opt.id)
                    setOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                >
                  {value === opt.id && (
                    <Check className="w-4 h-4 text-indigo-600" />
                  )}
                  <span>{opt.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function UniversalFilterBar() {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const datePreset = useAnalyticsV2Filters(s => s.datePreset)
  const from = useAnalyticsV2Filters(s => s.from)
  const to = useAnalyticsV2Filters(s => s.to)
  const phaseSlugs = useAnalyticsV2Filters(s => s.phaseSlugs)
  const ownerId = useAnalyticsV2Filters(s => s.ownerId)
  const origens = useAnalyticsV2Filters(s => s.origens)
  const leadEntryPath = useAnalyticsV2Filters(s => s.leadEntryPath)
  const destinos = useAnalyticsV2Filters(s => s.destinos)
  const tagIds = useAnalyticsV2Filters(s => s.tagIds)
  const temporalLens = useAnalyticsV2Filters(s => s.temporalLens)
  const winPoint = useAnalyticsV2Filters(s => s.winPoint)

  const setDatePreset = useAnalyticsV2Filters(s => s.setDatePreset)
  const setPhaseSlugs = useAnalyticsV2Filters(s => s.setPhaseSlugs)
  const setOwnerId = useAnalyticsV2Filters(s => s.setOwnerId)
  const setOrigens = useAnalyticsV2Filters(s => s.setOrigens)
  const setLeadEntryPath = useAnalyticsV2Filters(s => s.setLeadEntryPath)
  const setDestinos = useAnalyticsV2Filters(s => s.setDestinos)
  const setTagIds = useAnalyticsV2Filters(s => s.setTagIds)
  const setTemporalLens = useAnalyticsV2Filters(s => s.setTemporalLens)
  const setWinPoint = useAnalyticsV2Filters(s => s.setWinPoint)
  const resetToPersona = useAnalyticsV2Filters(s => s.resetToPersona)

  const { data: profiles = [], isLoading: profilesLoading } = useFilterProfiles()
  const { data: origensOptions = [], isLoading: origensLoading } = useFilterOrigens()
  const { data: destOptions = [], isLoading: destLoading } = useFilterDestinations()
  const { data: tagOptions = [], isLoading: tagsLoading } = useFilterTags()

  const profileOptions = profiles.map(p => ({ id: p.id, label: p.nome || '(sem nome)' }))
  const origensOpts = origensOptions.map(o => ({ id: o, label: o }))
  const destOpts = destOptions.map(d => ({ id: d.id, label: d.nome }))
  const tagOpts = tagOptions.map(t => ({ id: t.id, label: t.name }))

  const handleClearAll = () => {
    resetToPersona('dono')
    setShowAdvanced(false)
  }

  const hasActiveFilters = phaseSlugs.length > 0 || ownerId || origens.length > 0 || leadEntryPath || destinos.length > 0 || tagIds.length > 0

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          <span>Período:</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setDatePreset(p.key)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                datePreset === p.key
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-400">
          {from}
          {' '}
          →
          {' '}
          {to}
        </span>

        <div className="h-4 w-px bg-slate-200" />

        <MultiSelectPopover
          label="Fase"
          values={phaseSlugs as string[]}
          allOptions={PHASES.map(p => ({ id: p.slug, label: p.label }))}
          onChange={(vals) => setPhaseSlugs(vals as PhaseSlugV2[])}
          isLoading={false}
        />

        <OwnerSelect
          value={ownerId}
          onChange={setOwnerId}
          options={profileOptions}
          isLoading={profilesLoading}
        />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              showAdvanced || hasActiveFilters
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900',
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            Mais filtros
            {hasActiveFilters && <span className="font-bold">{phaseSlugs.length + (ownerId ? 1 : 0) + origens.length + (leadEntryPath ? 1 : 0) + destinos.length + tagIds.length}</span>}
          </button>

          <button
            onClick={handleClearAll}
            className={cn(
              'inline-flex items-center gap-1 text-xs transition-colors',
              hasActiveFilters
                ? 'text-slate-600 hover:text-slate-900 cursor-pointer'
                : 'text-slate-400 cursor-not-allowed',
            )}
            disabled={!hasActiveFilters}
          >
            <RotateCcw className="w-3 h-3" />
            Limpar
          </button>
        </div>
      </div>

      {showAdvanced && (
        <div className="border-t border-slate-200 mt-3 pt-3 flex flex-wrap items-center gap-3">
          <MultiSelectPopover
            label="Origem"
            values={origens}
            allOptions={origensOpts}
            onChange={setOrigens}
            isLoading={origensLoading}
          />

          <MultiSelectPopover
            label="Entry Path"
            values={leadEntryPath ? [leadEntryPath] : []}
            allOptions={ENTRY_PATHS.map(e => ({ id: e.value, label: e.label }))}
            onChange={(vals) =>
              setLeadEntryPath(vals.length > 0 ? (vals[0] as LeadEntryPathV2) : null)
            }
            isLoading={false}
          />

          <MultiSelectPopover
            label="Destino"
            values={destinos}
            allOptions={destOpts}
            onChange={setDestinos}
            isLoading={destLoading}
          />

          <MultiSelectPopover
            label="Tags"
            values={tagIds}
            allOptions={tagOpts}
            onChange={setTagIds}
            isLoading={tagsLoading}
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Lente:</span>
            <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5">
              {TEMPORAL_LENS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTemporalLens(t.value)}
                  className={cn(
                    'px-2 py-1 rounded-md text-xs font-medium transition-colors',
                    temporalLens === t.value
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Vitória:</span>
            <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5">
              {WIN_POINTS.map(w => (
                <button
                  key={w.value}
                  onClick={() => setWinPoint(w.value)}
                  className={cn(
                    'px-2 py-1 rounded-md text-xs font-medium transition-colors',
                    winPoint === w.value
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
