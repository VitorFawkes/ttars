import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Zap,
  Plus,
  Copy,
  Trash2,
  BarChart3,
  ChevronRight,
  MessageSquare,
  Clock,
  Database,
  Globe,
  MoreVertical,
} from 'lucide-react'

import { useAutomacaoRegras, type AutomacaoRegra, type TriggerType } from '@/hooks/useAutomacaoRegras'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'

const TRIGGER_LABELS: Record<TriggerType, string> = {
  stage_enter: 'Card entrou em etapa',
  stage_exit: 'Card saiu de etapa',
  card_won: 'Card ganho',
  card_lost: 'Card perdido',
  card_created: 'Card criado',
  field_changed: 'Campo alterado',
  owner_changed: 'Dono alterado',
  dias_no_stage: 'Dias na etapa',
  dias_sem_contato: 'Dias sem contato',
  sem_resposta_horas: 'Sem resposta (horas)',
  dias_antes_viagem: 'Antes da viagem',
  dias_apos_viagem: 'Após a viagem',
  aniversario_contato: 'Aniversário',
  documento_recebido: 'Documento recebido',
  documento_pendente: 'Documento pendente',
  proposta_visualizada: 'Proposta visualizada',
  proposta_aceita: 'Proposta aceita',
  proposta_expirada: 'Proposta expirada',
  voo_alterado: 'Voo alterado',
  pagamento_recebido: 'Pagamento recebido',
  milestone_atingido: 'Milestone atingido',
  webhook_externo: 'Webhook externo',
}

const TRIGGER_CATEGORIES: Record<TriggerType, 'pipeline' | 'temporal' | 'dados' | 'externo'> = {
  stage_enter: 'pipeline',
  stage_exit: 'pipeline',
  card_won: 'pipeline',
  card_lost: 'pipeline',
  card_created: 'pipeline',
  field_changed: 'dados',
  owner_changed: 'dados',
  dias_no_stage: 'temporal',
  dias_sem_contato: 'temporal',
  sem_resposta_horas: 'temporal',
  dias_antes_viagem: 'temporal',
  dias_apos_viagem: 'temporal',
  aniversario_contato: 'temporal',
  documento_recebido: 'dados',
  documento_pendente: 'dados',
  proposta_visualizada: 'dados',
  proposta_aceita: 'dados',
  proposta_expirada: 'dados',
  voo_alterado: 'dados',
  pagamento_recebido: 'dados',
  milestone_atingido: 'dados',
  webhook_externo: 'externo',
}

function getTriggerIcon(trigger: TriggerType): typeof Zap {
  const category = TRIGGER_CATEGORIES[trigger]
  switch (category) {
    case 'pipeline':
      return Zap
    case 'temporal':
      return Clock
    case 'dados':
      return Database
    case 'externo':
      return Globe
    default:
      return Zap
  }
}

function getModoColor(modo?: string): string {
  switch (modo) {
    case 'template_fixo':
      return 'bg-slate-100 text-slate-700'
    case 'template_ia':
      return 'bg-blue-100 text-blue-700'
    case 'ia_generativa':
      return 'bg-purple-100 text-purple-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function getModoLabel(modo?: string): string {
  switch (modo) {
    case 'template_fixo':
      return 'Template Fixo'
    case 'template_ia':
      return 'Template IA'
    case 'ia_generativa':
      return 'IA Generativa'
    default:
      return modo || 'N/A'
  }
}

export default function AutomacaoListPage() {
  const navigate = useNavigate()
  const { pipelineId } = useCurrentProductMeta()
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const { regras = [], isLoading, toggleAtiva, duplicate, remove } = useAutomacaoRegras(pipelineId)

  const ativasCount = regras.filter((r) => r.ativa).length
  const enviadosHoje = regras.reduce((sum: number, r: AutomacaoRegra) => sum + (r.total_enviados ?? 0), 0)
  const totalEntregues = regras.reduce((sum: number, r: AutomacaoRegra) => sum + (r.total_entregues ?? 0), 0)
  const totalEnviados = regras.reduce((sum: number, r: AutomacaoRegra) => sum + (r.total_enviados ?? 0), 0)
  const taxaEntrega = totalEnviados > 0 ? Math.round((totalEntregues / totalEnviados) * 100) : 0
  const totalRespondidos = regras.reduce((sum: number, r: AutomacaoRegra) => sum + (r.total_respondidos ?? 0), 0)
  const taxaResposta = totalEnviados > 0 ? Math.round((totalRespondidos / totalEnviados) * 100) : 0

  const handleToggleAtiva = async (id: string, currentAtiva: boolean): Promise<void> => {
    try {
      await toggleAtiva.mutateAsync({ id, ativa: !currentAtiva })
      toast.success(!currentAtiva ? 'Automação ativada' : 'Automação desativada')
    } catch (error) {
      toast.error('Erro ao atualizar automação')
    }
  }

  const handleDuplicate = async (id: string): Promise<void> => {
    try {
      const result = await duplicate.mutateAsync(id)
      toast.success('Automação duplicada com sucesso')
      navigate(`/settings/automacoes/builder/${result.id}`)
    } catch (error) {
      toast.error('Erro ao duplicar automação')
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm('Tem certeza que deseja excluir esta automação?')) return

    try {
      await remove.mutateAsync(id)
      toast.success('Automação excluída')
    } catch (error) {
      toast.error('Erro ao excluir automação')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="h-8 bg-slate-200 rounded-lg w-48 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Automações de Mensagem</h1>
            <p className="mt-1 text-slate-500">Gerencie regras de automação e campanhas de mensagem</p>
          </div>
          <Button
            onClick={() => navigate('/settings/automacoes/builder/new')}
            className="flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Nova Automação
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Automações Ativas</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{ativasCount}</p>
              </div>
              <Zap className="h-8 w-8 text-indigo-600" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Enviadas Hoje</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{enviadosHoje}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Taxa Entrega</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{taxaEntrega}%</p>
              </div>
              <BarChart3 className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Taxa Resposta</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{taxaResposta}%</p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Empty State */}
        {regras.length === 0 ? (
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-12 text-center">
            <MessageSquare className="h-16 w-16 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Nenhuma automação criada</h3>
            <p className="text-slate-500 mb-6">Comece criando sua primeira automação de mensagem</p>
            <Button
              onClick={() => navigate('/settings/automacoes/builder/new')}
              className="inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Criar Automação
            </Button>
          </div>
        ) : (
          /* Table */
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold text-slate-900">Nome</th>
                  <th className="px-6 py-4 text-left font-semibold text-slate-900">Trigger</th>
                  <th className="px-6 py-4 text-left font-semibold text-slate-900">Modo</th>
                  <th className="px-6 py-4 text-left font-semibold text-slate-900">Template</th>
                  <th className="px-6 py-4 text-left font-semibold text-slate-900">Métricas</th>
                  <th className="px-6 py-4 text-center font-semibold text-slate-900">Ativa</th>
                  <th className="px-6 py-4 text-right font-semibold text-slate-900">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {regras.map((regra: AutomacaoRegra) => {
                  const TriggerIcon = getTriggerIcon(regra.trigger_type)
                  const tipoColor =
                    regra.tipo === 'single' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                  const tipoLabel = regra.tipo === 'single' ? 'Single' : 'Jornada'

                  return (
                    <tr key={regra.id} className="hover:bg-slate-50 transition-colors">
                      {/* Nome */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{regra.nome}</p>
                            <span className={`inline-block mt-1 px-2.5 py-1 text-xs font-medium rounded ${tipoColor}`}>
                              {tipoLabel}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Trigger */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-900">
                          <TriggerIcon className="h-4 w-4 text-slate-400" />
                          {TRIGGER_LABELS[regra.trigger_type]}
                        </div>
                      </td>

                      {/* Modo */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-1 text-xs font-medium rounded ${getModoColor(regra.mensagem_templates?.modo)}`}
                        >
                          {getModoLabel(regra.mensagem_templates?.modo)}
                        </span>
                      </td>

                      {/* Template */}
                      <td className="px-6 py-4 text-slate-900">{regra.mensagem_templates?.nome || 'N/A'}</td>

                      {/* Métricas */}
                      <td className="px-6 py-4">
                        <div className="text-xs space-y-1">
                          <div className="text-slate-900">
                            <span className="font-semibold">{regra.total_enviados ?? 0}</span> enviadas
                          </div>
                          <div className="text-slate-500">
                            <span className="font-semibold">{regra.total_entregues ?? 0}</span> entregues
                          </div>
                          <div className="text-slate-500">
                            <span className="font-semibold">{regra.total_respondidos ?? 0}</span> respostas
                          </div>
                        </div>
                      </td>

                      {/* Ativa */}
                      <td className="px-6 py-4 text-center">
                        <Switch
                          checked={regra.ativa}
                          onCheckedChange={() => handleToggleAtiva(regra.id, regra.ativa)}
                          disabled={toggleAtiva.isPending}
                        />
                      </td>

                      {/* Ações */}
                      <td className="px-6 py-4 text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === regra.id ? null : regra.id)}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label="Menu de ações"
                          >
                            <MoreVertical className="h-4 w-4 text-slate-400" />
                          </button>

                          {openMenuId === regra.id && (
                            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                              <button
                                onClick={() => {
                                  navigate(`/settings/automacoes/builder/${regra.id}`)
                                  setOpenMenuId(null)
                                }}
                                className="w-full text-left px-4 py-2 text-slate-900 hover:bg-slate-50 transition-colors flex items-center gap-2"
                              >
                                <ChevronRight className="h-4 w-4" />
                                Editar
                              </button>
                              <button
                                onClick={() => {
                                  handleDuplicate(regra.id)
                                  setOpenMenuId(null)
                                }}
                                className="w-full text-left px-4 py-2 text-slate-900 hover:bg-slate-50 transition-colors flex items-center gap-2"
                              >
                                <Copy className="h-4 w-4" />
                                Duplicar
                              </button>
                              <button
                                onClick={() => {
                                  navigate(`/settings/automacoes/${regra.id}/logs`)
                                  setOpenMenuId(null)
                                }}
                                className="w-full text-left px-4 py-2 text-slate-900 hover:bg-slate-50 transition-colors flex items-center gap-2"
                              >
                                <BarChart3 className="h-4 w-4" />
                                Logs
                              </button>
                              <hr className="my-1" />
                              <button
                                onClick={() => {
                                  handleDelete(regra.id)
                                  setOpenMenuId(null)
                                }}
                                className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                              >
                                <Trash2 className="h-4 w-4" />
                                Excluir
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
