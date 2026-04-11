import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Bot, Plus, Copy, Trash2, BarChart3, Brain, HeadphonesIcon,
  Sparkles, ArrowRightLeft, ShieldCheck,
} from 'lucide-react'

import { useAiAgents, type AiAgent, type AgentTipo } from '@/hooks/useAiAgents'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/Table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const TIPO_CONFIG: Record<AgentTipo, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}> = {
  sales: { label: 'Vendas', icon: Sparkles, color: 'bg-green-100 text-green-700' },
  support: { label: 'Suporte', icon: HeadphonesIcon, color: 'bg-blue-100 text-blue-700' },
  success: { label: 'Sucesso', icon: ShieldCheck, color: 'bg-purple-100 text-purple-700' },
  specialist: { label: 'Especialista', icon: Brain, color: 'bg-amber-100 text-amber-700' },
  router: { label: 'Roteador', icon: ArrowRightLeft, color: 'bg-slate-100 text-slate-700' },
}

export default function AiAgentListPage() {
  const navigate = useNavigate()
  const { slug: currentProduct } = useCurrentProductMeta()

  const { agents = [], isLoading, toggleAtiva, duplicate, remove } = useAiAgents(currentProduct)

  const ativosCount = agents.filter((a) => a.ativa).length
  const totalSkills = agents.reduce((sum: number, a: AiAgent) =>
    sum + (a.ai_agent_skills?.filter(s => s.enabled)?.length ?? 0), 0)

  const stats = useMemo(
    () => [
      { label: 'Agentes ativos', value: ativosCount, color: 'green' as const },
      { label: 'Total', value: agents.length, color: 'blue' as const },
      { label: 'Skills atribuídas', value: totalSkills, color: 'purple' as const },
    ],
    [ativosCount, agents.length, totalSkills]
  )

  const handleToggleAtiva = async (id: string, currentAtiva: boolean) => {
    try {
      await toggleAtiva.mutateAsync({ id, ativa: !currentAtiva })
      toast.success(!currentAtiva ? 'Agente ativado' : 'Agente desativado')
    } catch {
      toast.error('Erro ao atualizar agente')
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      const result = await duplicate.mutateAsync(id)
      toast.success('Agente duplicado')
      navigate(`/settings/ai-agents/${result.id}`)
    } catch {
      toast.error('Erro ao duplicar agente')
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este agente?')) return
    try {
      await remove.mutateAsync(id)
      toast.success('Agente excluído')
    } catch {
      toast.error('Erro ao excluir agente')
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
        title="Agentes IA"
        subtitle="Configure agentes inteligentes de WhatsApp para vendas e pós-venda"
        icon={<Bot className="w-5 h-5" />}
        stats={stats}
        actions={
          <Button onClick={() => navigate('/settings/ai-agents/new')} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Agente
          </Button>
        }
      />

      {agents.length === 0 ? (
        <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <Bot className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Nenhum agente IA criado</p>
          <p className="text-sm text-slate-500 mt-1">
            Crie seu primeiro agente para automatizar conversas no WhatsApp
          </p>
          <Button onClick={() => navigate('/settings/ai-agents/new')} className="mt-6 gap-2">
            <Plus className="w-4 h-4" />
            Criar Agente
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left">Agente</TableHead>
                <TableHead className="text-left">Tipo</TableHead>
                <TableHead className="text-left">Modelo</TableHead>
                <TableHead className="text-left">Skills</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent: AiAgent) => {
                const tipoConfig = TIPO_CONFIG[agent.tipo]
                const TipoIcon = tipoConfig.icon
                const skillCount = agent.ai_agent_skills?.filter(s => s.enabled)?.length ?? 0
                const lineCount = agent.ai_agent_phone_line_config?.filter(l => l.ativa)?.length ?? 0

                return (
                  <TableRow
                    key={agent.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/settings/ai-agents/${agent.id}`)}
                  >
                    {/* Agente */}
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-900">{agent.nome}</p>
                        {agent.persona && (
                          <p className="text-xs text-slate-500 line-clamp-1">{agent.persona}</p>
                        )}
                        {lineCount > 0 && (
                          <p className="text-xs text-slate-400">
                            {lineCount} linha{lineCount > 1 ? 's' : ''} WhatsApp
                          </p>
                        )}
                      </div>
                    </TableCell>

                    {/* Tipo */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TipoIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <Badge variant="outline" className={cn('text-xs', tipoConfig.color)}>
                          {tipoConfig.label}
                        </Badge>
                      </div>
                    </TableCell>

                    {/* Modelo */}
                    <TableCell>
                      <p className="text-sm text-slate-700 font-mono">{agent.modelo}</p>
                      <p className="text-xs text-slate-400">temp: {agent.temperature}</p>
                    </TableCell>

                    {/* Skills */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {skillCount > 0 ? (
                          agent.ai_agent_skills?.filter(s => s.enabled).slice(0, 3).map((as) => (
                            <Badge key={as.id} variant="outline" className="text-xs">
                              {as.ai_skills?.nome || 'Skill'}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">Nenhuma</span>
                        )}
                        {skillCount > 3 && (
                          <Badge variant="outline" className="text-xs text-slate-400">
                            +{skillCount - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={agent.ativa}
                        onCheckedChange={() => handleToggleAtiva(agent.id, agent.ativa)}
                        disabled={toggleAtiva.isPending}
                      />
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <BarChart3 className="w-4 h-4 text-slate-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/settings/ai-agents/${agent.id}`)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(agent.id)}>
                            <Copy className="w-3 h-3 mr-2" />
                            Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => navigate(`/settings/ai-agents/conversations?agent=${agent.id}`)}
                          >
                            <BarChart3 className="w-3 h-3 mr-2" />
                            Ver Conversas
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(agent.id)} className="text-red-600">
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
