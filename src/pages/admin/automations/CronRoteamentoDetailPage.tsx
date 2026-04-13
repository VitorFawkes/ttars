import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Timer, Plane, ArrowRightLeft, CheckCircle2, Clock,
  ListChecks, CalendarRange, Save, Loader2,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'

interface ActionConfig {
  description: string
  dias_threshold: number
  source_stage_id: string
  cadence_template_id: string | null
  check_products_ready: boolean
  check_cadence_completed: boolean
  check_travel_dates: boolean
  stages: {
    pre_30_plus: string
    pre_30_minus: string
    em_viagem: string
    pos_viagem: string
  }
}

const DEFAULT_CONFIG: ActionConfig = {
  description: '',
  dias_threshold: 30,
  source_stage_id: '',
  cadence_template_id: null,
  check_products_ready: true,
  check_cadence_completed: true,
  check_travel_dates: true,
  stages: { pre_30_plus: '', pre_30_minus: '', em_viagem: '', pos_viagem: '' },
}

interface RoteamentoStats {
  moved: number
  skipped: number
  errors: number
  run_at: string
}

interface RecentLog {
  from_stage: string
  to_stage: string
  created_at: string
}

interface CadenceTemplate {
  id: string
  name: string
}

export default function CronRoteamentoDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { pipelineId } = useCurrentProductMeta()
  const { data: stagesRaw } = usePipelineStages(pipelineId || undefined)
  const stages = (stagesRaw || []).map((s) => ({ id: s.id, nome: s.nome }))

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [name, setName] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [config, setConfig] = useState<ActionConfig>(DEFAULT_CONFIG)
  const [lastRun, setLastRun] = useState<RoteamentoStats | null>(null)
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([])
  const [cadenceTemplates, setCadenceTemplates] = useState<CadenceTemplate[]>([])

  const updateConfig = (patch: Partial<ActionConfig>) =>
    setConfig((prev) => ({ ...prev, ...patch }))
  const updateStage = (key: keyof ActionConfig['stages'], value: string) =>
    setConfig((prev) => ({ ...prev, stages: { ...prev.stages, [key]: value } }))

  // Carregar dados
  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any

      const [triggerRes, cadRes, logsRes] = await Promise.all([
        sb.from('cadence_event_triggers').select('*').eq('id', id).single(),
        sb.from('cadence_templates').select('id, name').order('name'),
        sb.from('cadence_event_log')
          .select('card_id, event_data, created_at')
          .eq('event_source', 'cron_roteamento_pos_venda')
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      if (triggerRes.error || !triggerRes.data) {
        toast.error('Automação não encontrada')
        navigate('/settings/automations')
        return
      }

      const data = triggerRes.data
      if (data.event_type !== 'cron_roteamento') {
        navigate(`/settings/automations/trigger/${id}`, { replace: true })
        return
      }

      setName(data.name || '')
      setIsActive(data.is_active)

      const ac = data.action_config || {}
      setConfig({
        description: ac.description || '',
        dias_threshold: ac.dias_threshold ?? 30,
        source_stage_id: ac.source_stage_id || '',
        cadence_template_id: ac.cadence_template_id || null,
        check_products_ready: ac.check_products_ready ?? true,
        check_cadence_completed: ac.check_cadence_completed ?? true,
        check_travel_dates: ac.check_travel_dates ?? true,
        stages: {
          pre_30_plus: ac.stages?.pre_30_plus || '',
          pre_30_minus: ac.stages?.pre_30_minus || '',
          em_viagem: ac.stages?.em_viagem || '',
          pos_viagem: ac.stages?.pos_viagem || '',
        },
      })

      setCadenceTemplates(cadRes.data || [])

      if (logsRes.data) {
        setRecentLogs(
          logsRes.data.map((l: { event_data: Record<string, unknown>; created_at: string }) => ({
            from_stage: (l.event_data?.from_stage as string) || '?',
            to_stage: (l.event_data?.to_stage as string) || '?',
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
        action_config: config,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: logs } = await (supabase as any)
        .from('cadence_event_log')
        .select('card_id, event_data, created_at')
        .eq('event_source', 'cron_roteamento_pos_venda')
        .order('created_at', { ascending: false })
        .limit(10)

      if (logs) {
        setRecentLogs(
          logs.map((l: { event_data: Record<string, unknown>; created_at: string }) => ({
            from_stage: (l.event_data?.from_stage as string) || '?',
            to_stage: (l.event_data?.to_stage as string) || '?',
            created_at: l.created_at,
          }))
        )
      }
    } catch {
      toast.error('Erro ao executar roteamento')
    }
    setRunning(false)
  }

  const stageOptions = stages.map((s) => ({ value: s.id, label: s.nome }))
  const cadenceOptions = [
    { value: '', label: 'Nenhuma (não verificar)' },
    ...cadenceTemplates.map((t) => ({ value: t.id, label: t.name })),
  ]

  const stageName = (stageId: string) =>
    stages.find((s) => s.id === stageId)?.nome || '(selecione)'

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
          <Button variant="outline" onClick={handleRunNow} disabled={running} className="gap-2">
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
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            <Timer className="w-4 h-4" />
            Executa automaticamente todos os dias às 6h (horário de Brasília)
          </div>
        </div>
      </div>

      {/* Etapa de origem */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Etapa de origem</h2>
        <p className="text-sm text-slate-500">
          A automação avalia cards que estão nesta etapa (e nas etapas de destino abaixo):
        </p>
        <Select
          value={config.source_stage_id}
          onChange={(v) => updateConfig({ source_stage_id: v })}
          options={stageOptions}
          placeholder="Selecione a etapa de origem..."
        />
      </div>

      {/* Pré-requisitos */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">
          Pré-requisitos para sair de "{stageName(config.source_stage_id)}"
        </h2>
        <p className="text-sm text-slate-500">
          O caso só avança quando as condições ativas abaixo forem verdadeiras:
        </p>
        <div className="space-y-3">
          {/* Produtos concluídos */}
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <span className="text-sm text-slate-700">Todos os produtos marcados como concluídos</span>
            </div>
            <Switch
              checked={config.check_products_ready}
              onCheckedChange={(v) => updateConfig({ check_products_ready: v })}
            />
          </div>

          {/* Cadência finalizada */}
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-amber-50 border border-amber-200">
                  <ListChecks className="w-4 h-4 text-amber-600" />
                </div>
                <span className="text-sm text-slate-700">Cadência finalizada</span>
              </div>
              <Switch
                checked={config.check_cadence_completed}
                onCheckedChange={(v) => updateConfig({ check_cadence_completed: v })}
              />
            </div>
            {config.check_cadence_completed && (
              <div className="ml-10">
                <Label className="text-xs text-slate-500">Qual cadência verificar?</Label>
                <Select
                  value={config.cadence_template_id || ''}
                  onChange={(v) => updateConfig({ cadence_template_id: v || null })}
                  options={cadenceOptions}
                  placeholder="Selecione a cadência..."
                />
              </div>
            )}
          </div>

          {/* Data preenchida */}
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-blue-50 border border-blue-200">
                <CalendarRange className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-sm text-slate-700">Data da viagem preenchida (início e fim)</span>
            </div>
            <Switch
              checked={config.check_travel_dates}
              onCheckedChange={(v) => updateConfig({ check_travel_dates: v })}
            />
          </div>
        </div>
      </div>

      {/* Regras de roteamento */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-5">
        <div>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
            Regras de roteamento
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Baseado na data da viagem, o caso é movido para a etapa correspondente:
          </p>
        </div>

        {/* Dias de corte */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
          <Label className="text-sm font-medium text-indigo-700">Dias de corte para pré-embarque</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <Input
              type="number"
              min={1}
              max={365}
              value={config.dias_threshold}
              onChange={(e) => updateConfig({ dias_threshold: parseInt(e.target.value) || 30 })}
              className="w-24 bg-white"
            />
            <span className="text-sm text-indigo-600">dias antes do início da viagem</span>
          </div>
        </div>

        {/* 4 regras com dropdowns */}
        <div className="space-y-3">
          <RuleRow
            icon={CalendarRange}
            color="text-blue-600 bg-blue-50 border-blue-200"
            label={`Mais de ${config.dias_threshold} dias para a viagem`}
            stageId={config.stages.pre_30_plus}
            stageOptions={stageOptions}
            onChange={(v) => updateStage('pre_30_plus', v)}
          />
          <RuleRow
            icon={Clock}
            color="text-amber-600 bg-amber-50 border-amber-200"
            label={`Menos de ${config.dias_threshold} dias para a viagem`}
            stageId={config.stages.pre_30_minus}
            stageOptions={stageOptions}
            onChange={(v) => updateStage('pre_30_minus', v)}
          />
          <RuleRow
            icon={Plane}
            color="text-emerald-600 bg-emerald-50 border-emerald-200"
            label="Viagem em andamento"
            stageId={config.stages.em_viagem}
            stageOptions={stageOptions}
            onChange={(v) => updateStage('em_viagem', v)}
          />
          <RuleRow
            icon={CheckCircle2}
            color="text-purple-600 bg-purple-50 border-purple-200"
            label="Viagem encerrada"
            stageId={config.stages.pos_viagem}
            stageOptions={stageOptions}
            onChange={(v) => updateStage('pos_viagem', v)}
          />
        </div>

        <p className="text-xs text-slate-400">
          Casos que já estão nas etapas de destino acima também são reavaliados diariamente.
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

/** Linha de regra com dropdown de etapa editável */
function RuleRow({
  icon: Icon,
  color,
  label,
  stageId,
  stageOptions,
  onChange,
}: {
  icon: typeof CalendarRange
  color: string
  label: string
  stageId: string
  stageOptions: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-3">
      <div className={cn('p-1.5 rounded-md border flex-shrink-0', color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700">{label}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ArrowRightLeft className="w-3 h-3 text-slate-400" />
        <Select
          value={stageId}
          onChange={onChange}
          options={stageOptions}
          placeholder="Etapa..."
        />
      </div>
    </div>
  )
}
