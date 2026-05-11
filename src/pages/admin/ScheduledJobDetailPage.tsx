import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Clock, CheckCircle2, AlertTriangle, PowerOff, Power,
  Loader2, ChevronRight, ExternalLink, Zap,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useScheduledJobs, useScheduledJobDetail } from '@/hooks/useScheduledJobs'

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
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

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export default function ScheduledJobDetailPage() {
  const { jobName } = useParams<{ jobName: string }>()
  const navigate = useNavigate()
  const { jobs, toggle } = useScheduledJobs()
  const { runs, targets, isLoading } = useScheduledJobDetail(jobName)

  const job = jobs.find(j => j.job_name === jobName)

  if (!job && jobs.length > 0) {
    return (
      <div className="max-w-4xl">
        <p className="text-sm text-slate-500">Processo não encontrado.</p>
        <Button variant="outline" onClick={() => navigate('/settings/operations/scheduled-jobs')} className="mt-4 gap-2">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
      </div>
    )
  }

  const succeededRuns = runs.filter(r => r.status === 'succeeded').length
  const failedRuns = runs.filter(r => r.status === 'failed').length

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/settings/operations/scheduled-jobs')}
          className="gap-2 mb-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" /> Processos Agendados
        </Button>

        {job && (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{job.label}</h1>
              {job.description && (
                <p className="text-sm text-slate-500 mt-1">{job.description}</p>
              )}
              <div className="flex items-center gap-3 mt-3 text-xs text-slate-500 flex-wrap">
                {job.frequency_label && (
                  <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{job.frequency_label}</Badge>
                )}
                {!job.cron_registered && (
                  <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                    <AlertTriangle className="w-3 h-3 mr-1" />Não agendado
                  </Badge>
                )}
                <span>Última execução: {formatRelative(job.last_run_started_at)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {job.is_enabled ? <Power className="w-5 h-5 text-green-500" /> : <PowerOff className="w-5 h-5 text-slate-400" />}
              <Switch
                checked={job.is_enabled}
                disabled={toggle.isPending}
                onCheckedChange={(v) => {
                  toggle.mutate(
                    { jobName: job.job_name, isEnabled: v },
                    {
                      onSuccess: () => toast.success(v ? 'Processo retomado' : 'Processo pausado'),
                      onError: () => toast.error('Erro ao atualizar'),
                    }
                  )
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Regras / items que este processo executa */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-500" />
              Regras que este processo executa
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {targets.length === 0 ? 'Nada configurado' : `${targets.length} ${targets.length === 1 ? 'item' : 'items'}`}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /></div>
        ) : targets.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Este processo não tem regras configuradas no momento.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {targets.map(t => {
              const content = (
                <div className="flex items-start justify-between gap-4 p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        t.is_active ? 'bg-green-500' : 'bg-slate-300'
                      )} />
                      <p className="text-sm font-medium text-slate-900 truncate">{t.target_label}</p>
                      {t.status_label && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px]',
                            t.status_label === 'Ativa' || t.status_label === 'Ativo' || t.status_label === 'success' ? 'text-green-700 border-green-200 bg-green-50' :
                            t.status_label === 'Pausada' || t.status_label === 'Pausado' || t.status_label === 'cancelled' ? 'text-slate-600' :
                            t.status_label === 'failed' ? 'text-red-700 border-red-200 bg-red-50' :
                            'text-slate-600'
                          )}
                        >
                          {t.status_label}
                        </Badge>
                      )}
                    </div>
                    {t.target_sublabel && (
                      <p className="text-xs text-slate-500 mt-1 ml-4">{t.target_sublabel}</p>
                    )}
                    {t.last_activity_at && (
                      <p className="text-xs text-slate-400 mt-1 ml-4">
                        Atualizado {formatRelative(t.last_activity_at)}
                      </p>
                    )}
                  </div>
                  {t.link_path && (
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />
                  )}
                </div>
              )
              return t.link_path ? (
                <Link key={`${t.target_kind}-${t.target_id}`} to={t.link_path} className="block">
                  {content}
                </Link>
              ) : (
                <div key={`${t.target_kind}-${t.target_id}`}>{content}</div>
              )
            })}
          </div>
        )}
      </section>

      {/* Últimas execuções */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            Últimas execuções
            {runs.length > 0 && (
              <span className="text-xs text-slate-400 font-normal">
                ({succeededRuns} ok, {failedRuns} falhas em {runs.length} rodadas)
              </span>
            )}
          </h2>
        </div>

        {isLoading ? (
          <div className="p-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /></div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Nenhuma execução registrada ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-600 text-xs uppercase tracking-wider">Quando</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600 text-xs uppercase tracking-wider">Duração</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600 text-xs uppercase tracking-wider">Mensagem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-slate-700 whitespace-nowrap">
                      {formatAbsolute(r.start_time)}
                      <span className="text-xs text-slate-400 ml-2">{formatRelative(r.start_time)}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{formatDuration(r.duration_ms)}</td>
                    <td className="px-4 py-2">
                      {r.status === 'succeeded' ? (
                        <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Sucesso
                        </span>
                      ) : r.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Falhou
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">{r.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500 font-mono max-w-md truncate">
                      {r.return_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {job && (
        <div className="text-xs text-slate-400 flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          Nome técnico: <code className="font-mono">{job.job_name}</code>
        </div>
      )}
    </div>
  )
}
