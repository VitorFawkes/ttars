import { AlertTriangle, AlertCircle, Info, Clock, MessageSquare, Zap, ArrowUpRight, Building2, Timer } from 'lucide-react'
import { useHealthAlerts, type HealthAlert } from '@/hooks/useIntegrationHealth'

const SEVERITY_CONFIG = {
    critical: { icon: AlertCircle,  bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-700',    iconColor: 'text-red-500',    label: 'Critico' },
    warning:  { icon: AlertTriangle, bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-700',  iconColor: 'text-amber-500',  label: 'Aviso' },
    info:     { icon: Info,          bg: 'bg-blue-50',   border: 'border-blue-100',   text: 'text-blue-700',   iconColor: 'text-blue-500',   label: 'Info' },
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    whatsapp:       { label: 'WhatsApp',        icon: MessageSquare, color: 'text-green-600 bg-green-50' },
    activecampaign: { label: 'ActiveCampaign',  icon: Zap,           color: 'text-blue-600 bg-blue-50' },
    outbound:       { label: 'Outbound Sync',   icon: ArrowUpRight,  color: 'text-indigo-600 bg-indigo-50' },
    monde:          { label: 'Monde',           icon: Building2,     color: 'text-purple-600 bg-purple-50' },
    system:         { label: 'Sistema',         icon: Timer,         color: 'text-slate-600 bg-slate-100' },
}

function formatContextSummary(alert: HealthAlert): string {
    const ctx = alert.context
    if (ctx.hours_since != null && ctx.threshold_hours != null) {
        return `${ctx.hours_since}h sem atividade (limite configurado: ${ctx.threshold_hours}h)`
    }
    if (ctx.stuck_pending_count != null) {
        return `${ctx.stuck_pending_count} eventos pendentes ha mais de ${ctx.threshold_hours}h sem processamento`
    }
    if (ctx.stuck_count != null) {
        return `${ctx.stuck_count} itens parados ha mais de ${ctx.threshold_hours}h na fila`
    }
    if (ctx.overdue_count != null) {
        return `${ctx.overdue_count} itens atrasados aguardando execucao`
    }
    if (ctx.failed_count != null && ctx.total_count != null) {
        return `${ctx.failed_count} de ${ctx.total_count} falharam nas ultimas ${ctx.threshold_hours ?? 24}h (taxa: ${ctx.error_rate_percent ?? 0}%)`
    }
    if (ctx.failed_count != null) {
        return `${ctx.failed_count} falhas nas ultimas ${ctx.threshold_hours ?? 24}h`
    }
    return 'Condicao ativa — verificar integracao'
}

function formatContextDetail(alert: HealthAlert): string | null {
    const ctx = alert.context
    const parts: string[] = []

    if (ctx.last_event_at) {
        const d = new Date(String(ctx.last_event_at))
        parts.push(`Ultimo evento: ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`)
    }
    if (ctx.hours_since != null) {
        const h = Number(ctx.hours_since)
        if (h >= 24) {
            const days = Math.floor(h / 24)
            parts.push(`${days} dia${days > 1 ? 's' : ''} sem dados`)
        }
    }
    if (ctx.success_count != null) {
        parts.push(`Sucessos: ${ctx.success_count}`)
    }
    if (ctx.total_24h != null) {
        parts.push(`Total 24h: ${ctx.total_24h}`)
    }

    return parts.length > 0 ? parts.join(' · ') : null
}

function formatFullDate(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

function AlertRow({ alert }: { alert: HealthAlert }) {
    const severity = (alert.rule?.severity ?? 'warning') as keyof typeof SEVERITY_CONFIG
    const config = SEVERITY_CONFIG[severity]
    const Icon = config.icon
    const category = CATEGORY_CONFIG[alert.rule?.category ?? '']
    const detail = formatContextDetail(alert)

    return (
        <div className={`p-4 ${config.bg} border ${config.border} rounded-lg`}>
            {/* Linha 1: Categoria + Severidade + Tempo */}
            <div className="flex items-center gap-2 mb-2">
                {category && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${category.color}`}>
                        <category.icon className="w-3 h-3" />
                        {category.label}
                    </span>
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.text} border ${config.border}`}>
                    {config.label}
                </span>
                <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                    <Clock className="w-3 h-3" />
                    {formatFullDate(alert.fired_at)}
                </span>
            </div>

            {/* Linha 2: Titulo do alerta */}
            <div className="flex items-start gap-2.5">
                <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${config.iconColor}`} />
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${config.text}`}>
                        {alert.rule?.label ?? alert.rule_key}
                    </p>
                    {/* Descricao da regra */}
                    {alert.rule?.description && (
                        <p className="text-xs text-slate-500 mt-0.5">
                            {alert.rule.description}
                        </p>
                    )}
                    {/* Contexto detalhado */}
                    <p className="text-sm text-slate-700 mt-1.5 font-medium">
                        {formatContextSummary(alert)}
                    </p>
                    {/* Detalhes adicionais */}
                    {detail && (
                        <p className="text-xs text-slate-500 mt-1">
                            {detail}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function ActiveAlertsList() {
    const { data: alerts, isLoading } = useHealthAlerts(false)

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2].map(i => (
                    <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />
                ))}
            </div>
        )
    }

    if (!alerts?.length) {
        return (
            <div className="text-center py-8 text-sm text-slate-500">
                Nenhum alerta ativo. Todas as integracoes funcionando normalmente.
            </div>
        )
    }

    // Ordena por severidade: critical -> warning -> info
    const order = { critical: 0, warning: 1, info: 2 }
    const sorted = [...alerts].sort((a, b) => {
        const sa = order[(a.rule?.severity ?? 'info') as keyof typeof order] ?? 2
        const sb = order[(b.rule?.severity ?? 'info') as keyof typeof order] ?? 2
        return sa - sb
    })

    const criticalCount = sorted.filter(a => a.rule?.severity === 'critical').length
    const warningCount = sorted.filter(a => a.rule?.severity === 'warning').length

    return (
        <div className="space-y-3">
            {/* Resumo rapido */}
            {(criticalCount > 0 || warningCount > 0) && (
                <div className="flex items-center gap-3 text-xs">
                    {criticalCount > 0 && (
                        <span className="flex items-center gap-1 text-red-600 font-medium">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {criticalCount} critico{criticalCount > 1 ? 's' : ''}
                        </span>
                    )}
                    {warningCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {warningCount} aviso{warningCount > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            )}
            {sorted.map(alert => <AlertRow key={alert.id} alert={alert} />)}
        </div>
    )
}
