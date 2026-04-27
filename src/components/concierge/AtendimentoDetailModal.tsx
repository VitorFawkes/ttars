import { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMarcarOutcome, useNotificarCliente } from '../../hooks/concierge/useAtendimentoMutations'
import { TIPO_LABEL, SOURCE_LABEL, type MeuDiaItem, type OutcomeConcierge, type CobradoDe } from '../../hooks/concierge/types'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../../lib/utils'

interface AtendimentoDetailModalProps {
  item?: MeuDiaItem
  atendimento?: MeuDiaItem
  isOpen?: boolean
  open?: boolean
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
}

const OUTCOME_OPTIONS: { value: OutcomeConcierge; label: string; color: string; bgColor: string }[] = [
  { value: 'aceito', label: 'Aceito', color: 'text-green-700', bgColor: 'bg-green-50' },
  { value: 'recusado', label: 'Recusado', color: 'text-red-700', bgColor: 'bg-red-50' },
  { value: 'feito', label: 'Feito', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  { value: 'cancelado', label: 'Cancelado', color: 'text-slate-700', bgColor: 'bg-slate-50' },
]

export function AtendimentoDetailModal(props: AtendimentoDetailModalProps) {
  const item = (props.item ?? props.atendimento) as MeuDiaItem | undefined
  const isOpen = props.open ?? props.isOpen ?? false
  const onClose = () => { props.onClose?.(); props.onOpenChange?.(false) }
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeConcierge | null>((item?.outcome as OutcomeConcierge) ?? null)
  const [valorFinal, setValorFinal] = useState(item?.valor?.toString() ?? '')
  const [cobradoDe, setCobradoDe] = useState<CobradoDe | ''>(item?.cobrado_de ?? '')
  const [observacao, setObservacao] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const { mutate: marcarOutcome, isPending: isMarkingOutcome } = useMarcarOutcome()
  const { mutate: notificarCliente, isPending: isNotifying } = useNotificarCliente()

  if (!item) return null

  const isVencido = item.status_apresentacao === 'vencido'
  const tipoInfo = TIPO_LABEL[item.tipo_concierge]
  const sourceInfo = SOURCE_LABEL[item.source]

  const handleMarcarOutcome = () => {
    if (!selectedOutcome) return
    marcarOutcome({
      atendimento_id: item.atendimento_id,
      outcome: selectedOutcome,
      valor_final: valorFinal ? parseFloat(valorFinal) : null,
      cobrado_de: cobradoDe ? (cobradoDe as CobradoDe) : null,
      observacao: observacao ?? null,
    }, {
      onSuccess: () => {
        setShowConfirm(false)
        onClose()
      },
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-slate-900">Detalhe do atendimento</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Alert se vencido */}
          {isVencido && (
            <div className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">Atendimento vencido</p>
                <p className="text-sm text-red-700">Vencido há {formatDistanceToNow(new Date(item.data_vencimento!), { locale: ptBR })}</p>
              </div>
            </div>
          )}

          {/* Info boxes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-600 mb-1">Tipo</p>
              <div className="flex items-center gap-2">
                <span>{tipoInfo.emoji}</span>
                <p className="font-semibold text-slate-900">{tipoInfo.label}</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-600 mb-1">Categoria</p>
              <p className="font-semibold text-slate-900">{item.categoria}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-600 mb-1">Origem</p>
              <div className="flex items-center gap-2">
                <span>{sourceInfo.emoji}</span>
                <p className="font-semibold text-slate-900">{sourceInfo.label}</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-600 mb-1">Status</p>
              <p className="font-semibold text-slate-900">
                {item.status_apresentacao === 'vencido' && 'Vencido'}
                {item.status_apresentacao === 'hoje' && 'Hoje'}
                {item.status_apresentacao === 'esta_semana' && 'Esta semana'}
                {item.status_apresentacao === 'futuro' && 'Próximas'}
                {item.status_apresentacao === 'fechado' && 'Fechado'}
                {item.status_apresentacao === 'concluido' && 'Concluído'}
              </p>
            </div>
          </div>

          {/* Título e Descrição */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">{item.titulo}</h3>
            {item.descricao && (
              <p className="text-slate-600">{item.descricao}</p>
            )}
          </div>

          {/* Card info */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-xs text-slate-600 mb-1">Viagem</p>
            <p className="font-semibold text-slate-900 mb-1">{item.card_titulo}</p>
            {item.data_viagem_inicio && (
              <p className="text-sm text-slate-600">
                {new Date(item.data_viagem_inicio).toLocaleDateString('pt-BR')} a{' '}
                {item.data_viagem_fim ? new Date(item.data_viagem_fim).toLocaleDateString('pt-BR') : '?'}
              </p>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-sm">
            <div>
              <span className="text-slate-600">Criado em:</span>
              <span className="ml-2 font-semibold text-slate-900">
                {new Date(item.atendimento_criado_em).toLocaleString('pt-BR')}
              </span>
            </div>
            {item.outcome_em && (
              <div>
                <span className="text-slate-600">Finalizado em:</span>
                <span className="ml-2 font-semibold text-slate-900">
                  {new Date(item.outcome_em).toLocaleString('pt-BR')}
                </span>
              </div>
            )}
          </div>

          {/* Outcome buttons */}
          {!item.outcome && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Marcar como *
              </label>
              <div className="grid grid-cols-2 gap-3">
                {OUTCOME_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setSelectedOutcome(option.value)}
                    className={cn(
                      "p-3 rounded-lg border-2 transition-colors",
                      selectedOutcome === option.value
                        ? `${option.bgColor} border-slate-400`
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <p className={cn("font-semibold", option.color)}>
                      {option.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Valor final (se oferta) */}
          {item.tipo_concierge === 'oferta' && !item.outcome && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Valor final
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-600">R$</span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={valorFinal}
                    onChange={(e) => setValorFinal(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Cobrado de
                </label>
                <select
                  value={cobradoDe}
                  onChange={(e) => setCobradoDe(e.target.value as CobradoDe)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">Selecionar...</option>
                  <option value="cliente">Cliente</option>
                  <option value="cortesia">Cortesia</option>
                  <option value="incluido_pacote">Incluído pacote</option>
                </select>
              </div>
            </div>
          )}

          {/* Observação */}
          {!item.outcome && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Observação
              </label>
              <textarea
                placeholder="Anotações sobre este atendimento..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-none h-20"
              />
            </div>
          )}

          {/* Outcome status se já finalizado */}
          {item.outcome && (
            <div className={cn(
              "p-4 rounded-lg",
              item.outcome === 'aceito' && 'bg-green-50 border border-green-200',
              item.outcome === 'recusado' && 'bg-red-50 border border-red-200',
              item.outcome === 'feito' && 'bg-blue-50 border border-blue-200',
              item.outcome === 'cancelado' && 'bg-slate-50 border border-slate-200',
            )}>
              <p className="text-sm font-semibold text-slate-900 mb-2">
                Finalizado como: <span className="font-bold capitalize">{item.outcome}</span>
              </p>
              {item.outcome_em && (
                <p className="text-xs text-slate-600">
                  em {new Date(item.outcome_em).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
            {!item.outcome ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isMarkingOutcome}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  disabled={!selectedOutcome || isMarkingOutcome}
                >
                  Confirmar
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => notificarCliente(item.atendimento_id)}
                  disabled={isNotifying || item.notificou_cliente_em !== null}
                >
                  {item.notificou_cliente_em ? 'Cliente notificado' : 'Notificar cliente'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                >
                  Fechar
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Confirmation Modal */}
        {showConfirm && selectedOutcome && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Confirmar {OUTCOME_OPTIONS.find(o => o.value === selectedOutcome)?.label.toLowerCase()}?
              </h3>
              <p className="text-slate-600 mb-6">
                Esta ação não pode ser desfeita. O atendimento será marcado como {selectedOutcome}.
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  disabled={isMarkingOutcome}
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={handleMarcarOutcome}
                  disabled={isMarkingOutcome}
                >
                  Sim, confirmar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
