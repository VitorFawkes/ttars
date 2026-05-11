import { ArrowLeft, Activity, AlertTriangle, CheckCircle2, Clock, MessageSquare, Wrench, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAiAgentHealthStats, useAiAgentRecentErrors, type AiAgentHealthRow, type AiAgentErrorRow } from '@/hooks/useAiAgentHealth'
import { cn } from '@/lib/utils'

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function healthStatus(row: AiAgentHealthRow): { label: string; color: string; icon: typeof CheckCircle2 } {
  if (!row.ativa) return { label: 'Desligado', color: 'text-slate-500 bg-slate-100', icon: Clock }
  if (row.whatsapp_failed_24h > 5 || (row.tool_success_rate_pct ?? 100) < 70) {
    return { label: 'Atenção', color: 'text-red-700 bg-red-100', icon: AlertTriangle }
  }
  if ((row.tool_success_rate_pct ?? 100) < 90) {
    return { label: 'Mediano', color: 'text-amber-700 bg-amber-100', icon: AlertTriangle }
  }
  return { label: 'Saudável', color: 'text-emerald-700 bg-emerald-100', icon: CheckCircle2 }
}

export default function AiAgentHealthPage() {
  const navigate = useNavigate()
  const { data: stats = [], isLoading } = useAiAgentHealthStats()
  const { data: allErrors = [] } = useAiAgentRecentErrors()

  const errorsByAgent = allErrors.reduce<Record<string, AiAgentErrorRow[]>>((acc, err) => {
    acc[err.agent_id] = acc[err.agent_id] ?? []
    acc[err.agent_id].push(err)
    return acc
  }, {})

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings/ai-agents')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-500" />
            Saúde dos agentes IA
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Como cada agente está se comportando em tempo real. Atualiza a cada 60 segundos.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
          <div className="h-6 bg-slate-200 rounded w-48 animate-pulse mb-3" />
          <div className="h-4 bg-slate-100 rounded w-full animate-pulse" />
        </div>
      )}

      {!isLoading && stats.length === 0 && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-10 text-center">
          <p className="text-sm text-slate-500">Nenhum agente encontrado nesta conta.</p>
        </div>
      )}

      {stats.map(row => {
        const status = healthStatus(row)
        const StatusIcon = status.icon
        const errors = errorsByAgent[row.agent_id] ?? []
        return (
          <section key={row.agent_id} className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
            <header className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', status.color)}>
                  <StatusIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{row.agent_name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className={cn('text-xs', status.color)}>{status.label}</Badge>
                    {row.ativa ? (
                      <span className="text-xs text-slate-500">Ativo respondendo conversas</span>
                    ) : (
                      <span className="text-xs text-slate-400">Pausado</span>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/settings/ai-agents/${row.agent_id}`)}>
                Abrir configuração
              </Button>
            </header>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                icon={MessageSquare}
                label="Mensagens (24h)"
                value={row.user_turns_24h}
                hint={`${row.user_turns_7d} nos últimos 7 dias`}
              />
              <MetricCard
                icon={Activity}
                label="Respostas (24h)"
                value={row.agent_turns_24h}
                hint={formatTokens(row.input_tokens_24h + row.output_tokens_24h) + ' tokens'}
              />
              <MetricCard
                icon={Wrench}
                label="Ferramentas"
                value={`${row.tool_calls_24h - row.tool_failures_24h}/${row.tool_calls_24h}`}
                hint={row.tool_success_rate_pct != null ? `${row.tool_success_rate_pct}% sucesso` : '—'}
                tone={row.tool_failures_24h > 0 ? 'warning' : 'normal'}
              />
              <MetricCard
                icon={XCircle}
                label="Falhas WhatsApp"
                value={row.whatsapp_failed_24h}
                hint={row.whatsapp_blocked_test_24h > 0 ? `${row.whatsapp_blocked_test_24h} bloqueadas em teste` : '24h'}
                tone={row.whatsapp_failed_24h > 0 ? 'warning' : 'normal'}
              />
            </div>

            {row.conversations_24h > 0 && (
              <div className="flex flex-wrap gap-4 text-xs text-slate-500 border-t border-slate-100 pt-3">
                <span>Conversas 24h: <strong className="text-slate-900">{row.conversations_24h}</strong></span>
                {row.escalated_24h > 0 && (
                  <span className="text-amber-700">Escalações 24h: <strong>{row.escalated_24h}</strong></span>
                )}
              </div>
            )}

            {errors.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-medium text-slate-900 mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Últimos erros
                </h3>
                <div className="space-y-2">
                  {errors.map((err, i) => (
                    <div key={`${err.agent_id}-${err.created_at}-${i}`} className="flex items-start gap-3 text-xs p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <Badge variant="outline" className="text-[10px] uppercase flex-shrink-0">
                        {err.error_source === 'tool_failure' ? 'ferramenta' : 'whatsapp'}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-900 line-clamp-2">{err.error_message}</p>
                      </div>
                      <span className="text-slate-400 flex-shrink-0">há {formatRelative(err.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errors.length === 0 && row.ativa && row.conversations_24h > 0 && (
              <div className="border-t border-slate-100 pt-3 text-xs text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Sem erros nos últimos 7 dias.
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'normal',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
  tone?: 'normal' | 'warning'
}) {
  return (
    <div className={cn(
      'rounded-lg p-3 border',
      tone === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100',
    )}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn('w-3.5 h-3.5', tone === 'warning' ? 'text-amber-600' : 'text-slate-400')} />
        <p className="text-xs text-slate-500 font-medium">{label}</p>
      </div>
      <p className={cn('text-xl font-semibold tracking-tight mt-1', tone === 'warning' ? 'text-amber-900' : 'text-slate-900')}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}
