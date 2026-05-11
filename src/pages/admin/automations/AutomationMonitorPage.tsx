/**
 * AutomationMonitorPage — monitor global das automações.
 *
 * Agrega dados de 3 tabelas:
 *   - cadence_event_log: eventos já ocorridos (send_message, create_task, change_stage,
 *     start_cadence — tudo que passou pelo engine)
 *   - cadence_entry_queue: itens enfileirados aguardando processamento (ou com erro em retry)
 *   - cadence_dead_letter: falhas permanentes de execução de steps de cadência
 *
 * Versão "mostra o que aconteceu" — não é detalhe por cadência (pra isso o
 * CadenceMonitorPage, acessado via drill-in). Aqui é o radar macro.
 */

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, Clock, RefreshCw, ExternalLink, CheckCircle2, MessageSquare,
  CheckSquare, ArrowRightLeft, Layers,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { supabase } from '@/lib/supabase'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventLogRow {
  id: string
  card_id: string | null
  event_type: string
  event_source: string
  event_data: Record<string, unknown> | null
  action_taken: string | null
  action_result: Record<string, unknown> | null
  created_at: string
  cards?: { id: string; titulo: string } | null
}

interface QueueRow {
  id: string
  card_id: string
  trigger_id: string
  event_type: string
  status: string
  attempts: number
  max_attempts: number
  last_error: string | null
  created_at: string
  execute_at: string
  cards?: { id: string; titulo: string } | null
  trigger?: { id: string; name: string | null; action_type: string } | null
}

interface DeadLetterRow {
  id: string
  error_message: string
  failed_at: string
  resolved_at: string | null
  instance_id: string | null
  step_id: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTION_META: Record<string, { icon: typeof MessageSquare; label: string; tint: string }> = {
  send_message: { icon: MessageSquare, label: 'Mensagem enviada', tint: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  create_task: { icon: CheckSquare, label: 'Tarefa criada', tint: 'bg-amber-50 text-amber-700 border-amber-200' },
  change_stage: { icon: ArrowRightLeft, label: 'Etapa alterada', tint: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  start_cadence: { icon: Layers, label: 'Cadência iniciada', tint: 'bg-purple-50 text-purple-700 border-purple-200' },
  queued_for_processing: { icon: Clock, label: 'Enfileirado', tint: 'bg-slate-50 text-slate-600 border-slate-200' },
  skip_duplicate: { icon: CheckCircle2, label: 'Pulado (duplicata)', tint: 'bg-slate-50 text-slate-500 border-slate-200' },
}

function ActionBadge({ actionTaken }: { actionTaken: string | null }) {
  const meta = ACTION_META[actionTaken || ''] || {
    icon: Activity,
    label: actionTaken || '—',
    tint: 'bg-slate-50 text-slate-600 border-slate-200',
  }
  const Icon = meta.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border', meta.tint)}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'pending'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : status === 'processing'
        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
        : status === 'completed'
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : status === 'failed'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border', color)}>
      {status}
    </span>
  )
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AutomationMonitorPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const triggerFilter = searchParams.get('trigger_id')
  const [activeTab, setActiveTab] = useState<'activity' | 'queue' | 'failures'>('activity')

  const activity = useQuery({
    queryKey: ['automations-monitor', 'activity', triggerFilter],
    queryFn: async (): Promise<EventLogRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('cadence_event_log')
        .select('id, card_id, event_type, event_source, event_data, action_taken, action_result, created_at, cards:card_id ( id, titulo )')
        .in('action_taken', ['send_message', 'create_task', 'change_stage', 'start_cadence'])
      if (triggerFilter) q = q.contains('event_data', { trigger_id: triggerFilter })
      const { data, error } = await q.order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data || []
    },
    refetchInterval: 30_000,
  })

  const queue = useQuery({
    queryKey: ['automations-monitor', 'queue', triggerFilter],
    queryFn: async (): Promise<QueueRow[]> => {
      const selectCols = 'id, card_id, trigger_id, event_type, status, attempts, max_attempts, last_error, created_at, execute_at, cards:card_id ( id, titulo ), trigger:cadence_event_triggers!trigger_id ( id, name, action_type )'
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any
      // Pendentes/processando/falhas (sempre visíveis) + completed nos últimos 10min
      // (pra o gestor não achar que "sumiu" quando o engine processa rápido)
      let liveQ = sb.from('cadence_entry_queue').select(selectCols).in('status', ['pending', 'processing', 'failed'])
      let doneQ = sb.from('cadence_entry_queue').select(selectCols).eq('status', 'completed').gte('created_at', tenMinAgo)
      if (triggerFilter) {
        liveQ = liveQ.eq('trigger_id', triggerFilter)
        doneQ = doneQ.eq('trigger_id', triggerFilter)
      }
      const [liveRes, doneRes] = await Promise.all([
        liveQ.order('created_at', { ascending: false }).limit(100),
        doneQ.order('created_at', { ascending: false }).limit(50),
      ])
      if (liveRes.error) throw liveRes.error
      if (doneRes.error) throw doneRes.error
      const merged = [...(liveRes.data || []), ...(doneRes.data || [])]
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      return merged
    },
    refetchInterval: 15_000,
  })

  const failures = useQuery({
    queryKey: ['automations-monitor', 'failures'],
    queryFn: async (): Promise<DeadLetterRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cadence_dead_letter')
        .select('id, error_message, failed_at, resolved_at, instance_id, step_id')
        .order('failed_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data || []
    },
    refetchInterval: 60_000,
  })

  const stats = useMemo(() => {
    const last24h = activity.data?.filter(
      (e) => new Date(e.created_at).getTime() > Date.now() - 24 * 3600 * 1000
    ).length || 0
    const pending = queue.data?.filter((q) => q.status === 'pending').length || 0
    const failed = queue.data?.filter((q) => q.status === 'failed').length || 0
    return [
      { label: 'Eventos 24h', value: last24h, color: 'blue' as const },
      { label: 'Pendentes', value: pending, color: 'yellow' as const },
      { label: 'Falhas', value: failed + (failures.data?.length || 0), color: 'red' as const },
    ]
  }, [activity.data, queue.data, failures.data])

  const refetchAll = () => {
    activity.refetch()
    queue.refetch()
    failures.refetch()
  }

  return (
    <>
      <AdminPageHeader
        title="Monitor de Automações"
        subtitle="O que aconteceu, o que está em fila e o que falhou"
        icon={<Activity className="w-5 h-5" />}
        stats={stats}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/settings/automations')}>
              Voltar ao hub
            </Button>
            <Button variant="outline" onClick={refetchAll} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </Button>
          </div>
        }
      />

      {triggerFilter && (
        <div className="flex items-center justify-between gap-2 mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-md text-sm">
          <span className="text-indigo-900">
            Filtrando execuções de uma automação específica. Limpe o filtro para ver tudo.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              next.delete('trigger_id')
              setSearchParams(next, { replace: true })
            }}
          >
            Limpar filtro
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="activity">
            <Activity className="w-4 h-4 mr-1.5" />
            Atividade
          </TabsTrigger>
          <TabsTrigger value="queue">
            <Clock className="w-4 h-4 mr-1.5" />
            Fila ({queue.data?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="failures">
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            Falhas ({failures.data?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB: ATIVIDADE ─────────────────────────────────────── */}
        <TabsContent value="activity" className="mt-4">
          {activity.isLoading ? (
            <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
          ) : !activity.data || activity.data.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <Activity className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-600 font-medium">Nenhuma atividade ainda</p>
              <p className="text-sm text-slate-500 mt-1">
                Assim que uma automação disparar, aparece aqui
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Automação</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.data.map((row) => {
                    const triggerName = (row.event_data?.trigger_name as string) || null
                    const cardTitulo = row.cards?.titulo || '—'
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-sm text-slate-600">
                          {relativeTime(row.created_at)}
                        </TableCell>
                        <TableCell>
                          <ActionBadge actionTaken={row.action_taken} />
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {triggerName || <span className="text-slate-400 italic">(sem nome)</span>}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 truncate max-w-xs">
                          {cardTitulo}
                        </TableCell>
                        <TableCell>
                          {row.card_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/cards/${row.card_id}`)}
                              title="Abrir card"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ─── TAB: FILA ─────────────────────────────────────────── */}
        <TabsContent value="queue" className="mt-4">
          {queue.isLoading ? (
            <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
          ) : !queue.data || queue.data.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-600 font-medium">Fila vazia</p>
              <p className="text-sm text-slate-500 mt-1">Nenhuma automação aguardando processamento</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criado</TableHead>
                    <TableHead>Executar em</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Automação</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead>Tentativas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.data.map((row) => (
                    <TableRow key={row.id} className={row.status === 'failed' ? 'bg-red-50/30' : ''}>
                      <TableCell className="text-sm text-slate-600">{relativeTime(row.created_at)}</TableCell>
                      <TableCell className="text-sm text-slate-600">{relativeTime(row.execute_at)}</TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {row.trigger?.name || <span className="text-slate-400 italic">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-slate-700 truncate max-w-xs">
                        {row.cards?.titulo || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {row.attempts}/{row.max_attempts}
                        </Badge>
                        {row.last_error && (
                          <p className="text-xs text-red-600 mt-1 truncate max-w-[300px]">
                            {row.last_error}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ─── TAB: FALHAS ───────────────────────────────────────── */}
        <TabsContent value="failures" className="mt-4">
          {failures.isLoading ? (
            <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
          ) : !failures.data || failures.data.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="text-slate-600 font-medium">Nenhuma falha permanente</p>
              <p className="text-sm text-slate-500 mt-1">Itens em retry aparecem na aba Fila</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Falhou</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Resolvido?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failures.data.map((row) => (
                    <TableRow key={row.id} className={!row.resolved_at ? 'bg-red-50/30' : ''}>
                      <TableCell className="text-sm text-slate-600">{relativeTime(row.failed_at)}</TableCell>
                      <TableCell className="text-sm text-slate-700 max-w-lg">
                        <p className="truncate">{row.error_message}</p>
                      </TableCell>
                      <TableCell>
                        {row.resolved_at ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                            Resolvido
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}
