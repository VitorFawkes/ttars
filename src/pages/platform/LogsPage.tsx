import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Inbox, Webhook, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type Tab = 'webhooks' | 'outbox' | 'alerts' | 'pulse'

interface WebhookLog {
  id: string
  source: string
  payload: Record<string, unknown>
  created_at: string
}

interface OutboxEntry {
  id: string
  destination: string
  entity_type: string
  internal_id: string | null
  action: string
  status: string
  retry_count: number
  error_log: string | null
  created_at: string
}

interface IntegrationAlert {
  id: string
  rule_key: string
  status: string
  context: Record<string, unknown>
  org_id: string | null
  org_name: string | null
  fired_at: string
  acknowledged_at: string | null
  resolved_at: string | null
}

interface PulseEntry {
  channel: string
  label: string
  last_event_at: string | null
  event_count_24h: number
  event_count_7d: number
  last_error_at: string | null
  error_count_24h: number
}

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>('webhooks')
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Activity className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Logs & Saúde</h1>
          <p className="text-sm text-slate-500">
            Visibilidade cross-org de webhooks, filas técnicas e alertas de integração.
          </p>
        </div>
      </header>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          <TabButton active={tab === 'webhooks'} onClick={() => setTab('webhooks')} icon={Webhook}>
            Webhooks recebidos
          </TabButton>
          <TabButton active={tab === 'outbox'} onClick={() => setTab('outbox')} icon={Inbox}>
            Fila outbox
          </TabButton>
          <TabButton active={tab === 'alerts'} onClick={() => setTab('alerts')} icon={AlertTriangle}>
            Alertas de integração
          </TabButton>
          <TabButton active={tab === 'pulse'} onClick={() => setTab('pulse')} icon={Activity}>
            Saúde por canal
          </TabButton>
        </div>

        <div className="p-0">
          {tab === 'webhooks' && <WebhooksTab />}
          {tab === 'outbox' && <OutboxTab />}
          {tab === 'alerts' && <AlertsTab />}
          {tab === 'pulse' && <PulseTab />}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active, onClick, icon: Icon, children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors',
        active
          ? 'border-indigo-600 text-indigo-700 font-medium bg-indigo-50/30'
          : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
      )}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  )
}

function useListRpc<T>(rpcName: string, params: Record<string, unknown> = {}) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: rpcError } = await db.rpc(rpcName, params)
      if (rpcError) throw rpcError
      setRows((data ?? []) as T[])
    } catch (err) {
      setError(err instanceof Error ? err.message : `Erro ao carregar ${rpcName}`)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpcName, JSON.stringify(params)])

  useEffect(() => { load() }, [load])
  return { rows, loading, error, reload: load }
}

function TabHeader({ loading, onRefresh, label }: { loading: boolean; onRefresh: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
      <span className="text-xs text-slate-600">{label}</span>
      <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="h-7">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      </Button>
    </div>
  )
}

function WebhooksTab() {
  const { rows, loading, error, reload } = useListRpc<WebhookLog>('platform_list_webhook_logs', { p_limit: 100 })
  return (
    <>
      <TabHeader loading={loading} onRefresh={reload} label={`Últimos ${rows.length} webhooks recebidos`} />
      {error && <div className="px-5 py-3 text-sm text-red-700 bg-red-50">{error}</div>}
      <div className="divide-y divide-slate-100 max-h-[calc(100vh-320px)] overflow-y-auto">
        {rows.length === 0 && !loading ? (
          <div className="px-5 py-8 text-sm text-slate-500 text-center">Nenhum webhook registrado.</div>
        ) : rows.map((w) => (
          <details key={w.id} className="px-5 py-2.5 hover:bg-slate-50 cursor-pointer">
            <summary className="flex items-center gap-3 text-sm">
              <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{w.source}</span>
              <span className="text-slate-500 text-xs ml-auto">{new Date(w.created_at).toLocaleString('pt-BR')}</span>
            </summary>
            <pre className="mt-2 text-[11px] bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto max-h-64">
              {JSON.stringify(w.payload, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </>
  )
}

function OutboxTab() {
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const { rows, loading, error, reload } = useListRpc<OutboxEntry>(
    'platform_list_integration_outbox',
    { p_limit: 100, p_status: statusFilter }
  )
  return (
    <>
      <TabHeader loading={loading} onRefresh={reload} label={`${rows.length} itens na fila outbox`} />
      <div className="flex gap-1 px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs">
        {(['all', 'pending', 'sent', 'failed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === 'all' ? null : s)}
            className={cn(
              'px-2 py-1 rounded',
              (s === 'all' ? !statusFilter : statusFilter === s)
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-200'
            )}
          >
            {s === 'all' ? 'Todos' : s}
          </button>
        ))}
      </div>
      {error && <div className="px-5 py-3 text-sm text-red-700 bg-red-50">{error}</div>}
      <div className="divide-y divide-slate-100 max-h-[calc(100vh-360px)] overflow-y-auto">
        {rows.length === 0 && !loading ? (
          <div className="px-5 py-8 text-sm text-slate-500 text-center">Nenhum item na fila.</div>
        ) : rows.map((e) => (
          <div key={e.id} className="px-5 py-3 hover:bg-slate-50">
            <div className="flex items-center gap-3 text-sm">
              <span className={cn(
                'text-[10px] font-medium rounded-full px-2 py-0.5 border',
                e.status === 'sent' && 'text-emerald-700 bg-emerald-50 border-emerald-200',
                e.status === 'failed' && 'text-rose-700 bg-rose-50 border-rose-200',
                e.status === 'pending' && 'text-amber-700 bg-amber-50 border-amber-200',
                !['sent', 'failed', 'pending'].includes(e.status) && 'text-slate-600 bg-slate-50 border-slate-200'
              )}>{e.status}</span>
              <span className="font-mono text-xs text-slate-500">{e.destination}</span>
              <span className="text-xs text-slate-500">{e.entity_type} · {e.action}</span>
              {e.retry_count > 0 && (
                <span className="text-xs text-rose-600">retry: {e.retry_count}</span>
              )}
              <span className="text-slate-500 text-xs ml-auto">{new Date(e.created_at).toLocaleString('pt-BR')}</span>
            </div>
            {e.error_log && (
              <div className="mt-1 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded px-2 py-1 font-mono overflow-x-auto">
                {e.error_log}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function AlertsTab() {
  const [unresolvedOnly, setUnresolvedOnly] = useState(true)
  const { rows, loading, error, reload } = useListRpc<IntegrationAlert>(
    'platform_list_integration_alerts',
    { p_limit: 100, p_unresolved_only: unresolvedOnly }
  )
  return (
    <>
      <TabHeader loading={loading} onRefresh={reload} label={`${rows.length} alertas`} />
      <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs flex items-center gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={unresolvedOnly}
            onChange={(e) => setUnresolvedOnly(e.target.checked)}
            className="rounded"
          />
          Só não resolvidos
        </label>
      </div>
      {error && <div className="px-5 py-3 text-sm text-red-700 bg-red-50">{error}</div>}
      <div className="divide-y divide-slate-100 max-h-[calc(100vh-360px)] overflow-y-auto">
        {rows.length === 0 && !loading ? (
          <div className="px-5 py-8 text-sm text-emerald-600 text-center">Nenhum alerta ativo.</div>
        ) : rows.map((a) => (
          <div key={a.id} className="px-5 py-3 hover:bg-slate-50">
            <div className="flex items-center gap-3 text-sm">
              <AlertTriangle className={cn(
                'w-4 h-4',
                a.resolved_at ? 'text-slate-400' : 'text-amber-600'
              )} />
              <span className="font-medium text-slate-900">{a.rule_key}</span>
              <span className="text-xs text-slate-500">{a.org_name ?? '—'}</span>
              <span className="text-xs text-slate-500 ml-auto">{new Date(a.fired_at).toLocaleString('pt-BR')}</span>
            </div>
            {Object.keys(a.context ?? {}).length > 0 && (
              <pre className="mt-1 text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1 overflow-x-auto">
                {JSON.stringify(a.context, null, 2)}
              </pre>
            )}
            <div className="text-xs text-slate-500 mt-1">
              Status: {a.status}
              {a.acknowledged_at && ` · Reconhecido ${new Date(a.acknowledged_at).toLocaleDateString('pt-BR')}`}
              {a.resolved_at && ` · Resolvido ${new Date(a.resolved_at).toLocaleDateString('pt-BR')}`}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function PulseTab() {
  const { rows, loading, error, reload } = useListRpc<PulseEntry>('platform_list_integration_pulse')
  return (
    <>
      <TabHeader loading={loading} onRefresh={reload} label={`Saúde de ${rows.length} canais`} />
      {error && <div className="px-5 py-3 text-sm text-red-700 bg-red-50">{error}</div>}
      <div className="divide-y divide-slate-100 max-h-[calc(100vh-320px)] overflow-y-auto">
        {rows.length === 0 && !loading ? (
          <div className="px-5 py-8 text-sm text-slate-500 text-center">Nenhum canal monitorado.</div>
        ) : rows.map((p) => {
          const hasError24h = p.error_count_24h > 0
          return (
            <div key={p.channel} className="px-5 py-3 hover:bg-slate-50 flex items-center gap-4">
              <div className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                hasError24h ? 'bg-rose-500' : p.last_event_at ? 'bg-emerald-500' : 'bg-slate-300'
              )} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">{p.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  <code className="bg-slate-100 px-1 rounded">{p.channel}</code>
                  {p.last_event_at && (
                    <> · último evento {new Date(p.last_event_at).toLocaleString('pt-BR')}</>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-slate-600 flex-shrink-0">
                <div>24h: <strong>{p.event_count_24h}</strong> {hasError24h && <span className="text-rose-600">({p.error_count_24h} erros)</span>}</div>
                <div>7d: {p.event_count_7d}</div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
