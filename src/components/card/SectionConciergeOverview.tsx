import { useState } from 'react'
import { AlertCircle, Plus, ChevronRight } from 'lucide-react'
import { useAtendimentosCard } from '../../hooks/concierge/useAtendimentosCard'
import { useCardConciergeStats } from '../../hooks/concierge/useCardConciergeStats'
import { TIPO_LABEL, type MeuDiaItem } from '../../hooks/concierge/types'
import { Button } from '../ui/Button'
import { NovoAtendimentoModal } from '../concierge/NovoAtendimentoModal'
import { AtendimentoDetailModal } from '../concierge/AtendimentoDetailModal'
import { cn } from '../../lib/utils'

interface SectionConciergeOverviewProps {
  cardId: string
}

export function SectionConciergeOverview({ cardId }: SectionConciergeOverviewProps) {
  const { data: atendimentos = [], isLoading } = useAtendimentosCard(cardId)
  const { data: stats } = useCardConciergeStats(cardId)
  const [showNovoModal, setShowNovoModal] = useState(false)
  const [selectedAtendimento, setSelectedAtendimento] = useState<MeuDiaItem | null>(null)

  const ativos = atendimentos.filter(a => !a.outcome)
  const vencidos = ativos.filter(a => a.status_apresentacao === 'vencido')
  const topUrgentes = ativos
    .sort((a, b) => {
      // Vencidos primeiro
      if (a.status_apresentacao === 'vencido' && b.status_apresentacao !== 'vencido') return -1
      if (a.status_apresentacao !== 'vencido' && b.status_apresentacao === 'vencido') return 1
      // Depois por prazo
      if (a.data_vencimento && b.data_vencimento) {
        return new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime()
      }
      return 0
    })
    .slice(0, 3)

  const mostrarSecao = atendimentos.length > 0

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="w-12 h-4 bg-slate-200 rounded animate-pulse" />
      </div>
    )
  }

  if (!mostrarSecao) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Concierge</h3>
          <Button
            onClick={() => setShowNovoModal(true)}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">Concierge</h3>
          <Button
            onClick={() => setShowNovoModal(true)}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo
          </Button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-slate-600">{stats.ativos} ativos</span>
            </div>
            {vencidos.length > 0 && (
              <div>
                <span className="text-red-600 font-semibold">{stats.vencidos} vencidos</span>
              </div>
            )}
            {stats.valor_vendido_extra > 0 && (
              <div>
                <span className="text-green-600 font-semibold">
                  R$ {stats.valor_vendido_extra.toLocaleString('pt-BR')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Top 3 Urgentes */}
      <div className="p-6 space-y-3">
        {topUrgentes.length === 0 ? (
          <p className="text-slate-600 text-sm">Nenhum atendimento ativo</p>
        ) : (
          topUrgentes.map(item => {
            const isVencido = item.status_apresentacao === 'vencido'
            const tipoInfo = TIPO_LABEL[item.tipo_concierge]

            return (
              <button
                key={item.atendimento_id}
                onClick={() => setSelectedAtendimento(item)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border transition-all hover:shadow-md",
                  isVencido
                    ? 'bg-red-50 border-red-200'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                        style={{
                          backgroundColor: tipoInfo.bgColor,
                          color: tipoInfo.color.replace('text-', '').replace('-', ' ')
                        }}>
                        {tipoInfo.label}
                      </span>
                      {isVencido && (
                        <span className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                          <AlertCircle className="w-3 h-3" />
                          Vencido
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 truncate">{item.titulo}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{item.categoria}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Footer */}
      {atendimentos.length > 3 && (
        <div className="border-t border-slate-200 px-6 py-3">
          <a
            href={`/concierge?cardId=${cardId}`}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            Ver todos ({atendimentos.length})
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Modals */}
      {showNovoModal && (
        <NovoAtendimentoModal
          isOpen={showNovoModal}
          onClose={() => setShowNovoModal(false)}
          cardId={cardId}
        />
      )}

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
