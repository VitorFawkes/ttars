import { useMemo } from 'react'
import { User as UserIcon, Tag as TagIcon, Users as UsersIcon, X, Repeat } from 'lucide-react'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import type { FilterDimension } from '@/hooks/analytics/filterContracts'
import { useAuth } from '@/contexts/AuthContext'
import {
  useFilterOrigens,
  useFilterTags,
  useFilterProfilesWithRole,
  type FilterProfileWithRole,
} from '@/hooks/analytics/useFilterOptions'
import DateRangePicker from '@/components/analytics/DateRangePicker'
import { cn } from '@/lib/utils'

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
  /**
   * Filtros que ESTA tela suporta. Vem de `FILTER_CONTRACTS[view]`.
   * A barra renderiza só o que está aqui — e o hook da tela passa exatamente
   * esses mesmos params pra RPC. Sem controle morto, sem filtro fantasma.
   */
  contract: FilterDimension[]
  /** Apenas profiles com esse role aparecem no seletor de pessoa */
  roleFilter?: 'sdr' | 'vendas' | null
  /** Rótulo customizado do botão "Meu trabalho" — ex: "Meus cards", "Minhas vendas" */
  myButtonLabel?: string
}

export default function SimpleFilterBar({
  contract,
  roleFilter = null,
  myButtonLabel = 'Meu trabalho',
}: Props) {
  const has = (d: FilterDimension) => contract.includes(d)

  const { profile } = useAuth()
  const {
    ownerIds,
    setOwnerIds,
    origins,
    setOrigins,
    tagIds,
    setTagIds,
    dateRef,
    setDateRef,
    compare,
    setCompare,
  } = useAnalyticsFilters()

  const profiles = useFilterProfilesWithRole()
  const origens = useFilterOrigens()
  const tags = useFilterTags()

  const peopleOptions = useMemo<FilterProfileWithRole[]>(() => {
    const all = profiles.data ?? []
    if (!roleFilter) return all
    return all.filter(p => p.role === roleFilter)
  }, [profiles.data, roleFilter])

  const isMyView = !!profile?.id && ownerIds.length === 1 && ownerIds[0] === profile.id
  const isTeamView = ownerIds.length === 0
  const isSpecificPerson = !isMyView && !isTeamView

  const selectedOwnerLabel = useMemo(() => {
    if (ownerIds.length === 0) return 'Time todo'
    if (isMyView) return 'Meu trabalho'
    if (ownerIds.length === 1) {
      const p = peopleOptions.find(pp => pp.id === ownerIds[0])
      return p?.nome || '1 pessoa'
    }
    return `${ownerIds.length} pessoas`
  }, [ownerIds, peopleOptions, isMyView])

  const selectedOrigensLabel = useMemo(() => {
    if (origins.length === 0) return 'Todas'
    if (origins.length === 1) return ORIGEM_LABELS[origins[0]] ?? origins[0]
    return `${origins.length} origens`
  }, [origins])

  const selectedTagsLabel = useMemo(() => {
    if (tagIds.length === 0) return 'Todas'
    if (tagIds.length === 1) {
      const t = (tags.data ?? []).find(tt => tt.id === tagIds[0])
      return t?.name || '1 etiqueta'
    }
    return `${tagIds.length} etiquetas`
  }, [tagIds, tags.data])

  const setTeam = () => setOwnerIds([])
  const setMine = () => {
    if (profile?.id) setOwnerIds([profile.id])
  }

  const hasActiveExtras =
    (has('origins') && origins.length > 0) ||
    (has('tags') && tagIds.length > 0) ||
    (has('owners') && isSpecificPerson)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
      {/* Visão: Time todo / Meu trabalho — define a ótica antes de qualquer filtro */}
      {has('owners') && profile?.id && (
        <>
          <div className="flex items-center gap-0.5 bg-slate-50 rounded-md p-0.5">
            <button
              type="button"
              onClick={setTeam}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                isTeamView
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
              title="Ver os números agregados do time"
            >
              <UsersIcon className="w-3.5 h-3.5" />
              Time todo
            </button>
            <button
              type="button"
              onClick={setMine}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                isMyView
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
              title="Filtrar pra ver só os seus cards"
            >
              <UserIcon className="w-3.5 h-3.5" />
              {myButtonLabel}
            </button>
          </div>

          <span className="w-px h-6 bg-slate-200 mx-1" />
        </>
      )}

      {/* Período */}
      {has('period') && <DateRangePicker compact />}

      {/* Lente temporal: Por safra (criação) ↔ Por atividade (período) */}
      {has('dateRef') && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider hidden sm:inline">
            Lente
          </span>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(
              [
                ['created', 'Por safra'],
                ['stage', 'Por atividade'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setDateRef(val)}
                title={
                  val === 'created'
                    ? 'Por safra (data de criação): a turma de leads que ENTROU no período — e o que aconteceu com ela depois.'
                    : 'Por atividade (data do evento): o que ACONTECEU no período (entrou na etapa, fechou), mesmo de leads antigos.'
                }
                className={cn(
                  'px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  dateRef === val
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="w-px h-6 bg-slate-200 mx-1" />
        </div>
      )}

      {/* Comparar com período anterior (mesma duração, deslocado pra trás) */}
      {has('compare') && (
        <button
          type="button"
          onClick={() => setCompare(!compare)}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors',
            compare
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
          )}
          title="Mostra a variação vs o período anterior de mesma duração"
        >
          <Repeat className="w-3.5 h-3.5" />
          Comparar
        </button>
      )}

      {/* Pessoa específica — só faz sentido na visão Time todo (gestor focando em alguém) */}
      {has('owners') && isTeamView && peopleOptions.length > 0 && (
        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">
            <UserIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Focar em:</span> <span className="text-slate-900">Ninguém</span>
          </summary>
          <div className="absolute top-full left-0 mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            {peopleOptions.length === 0 && (
              <p className="text-xs text-slate-400 px-2 py-3 text-center">
                {profiles.isLoading ? 'Carregando…' : roleFilter ? `Ninguém com função ${roleFilter}` : 'Ninguém'}
              </p>
            )}
            {peopleOptions.map(p => (
              <button
                key={p.id}
                onClick={() => setOwnerIds([p.id])}
                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between"
              >
                <span className="truncate">{p.nome}</span>
                {p.role && <span className="ml-2 text-[10px] text-slate-400 uppercase">{p.role}</span>}
              </button>
            ))}
          </div>
        </details>
      )}

      {/* Indicador de pessoa em foco (quando não é Meu e não é Time todo) */}
      {has('owners') && isSpecificPerson && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-md">
          <UserIcon className="w-3.5 h-3.5" />
          {selectedOwnerLabel}
          <button
            onClick={setTeam}
            className="ml-1 text-indigo-400 hover:text-indigo-700"
            title="Voltar pra visão do time todo"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Origem (contextual) */}
      {has('origins') && (
        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">
            <TagIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Origem:</span> <span className="text-slate-900">{selectedOrigensLabel}</span>
          </summary>
          <div className="absolute top-full left-0 mt-1 w-56 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            <button
              onClick={() => setOrigins([])}
              className={cn(
                'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                origins.length === 0 && 'bg-indigo-50 text-indigo-700 font-medium',
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
                    isSelected && 'bg-indigo-50 text-indigo-700',
                  )}
                >
                  {ORIGEM_LABELS[o] ?? o}
                </button>
              )
            })}
          </div>
        </details>
      )}

      {/* Etiquetas (contextual) */}
      {has('tags') && (
        <details className="relative">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">
            <TagIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Etiqueta:</span> <span className="text-slate-900">{selectedTagsLabel}</span>
          </summary>
          <div className="absolute top-full left-0 mt-1 w-56 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
            <button
              onClick={() => setTagIds([])}
              className={cn(
                'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                tagIds.length === 0 && 'bg-indigo-50 text-indigo-700 font-medium',
              )}
            >
              Todas
            </button>
            {(tags.data ?? []).length === 0 && (
              <p className="text-xs text-slate-400 px-2 py-3 text-center">
                {tags.isLoading ? 'Carregando…' : 'Nenhuma etiqueta'}
              </p>
            )}
            {(tags.data ?? []).map(t => {
              const isSelected = tagIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (isSelected) setTagIds(tagIds.filter(x => x !== t.id))
                    else setTagIds([...tagIds, t.id])
                  }}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50',
                    isSelected && 'bg-indigo-50 text-indigo-700',
                  )}
                >
                  {t.name}
                </button>
              )
            })}
          </div>
        </details>
      )}

      {/* Limpar — quando há filtro aplicado além do "Time todo" default */}
      {hasActiveExtras && (
        <button
          onClick={() => {
            setOwnerIds([])
            setOrigins([])
            setTagIds([])
          }}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 hover:text-rose-600"
          title="Limpar tudo"
        >
          <X className="w-3 h-3" />
          Limpar
        </button>
      )}
    </div>
  )
}
