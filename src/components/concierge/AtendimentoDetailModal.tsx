import { useEffect, useRef, useState } from 'react'
import { X, AlertCircle, ExternalLink, Calendar, Wallet, Flame, User, ChevronDown, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMarcarOutcome, useReatribuirAtendimento } from '../../hooks/concierge/useAtendimentoMutations'
import { useMoverEstadoFunil } from '../../hooks/concierge/useMoverEstadoFunil'
import { useToggleEmFuturoConcierge } from '../../hooks/concierge/useToggleEmFuturoConcierge'
import { useEditarPrazoTarefa } from '../../hooks/concierge/useEditarPrazoTarefa'
import { useChecklistTarefa } from '../../hooks/concierge/useChecklistTarefa'
import { EstocarFuturoModal } from './kanban/EstocarFuturoModal'
import { ChecklistEditor } from './atendimento-form/ChecklistEditor'
import type { ChecklistItem } from '../../hooks/concierge/types'
import { useToggleTarefaCritica } from '../../hooks/concierge/useToggleCritical'
import { useConciergeProfilesLookup } from '../../hooks/concierge/useConciergeProfilesLookup'
import { useConciergeUsers } from '../../hooks/concierge/useConciergeUsers'
import { TIPO_LABEL, SOURCE_LABEL, CATEGORIAS_CONCIERGE, type MeuDiaItem, type CobradoDe } from '../../hooks/concierge/types'
import { ESTADO_FUNIL_COLUMNS, computeEstadoFunil, type EstadoFunil, type KanbanTarefaItem } from '../../hooks/concierge/useKanbanTarefas'
import { SourceIcon } from './Badges'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { CardContextBlocks } from './CardContextBlocks'
import { cn } from '../../lib/utils'

interface AtendimentoDetailModalProps {
  item?: MeuDiaItem
  atendimento?: MeuDiaItem
  isOpen?: boolean
  open?: boolean
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
}

function fmtBRL(v: number | null | undefined) {
  if (v == null) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function dateInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}T09:00:00`)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

export function AtendimentoDetailModal(props: AtendimentoDetailModalProps) {
  const item = (props.item ?? props.atendimento) as MeuDiaItem | undefined
  const isOpen = props.open ?? props.isOpen ?? false
  const onClose = () => { props.onClose?.(); props.onOpenChange?.(false) }
  // Estado atual do atendimento no funil concierge (computado a partir de
  // started_at / notificou_cliente_em / outcome).
  const estadoAtual: EstadoFunil | null = item ? computeEstadoFunil(item) : null
  const [destinoSelecionado, setDestinoSelecionado] = useState<EstadoFunil | null>(null)
  const [estocarModalOpen, setEstocarModalOpen] = useState(false)
  const [editarAvisoOpen, setEditarAvisoOpen] = useState(false)
  const outcomeEncerramento = 'cancelado' as const
  // Quando o atendimento é uma oferta E o usuário escolhe "Feito", pode marcar
  // adicionalmente como "Aceito" (cliente fechou). Outcome no banco vira 'aceito'.
  const [comoAceito, setComoAceito] = useState(false)
  const [valorFinal, setValorFinal] = useState(item?.valor?.toString() ?? '')
  const [cobradoDe, setCobradoDe] = useState<CobradoDe | ''>(item?.cobrado_de ?? '')
  const [observacao, setObservacao] = useState('')

  // Prazo da tarefa (data_vencimento). Editável a qualquer momento —
  // quem cria a tarefa nem sempre acerta o prazo.
  const [prazoDate, setPrazoDate] = useState<string>(() =>
    item?.data_vencimento ? isoToDateInput(item.data_vencimento) : ''
  )
  useEffect(() => {
    if (!item) return
    setPrazoDate(item.data_vencimento ? isoToDateInput(item.data_vencimento) : '')
  }, [item?.atendimento_id, item?.data_vencimento]) // eslint-disable-line react-hooks/exhaustive-deps

  const { mutate: marcarOutcome, isPending: isMarkingOutcome } = useMarcarOutcome()
  const { mutateAsync: moverEstadoAsync, isPending: isMovingEstado } = useMoverEstadoFunil()
  const { mutateAsync: toggleEmFuturoAsync, isPending: isTogglingFuturo } = useToggleEmFuturoConcierge()
  const { mutate: editarPrazo, isPending: isEditingPrazo } = useEditarPrazoTarefa()
  const { mutate: salvarChecklist } = useChecklistTarefa()
  const { mutate: toggleCritica, isPending: togglingCritica } = useToggleTarefaCritica()
  const { mutate: reatribuir, isPending: isReatribuindo } = useReatribuirAtendimento()
  const profilesLookup = useConciergeProfilesLookup()
  const conciergeUsers = useConciergeUsers()
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  if (!item) return null
  if (!isOpen) return null

  const isVencido = item.status_apresentacao === 'vencido'
  const isCritical = item.prioridade === 'critica'
  const isCriticalEffective = isCritical || !!item.card_is_critical
  const tipoMeta = TIPO_LABEL[item.tipo_concierge]
  const sourceLabel = SOURCE_LABEL[item.source].label
  const cat = CATEGORIAS_CONCIERGE[item.categoria as keyof typeof CATEGORIAS_CONCIERGE]
  const catLabel = cat?.label ?? item.categoria
  const titulo = item.titulo?.trim() || catLabel
  const donoNome = item.dono_id ? profilesLookup?.get(item.dono_id) : null

  const isOferta = item.tipo_concierge === 'oferta'
  const podeConfirmar = !!destinoSelecionado
    && destinoSelecionado !== estadoAtual
    && destinoSelecionado !== 'aguardando_atendimento'
    && destinoSelecionado !== 'agendado_futuro'
  const isPendingMove = isMarkingOutcome || isMovingEstado || isTogglingFuturo

  const handleSalvarPrazoTarefa = () => {
    const iso = dateInputToIso(prazoDate)
    if (!iso) return
    editarPrazo({ tarefaId: item.tarefa_id, data: iso })
  }

  const handleEstocarFuturo = async (avisoDias: number) => {
    try {
      await toggleEmFuturoAsync({ tarefaId: item.tarefa_id, emFuturo: true, avisoDias })
      setEstocarModalOpen(false)
      onClose()
    } catch { /* toast via hook */ }
  }

  const handleAjustarAviso = async (avisoDias: number) => {
    try {
      await toggleEmFuturoAsync({ tarefaId: item.tarefa_id, emFuturo: true, avisoDias })
      setEditarAvisoOpen(false)
    } catch { /* toast via hook */ }
  }

  const handleChecklistChange = (proximos: ChecklistItem[]) => {
    salvarChecklist({ tarefaId: item.tarefa_id, itens: proximos })
  }

  const checklistItens: ChecklistItem[] = Array.isArray(item.checklist) ? item.checklist : []
  const checklistTodosFeitos = checklistItens.length > 0 && checklistItens.every(i => i.feito)

  const handleMarcarComoFeito = async () => {
    try {
      const kanbanItem: KanbanTarefaItem = {
        ...item,
        concierge_em_futuro: false,
        estado_funil: estadoAtual ?? 'aguardando_atendimento',
        janela_embarque: 'embarca_futuro',
      }
      if (estadoAtual === 'agendado_futuro' && item.concierge_em_futuro) {
        await toggleEmFuturoAsync({ tarefaId: item.tarefa_id, emFuturo: false })
      }
      await moverEstadoAsync({ atendimento: kanbanItem, destino: 'feito' })
      onClose()
    } catch { /* toast via hook */ }
  }

  const handleTirarDoFuturo = async () => {
    try {
      await toggleEmFuturoAsync({ tarefaId: item.tarefa_id, emFuturo: false })
      onClose()
    } catch { /* toast via hook */ }
  }

  const handleConfirmar = async () => {
    if (!destinoSelecionado || !podeConfirmar) return

    // "Feito" pra oferta marcado como aceito → outcome='aceito' direto.
    if (destinoSelecionado === 'feito' && isOferta && comoAceito) {
      marcarOutcome({
        atendimento_id: item.atendimento_id,
        outcome: 'aceito',
        valor_final: valorFinal ? parseFloat(valorFinal) : null,
        cobrado_de: cobradoDe ? (cobradoDe as CobradoDe) : null,
        observacao: observacao || undefined,
      }, { onSuccess: () => onClose() })
      return
    }

    // Demais casos delegam ao useMoverEstadoFunil (em_contato → started_at,
    // aguardando_retorno → rpc_notificar_cliente, feito/encerrado → rpc_marcar_outcome).
    // Se o atendimento estava em Futuro, antes precisamos limpar o flag sticky
    // pra que computeEstadoFunil não force ele a continuar lá.
    try {
      if (estadoAtual === 'agendado_futuro' && item.concierge_em_futuro) {
        await toggleEmFuturoAsync({ tarefaId: item.tarefa_id, emFuturo: false })
      }
      const kanbanItem: KanbanTarefaItem = {
        ...item,
        concierge_em_futuro: false,
        estado_funil: estadoAtual ?? 'aguardando_atendimento',
        janela_embarque: 'embarca_futuro',
        // Pra "feito" em oferta, pré-popular valor/cobrado_de no item passado
        // ao hook (ele lê esses campos e repassa pro RPC).
        valor: valorFinal ? parseFloat(valorFinal) : item.valor,
        cobrado_de: cobradoDe ? (cobradoDe as CobradoDe) : item.cobrado_de,
      }
      await moverEstadoAsync({
        atendimento: kanbanItem,
        destino: destinoSelecionado,
        outcomeEncerramento: destinoSelecionado === 'encerrado' ? outcomeEncerramento : undefined,
        observacao: observacao || undefined,
      })
      onClose()
    } catch {
      // Toast de erro já é exibido pelo onError do hook.
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-start gap-3">
          <span className={cn('shrink-0 w-1 h-10 rounded-full', tipoMeta.dotColor)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide font-semibold mb-0.5">
              <span className={tipoMeta.color}>{tipoMeta.label}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">{catLabel}</span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 text-slate-400">
                <SourceIcon source={item.source} className="w-3 h-3" />
                {sourceLabel}
              </span>
              {isCriticalEffective && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-0.5 text-red-600">
                    <Flame className="w-3 h-3" strokeWidth={2.5} />
                    {isCritical ? 'Crítica' : 'Viagem crítica'}
                  </span>
                </>
              )}
            </div>
            <h2 className="text-base font-bold text-slate-900 leading-snug truncate">{titulo}</h2>
            <div className="mt-1 relative inline-block" ref={pickerRef}>
              <button
                type="button"
                onClick={() => setPickerOpen(o => !o)}
                disabled={isReatribuindo}
                className="inline-flex items-center gap-1 text-[11.5px] text-slate-600 hover:bg-slate-100 rounded px-1.5 py-0.5 -ml-1.5 transition-colors disabled:opacity-50"
                title="Trocar responsável"
              >
                <User className="w-3 h-3 text-slate-400" />
                <span>
                  Atribuído a{' '}
                  <span className="font-medium text-slate-700">
                    {donoNome || (item.dono_id ? '…' : 'ninguém')}
                  </span>
                </span>
                <ChevronDown className={cn('w-3 h-3 text-slate-400 transition-transform', pickerOpen && 'rotate-180')} />
              </button>
              {pickerOpen && (
                <div className="absolute z-20 mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[220px] py-1 max-h-[260px] overflow-y-auto">
                  {conciergeUsers.length === 0 && (
                    <div className="px-3 py-2 text-xs text-slate-500">Sem concierges cadastrados.</div>
                  )}
                  {conciergeUsers.map(u => {
                    const selected = u.id === item.dono_id
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          if (selected) { setPickerOpen(false); return }
                          reatribuir(
                            { tarefa_id: item.tarefa_id, responsavel_id: u.id },
                            { onSuccess: () => setPickerOpen(false) }
                          )
                        }}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-slate-50',
                          selected && 'bg-indigo-50 text-indigo-700 font-medium'
                        )}
                      >
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="flex-1 truncate">{u.nome}</span>
                        {selected && <Check className="w-3 h-3 text-indigo-600 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => toggleCritica({ tarefa_id: item.tarefa_id, isCritical: !isCritical })}
            disabled={togglingCritica}
            className={cn(
              'shrink-0 p-1.5 rounded-lg transition-colors',
              isCritical
                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                : isCriticalEffective
                ? 'bg-red-50 text-red-400 hover:bg-red-100'
                : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
            )}
            aria-label={isCritical ? 'Remover marcação crítica' : 'Marcar como crítica'}
            title={
              isCritical
                ? 'Tarefa crítica — clique pra remover'
                : isCriticalEffective
                ? 'Crítica porque a viagem está marcada como crítica — clique para marcar a tarefa também'
                : 'Marcar como crítica'
            }
          >
            <Flame className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {isVencido && item.data_vencimento && (
            <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold text-red-900">Atendimento vencido</span>
                <span className="text-red-700 ml-1">há {formatDistanceToNow(new Date(item.data_vencimento), { locale: ptBR })}</span>
              </div>
            </div>
          )}

          {!item.outcome && (
            <PrazoTarefaEditor
              dataVencimento={item.data_vencimento}
              prazoDate={prazoDate}
              onChangePrazoDate={setPrazoDate}
              onSalvar={handleSalvarPrazoTarefa}
              isPending={isEditingPrazo}
              canSalvar={!!dateInputToIso(prazoDate) && (isoToDateInput(item.data_vencimento) !== prazoDate)}
            />
          )}

          {item.concierge_em_futuro && !item.outcome && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-[12px] text-violet-800">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-violet-600" />
                Estocado em "Futuro" — avisa {item.concierge_aviso_dias ?? 7}d antes
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditarAvisoOpen(true)}
                  disabled={isTogglingFuturo}
                  className="text-[11.5px] font-medium text-violet-700 hover:text-violet-900 disabled:opacity-50"
                >
                  ajustar aviso
                </button>
                <button
                  type="button"
                  onClick={handleTirarDoFuturo}
                  disabled={isTogglingFuturo}
                  className="text-[11.5px] font-medium text-violet-700 hover:text-violet-900 disabled:opacity-50"
                >
                  {isTogglingFuturo ? 'tirando…' : 'tirar do Futuro'}
                </button>
              </span>
            </div>
          )}

          <ViagemBlock item={item} onClose={onClose} />

          <CardContextBlocks
            cardId={item.card_id}
            rootCardId={item.root_card_id ?? item.card_id}
            excludeAtendimentoId={item.atendimento_id}
            showOutrasPendencias={true}
          />

          {(() => {
            const observacaoConcierge = (item.payload as Record<string, unknown> | null | undefined)?.observacao_outcome
            const observacaoConciergeStr = typeof observacaoConcierge === 'string' && observacaoConcierge.trim().length > 0
              ? observacaoConcierge
              : null
            const hasAny = !!item.descricao || !!observacaoConciergeStr
            if (!hasAny) return null
            return (
              <div className="space-y-2">
                {item.descricao && (
                  <DescricaoColapsavel
                    descricao={item.descricao}
                    criadorNome={item.tarefa_criada_por ? (profilesLookup?.get(item.tarefa_criada_por) ?? null) : null}
                  />
                )}
                {observacaoConciergeStr && (
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10.5px] uppercase tracking-wide font-semibold text-emerald-700">
                        Comentário do Concierge
                      </div>
                      {item.outcome_em && (
                        <div className="text-[10.5px] text-emerald-700/60">
                          {new Date(item.outcome_em).toLocaleString('pt-BR')}
                        </div>
                      )}
                    </div>
                    <p className="text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">{observacaoConciergeStr}</p>
                  </div>
                )}
              </div>
            )
          })()}

          <ChecklistEditor
            itens={checklistItens}
            readOnly={!!item.outcome}
            onChange={handleChecklistChange}
          />

          {checklistTodosFeitos && !item.outcome && (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="text-[12.5px] text-emerald-800">
                <span className="font-semibold">Tudo do checklist tá feito.</span>{' '}
                <span className="text-emerald-700">Marcar a tarefa como concluída?</span>
              </div>
              <Button
                size="sm"
                onClick={handleMarcarComoFeito}
                disabled={isMovingEstado || isTogglingFuturo}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isMovingEstado || isTogglingFuturo ? 'Salvando…' : 'Marcar como feito'}
              </Button>
            </div>
          )}

          {!item.outcome ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">Mover para coluna</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {ESTADO_FUNIL_COLUMNS.map(col => {
                    const isAtual = col.id === estadoAtual
                    const isSelecionado = destinoSelecionado === col.id
                    // 'aguardando_atendimento' não pode ser destino: é estado inicial,
                    // useMoverEstadoFunil rejeita. Mantém visível pra orientação,
                    // mas só clicável se for o estado atual (sem efeito).
                    const desabilitado = col.id === 'aguardando_atendimento' && !isAtual
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => {
                          if (desabilitado || isAtual) return
                          // Estocar em "Agendados para o futuro": abre o
                          // modal pra escolher em quantos dias antes do
                          // prazo o card vai piscar.
                          if (col.id === 'agendado_futuro') {
                            setDestinoSelecionado(null)
                            setEstocarModalOpen(true)
                            return
                          }
                          setDestinoSelecionado(col.id)
                        }}
                        disabled={desabilitado || isAtual}
                        title={
                          isAtual ? 'Coluna atual' :
                          desabilitado ? 'Estado inicial — não dá pra voltar' :
                          col.id === 'agendado_futuro' ? 'Estocar na coluna Futuro (sticky)' :
                          `Mover para ${col.label}`
                        }
                        className={cn(
                          'p-2 rounded-lg border-2 transition-all text-[11px] font-semibold leading-tight text-center',
                          isAtual
                            ? cn(col.tone.bg, col.tone.text, col.tone.border, 'cursor-default ring-2 ring-offset-1 ring-indigo-300')
                            : isSelecionado
                              ? cn(col.tone.bg, col.tone.text, col.tone.border)
                              : desabilitado
                                ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        )}
                      >
                        <div>{col.label}</div>
                        {isAtual && <div className="text-[9px] opacity-60 mt-0.5 normal-case font-normal">atual</div>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Sub-area condicional ao destino selecionado */}
              {destinoSelecionado === 'feito' && isOferta && (
                <div className="bg-purple-50/40 border border-purple-100 rounded-lg p-3 space-y-3">
                  <label className="flex items-start gap-2 text-[12.5px] font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={comoAceito}
                      onChange={(e) => setComoAceito(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span>
                      Cliente fechou a oferta (marcar como <span className="font-semibold text-purple-700">Aceito</span>)
                    </span>
                  </label>
                  {comoAceito && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11.5px] font-semibold text-slate-700 mb-1">Valor final</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                          <Input
                            type="number"
                            placeholder="0"
                            value={valorFinal}
                            onChange={(e) => setValorFinal(e.target.value)}
                            className="pl-8"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11.5px] font-semibold text-slate-700 mb-1">Cobrado de</label>
                        <select
                          value={cobradoDe}
                          onChange={(e) => setCobradoDe(e.target.value as CobradoDe)}
                          className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        >
                          <option value="">Selecionar…</option>
                          <option value="cliente">Cliente</option>
                          <option value="cortesia">Cortesia</option>
                          <option value="incluido_pacote">Incluído no pacote</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {destinoSelecionado === 'encerrado' && (
                <div className="bg-red-50/40 border border-red-100 rounded-lg p-3">
                  <p className="text-[12px] text-slate-700">
                    Vai marcar como <span className="font-semibold">cancelado</span>. Use a observação abaixo se quiser explicar o porquê.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[11.5px] font-semibold text-slate-700 mb-1">
                  Observação <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <textarea
                  placeholder="Anotações sobre este atendimento…"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 resize-none"
                  rows={2}
                />
                {destinoSelecionado && destinoSelecionado !== 'feito' && destinoSelecionado !== 'encerrado' && (
                  <p className="text-[10.5px] text-slate-400 mt-1">
                    A observação só fica registrada quando finaliza (Feito ou Encerrado).
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className={cn(
              'p-3 rounded-lg border text-sm flex items-center justify-between gap-3',
              item.outcome === 'aceito'    && 'bg-purple-50 border-purple-200 text-purple-700',
              item.outcome === 'feito'     && 'bg-emerald-50 border-emerald-200 text-emerald-700',
              item.outcome === 'recusado'  && 'bg-red-50 border-red-200 text-red-700',
              item.outcome === 'cancelado' && 'bg-slate-50 border-slate-200 text-slate-700',
            )}>
              <div>
                <span className="text-[11px] uppercase tracking-wide font-semibold opacity-70">Finalizado</span>
                <div className="font-semibold capitalize">{item.outcome}</div>
              </div>
              {item.outcome_em && (
                <div className="text-[11px] opacity-70">
                  {new Date(item.outcome_em).toLocaleString('pt-BR')}
                </div>
              )}
            </div>
          )}

          <div className="text-[10.5px] text-slate-400 flex items-center gap-2 pt-2 border-t border-slate-100">
            <span>Criado {formatDistanceToNow(new Date(item.atendimento_criado_em), { locale: ptBR, addSuffix: true })}</span>
            {item.notificou_cliente_em && (
              <>
                <span className="text-slate-300">·</span>
                <span>Aguardando retorno {formatDistanceToNow(new Date(item.notificou_cliente_em), { locale: ptBR, addSuffix: true })}</span>
              </>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-3 flex items-center justify-end gap-2">
          {!item.outcome ? (
            <>
              <Button variant="ghost" onClick={onClose} disabled={isPendingMove}>Fechar</Button>
              <Button onClick={handleConfirmar} disabled={!podeConfirmar || isPendingMove}>
                {isPendingMove ? 'Salvando…' : 'Confirmar'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          )}
        </div>
      </div>

      <EstocarFuturoModal
        open={estocarModalOpen}
        modo="estocar"
        avisoDiasAtual={item.concierge_aviso_dias ?? 7}
        onClose={() => setEstocarModalOpen(false)}
        isSubmitting={isTogglingFuturo}
        onConfirm={handleEstocarFuturo}
      />

      <EstocarFuturoModal
        open={editarAvisoOpen}
        modo="editar"
        avisoDiasAtual={item.concierge_aviso_dias ?? 7}
        onClose={() => setEditarAvisoOpen(false)}
        isSubmitting={isTogglingFuturo}
        onConfirm={handleAjustarAviso}
      />
    </div>
  )
}

function DescricaoColapsavel({ descricao, criadorNome }: { descricao: string; criadorNome: string | null }) {
  const [expandida, setExpandida] = useState(false)
  const [transbordou, setTransbordou] = useState(false)
  const pRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = pRef.current
    if (!el) return
    // Mede com o clamp aplicado (no estado colapsado). Se o conteúdo
    // real ultrapassa a altura visível, mostra o botão "Ver tudo".
    setTransbordou(el.scrollHeight > el.clientHeight + 1)
  }, [descricao])

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-500">
          Descrição da tarefa
        </div>
        {criadorNome && (
          <div className="text-[10.5px] text-slate-500" title={`Criado por ${criadorNome}`}>
            por <span className="font-medium text-slate-700">{criadorNome}</span>
          </div>
        )}
      </div>
      <p
        ref={pRef}
        className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap"
        style={
          !expandida
            ? {
                display: '-webkit-box',
                WebkitLineClamp: 10,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
            : undefined
        }
      >
        {descricao}
      </p>
      {transbordou && (
        <button
          type="button"
          onClick={() => setExpandida(v => !v)}
          className="mt-1.5 text-[11.5px] font-medium text-indigo-600 hover:text-indigo-700"
        >
          {expandida ? 'Ver menos' : 'Ver tudo'}
        </button>
      )}
    </div>
  )
}

interface PrazoTarefaEditorProps {
  dataVencimento: string | null
  prazoDate: string
  onChangePrazoDate: (value: string) => void
  onSalvar: () => void
  isPending: boolean
  canSalvar: boolean
}

function PrazoTarefaEditor({ dataVencimento, prazoDate, onChangePrazoDate, onSalvar, isPending, canSalvar }: PrazoTarefaEditorProps) {
  let toneText = 'text-slate-600'
  let label = 'sem prazo'

  if (dataVencimento) {
    const target = new Date(dataVencimento).getTime()
    const now = Date.now()
    const diffD = Math.round((target - now) / (1000 * 60 * 60 * 24))
    if (diffD < 0) {
      toneText = 'text-red-600'
      label = `venceu há ${-diffD}d`
    } else if (diffD === 0) {
      toneText = 'text-amber-700'
      label = 'hoje'
    } else if (diffD <= 7) {
      toneText = 'text-amber-700'
      label = `em ${diffD}d`
    } else {
      toneText = 'text-slate-600'
      label = `em ${diffD}d`
    }
  }

  return (
    <div className="flex items-center gap-2 text-[12px]">
      <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
      <span className="text-slate-500">Prazo</span>
      <input
        type="date"
        value={prazoDate}
        onChange={(e) => onChangePrazoDate(e.target.value)}
        disabled={isPending}
        className="h-6 px-1.5 text-[12px] bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 disabled:opacity-50"
      />
      <span className={cn('font-medium', toneText)}>({label})</span>
      {canSalvar && (
        <button
          type="button"
          onClick={onSalvar}
          disabled={isPending}
          className="ml-auto text-[11px] font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
        >
          {isPending ? 'salvando…' : 'salvar'}
        </button>
      )}
    </div>
  )
}

function ViagemBlock({ item, onClose }: { item: MeuDiaItem; onClose: () => void }) {
  // Painel de cabeçalho sempre referencia o card RAIZ da viagem. Quando o
  // atendimento foi criado num sub-card (ex: "Alteração de hotel"), queremos
  // mostrar/abrir a viagem inteira, não o sub-card.
  const cardId         = item.root_card_id            ?? item.card_id
  const cardTitulo     = item.root_card_titulo        ?? item.card_titulo
  const produto        = item.root_produto            ?? item.produto
  const dataInicio     = item.root_data_viagem_inicio ?? item.data_viagem_inicio
  const dataFim        = item.root_data_viagem_fim    ?? item.data_viagem_fim
  const valorFinal     = item.root_valor_final        ?? item.card_valor_final
  const valorEstimado  = item.root_valor_estimado     ?? item.card_valor_estimado
  const valor          = valorFinal ?? valorEstimado

  // dias_pra_embarque é derivado de data_viagem_inicio na view — quando
  // recalcular vale a pena fazer client-side a partir da data raiz.
  const diasPraEmbarque = dataInicio
    ? Math.floor((new Date(dataInicio).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="bg-indigo-50/40 border border-indigo-100 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-indigo-100 flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 flex items-center gap-1.5">
          Viagem
        </div>
        <Link
          to={`/cards/${cardId}`}
          onClick={onClose}
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-indigo-600 hover:text-indigo-700"
        >
          Abrir card completo <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <div className="p-3 space-y-2">
        <div className="font-semibold text-slate-900 leading-snug">{cardTitulo}</div>
        <div className="flex items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-700 flex-wrap">
          <span className="font-mono uppercase tracking-wide text-[11px] text-slate-500">{produto?.toUpperCase()}</span>
          {dataInicio && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono">
                {new Date(dataInicio).toLocaleDateString('pt-BR')}
                {dataFim && ` – ${new Date(dataFim).toLocaleDateString('pt-BR')}`}
              </span>
            </span>
          )}
          {diasPraEmbarque !== null && (
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded font-mono text-[11.5px] font-semibold',
              diasPraEmbarque < 0 ? 'bg-slate-100 text-slate-600' :
              diasPraEmbarque <= 2 ? 'bg-red-50 text-red-700' :
              diasPraEmbarque <= 7 ? 'bg-amber-50 text-amber-700' :
              'bg-slate-50 text-slate-600'
            )}>
              {diasPraEmbarque < 0
                ? `Já voltou há ${-diasPraEmbarque}d`
                : diasPraEmbarque === 0
                ? 'Embarca hoje'
                : `Embarca em ${diasPraEmbarque}d`}
            </span>
          )}
          {valor != null && valor > 0 && (
            <span className="inline-flex items-center gap-1 text-slate-700">
              <Wallet className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono font-semibold">{fmtBRL(valor)}</span>
              {valorFinal == null && <span className="text-[10.5px] text-slate-400 italic">(estimado)</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
