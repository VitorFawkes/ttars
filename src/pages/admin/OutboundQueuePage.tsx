import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Send, RefreshCw, XCircle, Clock, CheckCircle2,
  AlertTriangle, Filter, BarChart3,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { useOutboundQueue, type OutboundQueueStatus } from '@/hooks/useOutboundQueue'
import { useAiAgents } from '@/hooks/useAiAgents'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<OutboundQueueStatus, { label: string; color: string; icon: typeof Send }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
  scheduled: { label: 'Agendado', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
  processing: { label: 'Processando', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: RefreshCw },
  sent: { label: 'Enviado', color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
  failed: { label: 'Falhou', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
  skipped: { label: 'Ignorado', color: 'bg-slate-50 text-slate-600 border-slate-200', icon: XCircle },
  expired: { label: 'Expirado', color: 'bg-slate-50 text-slate-500 border-slate-200', icon: XCircle },
}

const TRIGGER_LABELS: Record<string, string> = {
  card_created: 'Novo lead',
  stage_changed: 'Mudou etapa',
  idle_days: 'Follow-up',
  manual: 'Manual',
}

const STATUS_OPTIONS: Array<{ value: OutboundQueueStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'scheduled', label: 'Agendados' },
  { value: 'processing', label: 'Processando' },
  { value: 'sent', label: 'Enviados' },
  { value: 'failed', label: 'Falhados' },
  { value: 'skipped', label: 'Ignorados' },
  { value: 'expired', label: 'Expirados' },
]

export default function OutboundQueuePage() {
  const { slug: currentProduct } = useCurrentProductMeta()
  const { agents } = useAiAgents(currentProduct)

  const [filterAgent, setFilterAgent] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<OutboundQueueStatus | 'all'>('all')
  const [filterTrigger, setFilterTrigger] = useState<string>('all')

  const { items, isLoading, stats, reprocess, cancel } = useOutboundQueue({
    agentId: filterAgent !== 'all' ? filterAgent : undefined,
    status: filterStatus !== 'all' ? filterStatus : undefined,
    triggerType: filterTrigger !== 'all' ? filterTrigger : undefined,
  })

  const headerStats = useMemo(() => {
    if (!stats) return []
    return [
      { label: 'Pendentes', value: stats.total_pending, color: 'yellow' as const },
      { label: 'Enviados hoje', value: stats.total_sent_today, color: 'green' as const },
      { label: 'Falhados hoje', value: stats.total_failed_today, color: 'red' as const },
      { label: 'Taxa sucesso (7d)', value: `${stats.success_rate_7d}%`, color: 'blue' as const },
    ]
  }, [stats])

  const handleReprocess = async (id: string) => {
    try {
      await reprocess.mutateAsync(id)
      toast.success('Item reenfileirado')
    } catch {
      toast.error('Erro ao reprocessar')
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id)
      toast.success('Item cancelado')
    } catch {
      toast.error('Erro ao cancelar')
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Fila de Envios"
        subtitle="Acompanhe e gerencie envios outbound dos agentes IA"
        icon={<Send className="w-5 h-5" />}
        stats={headerStats}
      />

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          >
            <option value="all">Todos os agentes</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as OutboundQueueStatus | 'all')}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={filterTrigger}
            onChange={(e) => setFilterTrigger(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          >
            <option value="all">Todos os gatilhos</option>
            {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          {(filterAgent !== 'all' || filterStatus !== 'all' || filterTrigger !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setFilterAgent('all'); setFilterStatus('all'); setFilterTrigger('all') }}
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-16 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Fila vazia</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            Nenhum item na fila com os filtros selecionados.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Contato</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Agente</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Gatilho</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Agendado</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Tentativas</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Criado</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const sc = STATUS_CONFIG[item.status as OutboundQueueStatus] || STATUS_CONFIG.pending
                  const StatusIcon = sc.icon
                  const canReprocess = item.status === 'failed'
                  const canCancel = item.status === 'pending' || item.status === 'scheduled'

                  return (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-900 truncate max-w-[180px]">
                            {item.contact_name || 'Sem nome'}
                          </p>
                          <p className="text-xs text-slate-500">{item.contact_phone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.ai_agents?.nome || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                          {TRIGGER_LABELS[item.trigger_type] || item.trigger_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border',
                          sc.color
                        )}>
                          <StatusIcon className="w-3 h-3" />
                          {sc.label}
                        </span>
                        {item.error_message && (
                          <p className="text-[11px] text-red-500 mt-1 truncate max-w-[200px]" title={item.error_message}>
                            {item.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {item.scheduled_for
                          ? format(new Date(item.scheduled_for), 'dd/MM HH:mm')
                          : '—'
                        }
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.attempts}/{item.max_attempts}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canReprocess && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReprocess(item.id)}
                              disabled={reprocess.isPending}
                              className="text-xs gap-1"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Reprocessar
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancel(item.id)}
                              disabled={cancel.isPending}
                              className="text-xs gap-1 text-red-600 hover:text-red-700"
                            >
                              <XCircle className="w-3 h-3" />
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-xs text-slate-500">{items.length} itens exibidos</p>
            <p className="text-xs text-slate-400">Atualiza automaticamente a cada 30s</p>
          </div>
        </div>
      )}
    </>
  )
}
