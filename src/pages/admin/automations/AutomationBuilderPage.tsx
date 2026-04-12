import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Save, Zap, MessageSquare, CheckSquare, ArrowRightLeft, Layers,
  Sparkles, Check,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

import { useMensagemTemplates } from '@/hooks/useMensagemTemplates'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useUsers } from '@/hooks/useUsers'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import {
  RECIPES, RECIPE_CATEGORIES,
  ACTION_TYPE_LABELS, EVENT_TYPE_LABELS,
  type ActionType, type EventType, type RecipePreset,
} from '@/lib/automation-recipes'

type Step = 'gallery' | 'editor' | 'review'

interface FormState {
  name: string
  event_type: EventType
  event_config: Record<string, unknown>
  stage_ids: string[]
  action_type: ActionType
  // send_message
  template_id: string | null
  message_body: string
  message_mode: 'template' | 'custom'
  phone_number_id: string | null
  dedup_hours: number
  // create_task
  task_title: string
  task_tipo: string
  task_assign_to: 'card_owner' | 'specific'
  task_assign_to_user_id: string | null
  // change_stage
  target_stage_id: string | null
  // start_cadence
  target_cadence_template_id: string | null
  // delay
  delay_minutes: number
  delay_type: 'business' | 'calendar'
  is_active: boolean
}

const DEFAULT_FORM: FormState = {
  name: '',
  event_type: 'card_created',
  event_config: {},
  stage_ids: [],
  action_type: 'send_message',
  template_id: null,
  message_body: '',
  message_mode: 'template',
  phone_number_id: null,
  dedup_hours: 24,
  task_title: '',
  task_tipo: 'contato',
  task_assign_to: 'card_owner',
  task_assign_to_user_id: null,
  target_stage_id: null,
  target_cadence_template_id: null,
  delay_minutes: 5,
  delay_type: 'business',
  is_active: false,
}

const ACTION_OPTIONS: Array<{ value: ActionType; label: string; desc: string; icon: typeof MessageSquare }> = [
  { value: 'send_message', label: 'Enviar mensagem', desc: 'WhatsApp automático para o contato', icon: MessageSquare },
  { value: 'create_task', label: 'Criar tarefa', desc: 'Tarefa na agenda de alguém do time', icon: CheckSquare },
  { value: 'change_stage', label: 'Mudar etapa', desc: 'Mover card para outra etapa do pipeline', icon: ArrowRightLeft },
  { value: 'start_cadence', label: 'Iniciar cadência', desc: 'Disparar série de tarefas encadeadas', icon: Layers },
]

const EVENT_OPTIONS: Array<{ value: EventType; label: string }> = [
  { value: 'card_created', label: EVENT_TYPE_LABELS.card_created },
  { value: 'stage_enter', label: EVENT_TYPE_LABELS.stage_enter },
  { value: 'dias_antes_viagem', label: EVENT_TYPE_LABELS.dias_antes_viagem },
  { value: 'dias_apos_viagem', label: EVENT_TYPE_LABELS.dias_apos_viagem },
  { value: 'aniversario_contato', label: EVENT_TYPE_LABELS.aniversario_contato },
  { value: 'proposta_expirada', label: EVENT_TYPE_LABELS.proposta_expirada },
  { value: 'dias_no_stage', label: EVENT_TYPE_LABELS.dias_no_stage },
  { value: 'card_won', label: EVENT_TYPE_LABELS.card_won },
]

const TASK_TIPO_OPTIONS = [
  { value: 'contato', label: 'Contato' },
  { value: 'tarefa', label: 'Tarefa geral' },
  { value: 'email', label: 'E-mail' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'enviar_proposta', label: 'Enviar proposta' },
  { value: 'coleta_documentos', label: 'Coletar documentos' },
]

// ============================================================================
// Step 1 — Galeria de receitas
// ============================================================================

function RecipeGallery({
  onPick,
  onSkip,
  currentProduct,
}: {
  onPick: (recipe: RecipePreset) => void
  onSkip: () => void
  currentProduct: string | null | undefined
}) {
  const relevantRecipes = useMemo(() => {
    return RECIPES.filter((r) => !r.product || !currentProduct || r.product === currentProduct)
  }, [currentProduct])

  const byCategory = useMemo(() => {
    const map = new Map<string, RecipePreset[]>()
    for (const cat of RECIPE_CATEGORIES) map.set(cat.key, [])
    for (const r of relevantRecipes) {
      map.get(r.category)?.push(r)
    }
    return map
  }, [relevantRecipes])

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-1">
          Escolha uma receita pronta
        </h2>
        <p className="text-sm text-slate-600">
          Começar com um exemplo pré-preenchido é mais rápido. Você ajusta os detalhes depois.
        </p>
      </div>

      {RECIPE_CATEGORIES.map((cat) => {
        const list = byCategory.get(cat.key) || []
        if (list.length === 0) return null
        return (
          <div key={cat.key}>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">{cat.label}</h3>
            <p className="text-xs text-slate-500 mb-3">{cat.description}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((recipe) => {
                const Icon = recipe.icon
                return (
                  <button
                    key={recipe.id}
                    onClick={() => onPick(recipe)}
                    className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-400 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:bg-indigo-100">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 text-sm">{recipe.name}</p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{recipe.summary}</p>
                        {recipe.product && (
                          <Badge variant="outline" className="mt-2 text-xs">
                            {recipe.product}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
        <p className="text-sm text-slate-500">Nenhuma receita se aplica? Crie do zero.</p>
        <Button variant="outline" onClick={onSkip}>
          Começar em branco
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Step 2 — Editor
// ============================================================================

function ActionTypeTabs({
  value,
  onChange,
}: {
  value: ActionType
  onChange: (next: ActionType) => void
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {ACTION_OPTIONS.map((opt) => {
        const Icon = opt.icon
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'text-left p-3 rounded-xl border transition-all',
              active
                ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('w-4 h-4', active ? 'text-indigo-600' : 'text-slate-500')} />
              <span className="font-medium text-sm">{opt.label}</span>
            </div>
            <p className="text-xs text-slate-500 leading-snug">{opt.desc}</p>
          </button>
        )
      })}
    </div>
  )
}

function SendMessageEditor({
  form, setForm, templates,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
  templates: Array<{ id: string; nome: string; categoria: string; corpo: string | null }>
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['template', 'custom'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setForm({ message_mode: mode })}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md border',
              form.message_mode === mode
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200'
            )}
          >
            {mode === 'template' ? 'Usar template' : 'Texto direto'}
          </button>
        ))}
      </div>

      {form.message_mode === 'template' ? (
        <div className="space-y-2">
          <Label>Template de mensagem</Label>
          <Select
            value={form.template_id || ''}
            onChange={(v) => setForm({ template_id: v || null })}
            options={[
              { value: '', label: 'Selecione um template...' },
              ...templates.map((t) => ({ value: t.id, label: `${t.nome} (${t.categoria})` })),
            ]}
          />
          {form.template_id && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 whitespace-pre-wrap">
              {templates.find((t) => t.id === form.template_id)?.corpo || 'Template sem corpo'}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Não tem template? <a href="/settings/automacoes/templates" target="_blank" className="text-indigo-600 hover:underline">Criar em nova aba</a>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Texto da mensagem</Label>
          <Textarea
            value={form.message_body}
            onChange={(e) => setForm({ message_body: e.target.value })}
            rows={5}
            placeholder="Oi {{contact.nome}}, ..."
          />
          <p className="text-xs text-slate-500">
            Variáveis: <code className="text-xs">{'{{contact.nome}}'}</code>, <code className="text-xs">{'{{card.destino}}'}</code>, <code className="text-xs">{'{{card.valor}}'}</code>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
        <div>
          <Label>Janela anti-duplicata (horas)</Label>
          <Input
            type="number"
            min={0}
            value={form.dedup_hours}
            onChange={(e) => setForm({ dedup_hours: Number(e.target.value) })}
          />
          <p className="text-xs text-slate-500 mt-1">Não envia de novo se já enviou nesse período.</p>
        </div>
      </div>
    </div>
  )
}

function CreateTaskEditor({
  form, setForm, users,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
  users: Array<{ id: string; nome_completo: string }>
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Título da tarefa</Label>
        <Input
          value={form.task_title}
          onChange={(e) => setForm({ task_title: e.target.value })}
          placeholder="Ex: Ligar para o cliente"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Tipo</Label>
          <Select
            value={form.task_tipo}
            onChange={(v) => setForm({ task_tipo: v })}
            options={TASK_TIPO_OPTIONS}
          />
        </div>
        <div>
          <Label>Responsável</Label>
          <Select
            value={form.task_assign_to}
            onChange={(v) => setForm({ task_assign_to: v as 'card_owner' | 'specific' })}
            options={[
              { value: 'card_owner', label: 'Dono do card' },
              { value: 'specific', label: 'Pessoa específica' },
            ]}
          />
        </div>
      </div>
      {form.task_assign_to === 'specific' && (
        <div>
          <Label>Quem vai receber a tarefa</Label>
          <Select
            value={form.task_assign_to_user_id || ''}
            onChange={(v) => setForm({ task_assign_to_user_id: v || null })}
            options={[
              { value: '', label: 'Selecione...' },
              ...users.map((u) => ({ value: u.id, label: u.nome_completo })),
            ]}
          />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Delay (minutos)</Label>
          <Input
            type="number"
            min={0}
            value={form.delay_minutes}
            onChange={(e) => setForm({ delay_minutes: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Tipo de delay</Label>
          <Select
            value={form.delay_type}
            onChange={(v) => setForm({ delay_type: v as 'business' | 'calendar' })}
            options={[
              { value: 'business', label: 'Horário comercial' },
              { value: 'calendar', label: 'Calendário' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}

function ChangeStageEditor({
  form, setForm, stages,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
  stages: Array<{ id: string; nome: string }>
}) {
  return (
    <div className="space-y-3">
      <Label>Mover card para a etapa</Label>
      <Select
        value={form.target_stage_id || ''}
        onChange={(v) => setForm({ target_stage_id: v || null })}
        options={[
          { value: '', label: 'Selecione a etapa alvo...' },
          ...stages.map((s) => ({ value: s.id, label: s.nome })),
        ]}
      />
      <p className="text-xs text-slate-500">
        Evita loop: se o card já estiver na etapa alvo, a automação é pulada automaticamente.
      </p>
    </div>
  )
}

function StartCadenceEditor({
  form, setForm, cadenceTemplates,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
  cadenceTemplates: Array<{ id: string; name: string }>
}) {
  return (
    <div className="space-y-3">
      <Label>Cadência para disparar</Label>
      <Select
        value={form.target_cadence_template_id || ''}
        onChange={(v) => setForm({ target_cadence_template_id: v || null })}
        options={[
          { value: '', label: 'Selecione a cadência...' },
          ...cadenceTemplates.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      <p className="text-xs text-slate-500">
        A cadência é executada no seu próprio ritmo — cada step dela vira tarefa no momento certo.
      </p>
    </div>
  )
}

function EventConfigEditor({
  form, setForm, stages,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
  stages: Array<{ id: string; nome: string }>
}) {
  const needsStages = form.event_type === 'stage_enter' || form.event_type === 'dias_no_stage'
  const needsDays =
    form.event_type === 'dias_antes_viagem' ||
    form.event_type === 'dias_apos_viagem' ||
    form.event_type === 'dias_no_stage'

  return (
    <div className="space-y-3">
      <div>
        <Label>Gatilho</Label>
        <Select
          value={form.event_type}
          onChange={(v) => setForm({ event_type: v as EventType, event_config: {}, stage_ids: [] })}
          options={EVENT_OPTIONS}
        />
      </div>

      {needsStages && (
        <div>
          <Label>
            {form.event_type === 'stage_enter' ? 'Em qual(is) etapa(s)?' : 'Em qual etapa o card está parado?'}
          </Label>
          <div className="flex flex-wrap gap-2">
            {stages.map((s) => {
              const active = form.stage_ids.includes(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setForm({
                      stage_ids: active
                        ? form.stage_ids.filter((x) => x !== s.id)
                        : [...form.stage_ids, s.id],
                    })
                  }
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md border',
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200'
                  )}
                >
                  {s.nome}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {needsDays && (
        <div>
          <Label>Quantidade de dias</Label>
          <Input
            type="number"
            min={0}
            value={(form.event_config.dias as number) ?? 7}
            onChange={(e) => setForm({ event_config: { ...form.event_config, dias: Number(e.target.value) } })}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Página principal
// ============================================================================

export default function AutomationBuilderPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'

  const { slug: currentProduct, pipelineId } = useCurrentProductMeta()
  const { data: stagesData } = usePipelineStages(pipelineId || undefined)
  const stages: Array<{ id: string; nome: string }> = (stagesData || []).map((s) => ({ id: s.id, nome: s.nome }))
  const { users } = useUsers()
  const userOptions: Array<{ id: string; nome_completo: string }> = (users || []).map((u: { id: string; nome: string }) => ({ id: u.id, nome_completo: u.nome }))
  const { templates: messageTemplates } = useMensagemTemplates(currentProduct || undefined)

  const [step, setStep] = useState<Step>(isNew ? 'gallery' : 'editor')
  const [form, setFormState] = useState<FormState>(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cadenceTemplates, setCadenceTemplates] = useState<Array<{ id: string; name: string }>>([])

  const setForm = (next: Partial<FormState>) => setFormState((prev) => ({ ...prev, ...next }))

  // Carregar cadence_templates para start_cadence
  useEffect(() => {
    const load = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('cadence_templates')
        .select('id, name')
        .order('name')
      setCadenceTemplates(data || [])
    }
    load()
  }, [])

  // Carregar trigger existente em edição
  useEffect(() => {
    if (isNew) return
    const load = async () => {
      setLoading(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cadence_event_triggers')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        toast.error('Automação não encontrada')
        navigate('/settings/automations')
        return
      }

      const cfg = data.action_config || {}
      const evCfg = data.event_config || {}
      setFormState({
        ...DEFAULT_FORM,
        name: data.name || '',
        event_type: data.event_type,
        event_config: evCfg,
        stage_ids: data.applicable_stage_ids || [],
        action_type: data.action_type,
        template_id: cfg.template_id || null,
        message_body: cfg.corpo || '',
        message_mode: cfg.corpo && !cfg.template_id ? 'custom' : 'template',
        phone_number_id: cfg.phone_number_id || null,
        dedup_hours: typeof cfg.dedup_hours === 'number' ? cfg.dedup_hours : 24,
        task_title: (data.task_configs?.[0]?.titulo) || '',
        task_tipo: (data.task_configs?.[0]?.tipo) || 'contato',
        task_assign_to: (data.task_configs?.[0]?.assign_to) || 'card_owner',
        task_assign_to_user_id: data.task_configs?.[0]?.assign_to_user_id || null,
        target_stage_id: cfg.target_stage_id || null,
        target_cadence_template_id: data.target_template_id || null,
        delay_minutes: data.delay_minutes ?? 5,
        delay_type: data.delay_type || 'business',
        is_active: data.is_active ?? false,
      })
      setLoading(false)
    }
    load()
  }, [id, isNew, navigate])

  const pickRecipe = (recipe: RecipePreset) => {
    setFormState({
      ...DEFAULT_FORM,
      name: recipe.name,
      event_type: recipe.preset.event_type,
      event_config: recipe.preset.event_config || {},
      action_type: recipe.preset.action_type,
      template_id: (recipe.preset.action_config?.template_id as string) || null,
      message_body: recipe.preset.suggested_message || '',
      message_mode: recipe.preset.suggested_message ? 'custom' : 'template',
      task_title: recipe.preset.suggested_task_title || '',
      target_stage_id: (recipe.preset.action_config?.target_stage_id as string) || null,
      target_cadence_template_id: (recipe.preset.action_config?.target_template_id as string) || null,
    })
    setStep('editor')
  }

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Dê um nome à automação'
    if (form.action_type === 'send_message') {
      if (form.message_mode === 'template' && !form.template_id) return 'Selecione um template'
      if (form.message_mode === 'custom' && !form.message_body.trim()) return 'Escreva o texto da mensagem'
    }
    if (form.action_type === 'create_task' && !form.task_title.trim()) return 'Dê um título à tarefa'
    if (form.action_type === 'change_stage' && !form.target_stage_id) return 'Selecione a etapa alvo'
    if (form.action_type === 'start_cadence' && !form.target_cadence_template_id) return 'Selecione a cadência'
    if ((form.event_type === 'stage_enter' || form.event_type === 'dias_no_stage') && form.stage_ids.length === 0) {
      return 'Selecione ao menos uma etapa'
    }
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }

    setSaving(true)
    try {
      const actionConfig: Record<string, unknown> = {}
      let targetTemplateId: string | null = null
      const taskConfigs: Array<Record<string, unknown>> = []

      if (form.action_type === 'send_message') {
        if (form.message_mode === 'template' && form.template_id) {
          actionConfig.template_id = form.template_id
        }
        if (form.message_mode === 'custom' && form.message_body.trim()) {
          actionConfig.corpo = form.message_body.trim()
        }
        if (form.phone_number_id) actionConfig.phone_number_id = form.phone_number_id
        actionConfig.dedup_hours = form.dedup_hours
      }
      if (form.action_type === 'create_task') {
        taskConfigs.push({
          titulo: form.task_title.trim(),
          tipo: form.task_tipo,
          assign_to: form.task_assign_to,
          assign_to_user_id: form.task_assign_to_user_id,
        })
      }
      if (form.action_type === 'change_stage') {
        actionConfig.target_stage_id = form.target_stage_id
      }
      if (form.action_type === 'start_cadence') {
        targetTemplateId = form.target_cadence_template_id
      }

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        event_type: form.event_type,
        event_config: form.event_config,
        action_type: form.action_type,
        action_config: actionConfig,
        task_configs: taskConfigs,
        target_template_id: targetTemplateId,
        applicable_stage_ids: form.stage_ids.length > 0 ? form.stage_ids : null,
        delay_minutes: form.delay_minutes,
        delay_type: form.delay_type,
        is_active: form.is_active,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any
      if (isNew) {
        const { error } = await sb.from('cadence_event_triggers').insert(payload)
        if (error) throw error
      } else {
        const { error } = await sb.from('cadence_event_triggers').update({
          ...payload,
          updated_at: new Date().toISOString(),
        }).eq('id', id)
        if (error) throw error
      }

      toast.success(isNew ? 'Automação criada' : 'Automação salva')
      navigate('/settings/automations')
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao salvar'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6">Carregando...</div>
  }

  // ───────────────────────────────────────────────────────
  // STEP: GALLERY
  // ───────────────────────────────────────────────────────
  if (step === 'gallery' && isNew) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings/automations')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar
            </Button>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Nova automação
            </h1>
          </div>
        </div>
        <RecipeGallery
          onPick={pickRecipe}
          onSkip={() => { setFormState(DEFAULT_FORM); setStep('editor') }}
          currentProduct={currentProduct}
        />
      </div>
    )
  }

  // ───────────────────────────────────────────────────────
  // STEP: REVIEW
  // ───────────────────────────────────────────────────────
  if (step === 'review') {
    const actionLabel = ACTION_TYPE_LABELS[form.action_type]
    const eventLabel = EVENT_TYPE_LABELS[form.event_type as EventType] || form.event_type
    const stageNames = stages.filter((s: { id: string; nome: string }) => form.stage_ids.includes(s.id)).map((s: { nome: string }) => s.nome).join(', ')

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setStep('editor')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar
          </Button>
          <h1 className="text-xl font-bold text-slate-900">Revisar e ativar</h1>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Nome</p>
            <p className="font-semibold text-slate-900">{form.name}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Quando</p>
              <p className="text-slate-700">{eventLabel}</p>
              {stageNames && <p className="text-xs text-slate-500 mt-1">Etapas: {stageNames}</p>}
              {typeof form.event_config.dias === 'number' && (
                <p className="text-xs text-slate-500 mt-1">Dias: {form.event_config.dias as number}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Faz o quê</p>
              <p className="text-slate-700">{actionLabel}</p>
              {form.action_type === 'send_message' && form.message_mode === 'template' && (
                <p className="text-xs text-slate-500 mt-1">
                  Template: {messageTemplates.find((t) => t.id === form.template_id)?.nome || '—'}
                </p>
              )}
              {form.action_type === 'create_task' && (
                <p className="text-xs text-slate-500 mt-1">Tarefa: {form.task_title}</p>
              )}
              {form.action_type === 'change_stage' && (
                <p className="text-xs text-slate-500 mt-1">
                  Para: {stages.find((s) => s.id === form.target_stage_id)?.nome || '—'}
                </p>
              )}
              {form.action_type === 'start_cadence' && (
                <p className="text-xs text-slate-500 mt-1">
                  Cadência: {cadenceTemplates.find((c) => c.id === form.target_cadence_template_id)?.name || '—'}
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ is_active: v })}
              />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {form.is_active ? 'Ativar imediatamente' : 'Criar pausada'}
                </p>
                <p className="text-xs text-slate-500">
                  {form.is_active ? 'A automação começa a disparar assim que salvar' : 'Você pode ativar depois no hub'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep('editor')}>
            Editar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? 'Salvando...' : <><Check className="w-4 h-4" /> {isNew ? 'Criar automação' : 'Salvar alterações'}</>}
          </Button>
        </div>
      </div>
    )
  }

  // ───────────────────────────────────────────────────────
  // STEP: EDITOR
  // ───────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isNew ? (
            <Button variant="ghost" size="sm" onClick={() => setStep('gallery')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Receitas
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings/automations')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar
            </Button>
          )}
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            {isNew ? 'Nova automação' : form.name || 'Editar automação'}
          </h1>
        </div>
        <Button onClick={() => setStep('review')} className="gap-2">
          <Sparkles className="w-4 h-4" />
          Revisar
        </Button>
      </div>

      {/* Nome */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <Label>Nome da automação</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ name: e.target.value })}
          placeholder="Ex: Boas-vindas em novo card"
        />
      </div>

      {/* Quando */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Quando</h2>
          <p className="text-xs text-slate-500">Qual evento dispara a automação</p>
        </div>
        <EventConfigEditor form={form} setForm={setForm} stages={stages} />
      </div>

      {/* Faz o quê */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Faz o quê</h2>
          <p className="text-xs text-slate-500">Escolha a ação que a automação executa</p>
        </div>
        <ActionTypeTabs value={form.action_type} onChange={(a) => setForm({ action_type: a })} />

        <div className="pt-4 border-t border-slate-200">
          {form.action_type === 'send_message' && (
            <SendMessageEditor form={form} setForm={setForm} templates={messageTemplates} />
          )}
          {form.action_type === 'create_task' && (
            <CreateTaskEditor form={form} setForm={setForm} users={userOptions} />
          )}
          {form.action_type === 'change_stage' && (
            <ChangeStageEditor form={form} setForm={setForm} stages={stages} />
          )}
          {form.action_type === 'start_cadence' && (
            <StartCadenceEditor form={form} setForm={setForm} cadenceTemplates={cadenceTemplates} />
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/settings/automations')}>
          Cancelar
        </Button>
        <Button onClick={() => setStep('review')} className="gap-2">
          <Save className="w-4 h-4" />
          Revisar e salvar
        </Button>
      </div>
    </div>
  )
}
