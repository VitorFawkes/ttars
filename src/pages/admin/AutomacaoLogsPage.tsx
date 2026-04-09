import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  RefreshCw,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Eye,
  MessageSquare,
  Ban,
  Pause,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useAutomacaoLogs, useAutomacaoMetricas, type AutomacaoExecucao } from '@/hooks/useAutomacaoLogs'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  aguardando_horario: 'Aguardando horário',
  aguardando_passo: 'Aguardando passo',
  gerando_ia: 'Gerando IA',
  aguardando_aprovacao: 'Aguardando aprovação',
  enviando: 'Enviando',
  enviado: 'Enviado',
  entregue: 'Entregue',
  lido: 'Lido',
  respondido: 'Respondido',
  falhou: 'Falhou',
  skipped: 'Pulado',
  pausado: 'Pausado',
  cancelado: 'Cancelado',
  completo: 'Completo',
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4" />
    case 'enviado':
      return <Send className="w-4 h-4" />
    case 'entregue':
      return <CheckCircle2 className="w-4 h-4" />
    case 'lido':
      return <Eye className="w-4 h-4" />
    case 'respondido':
      return <MessageSquare className="w-4 h-4" />
    case 'falhou':
      return <XCircle className="w-4 h-4" />
    case 'skipped':
      return <Ban className="w-4 h-4" />
    case 'aguardando_passo':
    case 'aguardando_horario':
      return <Pause className="w-4 h-4" />
    case 'gerando_ia':
    case 'aguardando_aprovacao':
      return <Clock className="w-4 h-4" />
    case 'cancelado':
      return <XCircle className="w-4 h-4" />
    default:
      return <Clock className="w-4 h-4" />
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'text-amber-600 bg-amber-50'
    case 'enviado':
      return 'text-blue-600 bg-blue-50'
    case 'entregue':
      return 'text-green-600 bg-green-50'
    case 'lido':
      return 'text-purple-600 bg-purple-50'
    case 'respondido':
      return 'text-emerald-600 bg-emerald-50'
    case 'falhou':
      return 'text-red-600 bg-red-50'
    case 'skipped':
      return 'text-slate-600 bg-slate-50'
    case 'aguardando_passo':
    case 'aguardando_horario':
      return 'text-amber-600 bg-amber-50'
    case 'gerando_ia':
    case 'aguardando_aprovacao':
      return 'text-indigo-600 bg-indigo-50'
    case 'cancelado':
      return 'text-slate-600 bg-slate-50'
    default:
      return 'text-slate-600 bg-slate-50'
  }
}

function MetricCard({
  label,
  value,
  colorClass,
}: {
  label: string
  value: number | null
  colorClass: string
}) {
  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
      <p className={`text-sm font-medium ${colorClass}`}>{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value ?? 0}</p>
    </div>
  )
}

export default function AutomacaoLogsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const LIMIT = 50

  const { data: metricas, isLoading: metricsLoading, refetch: refetchMetricas } = useAutomacaoMetricas(id!)
  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useAutomacaoLogs(id!, {
    status: statusFilter || undefined,
    limit: LIMIT,
    offset,
  })

  const handleRefresh = () => {
    refetchMetricas()
    refetchLogs()
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setOffset(0)
  }

  const total = logs?.total ?? 0
  const items = logs?.logs ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/settings/automacoes')}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Logs da Automação</h1>
              <p className="text-sm text-slate-500 mt-1">Acompanhe a execução de suas automações</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={metricsLoading || logsLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="p-6">
        {/* Metrics */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Funil de Execução</h2>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
            <MetricCard
              label="Disparados"
              value={metricas?.total_disparados}
              colorClass="text-slate-600"
            />
            <div className="flex justify-center">
              <div className="w-6 h-0.5 bg-slate-300" />
            </div>
            <MetricCard label="Enviados" value={metricas?.total_enviados} colorClass="text-blue-600" />
            <div className="flex justify-center">
              <div className="w-6 h-0.5 bg-slate-300" />
            </div>
            <MetricCard
              label="Entregues"
              value={metricas?.total_entregues}
              colorClass="text-green-600"
            />
            <div className="flex justify-center">
              <div className="w-6 h-0.5 bg-slate-300" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Lidos" value={metricas?.total_lidos} colorClass="text-purple-600" />
              <MetricCard
                label="Respondidos"
                value={metricas?.total_respondidos}
                colorClass="text-emerald-600"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mt-3">
            <MetricCard label="Falhas" value={metricas?.total_falhas} colorClass="text-red-600" />
            <MetricCard label="Pulados" value={metricas?.total_skipped} colorClass="text-amber-600" />
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mb-6 flex items-center gap-3">
          <Filter className="w-5 h-5 text-slate-500" />
          <Select
            value={statusFilter}
            onChange={handleStatusChange}
            options={[
              { value: '', label: 'Todos os status' },
              { value: 'pending', label: 'Pendente' },
              { value: 'enviado', label: 'Enviado' },
              { value: 'entregue', label: 'Entregue' },
              { value: 'lido', label: 'Lido' },
              { value: 'respondido', label: 'Respondido' },
              { value: 'falhou', label: 'Falhou' },
              { value: 'skipped', label: 'Pulado' },
              { value: 'aguardando_passo', label: 'Aguardando passo' },
              { value: 'cancelado', label: 'Cancelado' },
            ]}
          />
        </div>

        {/* Logs Table */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          {logsLoading ? (
            <div className="p-8 text-center text-slate-500">Carregando logs...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Nenhum log encontrado</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Card
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Contato
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Trigger
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Mensagem
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Criado
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Enviado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((log: AutomacaoExecucao) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div
                            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(log.status)}`}
                          >
                            {getStatusIcon(log.status)}
                            {STATUS_LABELS[log.status] || log.status}
                          </div>
                          {log.status === 'skipped' && log.skip_reason && (
                            <p className="text-xs text-red-600 mt-1">{log.skip_reason}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-900">
                          {log.cards?.titulo || '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-900">
                          {log.contatos
                            ? `${log.contatos.nome || ''} ${log.contatos.sobrenome || ''}`.trim() ||
                              '—'
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{log.trigger_type || '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                          {log.corpo_renderizado
                            ? log.corpo_renderizado.substring(0, 80) +
                              (log.corpo_renderizado.length > 80 ? '...' : '')
                            : 'Pendente'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{timeAgo(log.created_at)}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{timeAgo(log.enviado_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  Mostrando {offset + 1} a {Math.min(offset + LIMIT, total)} de {total} logs
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + LIMIT >= total}
                    onClick={() => setOffset(offset + LIMIT)}
                  >
                    Próximo
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
