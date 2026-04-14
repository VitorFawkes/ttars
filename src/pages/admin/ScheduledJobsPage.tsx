import { useState } from 'react'
import {
  Clock, AlertTriangle, CheckCircle2, PowerOff, Power,
  MessageSquare, Repeat, ArrowRightLeft, Users, Calendar,
  Loader2,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useScheduledJobs, type ScheduledJob } from '@/hooks/useScheduledJobs'

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  messaging:   { label: 'Mensagens',         icon: MessageSquare,   color: 'text-blue-600' },
  cadence:     { label: 'Cadências',         icon: Repeat,          color: 'text-purple-600' },
  routing:     { label: 'Roteamento',        icon: ArrowRightLeft,  color: 'text-teal-600' },
  sync:        { label: 'Sincronização',     icon: Users,           color: 'text-amber-600' },
  opportunity: { label: 'Oportunidades',     icon: Calendar,        color: 'text-indigo-600' },
  other:       { label: 'Outros',            icon: Clock,           color: 'text-slate-600' },
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'nunca executou'
  const diffMs = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diffMs / 1000)
  if (secs < 60) return 'há segundos'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

export default function ScheduledJobsPage() {
  const { jobs, isLoading, toggle, stopAll } = useScheduledJobs()
  const [confirmStop, setConfirmStop] = useState(false)

  const grouped = jobs.reduce<Record<string, ScheduledJob[]>>((acc, j) => {
    const key = j.category || 'other'
    if (!acc[key]) acc[key] = []
    acc[key].push(j)
    return acc
  }, {})

  const enabledCount = jobs.filter(j => j.is_enabled).length
  const totalCount = jobs.length

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Processos Agendados</h1>
        <p className="text-sm text-slate-500 mt-1">
          Jobs que rodam em intervalos fixos no servidor e podem disparar mensagens, mover cards ou sincronizar dados.
          Desligar aqui pausa o processo na próxima execução — nenhuma intervenção técnica necessária.
        </p>
      </div>

      {/* Barra de status + parar tudo */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-2.5 h-2.5 rounded-full',
              enabledCount === totalCount ? 'bg-green-500 animate-pulse' :
              enabledCount === 0 ? 'bg-red-500' : 'bg-amber-500'
            )} />
            <div>
              <p className="text-sm font-medium text-slate-900">
                {enabledCount} de {totalCount} processos ativos
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {enabledCount === totalCount && 'Todos os processos estão rodando normalmente.'}
                {enabledCount === 0 && 'Tudo parado. Sistema em modo de contenção.'}
                {enabledCount > 0 && enabledCount < totalCount && 'Alguns processos foram pausados manualmente.'}
              </p>
            </div>
          </div>

          {!confirmStop ? (
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 gap-2"
              onClick={() => setConfirmStop(true)}
              disabled={enabledCount === 0}
            >
              <PowerOff className="w-4 h-4" />
              Parar tudo
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 font-medium">Tem certeza?</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmStop(false)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 gap-1.5"
                disabled={stopAll.isPending}
                onClick={() => {
                  stopAll.mutate(undefined, {
                    onSuccess: (count) => {
                      toast.success(`${count} processos pausados`)
                      setConfirmStop(false)
                    },
                    onError: () => toast.error('Erro ao pausar processos'),
                  })
                }}
              >
                {stopAll.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <PowerOff className="w-3 h-3" />}
                Parar tudo agora
              </Button>
            </div>
          )}
        </div>
      </section>

      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
        </div>
      ) : (
        Object.entries(grouped).map(([category, list]) => {
          const meta = CATEGORY_META[category] || CATEGORY_META.other
          const Icon = meta.icon
          return (
            <section key={category} className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <Icon className={cn('w-4 h-4', meta.color)} />
                <h2 className="text-sm font-semibold text-slate-900">{meta.label}</h2>
                <span className="text-xs text-slate-400">({list.length})</span>
              </div>

              <div className="divide-y divide-slate-100">
                {list.map(job => (
                  <div key={job.job_name} className="flex items-start justify-between p-4 gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-900">{job.label}</p>
                        {job.frequency_label && (
                          <Badge variant="outline" className="text-[10px]">
                            <Clock className="w-2.5 h-2.5 mr-1" />
                            {job.frequency_label}
                          </Badge>
                        )}
                        {!job.cron_registered && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">
                            <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                            não agendado
                          </Badge>
                        )}
                      </div>
                      {job.description && (
                        <p className="text-xs text-slate-500 mt-1">{job.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          {job.last_run_status === 'succeeded' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                          {job.last_run_status === 'failed' && <AlertTriangle className="w-3 h-3 text-red-500" />}
                          {!job.last_run_status && <Clock className="w-3 h-3" />}
                          Última execução: {formatRelative(job.last_run_started_at)}
                        </span>
                        {!job.is_enabled && job.last_toggled_at && (
                          <span className="flex items-center gap-1 text-red-600">
                            <PowerOff className="w-3 h-3" />
                            Pausado {formatRelative(job.last_toggled_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {job.is_enabled ? (
                        <Power className="w-4 h-4 text-green-500" />
                      ) : (
                        <PowerOff className="w-4 h-4 text-slate-300" />
                      )}
                      <Switch
                        checked={job.is_enabled}
                        disabled={toggle.isPending}
                        onCheckedChange={(v) => {
                          toggle.mutate(
                            { jobName: job.job_name, isEnabled: v },
                            {
                              onSuccess: () => toast.success(v ? 'Processo retomado' : 'Processo pausado'),
                              onError: () => toast.error('Erro ao atualizar processo'),
                            }
                          )
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
