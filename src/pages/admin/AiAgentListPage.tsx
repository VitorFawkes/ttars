import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Bot, Plus, Sparkles, Activity } from 'lucide-react'

import { useAiAgents, type AiAgent, type AgentTipo } from '@/hooks/useAiAgents'
import { useAiAgentHubStats } from '@/hooks/useAiAgentHubStats'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { AgentCard } from '@/components/ai-agent/AgentCard'
import { AgentHubFilters, type StatusFilter } from '@/components/ai-agent/AgentHubFilters'

export default function AiAgentListPage() {
  const navigate = useNavigate()
  const { slug: currentProduct } = useCurrentProductMeta()

  const { agents = [], isLoading, toggleAtiva, duplicate, remove } = useAiAgents(currentProduct)

  const agentIds = useMemo(() => agents.map((a) => a.id), [agents])
  const { data: statsByAgent = {} } = useAiAgentHubStats(agentIds)

  // Filters state
  const [search, setSearch] = useState('')
  const [tipo, setTipo] = useState<AgentTipo | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return agents.filter((a) => {
      if (tipo !== 'all' && a.tipo !== tipo) return false
      if (status === 'active' && !a.ativa) return false
      if (status === 'paused' && a.ativa) return false
      if (s) {
        const hay = `${a.nome} ${a.persona ?? ''} ${a.descricao ?? ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [agents, search, tipo, status])

  const ativosCount = agents.filter((a) => a.ativa).length
  const totalConversations = useMemo(
    () => Object.values(statsByAgent).reduce((sum, s) => sum + s.conversations_count, 0),
    [statsByAgent]
  )

  const stats = useMemo(
    () => [
      { label: 'Agentes ativos', value: ativosCount, color: 'green' as const },
      { label: 'Total', value: agents.length, color: 'blue' as const },
      { label: 'Conversas (7d)', value: totalConversations, color: 'purple' as const },
    ],
    [ativosCount, agents.length, totalConversations]
  )

  const handleToggleAtiva = async (id: string, currentAtiva: boolean) => {
    try {
      await toggleAtiva.mutateAsync({ id, ativa: !currentAtiva })
      toast.success(!currentAtiva ? 'Agente ativado' : 'Agente pausado')
    } catch {
      toast.error('Erro ao atualizar agente')
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      const result = await duplicate.mutateAsync(id)
      toast.success('Agente duplicado')
      navigate(`/settings/ai-agents/${(result as AiAgent).id}`)
    } catch {
      toast.error('Erro ao duplicar agente')
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este agente? Esta ação não pode ser desfeita.')) return
    try {
      await remove.mutateAsync(id)
      toast.success('Agente excluído')
    } catch {
      toast.error('Erro ao excluir agente')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-16 bg-slate-100 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const noAgents = agents.length === 0
  const noResults = !noAgents && filtered.length === 0

  return (
    <>
      <AdminPageHeader
        title="Agentes IA"
        subtitle="Configure agentes inteligentes de WhatsApp para vendas, suporte e pós-venda"
        icon={<Bot className="w-5 h-5" />}
        stats={stats}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/settings/ai-agents/health')} className="gap-2">
              <Activity className="w-4 h-4" />
              Saúde
            </Button>
            <Button onClick={() => navigate('/settings/ai-agents/builder')} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Criar agente
            </Button>
          </div>
        }
      />

      {noAgents ? (
        <div className="p-16 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bot className="w-8 h-8 text-indigo-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Crie seu primeiro agente</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            Agentes IA qualificam leads, respondem clientes, agendam reuniões e muito mais — automaticamente pelo WhatsApp.
          </p>
          <Button onClick={() => navigate('/settings/ai-agents/builder')} className="mt-6 gap-2">
            <Sparkles className="w-4 h-4" />
            Criar com assistente guiado
          </Button>
        </div>
      ) : (
        <>
          <AgentHubFilters
            search={search}
            onSearchChange={setSearch}
            tipo={tipo}
            onTipoChange={setTipo}
            status={status}
            onStatusChange={setStatus}
          />

          {noResults ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <p className="text-slate-600 font-medium">Nenhum agente encontrado</p>
              <p className="text-sm text-slate-500 mt-1">Tente ajustar a busca ou filtros.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearch(''); setTipo('all'); setStatus('all') }}
                className="mt-4"
              >
                Limpar filtros
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((agent) => {
                const stat = statsByAgent[agent.id]
                return (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    conversationsCount={stat?.conversations_count}
                    resolutionRate={stat?.resolution_rate}
                    onToggleActive={handleToggleAtiva}
                    onEdit={(id) => navigate(`/settings/ai-agents/${id}`)}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onViewConversations={(id) => navigate(`/settings/ai-agents/conversations?agent=${id}`)}
                    onViewAnalytics={(id) => navigate(`/settings/ai-agents/analytics?agent=${id}`)}
                    onClick={(id) => navigate(`/settings/ai-agents/${id}`)}
                    isTogglePending={toggleAtiva.isPending}
                  />
                )
              })}

              {/* Add card */}
              <button
                onClick={() => navigate('/settings/ai-agents/builder')}
                className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center min-h-[240px] hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
              >
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
                  <Plus className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-700">Criar novo agente</p>
                <p className="text-xs text-slate-500 mt-1">Assistente guiado em 8 passos</p>
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
