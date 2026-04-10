import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Send, Plus, Copy, Trash2, BarChart3, Zap, Clock, Database, Globe } from 'lucide-react'

import { useAutomacaoRegras, type AutomacaoRegra, type TriggerType } from '@/hooks/useAutomacaoRegras'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import AprovacaoPanel from '@/components/automacao/AprovacaoPanel'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

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

function getTriggerIcon(trigger: TriggerType): React.ComponentType<{ className?: string }> {
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

function getTriggerBadgeColor(category: 'pipeline' | 'temporal' | 'dados' | 'externo'): string {
  switch (category) {
    case 'pipeline':
      return 'bg-indigo-100 text-indigo-700'
    case 'temporal':
      return 'bg-amber-100 text-amber-700'
    case 'dados':
      return 'bg-blue-100 text-blue-700'
    case 'externo':
      return 'bg-purple-100 text-purple-700'
    default:
      return 'bg-slate-100 text-slate-700'
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
  const { slug: currentProduct } = useCurrentProductMeta()

  const { regras = [], isLoading, toggleAtiva, duplicate, remove } = useAutomacaoRegras(currentProduct)

  const ativasCount = regras.filter((r) => r.ativa).length
  const totalEnviados = regras.reduce((sum: number, r: AutomacaoRegra) => sum + (r.total_enviados ?? 0), 0)
  const totalEntregues = regras.reduce((sum: number, r: AutomacaoRegra) => sum + (r.total_entregues ?? 0), 0)
  const taxaEntrega = totalEnviados > 0 ? Math.round((totalEntregues / totalEnviados) * 100) : 0

  const stats = useMemo(
    () => [
      { label: 'Ativas', value: ativasCount, color: 'green' as const },
      { label: 'Enviadas', value: totalEnviados, color: 'blue' as const },
      {
        label: 'Taxa entrega',
        value: `${taxaEntrega}%`,
        color: totalEnviados > 0 ? 'green' : 'gray',
      } as const,
    ],
    [ativasCount, totalEnviados, taxaEntrega]
  )

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
      <div className="p-6 space-y-6">
        <div className="h-12 bg-slate-200 rounded-lg w-64 animate-pulse" />
      </div>
    )
  }

  return (
    <>
      <AdminPageHeader
        title="Automações de Mensagem"
        subtitle="Configure mensagens automáticas de WhatsApp para vendas e pós-venda"
        icon={<Send className="w-5 h-5" />}
        stats={stats}
        actions={
          <Button onClick={() => navigate('/settings/automacoes/builder/new')} className="gap-2">
            <Plus className="w-4 h-4" />
            Nova Automação
          </Button>
        }
      />

      <AprovacaoPanel />

      {regras.length === 0 ? (
        <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <Send className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Nenhuma automação criada</p>
          <p className="text-sm text-slate-500 mt-1">Comece criando sua primeira automação de mensagem</p>
          <Button
            onClick={() => navigate('/settings/automacoes/builder/new')}
            className="mt-6 gap-2"
          >
            <Plus className="w-4 h-4" />
            Criar Automação
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left">Automação</TableHead>
                <TableHead className="text-left">Trigger</TableHead>
                <TableHead className="text-left">Template</TableHead>
                <TableHead className="text-left">Métricas</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regras.map((regra: AutomacaoRegra) => {
                const TriggerIcon = getTriggerIcon(regra.trigger_type)
                const triggerCategory = TRIGGER_CATEGORIES[regra.trigger_type]
                const tipoLabel = regra.tipo === 'single' ? 'Single' : 'Jornada'

                return (
                  <TableRow key={regra.id}>
                    {/* Automação */}
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-900">{regra.nome}</p>
                        {regra.descricao && (
                          <p className="text-xs text-slate-500 line-clamp-1">{regra.descricao}</p>
                        )}
                        <div>
                          <Badge variant="outline" className="text-xs">
                            {tipoLabel}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>

                    {/* Trigger */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TriggerIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <div className="space-y-1">
                          <p className="text-sm text-slate-900">{TRIGGER_LABELS[regra.trigger_type]}</p>
                          <Badge
                            variant="outline"
                            className={cn('text-xs', getTriggerBadgeColor(triggerCategory))}
                          >
                            {triggerCategory}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>

                    {/* Template */}
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm text-slate-900">
                          {regra.mensagem_templates?.nome || '—'}
                        </p>
                        {regra.mensagem_templates?.modo && (
                          <span
                            className={cn(
                              'inline-block px-2 py-0.5 text-xs font-medium rounded',
                              getModoColor(regra.mensagem_templates.modo)
                            )}
                          >
                            {getModoLabel(regra.mensagem_templates.modo)}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Métricas */}
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        <p className="text-slate-900">
                          <span className="font-semibold">{regra.total_enviados ?? 0}</span> enviadas
                        </p>
                        <p className="text-slate-500">
                          <span className="font-semibold">{regra.total_entregues ?? 0}</span> entregues
                        </p>
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center">
                      <Switch
                        checked={regra.ativa}
                        onCheckedChange={() => handleToggleAtiva(regra.id, regra.ativa)}
                        disabled={toggleAtiva.isPending}
                      />
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <BarChart3 className="w-4 h-4 text-slate-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              navigate(`/settings/automacoes/builder/${regra.id}`)
                            }
                          >
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDuplicate(regra.id)}
                          >
                            <Copy className="w-3 h-3 mr-2" />
                            Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              navigate(`/settings/automacoes/${regra.id}/logs`)
                            }
                          >
                            <BarChart3 className="w-3 h-3 mr-2" />
                            Ver Logs
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(regra.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-3 h-3 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
