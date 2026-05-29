import { useEffect, useMemo, useState } from 'react'
import { Search, X, ChevronLeft, ChevronRight, Heart, AlertCircle, Users, Combine } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useWeddingsWithGuestCounts } from '../../../hooks/convidados/useWeddingsWithGuestCounts'
import { useConvidadosPreferences } from '../../../hooks/convidados/useConvidadosPreferences'
import { ETAPA_LABEL, ETAPA_ORDER, type EtapaConvidados } from '../../../hooks/convidados/types'
import { findDuplicateWeddings } from '../../../lib/convidados/findDuplicateWeddings'
import { UnirCasamentosDuplicadosModal } from '../UnirCasamentosDuplicadosModal'
import { CasamentoCard } from './CasamentoCard'

const PAGE_SIZE = 12

const ETAPA_DESCRIPTION: Record<EtapaConvidados, string> = {
  promo: 'Em divulgação',
  padrao: 'Comunicação ativa',
  encerrado: 'Comunicação cessada',
  cancelado: 'Casamento cancelado',
}

const ETAPA_CHIP_STYLE: Record<EtapaConvidados, { active: string; inactive: string }> = {
  promo: {
    active: 'bg-amber-600 text-white border-amber-600',
    inactive: 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50',
  },
  padrao: {
    active: 'bg-emerald-600 text-white border-emerald-600',
    inactive: 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50',
  },
  encerrado: {
    active: 'bg-slate-700 text-white border-slate-700',
    inactive: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
  },
  cancelado: {
    active: 'bg-rose-600 text-white border-rose-600',
    inactive: 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50',
  },
}

export function CasamentosBoard() {
  const { data, isLoading, isError } = useWeddingsWithGuestCounts()
  const { prefs, setPref, toggleEtapa } = useConvidadosPreferences()
  const [page, setPage] = useState(1)
  // Busca não persiste — zera sempre que entra na aba
  const [search, setSearch] = useState('')
  const [unirOpen, setUnirOpen] = useState(false)

  // Casamentos duplicados (mesmo casal + mesma data) detectados no board.
  const duplicateGroups = useMemo(() => findDuplicateWeddings(data), [data])

  // Estatísticas (sempre baseadas no conjunto total, não no filtrado)
  const stats = useMemo(() => {
    let totalConvidados = 0
    let convidadosAtivos = 0
    let pendentesConfig = 0
    for (const w of data) {
      totalConvidados += w.counts.total
      convidadosAtivos += w.counts.total - w.counts.nao_vai
      if (w.counts.total === 0) pendentesConfig += 1
    }
    return {
      totalCasamentos: data.length,
      pendentesConfig,
      totalConvidados,
      convidadosAtivos,
    }
  }, [data])

  const countsByEtapa = useMemo(() => {
    const map: Record<EtapaConvidados, number> = { promo: 0, padrao: 0, encerrado: 0, cancelado: 0 }
    for (const w of data) {
      if (map[w.etapa] !== undefined) map[w.etapa] += 1
    }
    return map
  }, [data])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const etapas = prefs.etapaFilter
    return data.filter(w => {
      if (prefs.pendentesOnly && w.counts.total > 0) return false
      if (etapas.length > 0 && !etapas.includes(w.etapa)) return false
      if (term && !w.titulo.toLowerCase().includes(term)) return false
      return true
    })
  }, [data, search, prefs.etapaFilter, prefs.pendentesOnly])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const start = (page - 1) * PAGE_SIZE
  const visible = filtered.slice(start, start + PAGE_SIZE)
  const hasAnyFilter =
    search.trim().length > 0 ||
    prefs.etapaFilter.length > 0 ||
    prefs.pendentesOnly

  const clearAllFilters = () => {
    setSearch('')
    setPref('etapaFilter', [])
    setPref('pendentesOnly', false)
    setPage(1)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <HeaderSection />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl h-56 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <HeaderSection />
        <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">
          Não consegui carregar os casamentos. Tenta recarregar a página.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <HeaderSection />

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total de Casamentos"
          value={stats.totalCasamentos}
          icon={<Heart className="w-5 h-5 text-rose-400" />}
        />
        <StatCard
          label="Pendentes Config."
          value={stats.pendentesConfig}
          icon={<AlertCircle className="w-5 h-5 text-orange-500" />}
          valueClassName="text-orange-600"
          active={prefs.pendentesOnly}
          onClick={() => {
            setPref('pendentesOnly', !prefs.pendentesOnly)
            setPage(1)
          }}
          activeRingClass="ring-2 ring-orange-400"
        />
        <StatCard
          label="Total de Convidados"
          value={stats.totalConvidados}
          icon={<Users className="w-5 h-5 text-sky-500" />}
        />
        <StatCard
          label="Convidados Ativos"
          value={stats.convidadosAtivos}
          icon={<Users className="w-5 h-5 text-emerald-500" />}
        />
      </div>

      {/* Search + etapa chips */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Buscar casamento pelo nome do casal..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>
          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
          {duplicateGroups.length > 0 && (
            <button
              type="button"
              onClick={() => setUnirOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md transition-colors shrink-0"
              title="Casamentos duplicados detectados — unir num só"
            >
              <Combine className="w-3.5 h-3.5" /> Unir duplicados
              <span className="tabular-nums text-[10px] font-semibold rounded-full px-1.5 min-w-[1.1rem] inline-flex items-center justify-center bg-amber-600 text-white">
                {duplicateGroups.length}
              </span>
            </button>
          )}
          <span className="text-xs text-slate-500 tabular-nums shrink-0">
            {filtered.length} de {data.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1">Etapa:</span>
          {ETAPA_ORDER.map(etapa => {
            const active = prefs.etapaFilter.includes(etapa)
            const style = ETAPA_CHIP_STYLE[etapa]
            const count = countsByEtapa[etapa]
            return (
              <button
                key={etapa}
                type="button"
                onClick={() => {
                  toggleEtapa(etapa)
                  setPage(1)
                }}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                  active ? style.active : style.inactive,
                )}
                title={ETAPA_DESCRIPTION[etapa]}
              >
                <span>{ETAPA_LABEL[etapa]}</span>
                <span
                  className={cn(
                    'tabular-nums text-[10px] font-semibold rounded-full px-1.5 min-w-[1.1rem] inline-flex items-center justify-center',
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Empty/grid */}
      {data.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-700">Nenhum casamento em pós-venda ainda.</p>
          <p className="text-xs text-slate-500 mt-1">A aba mostra apenas casamentos cuja etapa do funil é pós-venda.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-700">Nenhum casamento encontrado.</p>
          <p className="text-xs text-slate-500 mt-1">Ajuste a busca ou os filtros.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visible.map(wedding => (
            <CasamentoCard key={wedding.id} wedding={wedding} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <footer className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>
            Mostrando <strong className="text-slate-700">{start + 1}</strong>–<strong className="text-slate-700">{Math.min(start + PAGE_SIZE, filtered.length)}</strong>{' '}
            de <strong className="text-slate-700">{filtered.length}</strong>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3 h-3" /> Anterior
            </button>
            <span className="px-2 tabular-nums">
              Página <strong className="text-slate-700">{page}</strong> de <strong className="text-slate-700">{totalPages}</strong>
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Próximo <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </footer>
      )}

      <UnirCasamentosDuplicadosModal open={unirOpen} onClose={() => setUnirOpen(false)} />
    </div>
  )
}

function HeaderSection() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Casamentos</h1>
      <p className="text-sm text-slate-500 mt-0.5">Gerencie os casamentos e seus convidados</p>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
  valueClassName?: string
  active?: boolean
  onClick?: () => void
  activeRingClass?: string
}

function StatCard({ label, value, icon, valueClassName, active, onClick, activeRingClass }: StatCardProps) {
  const interactive = !!onClick
  const Tag = interactive ? 'button' : 'div'
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'text-left bg-white border border-slate-200 rounded-xl p-4 transition-all',
        interactive && 'hover:border-slate-300 hover:shadow-sm cursor-pointer',
        active && (activeRingClass ?? 'ring-2 ring-indigo-400'),
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-600">{label}</span>
        {icon}
      </div>
      <p className={cn('mt-1 text-3xl font-bold tabular-nums', valueClassName ?? 'text-slate-900')}>
        {value.toLocaleString('pt-BR')}
      </p>
    </Tag>
  )
}
