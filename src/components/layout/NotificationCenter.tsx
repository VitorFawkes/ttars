import { Bell, AlertCircle, AlertTriangle, Info, MessageSquare, Zap, ArrowUpRight, Building2, Timer, BellRing } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHealthAlerts, type HealthAlert } from '@/hooks/useIntegrationHealth'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { toast } from 'sonner'

const SEVERITY_ICON = {
    critical: { icon: AlertCircle,   color: 'text-red-500' },
    warning:  { icon: AlertTriangle, color: 'text-amber-500' },
    info:     { icon: Info,          color: 'text-blue-500' },
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    whatsapp:       { label: 'WhatsApp',       icon: MessageSquare, color: 'text-green-600 bg-green-50' },
    activecampaign: { label: 'ActiveCampaign', icon: Zap,           color: 'text-blue-600 bg-blue-50' },
    outbound:       { label: 'Outbound',       icon: ArrowUpRight,  color: 'text-indigo-600 bg-indigo-50' },
    monde:          { label: 'Monde',          icon: Building2,     color: 'text-purple-600 bg-purple-50' },
    system:         { label: 'Sistema',        icon: Timer,         color: 'text-slate-600 bg-slate-100' },
}

function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
}

function alertSummary(alert: HealthAlert): string {
    const ctx = alert.context
    if (ctx.hours_since != null && ctx.threshold_hours != null) {
        const h = Number(ctx.hours_since)
        if (h >= 24) {
            const days = Math.floor(h / 24)
            return `${days} dia${days > 1 ? 's' : ''} sem atividade (limite: ${ctx.threshold_hours}h)`
        }
        return `${ctx.hours_since}h sem atividade (limite: ${ctx.threshold_hours}h)`
    }
    if (ctx.stuck_pending_count != null || ctx.stuck_count != null) {
        const count = ctx.stuck_pending_count ?? ctx.stuck_count
        return `${count} itens parados ha ${ctx.threshold_hours ?? '?'}h+`
    }
    if (ctx.overdue_count != null) {
        return `${ctx.overdue_count} itens atrasados na fila`
    }
    if (ctx.failed_count != null && ctx.error_rate_percent != null) {
        return `${ctx.failed_count} falhas (${ctx.error_rate_percent}% de erro)`
    }
    if (ctx.failed_count != null) {
        return `${ctx.failed_count} falhas recentes`
    }
    return 'Atencao necessaria'
}

function alertDetail(alert: HealthAlert): string | null {
    const ctx = alert.context
    if (ctx.last_event_at) {
        const d = new Date(String(ctx.last_event_at))
        return `Ultimo: ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
    }
    return null
}

function AlertItem({ alert, onNavigate }: { alert: HealthAlert; onNavigate: () => void }) {
    const severity = (alert.rule?.severity ?? 'warning') as keyof typeof SEVERITY_ICON
    const config = SEVERITY_ICON[severity]
    const Icon = config.icon
    const isUnread = alert.status === 'active'
    const category = CATEGORY_CONFIG[alert.rule?.category ?? '']
    const detail = alertDetail(alert)

    return (
        <div
            className={cn(
                'p-3 hover:bg-slate-50 transition-colors cursor-pointer',
                isUnread && 'bg-blue-50/50'
            )}
            onClick={onNavigate}
        >
            <div className="flex gap-2.5">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', config.color)} />
                <div className="flex-1 min-w-0">
                    {/* Categoria + Tempo */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                        {category && (
                            <span className={cn('text-[9px] font-bold px-1.5 py-0 rounded', category.color)}>
                                {category.label}
                            </span>
                        )}
                        <span className="text-[11px] text-slate-400 ml-auto">
                            {formatTimeAgo(alert.fired_at)}
                        </span>
                    </div>
                    {/* Nome da regra */}
                    <p className={cn('text-sm text-slate-900 leading-snug', isUnread && 'font-semibold')}>
                        {alert.rule?.label ?? alert.rule_key}
                    </p>
                    {/* Resumo do contexto */}
                    <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                        {alertSummary(alert)}
                    </p>
                    {/* Detalhe extra */}
                    {detail && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {detail}
                        </p>
                    )}
                </div>
                {isUnread && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                )}
            </div>
        </div>
    )
}

export default function NotificationCenter({ triggerClassName }: { triggerClassName?: string }) {
    const [isOpen, setIsOpen] = useState(false)
    const navigate = useNavigate()
    const { data: alerts } = useHealthAlerts(false)
    const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications()

    const unreadCount = alerts?.filter(a => a.status === 'active').length ?? 0
    const criticalCount = alerts?.filter(a => a.rule?.severity === 'critical').length ?? 0

    const handleNavigateToHealth = () => {
        setIsOpen(false)
        navigate('/settings/operations/health?tab=integrations')
    }

    const handleTogglePush = async () => {
        if (pushSubscribed) {
            const ok = await pushUnsubscribe()
            if (ok) toast.info('Notificacoes push desativadas')
        } else {
            const ok = await pushSubscribe()
            if (ok) {
                toast.success('Notificacoes push ativadas!')
            } else {
                toast.error('Nao foi possivel ativar. Verifique as permissoes do navegador.')
            }
        }
    }

    return (
        <div className="relative">
            <Button
                variant="ghost"
                size="icon"
                className={cn('relative text-gray-500 hover:text-gray-700', triggerClassName)}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className={cn(
                        'absolute top-2 right-2 h-2 w-2 rounded-full ring-2 ring-white',
                        criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500'
                    )} />
                )}
            </Button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-0 bottom-full mb-2 w-96 z-50 rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 duration-100">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                            <h3 className="text-sm font-semibold text-slate-900">Alertas de Integracao</h3>
                            {unreadCount > 0 && (
                                <span className={cn(
                                    'text-xs font-medium px-2 py-0.5 rounded-full',
                                    criticalCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                )}>
                                    {unreadCount} ativo{unreadCount > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        {/* Push notifications toggle */}
                        {pushSupported && (
                            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <BellRing className={cn('w-4 h-4', pushSubscribed ? 'text-indigo-600' : 'text-slate-400')} />
                                    <span className="text-sm text-slate-700">Notificacoes push</span>
                                </div>
                                <button
                                    onClick={handleTogglePush}
                                    disabled={pushLoading}
                                    className={cn(
                                        'text-xs font-medium px-3 py-1 rounded-full transition-colors',
                                        pushSubscribed
                                            ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                                        pushLoading && 'opacity-50 cursor-not-allowed'
                                    )}
                                >
                                    {pushLoading ? '...' : pushSubscribed ? 'Ativado' : 'Ativar'}
                                </button>
                            </div>
                        )}

                        <div className="max-h-96 overflow-y-auto">
                            {!alerts?.length ? (
                                <div className="p-6 text-center text-sm text-slate-500">
                                    Nenhum alerta ativo. Integracoes funcionando.
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {alerts.map(alert => (
                                        <AlertItem
                                            key={alert.id}
                                            alert={alert}
                                            onNavigate={handleNavigateToHealth}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                        {(alerts?.length ?? 0) > 0 && (
                            <div className="border-t border-slate-100 p-2">
                                <button
                                    onClick={handleNavigateToHealth}
                                    className="w-full text-center text-xs text-blue-600 hover:text-blue-800 font-medium py-1.5"
                                >
                                    Ver todos os detalhes
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
