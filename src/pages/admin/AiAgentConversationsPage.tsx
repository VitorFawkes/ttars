import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  MessageSquare, Bot, User, Clock, AlertTriangle, CheckCircle,
  ChevronRight, Phone, ArrowUpRight,
} from 'lucide-react'

import {
  useAiConversations, useAiConversationTurns,
  type AiConversation, type AiConversationTurn,
} from '@/hooks/useAiConversations'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  active: { label: 'Ativa', color: 'bg-green-100 text-green-700', icon: MessageSquare },
  waiting: { label: 'Aguardando', color: 'bg-amber-100 text-amber-700', icon: Clock },
  escalated: { label: 'Escalada', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  completed: { label: 'Completa', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  archived: { label: 'Arquivada', color: 'bg-slate-100 text-slate-500', icon: CheckCircle },
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function AiAgentConversationsPage() {
  const [searchParams] = useSearchParams()
  const agentFilter = searchParams.get('agent') || undefined

  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)

  const { data: conversations = [], isLoading } = useAiConversations({
    agentId: agentFilter,
    status: statusFilter || undefined,
    limit: 100,
  })
  const { data: turns = [] } = useAiConversationTurns(selectedConvId || undefined)

  const selectedConv = conversations.find(c => c.id === selectedConvId)

  const activeCount = conversations.filter(c => c.status === 'active').length
  const escalatedCount = conversations.filter(c => c.status === 'escalated').length

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-12 bg-slate-200 rounded-lg w-64 animate-pulse" />
      </div>
    )
  }

  return (
    <>
      <AdminPageHeader
        title="Conversas dos Agentes"
        subtitle="Acompanhe todas as conversas gerenciadas por agentes IA"
        icon={<MessageSquare className="w-5 h-5" />}
        stats={[
          { label: 'Total', value: conversations.length, color: 'blue' as const },
          { label: 'Ativas', value: activeCount, color: 'green' as const },
          { label: 'Escaladas', value: escalatedCount, color: 'red' as const },
        ]}
      />

      {/* Filtros */}
      <div className="flex gap-3 mb-6">
        <div className="w-48">
          <Select
            value={statusFilter}
            onChange={(v: string) => setStatusFilter(v)}
            options={[
              { value: '', label: 'Todos os status' },
              { value: 'active', label: 'Ativas' },
              { value: 'escalated', label: 'Escaladas' },
              { value: 'completed', label: 'Completas' },
              { value: 'archived', label: 'Arquivadas' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de conversas */}
        <div className="space-y-2 max-h-[70vh] overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            conversations.map((conv: AiConversation) => {
              const statusConf = STATUS_CONFIG[conv.status] || STATUS_CONFIG.active
              const isSelected = selectedConvId === conv.id
              const contactName = conv.contatos
                ? `${conv.contatos.nome} ${conv.contatos.sobrenome || ''}`.trim()
                : 'Desconhecido'

              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={cn(
                    'w-full text-left bg-white border rounded-xl p-4 transition-colors',
                    isSelected ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-slate-900 truncate">
                          {contactName}
                        </p>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {formatTime(conv.created_at)}
                        </span>
                      </div>

                      {conv.contatos?.telefone && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {conv.contatos.telefone}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 mt-2">
                        <Badge variant="outline" className={cn('text-xs', statusConf.color)}>
                          {statusConf.label}
                        </Badge>
                        {conv.ai_agents && (
                          <Badge variant="outline" className="text-xs">
                            {conv.ai_agents.nome}
                          </Badge>
                        )}
                        <span className="text-xs text-slate-400">
                          {conv.message_count} msg{conv.message_count !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {conv.cards && (
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          {conv.cards.titulo}
                        </p>
                      )}
                    </div>

                    <ChevronRight className={cn(
                      'w-4 h-4 text-slate-400 mt-1 flex-shrink-0 transition-transform',
                      isSelected && 'rotate-90'
                    )} />
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Transcript */}
        <div className="lg:col-span-2">
          {!selectedConvId ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Selecione uma conversa para ver o transcript</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Header da conversa */}
              {selectedConv && (
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-slate-900">
                        {selectedConv.contatos
                          ? `${selectedConv.contatos.nome} ${selectedConv.contatos.sobrenome || ''}`.trim()
                          : 'Conversa'}
                      </p>
                      <p className="text-xs text-slate-400">
                        Início: {formatDate(selectedConv.started_at)} | Agente: {selectedConv.ai_agents?.nome || 'N/A'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {selectedConv.status === 'escalated' && (
                        <Badge className="bg-red-100 text-red-700 text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {selectedConv.escalation_reason || 'Escalada'}
                        </Badge>
                      )}
                      {selectedConv.cards && (
                        <Badge variant="outline" className="text-xs">
                          <ArrowUpRight className="w-3 h-3 mr-1" />
                          {selectedConv.cards.titulo}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {turns.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Nenhuma mensagem</p>
                ) : (
                  turns.map((turn: AiConversationTurn) => {
                    const isUser = turn.role === 'user'
                    const isSystem = turn.role === 'system'

                    if (isSystem) {
                      return (
                        <div key={turn.id} className="text-center">
                          <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                            {turn.content}
                          </span>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={turn.id}
                        className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}
                      >
                        {!isUser && (
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Bot className="w-4 h-4 text-indigo-600" />
                          </div>
                        )}

                        <div className={cn(
                          'max-w-[75%] rounded-2xl px-4 py-2.5',
                          isUser
                            ? 'bg-indigo-600 text-white rounded-br-md'
                            : 'bg-slate-100 text-slate-900 rounded-bl-md'
                        )}>
                          <p className="text-sm whitespace-pre-wrap">{turn.content}</p>
                          <div className={cn(
                            'flex items-center gap-2 mt-1 text-xs',
                            isUser ? 'text-indigo-200' : 'text-slate-400'
                          )}>
                            <span>{formatDate(turn.created_at)}</span>
                            {!isUser && turn.input_tokens != null && (
                              <span>{turn.input_tokens + (turn.output_tokens || 0)} tokens</span>
                            )}
                            {turn.is_fallback && (
                              <Badge className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0">
                                fallback
                              </Badge>
                            )}
                          </div>

                          {/* Skills usadas */}
                          {!isUser && turn.skills_used && (turn.skills_used as unknown[]).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {(turn.skills_used as Array<Record<string, unknown>>).map((skill, i) => (
                                <Badge key={i} variant="outline" className="text-xs bg-white/80">
                                  {(skill.skill_name as string) || 'skill'}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {isUser && (
                          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <User className="w-4 h-4 text-slate-600" />
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
