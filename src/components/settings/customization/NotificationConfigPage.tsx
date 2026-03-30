import { Bell } from 'lucide-react'
import { useNotificationConfig } from '@/hooks/useNotificationConfig'
import { NOTIFICATION_TYPE_REGISTRY } from '@/lib/notificationTypeRegistry'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function NotificationConfigPage() {
    const { configs, isLoading, toggleType } = useNotificationConfig()

    const handleToggle = (id: string, currentEnabled: boolean) => {
        toggleType.mutate(
            { id, enabled: !currentEnabled },
            {
                onSuccess: () => toast.success(!currentEnabled ? 'Tipo ativado' : 'Tipo desativado'),
                onError: () => toast.error('Erro ao atualizar'),
            }
        )
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto py-8 px-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <Bell className="h-5 w-5 text-indigo-600" />
                    Notificações
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Configure quais tipos de notificação in-app estão ativos para todos os usuários.
                    Cada usuário pode configurar suas próprias preferências de push no perfil.
                </p>
            </div>

            {/* Types list */}
            <div className="space-y-1">
                {configs.map(config => {
                    const registry = NOTIFICATION_TYPE_REGISTRY[config.type_key]
                    const Icon = registry?.icon ?? Bell
                    const color = registry?.color ?? 'text-slate-600 bg-slate-100'
                    const [textColor, bgColor] = color.split(' ')

                    return (
                        <div
                            key={config.id}
                            className={cn(
                                'flex items-center justify-between p-4 rounded-lg transition-colors',
                                config.enabled ? 'hover:bg-slate-50' : 'opacity-60'
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', bgColor)}>
                                    <Icon className={cn('w-4 h-4', textColor)} />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-900">{config.label}</p>
                                    <p className="text-xs text-slate-500">{config.description}</p>
                                </div>
                            </div>
                            <Switch
                                checked={config.enabled}
                                onCheckedChange={() => handleToggle(config.id, config.enabled)}
                                disabled={toggleType.isPending}
                            />
                        </div>
                    )
                })}
            </div>

            {configs.length === 0 && (
                <div className="text-center py-12 text-sm text-slate-400">
                    Nenhum tipo de notificação configurado.
                </div>
            )}

            {/* Info */}
            <div className="mt-8 p-4 rounded-lg border border-slate-200 bg-slate-50">
                <p className="text-xs text-slate-500">
                    Desativar um tipo aqui impede que novas notificações desse tipo sejam criadas para <strong>todos</strong> os usuários.
                    Notificações já existentes continuam visíveis. Push notifications no desktop são controladas individualmente por cada usuário em seu perfil.
                </p>
            </div>
        </div>
    )
}
