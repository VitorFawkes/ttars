import { useMemo } from 'react'
import { Loader2, CheckCircle2, RefreshCw, AlertOctagon, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAiAgentHealthStats, useAiAgentRecentErrors } from '@/hooks/useAiAgentHealth'
import { useAgentConfigChecks } from './useAgentConfigChecks'
import { HealthAlertCard } from './HealthAlertCard'
import type { HealthAlert, HealthSeverity } from './types'

interface Props {
  agentId: string
  /** Callback opcional pra navegar à aba relevante quando admin clica "Ir resolver". */
  onNavigate?: (target: HealthAlert['navigateTo']) => void
}

/**
 * Aba "Saúde" da redesign UI v3 — pré-flight check + diagnóstico ao vivo.
 *
 * Combina três fontes:
 *   1. Inconsistências de configuração detectadas no cliente (useAgentConfigChecks)
 *   2. Stats de execução das últimas 24h/7d (view ai_agent_health_stats)
 *   3. Erros recentes (view ai_agent_recent_errors)
 *
 * Não modifica nada — só leitura. Pode ser deixada aberta o tempo todo.
 */
export function HealthSection({ agentId, onNavigate }: Props) {
  const { alerts, isLoading: configLoading, countBySeverity } = useAgentConfigChecks(agentId)
  const { data: allStats, isLoading: statsLoading } = useAiAgentHealthStats()
  const { data: allErrors, isLoading: errorsLoading } = useAiAgentRecentErrors()

  const stats = useMemo(() => allStats?.find(s => s.agent_id === agentId) ?? null, [allStats, agentId])
  const errors = useMemo(() => (allErrors ?? []).filter(e => e.agent_id === agentId), [allErrors, agentId])

  if (configLoading) {
    return (
      <div className="py-12 text-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin inline" />
      </div>
    )
  }

  const totalAlerts = alerts.length
  const overallStatus = getOverallStatus(countBySeverity)

  // Agrupa alertas por severidade
  const grouped = groupBySeverity(alerts)

  return (
    <div className="space-y-6">
      {/* ── Status geral ──────────────────────────────────────────────── */}
      <header className={cn(
        'rounded-xl border p-4',
        overallStatus.bgClass,
        overallStatus.borderClass,
      )}>
        <div className="flex items-start gap-3">
          <overallStatus.Icon className={cn('w-6 h-6 mt-0.5', overallStatus.iconClass)} />
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900 tracking-tight">{overallStatus.title}</h3>
            <p className="text-sm text-slate-600 mt-0.5">{overallStatus.subtitle}</p>
            {totalAlerts > 0 && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {countBySeverity.blocker > 0 && (
                  <span className="text-rose-700 font-medium">
                    {countBySeverity.blocker} {countBySeverity.blocker > 1 ? 'bloqueios' : 'bloqueio'}
                  </span>
                )}
                {countBySeverity.warning > 0 && (
                  <span className="text-amber-700 font-medium">
                    {countBySeverity.warning} {countBySeverity.warning > 1 ? 'avisos' : 'aviso'}
                  </span>
                )}
                {countBySeverity.info > 0 && (
                  <span className="text-slate-500">
                    {countBySeverity.info} {countBySeverity.info > 1 ? 'sugestões' : 'sugestão'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Alertas ───────────────────────────────────────────────────── */}
      {totalAlerts > 0 && (
        <section className="space-y-3">
          {grouped.map(({ severity, items }) => (
            <div key={severity} className="space-y-2">
              {items.map(alert => (
                <HealthAlertCard
                  key={alert.id}
                  alert={alert}
                  onResolve={alert.navigateTo && onNavigate ? () => onNavigate(alert.navigateTo) : undefined}
                />
              ))}
            </div>
          ))}
        </section>
      )}

      {/* ── Histórico de execuções (24h / 7d) ─────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-slate-500" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900">Histórico de execuções</h3>
            <p className="text-xs text-slate-500 mt-0.5">Atividade real da agente em produção</p>
          </div>
          {statsLoading && (
            <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              carregando
            </span>
          )}
        </header>
        <div className="p-4">
          {statsLoading && !stats ? (
            <p className="text-sm text-slate-400 text-center py-6 inline-flex items-center justify-center gap-2 w-full">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando estatísticas...
            </p>
          ) : !stats ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Sem atividade registrada ainda.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat label="Conversas (24h)" value={stats.conversations_24h} />
              <Stat label="Respostas (24h)" value={stats.agent_turns_24h} />
              <Stat label="Conversas (7d)" value={stats.user_turns_7d} />
              <Stat label="Encaminhadas (24h)" value={stats.escalated_24h} />
              <Stat
                label="Falhas WA (24h)"
                value={stats.whatsapp_failed_24h}
                tone={stats.whatsapp_failed_24h > 0 ? 'warning' : 'normal'}
              />
              <Stat
                label="Falhas tool (24h)"
                value={stats.tool_failures_24h}
                tone={stats.tool_failures_24h > 0 ? 'warning' : 'normal'}
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Erros recentes ────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-slate-500" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900">Erros recentes</h3>
            <p className="text-xs text-slate-500 mt-0.5">Últimos 5 erros do sistema/ferramentas</p>
          </div>
          {errorsLoading && (
            <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              carregando
            </span>
          )}
        </header>
        <div className="p-4">
          {errors.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              Nenhum erro recente.
            </div>
          ) : (
            <ul className="space-y-2 text-xs">
              {errors.map((e, i) => (
                <li key={i} className="rounded border border-slate-200 p-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                    <span className="font-medium text-slate-900 truncate">{translateErrorSource(e.error_source)}</span>
                    <span className="text-slate-400 text-[11px] flex-shrink-0">
                      {new Date(e.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-1 line-clamp-3">{e.error_message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function Stat({
  label, value, tone = 'normal',
}: {
  label: string
  value: number
  tone?: 'normal' | 'warning'
}) {
  return (
    <div className="min-w-0">
      <div className={cn(
        'text-2xl font-semibold tracking-tight',
        tone === 'warning' && value > 0 ? 'text-amber-600' : 'text-slate-900',
      )}>
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-0.5 truncate" title={label}>{label}</div>
    </div>
  )
}

function getOverallStatus(c: { blocker: number; warning: number; info: number }) {
  if (c.blocker > 0) {
    return {
      title: 'Atenção urgente',
      subtitle: 'Há configuração que pode bloquear o funcionamento da agente. Resolva antes de ativar em produção.',
      Icon: AlertOctagon,
      iconClass: 'text-rose-600',
      bgClass: 'bg-rose-50/40',
      borderClass: 'border-rose-200',
    }
  }
  if (c.warning > 0) {
    return {
      title: 'Funciona, mas com avisos',
      subtitle: 'A agente está rodando, mas há inconsistências que podem afetar a qualidade das respostas.',
      Icon: RefreshCw,
      iconClass: 'text-amber-600',
      bgClass: 'bg-amber-50/40',
      borderClass: 'border-amber-200',
    }
  }
  if (c.info > 0) {
    return {
      title: 'Tudo funcionando',
      subtitle: 'Algumas sugestões opcionais pra melhorar.',
      Icon: CheckCircle2,
      iconClass: 'text-emerald-600',
      bgClass: 'bg-emerald-50/40',
      borderClass: 'border-emerald-200',
    }
  }
  return {
    title: 'Tudo funcionando',
    subtitle: 'Configuração consistente. Sem alertas detectados.',
    Icon: CheckCircle2,
    iconClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50/40',
    borderClass: 'border-emerald-200',
  }
}

function groupBySeverity(alerts: HealthAlert[]): Array<{ severity: HealthSeverity; items: HealthAlert[] }> {
  const order: HealthSeverity[] = ['blocker', 'warning', 'info']
  return order
    .map(severity => ({ severity, items: alerts.filter(a => a.severity === severity) }))
    .filter(g => g.items.length > 0)
}

// Catálogo de tradução de error_source. Sempre que adicionar uma nova
// origem de erro no banco/edge function, atualizar aqui.
const ERROR_SOURCE_LABELS: Record<string, string> = {
  tool_failure: 'Falha em ferramenta',
  whatsapp_send: 'Erro de envio WhatsApp',
  llm_call: 'Erro do modelo de IA',
  llm_timeout: 'Timeout do modelo de IA',
  rate_limit: 'Limite de uso atingido',
  validator_block: 'Resposta bloqueada pelo validador',
  validator_correct: 'Resposta corrigida pelo validador',
  edge_function_error: 'Erro interno do agente',
  rpc_error: 'Erro em consulta ao banco',
  webhook_failed: 'Webhook externo falhou',
  prompt_too_long: 'Prompt longo demais (truncado)',
  invalid_response: 'Resposta inválida do modelo',
  network_error: 'Erro de conexão',
  unknown: 'Erro desconhecido',
}

function translateErrorSource(s: string): string {
  if (s in ERROR_SOURCE_LABELS) return ERROR_SOURCE_LABELS[s]
  // Fallback: humaniza snake_case ("api_timeout" → "Api timeout")
  return s
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase())
}
