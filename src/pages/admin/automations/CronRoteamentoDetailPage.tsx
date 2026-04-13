import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Timer, Plane, ArrowRightLeft, CheckCircle2, Clock,
  ListChecks, CalendarRange, Save, Loader2,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'


interface RoteamentoStats {
  moved: number
  skipped: number
  errors: number
  run_at: string
}

interface RecentLog {
  card_id: string
  from_stage: string
  to_stage: string
  travel_start: string
  travel_end: string
  days_to_start: number
  created_at: string
  card_titulo?: string
}

const RULES = [
  {
    icon: CalendarRange,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    label: 'Mais de 30 dias para a viagem',
    target: 'Pré-embarque — >>> 30 dias',
  },
  {
    icon: Clock,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    label: 'Menos de 30 dias para a viagem',
    target: 'Pré-Embarque — <<< 30 dias',
  },
  {
    icon: Plane,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    label: 'Viagem em andamento',
    target: 'Em Viagem',
  },
  {
    icon: CheckCircle2,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    label: 'Viagem encerrada',
    target: 'Pós-viagem & Reativação',
  },
]

export default function CronRoteamentoDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [name, setName] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [description, setDescription] = useState('')
  const [lastRun, setLastRun] = useState<RoteamentoStats | null>(null)
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([])

  // Carregar dados do trigger
  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any
      const { data, error } = await sb
        .from('cadence_event_triggers')
        .select('id, name, is_active, action_config, event_type')
        .eq('id', id)
        .single()

      if (error || !data) {
        toast.error('Automação não encontrada')
        navigate('/settings/automations')
        return
      }

      if (data.event_type !== 'cron_roteamento') {
        navigate(`/settings/automations/trigger/${id}`)
        return
      }

      setName(data.name || '')
      setIsActive(data.is_active)
      setDescription(data.action_config?.description || '')

      // Buscar últimos logs de execução
      const { data: logs } = await sb
        .from('cadence_event_log')
        .select('card_id, event_data, created_at')
        .eq('event_source', 'cron_roteamento_pos_venda')
        .order('created_at', { ascending: false })
        .limit(10)

      if (logs && logs.length > 0) {
        setRecentLogs(
          logs.map((l: { card_id: string; event_data: Record<string, unknown>; created_at: string }) => ({
            card_id: l.card_id,
            from_stage: (l.event_data?.from_stage as string) || '?',
            to_stage: (l.event_data?.to_stage as string) || '?',
            travel_start: (l.event_data?.travel_start as string) || '?',
            travel_end: (l.event_data?.travel_end as string) || '?',
            days_to_start: (l.event_data?.days_to_start as number) ?? 0,
            created_at: l.created_at,
          }))
        )
      }

      setLoading(false)
    }
    load()
  }, [id, navigate])

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('cadence_event_triggers')
      .update({
        name,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    setSaving(false)
    if (error) {
      toast.error('Erro ao salvar')
    } else {
      toast.success('Salvo com sucesso')
    }
  }

  const handleRunNow = async () => {
    setRunning(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_roteamento_pos_venda_trips')
      if (error) throw error
      setLastRun(data as RoteamentoStats)
      toast.success(`Roteamento executado: ${data?.moved || 0} caso(s) movido(s)`)

      // Recarregar logs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: logs } = await (supabase as any)
        .from('cadence_event_log')
        .select('card_id, event_data, created_at')
        .eq('event_source', 'cron_roteamento_pos_venda')
        .order('created_at', { ascending: false })
        .limit(10)

      if (logs) {
        setRecentLogs(
          logs.map((l: { card_id: string; event_data: Record<string, unknown>; created_at: string }) => ({
            card_id: l.card_id,
            from_stage: (l.event_data?.from_stage as string) || '?',
            to_stage: (l.event_data?.to_stage as string) || '?',
            travel_start: (l.event_data?.travel_start as string) || '?',
            travel_end: (l.event_data?.travel_end as string) || '?',
            days_to_start: (l.event_data?.days_to_start as number) ?? 0,
            created_at: l.created_at,
          }))
        )
      }
    } catch {
      toast.error('Erro ao executar roteamento')
    }
    setRunning(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/settings/automations')}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-sky-600" />
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              {name || 'Roteamento Pós-Venda'}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRunNow}
            disabled={running}
            className="gap-2"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plane className="w-4 h-4" />}
            Executar agora
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Config básica */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Configuração</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">{isActive ? 'Ativa' : 'Pausada'}</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Nome da automação</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Descrição</Label>
            <p className="text-sm text-slate-600 mt-1">{description}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            <Timer className="w-4 h-4" />
            Executa automaticamente todos os dias às 6h (horário de Brasília)
          </div>
        </div>
      </div>

      {/* Pré-requisitos */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Pré-requisitos para sair de "App & Conteúdo"</h2>
        <p className="text-sm text-slate-500">
          O caso só avança quando TODAS as condições abaixo forem verdadeiras:
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-3">
            <div className="p-1.5 rounded-md bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-sm text-slate-700">Todos os produtos marcados como concluídos</span>
          </div>
          <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-3">
            <div className="p-1.5 rounded-md bg-amber-50 border border-amber-200">
              <ListChecks className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-sm text-slate-700">Nenhuma tarefa da cadência "App & Conteúdo" em aberto</span>
          </div>
          <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-3">
            <div className="p-1.5 rounded-md bg-blue-50 border border-blue-200">
              <CalendarRange className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-sm text-slate-700">Data da viagem preenchida (início e fim)</span>
          </div>
        </div>
      </div>

      {/* Regras de roteamento */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
          Regras de roteamento
        </h2>
        <p className="text-sm text-slate-500">
          Baseado na data da viagem, o caso é movido automaticamente para a etapa correta:
        </p>
        <div className="space-y-2">
          {RULES.map((rule, i) => {
            const Icon = rule.icon
            return (
              <div
                key={i}
                className="flex items-center gap-4 bg-slate-50 rounded-lg px-4 py-3"
              >
                <div className={cn('p-1.5 rounded-md border', rule.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{rule.label}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ArrowRightLeft className="w-3 h-3" />
                  <span className="font-medium text-slate-700">{rule.target}</span>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-slate-400">
          Casos que já estão em Pré-embarque ou Em Viagem também são reavaliados diariamente.
        </p>
      </div>

      {/* Última execução */}
      {lastRun && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Resultado da última execução</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-lg px-4 py-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{lastRun.moved}</p>
              <p className="text-xs text-emerald-600">Movidos</p>
            </div>
            <div className="bg-slate-50 rounded-lg px-4 py-3 text-center">
              <p className="text-2xl font-bold text-slate-700">{lastRun.skipped}</p>
              <p className="text-xs text-slate-500">Sem ação necessária</p>
            </div>
            <div className="bg-red-50 rounded-lg px-4 py-3 text-center">
              <p className="text-2xl font-bold text-red-700">{lastRun.errors}</p>
              <p className="text-xs text-red-600">Erros</p>
            </div>
          </div>
        </div>
      )}

      {/* Histórico recente */}
      {recentLogs.length > 0 && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Movimentações recentes</h2>
          <div className="divide-y divide-slate-100">
            {recentLogs.map((log, i) => (
              <div key={i} className="py-2.5 flex items-center gap-3 text-sm">
                <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-slate-500">{log.from_stage}</span>
                  <span className="text-slate-400 mx-1.5">→</span>
                  <span className="font-medium text-slate-700">{log.to_stage}</span>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  {new Date(log.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
