import { useState, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Zap, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useMeuDia, useGroupedMeuDia, type MeuDiaGroupBy, type MeuDiaFilters } from '../../hooks/concierge/useMeuDia'
import { TIPO_LABEL, SOURCE_LABEL, type TipoConcierge, type SourceConcierge } from '../../hooks/concierge/types'
import { cn } from '../../lib/utils'
import { AtendimentoDetailModal } from '../../components/concierge/AtendimentoDetailModal'
import type { MeuDiaItem } from '../../hooks/concierge/types'

type ViewMode = 'prazo' | 'viagem' | 'categoria'

export default function MeuDiaPage() {
  const { profile } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('prazo')
  const [showAllUsers, setShowAllUsers] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [tiposFilter, setTiposFilter] = useState<Set<string>>(new Set())
  const [categoriasFilter, setCategoriasFilter] = useState<Set<string>>(new Set())
  const [sourcesFilter, setSourcesFilter] = useState<Set<string>>(new Set())
  const [selectedAtendimento, setSelectedAtendimento] = useState<MeuDiaItem | null>(null)

  const filters: MeuDiaFilters = useMemo(() => ({
    donoId: !showAllUsers && profile?.id ? profile.id : undefined,
    status: statusFilter.size > 0 ? Array.from(statusFilter) as ('aberto' | 'em_andamento' | 'concluido')[] : undefined,
    tipos: tiposFilter.size > 0 ? Array.from(tiposFilter) as TipoConcierge[] : undefined,
    categorias: categoriasFilter.size > 0 ? Array.from(categoriasFilter) : undefined,
    sources: sourcesFilter.size > 0 ? Array.from(sourcesFilter) as SourceConcierge[] : undefined,
    incluirConcluidos: false,
  }), [profile?.id, showAllUsers, statusFilter, tiposFilter, categoriasFilter, sourcesFilter])

  const { data: items = [], isLoading } = useMeuDia(filters)
  const grouped = useGroupedMeuDia(items, viewMode as MeuDiaGroupBy)

  const estadoVazio = items.length === 0

  const toggleStatusFilter = (status: string) => {
    const next = new Set(statusFilter)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    setStatusFilter(next)
  }

  const toggleTiposFilter = (tipo: string) => {
    const next = new Set(tiposFilter)
    if (next.has(tipo)) next.delete(tipo)
    else next.add(tipo)
    setTiposFilter(next)
  }

  const toggleSourcesFilter = (source: string) => {
    const next = new Set(sourcesFilter)
    if (next.has(source)) next.delete(source)
    else next.add(source)
    setSourcesFilter(next)
  }

  const allCategorias = useMemo(() => {
    const cats = new Set<string>()
    for (const item of items) {
      cats.add(item.categoria)
    }
    return Array.from(cats).sort()
  }, [items])

  const closedItemsCount = items.filter(i => i.outcome !== null).length
  const vendidoExtra = items
    .filter(i => i.outcome === 'aceito' && i.cobrado_de === 'cliente')
    .reduce((sum, i) => sum + (i.valor ?? 0), 0)

  const isVencido = (item: MeuDiaItem) => item.status_apresentacao === 'vencido'

  return (
    <div className="p-8">
      {/* Filtros e Controles */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* View Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Agrupar por
            </label>
            <div className="flex gap-2">
              {(['prazo', 'viagem', 'categoria'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    viewMode === mode
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  )}
                >
                  {mode === 'prazo' && 'Por prazo'}
                  {mode === 'viagem' && 'Por viagem'}
                  {mode === 'categoria' && 'Por categoria'}
                </button>
              ))}
            </div>
          </div>

          {/* Show All Users Toggle */}
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllUsers}
                onChange={(e) => setShowAllUsers(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium text-slate-700">Ver de todos</span>
            </label>
          </div>
        </div>

        {/* Filter Row */}
        <div className="space-y-3">
          {/* Status Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status</label>
            <div className="flex flex-wrap gap-2">
              {(['aberto', 'em_andamento', 'concluido'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => toggleStatusFilter(status)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full font-medium transition-colors",
                    statusFilter.has(status)
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {status === 'aberto' && 'Aberto'}
                  {status === 'em_andamento' && 'Em andamento'}
                  {status === 'concluido' && 'Concluído'}
                </button>
              ))}
            </div>
          </div>

          {/* Tipos Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tipos</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TIPO_LABEL).map(([tipo, { label, bgColor, color }]) => (
                <button
                  key={tipo}
                  onClick={() => toggleTiposFilter(tipo)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full font-medium transition-colors",
                    tiposFilter.has(tipo)
                      ? `${bgColor} ${color}`
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Categorias Filter */}
          {allCategorias.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Categorias</label>
              <div className="flex flex-wrap gap-2">
                {allCategorias.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      const next = new Set(categoriasFilter)
                      if (next.has(cat)) next.delete(cat)
                      else next.add(cat)
                      setCategoriasFilter(next)
                    }}
                    className={cn(
                      "px-3 py-1 text-xs rounded-full font-medium transition-colors",
                      categoriasFilter.has(cat)
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sources Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Origem</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SOURCE_LABEL).map(([source, { label }]) => (
                <button
                  key={source}
                  onClick={() => toggleSourcesFilter(source)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full font-medium transition-colors",
                    sourcesFilter.has(source)
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lista Agrupada */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : estadoVazio ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <Zap className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Nenhum atendimento</h3>
          <p className="text-slate-600">Crie o primeiro atendimento para começar</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.groupKey}>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">{group.groupLabel}</h2>
              <div className="space-y-2">
                {group.items.map(item => (
                  <button
                    key={item.atendimento_id}
                    onClick={() => setSelectedAtendimento(item)}
                    className={cn(
                      "w-full text-left bg-white border border-slate-200 rounded-xl p-4 shadow-sm transition-all hover:shadow-md hover:border-slate-300",
                      isVencido(item) && 'border-red-200 bg-red-50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Tipo e Categoria */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold px-2 py-1 rounded-full"
                            style={{
                              backgroundColor: TIPO_LABEL[item.tipo_concierge].bgColor,
                              color: TIPO_LABEL[item.tipo_concierge].color.replace('text-', '').replace('-', ' ')
                            }}>
                            {TIPO_LABEL[item.tipo_concierge].emoji} {TIPO_LABEL[item.tipo_concierge].label}
                          </span>
                          <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                            {item.categoria}
                          </span>
                        </div>

                        {/* Titulo */}
                        <h3 className="font-semibold text-slate-900 mb-1">{item.titulo}</h3>

                        {/* Card Info */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm text-slate-600">{item.card_titulo}</span>
                          {item.data_viagem_inicio && (
                            <span className="text-xs text-slate-500">
                              ({new Date(item.data_viagem_inicio).toLocaleDateString('pt-BR')})
                            </span>
                          )}
                        </div>

                        {/* Prazo e fonte */}
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          {item.data_vencimento && (
                            <>
                              {isVencido(item) ? (
                                <span className="text-red-600 font-semibold flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Vencido {formatDistanceToNow(new Date(item.data_vencimento), { locale: ptBR })}
                                </span>
                              ) : (
                                <span>Prazo: {formatDistanceToNow(new Date(item.data_vencimento), { locale: ptBR })}</span>
                              )}
                            </>
                          )}
                          {SOURCE_LABEL[item.source] && (
                            <span className="ml-auto">
                              {SOURCE_LABEL[item.source].emoji} {SOURCE_LABEL[item.source].label}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Valor */}
                      {item.tipo_concierge === 'oferta' && item.valor && (
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-semibold text-slate-900">
                            R$ {item.valor.toLocaleString('pt-BR')}
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer com Métricas */}
      {!estadoVazio && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-8 py-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex gap-6">
              <div>
                <span className="text-xs text-slate-600">Fechados este mês</span>
                <div className="text-lg font-bold text-slate-900">{closedItemsCount}</div>
              </div>
              <div>
                <span className="text-xs text-slate-600">Vendido extra</span>
                <div className="text-lg font-bold text-green-600">
                  R$ {vendidoExtra.toLocaleString('pt-BR')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Atendimento Detail Modal */}
      {selectedAtendimento && (
        <AtendimentoDetailModal
          item={selectedAtendimento}
          isOpen={!!selectedAtendimento}
          onClose={() => setSelectedAtendimento(null)}
        />
      )}
    </div>
  )
}
