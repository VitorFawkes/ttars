import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  MessageSquare, Bot, User, Clock, AlertTriangle, CheckCircle,
  ChevronRight, Phone, ArrowUpRight, Search, X, Download,
  Smile, Meh, Frown, Sparkles,
} from 'lucide-react'

import {
  useAiConversations, useAiConversationTurns,
  type AiConversation, type AiConversationTurn,
} from '@/hooks/useAiConversations'
import { useAiAgents } from '@/hooks/useAiAgents'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

type DateRange = '7d' | '14d' | '30d' | 'all'
type StatusFilter = 'all' | 'active' | 'waiting' | 'escalated' | 'completed' | 'archived'

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: 'Ativa', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  waiting: { label: 'Aguardando', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  escalated: { label: 'Escalada', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  completed: { label: 'Completa', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  archived: { label: 'Arquivada', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
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
  if (diffD < 30) return `${diffD}d`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function getDateFrom(range: DateRange): string | undefined {
  if (range === 'all') return undefined
  const days = range === '7d' ? 7 : range === '14d' ? 14 : 30
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return d.toISOString()
}

function SentimentIcon({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null
  const lower = sentiment.toLowerCase()
  if (['positive', 'positivo', 'happy', 'satisfied'].some((s) => lower.includes(s))) {
    return <Smile className="w-3 h-3 text-green-600" />
  }
  if (['negative', 'negativo', 'angry', 'frustrated'].some((s) => lower.includes(s))) {
    return <Frown className="w-3 h-3 text-red-600" />
  }
  return <Meh className="w-3 h-3 text-slate-400" />
}

export default function AiAgentConversationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const agentFilter = searchParams.get('agent') || 'all'

  const { slug: currentProduct } = useCurrentProductMeta()
  const { agents = [] } = useAiAgents(currentProduct)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateRange, setDateRange] = useState<DateRange>('14d')
  const [search, setSearch] = useState('')
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)

  const { data: allConversations = [], isLoading } = useAiConversations({
    agentId: agentFilter !== 'all' ? agentFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    dateFrom: getDateFrom(dateRange),
    limit: 200,
  })

  const conversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allConversations
    return allConversations.filter((c) => {
      const name = c.contatos ? `${c.contatos.nome} ${c.contatos.sobrenome || ''}` : ''
      const phone = c.contatos?.telefone || ''
      const title = c.cards?.titulo || ''
      return (
        name.toLowerCase().includes(q) ||
        phone.includes(q) ||
        title.toLowerCase().includes(q)
      )
    })
  }, [allConversations, search])

  const { data: turns = [] } = useAiConversationTurns(selectedConvId || undefined)

  const selectedConv = conversations.find((c) => c.id === selectedConvId)

  const activeCount = allConversations.filter((c) => c.status === 'active').length
  const escalatedCount = allConversations.filter((c) => c.status === 'escalated').length

  const handleAgentChange = (agentId: string) => {
    if (agentId === 'all') {
      searchParams.delete('agent')
    } else {
      searchParams.set('agent', agentId)
    }
    setSearchParams(searchParams)
  }

  const handleExport = () => {
    if (!selectedConv) return
    const payload = {
      conversation: selectedConv,
      turns,
      exported_at: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conversa_${selectedConv.id.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading && allConversations.length === 0) {
    return (
      <div className="p-6">
        <div className="h-12 bg-slate-200 rounded-lg w-64 animate-pulse" />
      </div>
    )
  }

  return (
    <>
      <AdminPageHeader
        title="Conversas dos agentes"
        subtitle="Acompanhe e audite todas as conversas gerenciadas por IA"
        icon={<MessageSquare className="w-5 h-5" />}
        stats={[
          { label: 'Total (filtro)', value: conversations.length, color: 'blue' as const },
          { label: 'Ativas', value: activeCount, color: 'green' as const },
          { label: 'Escaladas', value: escalatedCount, color: 'red' as const },
        ]}
      />

      {/* Filters bar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou card..."
            className="pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(['7d', '14d', '30d', 'all'] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border',
                dateRange === r ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              {r === 'all' ? 'Tudo' : r}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativas</option>
          <option value="waiting">Aguardando</option>
          <option value="escalated">Escaladas</option>
          <option value="completed">Completas</option>
          <option value="archived">Arquivadas</option>
        </select>

        <select
          value={agentFilter}
          onChange={(e) => handleAgentChange(e.target.value)}
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Todos os agentes</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.nome}</option>
          ))}
        </select>
      </div>

      {/* 3-column layout: list | transcript | context */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* List */}
        <div className="lg:col-span-4 space-y-1.5 max-h-[75vh] overflow-y-auto pr-1">
          {conversations.length === 0 ? (
            <div className="p-10 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-600 font-medium">Nenhuma conversa</p>
              <p className="text-xs text-slate-500 mt-1">Tente ajustar os filtros</p>
            </div>
          ) : (
            conversations.map((conv: AiConversation) => {
              const statusConf = STATUS_CONFIG[conv.status] || STATUS_CONFIG.active
              const isSelected = selectedConvId === conv.id
              const contactName = conv.contatos
                ? `${conv.contatos.nome} ${conv.contatos.sobrenome || ''}`.trim()
                : 'Contato desconhecido'

              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={cn(
                    'w-full text-left bg-white border rounded-lg p-3 transition-colors',
                    isSelected ? 'border-indigo-400 bg-indigo-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn('w-2 h-2 rounded-full mt-2 flex-shrink-0', statusConf.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm text-slate-900 truncate">{contactName}</p>
                        <span className="text-[11px] text-slate-400 flex-shrink-0">{formatTime(conv.created_at)}</span>
                      </div>
                      {conv.contatos?.telefone && (
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-2.5 h-2.5" /> {conv.contatos.telefone}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', statusConf.color)}>
                          {statusConf.label}
                        </Badge>
                        {conv.ai_agents && (
                          <span className="text-[10px] text-slate-500 truncate max-w-[100px]">
                            {conv.ai_agents.nome}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 ml-auto">{conv.message_count}msg</span>
                      </div>
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
        <div className="lg:col-span-5">
          {!selectedConvId ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl h-full flex flex-col items-center justify-center">
              <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">Selecione uma conversa</p>
              <p className="text-sm text-slate-500 mt-1">Clique em um item à esquerda para ver o transcript</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[75vh]">
              {selectedConv && (
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex-shrink-0 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate">
                      {selectedConv.contatos ? `${selectedConv.contatos.nome} ${selectedConv.contatos.sobrenome || ''}`.trim() : 'Conversa'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatDateTime(selectedConv.started_at)} · {selectedConv.ai_agents?.nome || 'sem agente'}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 flex-shrink-0">
                    <Download className="w-3.5 h-3.5" /> Exportar
                  </Button>
                </div>
              )}

              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                {turns.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Sem mensagens</p>
                ) : (
                  turns.map((turn: AiConversationTurn) => {
                    const isUser = turn.role === 'user'
                    const isSystem = turn.role === 'system'

                    if (isSystem) {
                      return (
                        <div key={turn.id} className="text-center">
                          <span className="text-[11px] text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                            {turn.content}
                          </span>
                        </div>
                      )
                    }

                    return (
                      <div key={turn.id} className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
                        {!isUser && (
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Bot className="w-4 h-4 text-indigo-600" />
                          </div>
                        )}
                        <div className={cn(
                          'max-w-[75%] rounded-2xl px-3.5 py-2',
                          isUser
                            ? 'bg-indigo-600 text-white rounded-br-md'
                            : 'bg-slate-100 text-slate-900 rounded-bl-md'
                        )}>
                          <p className="text-sm whitespace-pre-wrap leading-snug">{turn.content}</p>
                          <div className={cn(
                            'flex items-center gap-2 mt-1 text-[10px]',
                            isUser ? 'text-indigo-200' : 'text-slate-400'
                          )}>
                            <span>{formatDateTime(turn.created_at)}</span>
                            {!isUser && turn.input_tokens != null && (
                              <span>{turn.input_tokens + (turn.output_tokens || 0)}t</span>
                            )}
                            {turn.detected_sentiment && isUser && (
                              <SentimentIcon sentiment={turn.detected_sentiment} />
                            )}
                            {turn.is_fallback && (
                              <span className="bg-amber-500/20 text-amber-100 px-1.5 rounded">fallback</span>
                            )}
                          </div>
                          {!isUser && turn.skills_used && (turn.skills_used as unknown[]).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {(turn.skills_used as Array<Record<string, unknown>>).map((skill, i) => (
                                <span key={i} className="text-[10px] bg-white/80 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full">
                                  {(skill.skill_name as string) || 'skill'}
                                </span>
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

        {/* Context sidebar */}
        <div className="lg:col-span-3">
          {selectedConv ? (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Contato</p>
                <p className="text-sm font-medium text-slate-900">
                  {selectedConv.contatos ? `${selectedConv.contatos.nome} ${selectedConv.contatos.sobrenome || ''}`.trim() : '—'}
                </p>
                {selectedConv.contatos?.telefone && (
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {selectedConv.contatos.telefone}
                  </p>
                )}
              </div>

              {selectedConv.cards && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Card vinculado</p>
                  <div className="flex items-center gap-2 text-sm">
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-slate-900 truncate">{selectedConv.cards.titulo}</p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Status</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('text-xs', STATUS_CONFIG[selectedConv.status]?.color)}>
                    {STATUS_CONFIG[selectedConv.status]?.label}
                  </Badge>
                </div>
                {selectedConv.status === 'escalated' && selectedConv.escalation_reason && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span>{selectedConv.escalation_reason}</span>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Estatísticas</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Total de mensagens</span>
                    <span className="font-medium text-slate-900">{selectedConv.message_count}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Mensagens IA</span>
                    <span className="font-medium text-slate-900">{selectedConv.ai_message_count}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Mensagens humanas</span>
                    <span className="font-medium text-slate-900">{selectedConv.human_message_count}</span>
                  </div>
                  {selectedConv.intent && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Intenção</span>
                      <span className="font-medium text-slate-900">{selectedConv.intent}</span>
                    </div>
                  )}
                </div>
              </div>

              {selectedConv.tags && selectedConv.tags.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedConv.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        <Sparkles className="w-2.5 h-2.5 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Timeline</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-500">Início:</span>
                    <span className="text-slate-900">{formatDateTime(selectedConv.started_at)}</span>
                  </div>
                  {selectedConv.ended_at && (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-500">Fim:</span>
                      <span className="text-slate-900">{formatDateTime(selectedConv.ended_at)}</span>
                    </div>
                  )}
                  {selectedConv.escalation_at && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                      <span className="text-slate-500">Escalada:</span>
                      <span className="text-slate-900">{formatDateTime(selectedConv.escalation_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
              <p className="text-xs text-slate-500">Selecione uma conversa para ver contexto</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
