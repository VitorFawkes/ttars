import { useMemo } from 'react'
import { Calendar, User as UserIcon, Tag as TagIcon, Sparkles, X } from 'lucide-react'
import { useAnalyticsFilters, type DatePreset } from '@/hooks/analytics/useAnalyticsFilters'
import { useAuth } from '@/contexts/AuthContext'
import {
  useFilterOrigens,
  useFilterProfilesWithRole,
  type FilterProfileWithRole,
} from '@/hooks/analytics/useFilterOptions'
import { cn } from '@/lib/utils'

const DATE_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'last_3_months', label: '3 meses' },
  { value: 'last_6_months', label: '6 meses' },
  { value: 'this_year', label: 'Este ano' },
  { value: 'all_time', label: 'Tudo' },
]

const ORIGEM_LABELS: Record<string, string> = {
  manual: 'Planner direto',
  whatsapp: 'WhatsApp (Julia)',
  active_campaign: 'Active Campaign',
  mkt: 'Marketing',
  indicacao: 'Indicação',
  carteira_propria: 'Carteira própria',
  carteira_wg: 'Carteira WG',
  sorrento: 'Sorrento',
  weddings: 'Weddings (cruzado)',
  sem_origem: 'Sem origem',
}

interface Props {
  /** Apenas profiles com esse role aparecem no seletor de pessoa */
  roleFilter?: 'sdr' | 'vendas' | null
  /** Texto do botão "Meu" — usa o profile logado se essa role bater com o do usuário */
  myButtonLabel?: string
}

export default function SimpleFilterBar({ roleFilter = null, myButtonLabel = 'Meu' }: Props) {
  const { profile } = useAuth()
  const {
    datePreset,
    setDatePreset,
    ownerIds,
    setOwnerIds,
    origins,
    setOrigins,
  } = useAnalyticsFilters()

  const profiles = useFilterProfilesWithRole()
  const origens = useFilterOrigens()

  // Lista de pessoas no dropdown — filtrada por role quando especificado
  const peopleOptions = useMemo<FilterProfileWithRole[]>(() => {
    const all = profiles.data ?? []
    if (!roleFilter) return all
    return all.filter(p => p.role === roleFilter)
  }, [profiles.data, roleFilter])

  const selectedOwnerLabel = useMemo(() => {
    if (ownerIds.length === 0) return 'Todos'
    if (ownerIds.length === 1) {
      const p = peopleOptions.find(pp => pp.id === ownerIds[0])
      return p?.nome || '1 pessoa'
    }
    return `${ownerIds.length} pessoas`
  }, [ownerIds, peopleOptions])

  const selectedOrigensLabel = useMemo(() => {
    if (origins.length === 0) return 'Todas'
    if (origins.length === 1) return ORIGEM_LABELS[origins[0]] ?? origins[0]
    return `${origins.length} origens`
  }, [origins])

  const isMyView = !!profile?.id && ownerIds.length === 1 && ownerIds[0] === profile.id

  const toggleMy = () => {
    if (!profile?.id) return
    if (isMyView) setOwnerIds([])
    else setOwnerIds([profile.id])
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
      {/* Período */}
      <div className="flex items-center gap-1 px-2">
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Período</span>
      </div>
      <div className="flex items-center gap-0.5 bg-slate-50 rounded-md p-0.5">
        {DATE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setDatePreset(opt.value)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded transition-colors',
              datePreset === opt.value
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <span className="w-px h-6 bg-slate-200 mx-1" />

      {/* Pessoa */}
      <details className="relative">
        <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">
          <UserIcon className="w-3.5 h-3.5" />
          Pessoa: <span className="text-slate-900">{selectedOwnerLabel}</span>
        </summary>
        <div className="absolute top-full left-0 mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
          <button
            onClick={() => setOwnerIds([])}
            className={cn(
              'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
              ownerIds.length === 0 && 'bg-indigo-50 text-indigo-700 font-medium'
            )}
          >
            Todos
          </button>
          {peopleOptions.length === 0 && (
            <p className="text-xs text-slate-400 px-2 py-3 text-center">
              {profiles.isLoading ? 'Carregando…' : roleFilter ? `Ninguém com role ${roleFilter}` : 'Ninguém'}
            </p>
          )}
          {peopleOptions.map(p => {
            const isSelected = ownerIds.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (isSelected) setOwnerIds(ownerIds.filter(x => x !== p.id))
                  else setOwnerIds([...ownerIds, p.id])
                }}
                className={cn(
                  'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between',
                  isSelected && 'bg-indigo-50 text-indigo-700'
                )}
              >
                <span className="truncate">{p.nome}</span>
                {p.role && <span className="ml-2 text-[10px] text-slate-400 uppercase">{p.role}</span>}
              </button>
            )
          })}
        </div>
      </details>

      {/* Origem */}
      <details className="relative">
        <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">
          <TagIcon className="w-3.5 h-3.5" />
          Origem: <span className="text-slate-900">{selectedOrigensLabel}</span>
        </summary>
        <div className="absolute top-full left-0 mt-1 w-56 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
          <button
            onClick={() => setOrigins([])}
            className={cn(
              'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
              origins.length === 0 && 'bg-indigo-50 text-indigo-700 font-medium'
            )}
          >
            Todas
          </button>
          {(origens.data ?? []).map(o => {
            const isSelected = origins.includes(o)
            return (
              <button
                key={o}
                onClick={() => {
                  if (isSelected) setOrigins(origins.filter(x => x !== o))
                  else setOrigins([...origins, o])
                }}
                className={cn(
                  'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                  isSelected && 'bg-indigo-50 text-indigo-700'
                )}
              >
                {ORIGEM_LABELS[o] ?? o}
              </button>
            )
          })}
        </div>
      </details>

      {/* Meu */}
      {profile?.id && (
        <button
          onClick={toggleMy}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md',
            isMyView
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          )}
          title="Filtra somente os meus cards"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {myButtonLabel}
        </button>
      )}

      {/* Clear */}
      {(ownerIds.length > 0 || origins.length > 0) && (
        <button
          onClick={() => {
            setOwnerIds([])
            setOrigins([])
          }}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 hover:text-rose-600"
          title="Limpar filtros"
        >
          <X className="w-3 h-3" />
          Limpar
        </button>
      )}
    </div>
  )
}
