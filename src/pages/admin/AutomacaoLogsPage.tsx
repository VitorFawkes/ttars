import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { cn } from '@/lib/utils'
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
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-700'
    case 'enviado':
      return 'bg-blue-50 text-blue-700'
    case 'entregue':
      return 'bg-green-50 text-green-700'
    case 'lido':
      return 'bg-purple-50 text-purple-700'
    case 'respondido':
      return 'bg-emerald-50 text-emerald-700'
    case 'falhou':
      return 'bg-red-50 text-red-700'
    case 'skipped':
      return 'bg-slate-50 text-slate-600'
    case 'cancelado':
      return 'bg-slate-50 text-slate-500'
    default:
      return 'bg-amber-50 text-amber-600'
  }
}

function contactName(log: AutomacaoExecucao): string {
  if (!log.contatos) return '—'
  const { nome, sobrenome } = log.contatos
  return `${nome || ''} ${sobrenome || ''}`.trim() || '—'
}

export default function AutomacaoLogsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const LIMIT = 50

  const { data: metricas } = useAutomacaoMetricas(id!)
  const { data: logs, isLoading: logsLoading } = useAutomacaoLogs(id!, {
    status: statusFilter || undefined,
    limit: LIMIT,
    offset,
  })

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setOffset(0)
  }

  const total = logs?.total ?? 0
  const items = logs?.logs ?? []

  return (
    <>
      <AdminPageHeader
        title="Logs da Automação"
        subtitle="Histórico de execuções"
        icon={<BarChart3 className="w-5 h-5" />}
        stats={
          metricas
            ? [
                { label: 'Disparados', value: metricas.total_disparados, color: 'gray' },
                { label: 'Enviados', value: metricas.total_enviados, color: 'blue' },
                { label: 'Entregues', value: metricas.total_entregues, color: 'green' },
                { label: 'Lidos', value: metricas.total_lidos, color: 'purple' },
                { label: 'Falhas', value: metricas.total_falhas, color: 'red' },
              ]
            : []
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings/automacoes')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="mb-6 flex items-center gap-3">
        <Select
          value={statusFilter}
          onChange={(v: string) => handleStatusChange(v)}
          options={[
            { value: '', label: 'Todos os status' },
            { value: 'pending', label: 'Pendente' },
            { value: 'enviado', label: 'Enviado' },
            { value: 'entregue', label: 'Entregue' },
            { value: 'lido', label: 'Lido' },
            { value: 'respondido', label: 'Respondido' },
            { value: 'falhou', label: 'Falhou' },
            { value: 'skipped', label: 'Pulado' },
            { value: 'aguardando_passo', label: 'Aguardando' },
            { value: 'cancelado', label: 'Cancelado' },
          ]}
          className="w-48"
        />
      </div>

      {/* Logs table */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        {logsLoading ? (
          <div className="p-12 text-center text-slate-500">Carregando logs...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500">Nenhuma execução encontrada</p>
            <p className="text-sm text-slate-400 mt-1">Tente alterar os filtros ou aguarde novas execuções</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Card</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead>Enviado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log: AutomacaoExecucao) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div>
                        <Badge variant="outline" className={cn('inline-block', getStatusColor(log.status))}>
                          {STATUS_LABELS[log.status] || log.status}
                        </Badge>
                        {log.status === 'skipped' && log.skip_reason && (
                          <p className="text-xs text-red-600 mt-1">{log.skip_reason}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{log.cards?.titulo || '—'}</TableCell>
                    <TableCell>{contactName(log)}</TableCell>
                    <TableCell>{log.trigger_type || '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {log.corpo_renderizado?.substring(0, 60) || '—'}
                    </TableCell>
                    <TableCell>{timeAgo(log.created_at)}</TableCell>
                    <TableCell>{timeAgo(log.enviado_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Mostrando {offset + 1}-{Math.min(offset + LIMIT, total)} de {total}
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
    </>
  )
}
