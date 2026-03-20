import { usePushNotifications, type NotificationType } from '@/hooks/usePushNotifications'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { UserPlus, Clock, AlertTriangle, FileText, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const NOTIFICATION_TYPES: {
  key: NotificationType
  label: string
  description: string
  icon: React.ElementType
}[] = [
  {
    key: 'lead_assigned',
    label: 'Novo lead atribuido',
    description: 'Quando um card e atribuido a voce',
    icon: UserPlus,
  },
  {
    key: 'task_expiring',
    label: 'Tarefa vence em breve',
    description: 'Quando uma tarefa vence nos proximos 60 minutos',
    icon: Clock,
  },
  {
    key: 'task_overdue',
    label: 'Tarefa atrasada',
    description: 'Quando uma tarefa passa do prazo sem ser concluida',
    icon: AlertTriangle,
  },
  {
    key: 'proposal_status',
    label: 'Proposta atualizada',
    description: 'Quando o cliente visualiza, aceita ou rejeita uma proposta',
    icon: FileText,
  },
  {
    key: 'meeting_reminder',
    label: 'Lembrete de reuniao',
    description: '30 minutos antes de uma reuniao agendada',
    icon: Calendar,
  },
]

export default function NotificationSettings() {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    preferences,
    subscribe,
    unsubscribe,
    updatePreference,
  } = usePushNotifications()

  const handleMasterToggle = async () => {
    if (isSubscribed) {
      const ok = await unsubscribe()
      if (ok) toast.info('Notificacoes push desativadas')
    } else {
      const ok = await subscribe()
      if (ok) {
        toast.success('Notificacoes push ativadas!')
      } else {
        toast.error('Nao foi possivel ativar. Verifique as permissoes do navegador.')
      }
    }
  }

  const handleTypeToggle = async (key: NotificationType, current: boolean) => {
    const ok = await updatePreference(key, !current)
    if (!ok) {
      toast.error('Erro ao salvar preferencia')
    }
  }

  if (!isSupported) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-sm">Seu navegador nao suporta notificacoes push.</p>
        <p className="text-xs mt-1">Use Chrome, Edge, Firefox ou Safari para ativar.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-slate-50">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Notificacoes push no desktop</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Receba alertas mesmo com o CRM fechado (o navegador precisa estar aberto)
          </p>
        </div>
        <Switch
          checked={isSubscribed && preferences.enabled}
          onCheckedChange={handleMasterToggle}
          disabled={isLoading}
        />
      </div>

      {/* Per-type toggles */}
      <div>
        <h4 className="text-sm font-medium text-slate-700 mb-3">Tipos de notificacao</h4>
        <div className="space-y-1">
          {NOTIFICATION_TYPES.map(({ key, label, description, icon: Icon }) => {
            const enabled = preferences[key]
            const disabled = !isSubscribed || !preferences.enabled || isLoading

            return (
              <div
                key={key}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg transition-colors',
                  disabled ? 'opacity-50' : 'hover:bg-slate-50'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    disabled ? 'bg-slate-100' : 'bg-indigo-50'
                  )}>
                    <Icon className={cn('w-4 h-4', disabled ? 'text-slate-400' : 'text-indigo-600')} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500">{description}</p>
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={() => handleTypeToggle(key, enabled)}
                  disabled={disabled}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Info footer */}
      {isSubscribed && preferences.enabled && (
        <p className="text-xs text-slate-400 text-center pt-2">
          As notificacoes aparecem no desktop do navegador, mesmo com a aba do CRM fechada.
        </p>
      )}
    </div>
  )
}
