import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Save, Zap, MessageSquare, CheckSquare, ArrowRightLeft, Layers,
  Sparkles, Check, ShieldCheck, AlertTriangle, PlayCircle, Tag as TagIcon, Bell,
  Edit3, Webhook,
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
import { useCardTags } from '@/hooks/useCardTags'
import { useWhatsAppTemplates, parseTemplateBody, type WhatsAppTemplate } from '@/hooks/useWhatsAppTemplates'
import {
  RECIPES, RECIPE_CATEGORIES, isProactiveEvent,
  ACTION_TYPE_LABELS, EVENT_TYPE_LABELS, UPDATE_FIELD_OPTIONS,
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
  /** 'hsm' = template aprovado Meta (recomendado p/ gatilho proativo, funciona fora da janela 24h)
   *  'template' = template salvo em mensagem_templates (texto livre)
   *  'custom' = texto livre inline */
  message_mode: 'hsm' | 'template' | 'custom'
  hsm_template_name: string | null
  hsm_language: string
  hsm_params: string[]
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
  // add_tag / remove_tag
  tag_id: string | null
  // notify_internal
  notify_recipient_mode: 'card_owner' | 'specific' | 'admins'
  notify_user_id: string | null
  notify_title: string
  notify_body: string
  // update_field
  update_field_key: string | null
  update_field_value: string
  // trigger_n8n_webhook
  webhook_url: string
  webhook_include_contact: boolean
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
  message_mode: 'hsm',
  hsm_template_name: null,
  hsm_language: 'pt_BR',
  hsm_params: [],
  phone_number_id: null,
  dedup_hours: 24,
  task_title: '',
  task_tipo: 'contato',
  task_assign_to: 'card_owner',
  task_assign_to_user_id: null,
  target_stage_id: null,
  target_cadence_template_id: null,
  tag_id: null,
  notify_recipient_mode: 'card_owner',
  notify_user_id: null,
  notify_title: '',
  notify_body: '',
  update_field_key: null,
  update_field_value: '',
  webhook_url: '',
  webhook_include_contact: true,
  delay_minutes: 5,
  delay_type: 'business',
  is_active: false,
}

const ACTION_OPTIONS: Array<{ value: ActionType; label: string; desc: string; icon: typeof MessageSquare }> = [
  { value: 'send_message', label: 'Enviar mensagem', desc: 'WhatsApp automático para o contato', icon: MessageSquare },
  { value: 'create_task', label: 'Criar tarefa', desc: 'Tarefa na agenda de alguém do time', icon: CheckSquare },
  { value: 'change_stage', label: 'Mudar etapa', desc: 'Mover card para outra etapa do pipeline', icon: ArrowRightLeft },
  { value: 'start_cadence', label: 'Iniciar cadência', desc: 'Disparar série de tarefas encadeadas', icon: Layers },
  { value: 'add_tag', label: 'Adicionar tag', desc: 'Marcar o card com uma etiqueta', icon: TagIcon },
  { value: 'remove_tag', label: 'Remover tag', desc: 'Tirar uma etiqueta do card', icon: TagIcon },
  { value: 'notify_internal', label: 'Avisar o time', desc: 'Notificação no sino do app (não manda WhatsApp)', icon: Bell },
  { value: 'update_field', label: 'Atualizar campo', desc: 'Muda valor de um campo do card (ex: status, prioridade)', icon: Edit3 },
  { value: 'trigger_n8n_webhook', label: 'Disparar webhook', desc: 'Chama URL externa (ex: n8n) com dados do card', icon: Webhook },
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

function HsmTemplatePicker({
  form, setForm, waTemplates, loading,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
  waTemplates: WhatsAppTemplate[]
  loading: boolean
}) {
  const selected = useMemo(
    () => waTemplates.find((t) => t.name === form.hsm_template_name) || null,
    [waTemplates, form.hsm_template_name]
  )
  const parsed = useMemo(() => (selected ? parseTemplateBody(selected) : null), [selected])

  // Ao trocar template, reajusta o array de params para o tamanho certo, preservando
  // os valores já digitados nas posições que existem.
  const handleSelectTemplate = (name: string) => {
    const next = waTemplates.find((t) => t.name === name)
    const paramCount = next ? parseTemplateBody(next).paramCount : 0
    const prev = form.hsm_params
    const padded: string[] = Array.from({ length: paramCount }, (_, i) => prev[i] || '')
    setForm({
      hsm_template_name: name || null,
      hsm_language: next?.language || 'pt_BR',
      hsm_params: padded,
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          Template aprovado (HSM)
        </Label>
        <Select
          value={form.hsm_template_name || ''}
          onChange={handleSelectTemplate}
          options={[
            { value: '', label: loading ? 'Carregando templates...' : 'Selecione um template aprovado' },
            ...waTemplates.map((t) => ({
              value: t.name,
              label: `${t.name} [${t.language}] — ${t.category}`,
            })),
          ]}
        />
        <p className="text-xs text-slate-500 mt-1">
          Templates HSM aprovados pela Meta. Funcionam fora da janela 24h (sem HSM, mensagens proativas são dropadas silenciosamente).
        </p>
      </div>

      {selected && parsed && (
        <>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 whitespace-pre-wrap">
            {parsed.bodyText}
            {parsed.hasButtons && (
              <p className="text-xs text-slate-500 mt-2 italic">+ botões do template (fixos)</p>
            )}
          </div>

          {parsed.paramCount > 0 && (
            <div className="space-y-2">
              <Label>Parâmetros do template</Label>
              {Array.from({ length: parsed.paramCount }).map((_, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{`{{${i + 1}}}`}</code>
                    <span className="text-xs text-slate-500">{parsed.paramLabels[i]}</span>
                  </div>
                  <Input
                    value={form.hsm_params[i] || ''}
                    onChange={(e) => {
                      const next = [...form.hsm_params]
                      next[i] = e.target.value
                      setForm({ hsm_params: next })
                    }}
                    placeholder="Ex: {{contact.primeiro_nome}} ou texto fixo"
                  />
                </div>
              ))}
              <p className="text-xs text-slate-500">
                Variáveis dinâmicas: <code>{'{{contact.primeiro_nome}}'}</code>, <code>{'{{contact.nome}}'}</code>, <code>{'{{card.titulo}}'}</code>. Ou digite texto fixo.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SendMessageEditor({
  form, setForm, templates, waTemplates, waTemplatesLoading,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
  templates: Array<{ id: string; nome: string; categoria: string; corpo: string | null }>
  waTemplates: WhatsAppTemplate[]
  waTemplatesLoading: boolean
}) {
  const proactive = isProactiveEvent(form.event_type)

  return (
    <div className="space-y-4">
      {proactive && form.message_mode !== 'hsm' && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-amber-900">
            <strong>Atenção:</strong> gatilho proativo ({EVENT_TYPE_LABELS[form.event_type]}) dispara sem conversa recente.
            O WhatsApp <strong>drops mensagem de texto livre</strong> se estiver fora da janela de 24h.
            Use um <strong>template HSM aprovado</strong> para garantir entrega.
            <button
              className="ml-1 underline"
              onClick={() => setForm({ message_mode: 'hsm' })}
            >
              Trocar para HSM
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: 'hsm', label: 'Template HSM', icon: ShieldCheck, hint: 'Funciona sempre' },
          { key: 'template', label: 'Template salvo', icon: MessageSquare, hint: 'Texto livre' },
          { key: 'custom', label: 'Texto direto', icon: Sparkles, hint: 'Texto livre' },
        ] as const).map((opt) => {
          const Icon = opt.icon
          const active = form.message_mode === opt.key
          return (
            <button
              key={opt.key}
              onClick={() => setForm({ message_mode: opt.key })}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border',
                active
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
              title={opt.hint}
            >
              <Icon className="w-3.5 h-3.5" />
              {opt.label}
            </button>
          )
        })}
      </div>

      {form.message_mode === 'hsm' && (
        <HsmTemplatePicker
          form={form}
          setForm={setForm}
          waTemplates={waTemplates}
          loading={waTemplatesLoading}
        />
      )}

      {form.message_mode === 'template' && (
        <div className="space-y-2">
          <Label>Template salvo (texto livre)</Label>
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
            Não tem template?{' '}
            <a href="/settings/automacoes/templates" target="_blank" className="text-indigo-600 hover:underline">
              Criar em nova aba
            </a>
          </p>
        </div>
      )}

      {form.message_mode === 'custom' && (
        <div className="space-y-2">
          <Label>Texto da mensagem</Label>
          <Textarea
            value={form.message_body}
            onChange={(e) => setForm({ message_body: e.target.value })}
            rows={5}
            placeholder="Oi {{contact.nome}}, ..."
          />
          <p className="text-xs text-slate-500">
            Variáveis: <code className="text-xs">{'{{contact.nome}}'}</code>,{' '}
            <code className="text-xs">{'{{contact.primeiro_nome}}'}</code>,{' '}
            <code className="text-xs">{'{{card.titulo}}'}</code>
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

function TagActionEditor({
  form, setForm, tags, mode,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
  tags: Array<{ id: string; name: string; color: string }>
  mode: 'add' | 'remove'
}) {
  return (
    <div className="space-y-3">
      <Label>{mode === 'add' ? 'Tag pra adicionar ao card' : 'Tag pra tirar do card'}</Label>
      <Select
        value={form.tag_id || ''}
        onChange={(v) => setForm({ tag_id: v || null })}
        options={[
          { value: '', label: 'Selecione a tag...' },
          ...tags.map((t) => ({ value: t.id, label: t.name })),
        ]}
      />
      <p className="text-xs text-slate-500">
        {mode === 'add'
          ? 'Evita duplicatas: se o card já tiver a tag, a automação é pulada.'
          : 'Se o card não tiver essa tag, a automação é pulada automaticamente.'}
      </p>
      {tags.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Nenhuma tag cadastrada. Crie tags em Configurações → Tags antes de usar essa automação.
        </p>
      )}
    </div>
  )
}

function UpdateFieldEditor({
  form, setForm,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
}) {
  const fieldMeta = UPDATE_FIELD_OPTIONS.find((f) => f.key === form.update_field_key)
  return (
    <div className="space-y-4">
      <div>
        <Label>Qual campo atualizar</Label>
        <Select
          value={form.update_field_key || ''}
          onChange={(v) => setForm({ update_field_key: v || null, update_field_value: '' })}
          options={[
            { value: '', label: 'Selecione o campo...' },
            ...UPDATE_FIELD_OPTIONS.map((f) => ({ value: f.key, label: f.label })),
          ]}
        />
        <p className="text-xs text-slate-500 mt-1">
          Só campos seguros aparecem aqui. Pra mudar etapa, use "Mudar etapa" — evita loop.
        </p>
      </div>

      {form.update_field_key && (
        <div>
          <Label>Novo valor</Label>
          {fieldMeta?.type === 'boolean' ? (
            <Select
              value={form.update_field_value}
              onChange={(v) => setForm({ update_field_value: v })}
              options={[
                { value: '', label: 'Selecione...' },
                { value: 'true', label: 'Sim' },
                { value: 'false', label: 'Não' },
              ]}
            />
          ) : fieldMeta?.options ? (
            <Select
              value={form.update_field_value}
              onChange={(v) => setForm({ update_field_value: v })}
              options={[
                { value: '', label: 'Selecione...' },
                ...fieldMeta.options.map((o) => ({ value: o, label: o })),
              ]}
            />
          ) : (
            <Input
              type={fieldMeta?.type === 'number' ? 'number' : 'text'}
              value={form.update_field_value}
              onChange={(e) => setForm({ update_field_value: e.target.value })}
              placeholder="Novo valor"
            />
          )}
          <p className="text-xs text-slate-500 mt-1">
            Se o campo já estiver com esse valor, a automação é pulada (evita loop).
          </p>
        </div>
      )}
    </div>
  )
}

function WebhookEditor({
  form, setForm,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>URL do webhook</Label>
        <Input
          type="url"
          value={form.webhook_url}
          onChange={(e) => setForm({ webhook_url: e.target.value })}
          placeholder="https://n8n.seusite.com/webhook/xxxx"
        />
        <p className="text-xs text-slate-500 mt-1">
          Vamos fazer POST nessa URL com os dados do card em JSON.
        </p>
      </div>
      <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded p-3">
        <div>
          <Label className="text-sm">Incluir dados do contato titular</Label>
          <p className="text-xs text-slate-500 mt-0.5">Nome, telefone e e-mail do titular do card.</p>
        </div>
        <Switch
          checked={form.webhook_include_contact}
          onCheckedChange={(v) => setForm({ webhook_include_contact: v })}
        />
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded p-3">
        <p className="text-xs text-amber-900">
          <strong>Cuidado:</strong> webhook chamado a cada disparo da automação. Se falhar (timeout 8s ou 4xx/5xx),
          a execução é marcada como erro e aparece em "Falhas recentes".
        </p>
      </div>
    </div>
  )
}

function NotifyInternalEditor({
  form, setForm, users,
}: {
  form: FormState
  setForm: (next: Partial<FormState>) => void
  users: Array<{ id: string; nome_completo: string }>
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Quem recebe</Label>
        <Select
          value={form.notify_recipient_mode}
          onChange={(v) => setForm({ notify_recipient_mode: v as 'card_owner' | 'specific' | 'admins' })}
          options={[
            { value: 'card_owner', label: 'Dono do card' },
            { value: 'specific', label: 'Pessoa específica' },
            { value: 'admins', label: 'Todos os admins' },
          ]}
        />
      </div>
      {form.notify_recipient_mode === 'specific' && (
        <div>
          <Label>Quem</Label>
          <Select
            value={form.notify_user_id || ''}
            onChange={(v) => setForm({ notify_user_id: v || null })}
            options={[
              { value: '', label: 'Selecione...' },
              ...users.map((u) => ({ value: u.id, label: u.nome_completo })),
            ]}
          />
        </div>
      )}
      <div>
        <Label>Título da notificação</Label>
        <Input
          value={form.notify_title}
          onChange={(e) => setForm({ notify_title: e.target.value })}
          placeholder="Ex: Card precisa de ação"
          maxLength={200}
        />
      </div>
      <div>
        <Label>Detalhes (opcional)</Label>
        <Textarea
          value={form.notify_body}
          onChange={(e) => setForm({ notify_body: e.target.value })}
          placeholder="Ex: O card {{card.titulo}} está parado há 5 dias."
          maxLength={500}
          rows={3}
        />
        <p className="text-xs text-slate-500 mt-1">
          Você pode usar <code className="bg-slate-100 px-1 rounded">{'{{card.titulo}}'}</code> no título ou no detalhe.
        </p>
      </div>
    </div>
  )
}

interface SimulateResult {
  action_type: string
  card?: { id: string; titulo: string } | null
  contact?: { id: string; nome: string; telefone: string | null } | null
  warnings?: string[]
  send_mode?: 'hsm' | 'text'
  hsm_template_name?: string
  rendered_params?: string[]
  rendered_body?: string
  target_stage?: { id: string; nome: string }
  tasks?: Array<{ titulo: string; tipo: string; assign_to: string }>
  cadence?: { id: string; name: string; description: string | null }
  tag?: { id: string; name: string; color: string | null }
  notify?: { recipient_mode: string; title: string; body: string }
  update_field?: { field_key: string; old_value?: unknown; new_value?: unknown; invalid?: boolean }
  webhook?: { url_host: string; protocol: string }
}

function SimulatePanel({
  form,
  currentProduct,
}: {
  form: FormState
  currentProduct: string | null | undefined
}) {
  const [recentCards, setRecentCards] = useState<Array<{ id: string; titulo: string; stage?: string }>>([])
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const load = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('cards')
        .select('id, titulo, pipeline_stages:pipeline_stage_id(nome)')
        .order('created_at', { ascending: false })
        .limit(10)
      if (currentProduct) q = q.eq('produto', currentProduct)
      const { data } = await q
      setRecentCards(
        (data || []).map((c: { id: string; titulo: string; pipeline_stages?: { nome: string } | null }) => ({
          id: c.id,
          titulo: c.titulo,
          stage: c.pipeline_stages?.nome,
        }))
      )
    }
    load()
  }, [currentProduct])

  const runSimulation = async () => {
    if (!selectedCardId) {
      toast.error('Escolha um card pra simular')
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const taskConfigs = form.action_type === 'create_task' ? [{
        titulo: form.task_title,
        tipo: form.task_tipo,
        assign_to: form.task_assign_to,
        assign_to_user_id: form.task_assign_to_user_id,
      }] : []
      const actionConfig: Record<string, unknown> = {}
      if (form.action_type === 'send_message') {
        if (form.message_mode === 'hsm' && form.hsm_template_name) {
          actionConfig.hsm_template_name = form.hsm_template_name
          actionConfig.hsm_language = form.hsm_language
          actionConfig.hsm_params = form.hsm_params
        } else if (form.message_mode === 'template' && form.template_id) {
          actionConfig.template_id = form.template_id
        } else if (form.message_mode === 'custom' && form.message_body.trim()) {
          actionConfig.corpo = form.message_body.trim()
        }
      }
      if (form.action_type === 'change_stage') actionConfig.target_stage_id = form.target_stage_id
      if (form.action_type === 'add_tag' || form.action_type === 'remove_tag') {
        actionConfig.tag_id = form.tag_id
      }
      if (form.action_type === 'notify_internal') {
        actionConfig.recipient_mode = form.notify_recipient_mode
        if (form.notify_recipient_mode === 'specific' && form.notify_user_id) {
          actionConfig.user_id = form.notify_user_id
        }
        actionConfig.title = form.notify_title
        actionConfig.body = form.notify_body
      }
      if (form.action_type === 'update_field') {
        actionConfig.field_key = form.update_field_key
        const fieldMeta = UPDATE_FIELD_OPTIONS.find((f) => f.key === form.update_field_key)
        const raw = form.update_field_value
        if (raw === '' || raw == null) {
          actionConfig.value = null
        } else if (fieldMeta?.type === 'number') {
          actionConfig.value = Number(raw)
        } else if (fieldMeta?.type === 'boolean') {
          actionConfig.value = raw === 'true'
        } else {
          actionConfig.value = raw
        }
      }
      if (form.action_type === 'trigger_n8n_webhook') {
        actionConfig.url = form.webhook_url.trim()
        actionConfig.include_contact = form.webhook_include_contact
      }

      const { data, error } = await supabase.functions.invoke('cadence-engine', {
        body: {
          action: 'simulate_automation',
          card_id: selectedCardId,
          trigger: {
            name: form.name,
            action_type: form.action_type,
            action_config: actionConfig,
            task_configs: taskConfigs,
            target_template_id: form.target_cadence_template_id,
          },
        },
      })
      if (error) throw error
      setResult(data as SimulateResult)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro na simulação')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-indigo-600" />
            Simular antes de ativar
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Escolha um card e veja o que a automação faria. <strong>Nada é enviado ou alterado.</strong>
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Select
          value={selectedCardId}
          onChange={setSelectedCardId}
          options={[
            { value: '', label: 'Selecione um card...' },
            ...recentCards.map((c) => ({ value: c.id, label: c.stage ? `${c.titulo} — ${c.stage}` : c.titulo })),
          ]}
        />
        <Button onClick={runSimulation} disabled={running || !selectedCardId}>
          {running ? 'Simulando...' : 'Simular'}
        </Button>
      </div>

      {result && (
        <div className="pt-4 border-t border-slate-200 space-y-3">
          {(result.warnings?.length ?? 0) > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <ul className="text-sm text-amber-900 space-y-0.5 list-disc list-inside">
                {result.warnings!.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="text-sm space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Destinatário</p>
            {result.contact ? (
              <p className="text-slate-700">
                {result.contact.nome}
                {result.contact.telefone && <span className="text-slate-500 ml-2">({result.contact.telefone})</span>}
              </p>
            ) : (
              <p className="text-slate-400 italic">Sem contato</p>
            )}
          </div>

          {result.action_type === 'send_message' && result.send_mode === 'hsm' && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Template HSM</p>
              <p className="text-sm text-slate-700">
                <code className="bg-slate-100 px-1.5 py-0.5 rounded">{result.hsm_template_name}</code>
              </p>
              {(result.rendered_params?.length ?? 0) > 0 && (
                <ul className="text-xs text-slate-600 mt-2 space-y-0.5">
                  {result.rendered_params!.map((p, i) => (
                    <li key={i}>
                      <code className="bg-slate-100 px-1 py-0.5 rounded">{`{{${i + 1}}}`}</code>
                      <span className="ml-2">→ "{p}"</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result.action_type === 'send_message' && result.send_mode === 'text' && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Mensagem renderizada</p>
              <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 whitespace-pre-wrap">
                {result.rendered_body || <span className="text-slate-400 italic">(vazia)</span>}
              </div>
            </div>
          )}

          {result.action_type === 'change_stage' && result.target_stage && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Etapa alvo</p>
              <p className="text-sm text-slate-700">{result.target_stage.nome}</p>
            </div>
          )}

          {result.action_type === 'create_task' && (result.tasks?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Tarefa(s) que seria(m) criada(s)</p>
              <ul className="text-sm text-slate-700 space-y-1">
                {result.tasks!.map((t, i) => (
                  <li key={i}>
                    <strong>{t.titulo}</strong> <span className="text-slate-500">({t.tipo} → {t.assign_to})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.action_type === 'start_cadence' && result.cadence && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Cadência</p>
              <p className="text-sm text-slate-700">{result.cadence.name}</p>
              {result.cadence.description && <p className="text-xs text-slate-500 mt-1">{result.cadence.description}</p>}
            </div>
          )}

          {(result.action_type === 'add_tag' || result.action_type === 'remove_tag') && result.tag && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                Tag que seria {result.action_type === 'add_tag' ? 'adicionada' : 'removida'}
              </p>
              <div className="flex items-center gap-2">
                {result.tag.color && (
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: result.tag.color }} />
                )}
                <span className="text-sm text-slate-700">{result.tag.name}</span>
              </div>
            </div>
          )}

          {result.action_type === 'notify_internal' && result.notify && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                Notificação no sino
              </p>
              <p className="text-sm text-slate-500 mb-2">
                Destinatário: {result.notify.recipient_mode === 'card_owner' ? 'Dono do card'
                  : result.notify.recipient_mode === 'specific' ? 'Pessoa específica'
                  : 'Todos os admins'}
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded p-3">
                <p className="text-sm font-semibold text-slate-900">{result.notify.title || '(sem título)'}</p>
                {result.notify.body && (
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{result.notify.body}</p>
                )}
              </div>
            </div>
          )}

          {result.action_type === 'update_field' && result.update_field && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Campo que seria atualizado</p>
              <p className="text-sm text-slate-700">
                <strong>{result.update_field.field_key}</strong>
              </p>
              <div className="text-xs text-slate-600 mt-1 grid grid-cols-2 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded p-2">
                  <span className="text-slate-500 uppercase tracking-wide text-[10px]">Antes</span>
                  <div className="text-slate-700 mt-0.5">{formatFieldValue(result.update_field.old_value)}</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded p-2">
                  <span className="text-indigo-600 uppercase tracking-wide text-[10px]">Depois</span>
                  <div className="text-indigo-900 mt-0.5">{formatFieldValue(result.update_field.new_value)}</div>
                </div>
              </div>
            </div>
          )}

          {result.action_type === 'trigger_n8n_webhook' && result.webhook && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Webhook que seria chamado</p>
              <p className="text-sm text-slate-700">
                <code className="bg-slate-100 px-1.5 py-0.5 rounded">{result.webhook.protocol}//{result.webhook.url_host}</code>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                POST JSON com dados do card e do contato titular.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatFieldValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v)
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
  const { data: waTemplates = [], isLoading: waTemplatesLoading } = useWhatsAppTemplates(null)
  const { tags: cardTags } = useCardTags(currentProduct || undefined)

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

      // Automações cron_roteamento têm página dedicada
      if (data.event_type === 'cron_roteamento') {
        navigate(`/settings/automations/roteamento/${id}`, { replace: true })
        return
      }

      const cfg = data.action_config || {}
      const evCfg = data.event_config || {}
      const loadedMode: FormState['message_mode'] = cfg.hsm_template_name
        ? 'hsm'
        : cfg.corpo && !cfg.template_id
          ? 'custom'
          : 'template'
      setFormState({
        ...DEFAULT_FORM,
        name: data.name || '',
        event_type: data.event_type,
        event_config: evCfg,
        stage_ids: data.applicable_stage_ids || [],
        action_type: data.action_type,
        template_id: cfg.template_id || null,
        message_body: cfg.corpo || '',
        message_mode: loadedMode,
        hsm_template_name: cfg.hsm_template_name || null,
        hsm_language: cfg.hsm_language || 'pt_BR',
        hsm_params: Array.isArray(cfg.hsm_params) ? cfg.hsm_params : [],
        phone_number_id: cfg.phone_number_id || null,
        dedup_hours: typeof cfg.dedup_hours === 'number' ? cfg.dedup_hours : 24,
        task_title: (data.task_configs?.[0]?.titulo) || '',
        task_tipo: (data.task_configs?.[0]?.tipo) || 'contato',
        task_assign_to: (data.task_configs?.[0]?.assign_to) || 'card_owner',
        task_assign_to_user_id: data.task_configs?.[0]?.assign_to_user_id || null,
        target_stage_id: cfg.target_stage_id || null,
        target_cadence_template_id: data.target_template_id || null,
        tag_id: cfg.tag_id || null,
        notify_recipient_mode: (cfg.recipient_mode as 'card_owner' | 'specific' | 'admins') || 'card_owner',
        notify_user_id: cfg.user_id || null,
        notify_title: cfg.title || '',
        notify_body: cfg.body || '',
        update_field_key: cfg.field_key || null,
        update_field_value: cfg.value !== undefined && cfg.value !== null ? String(cfg.value) : '',
        webhook_url: cfg.url || '',
        webhook_include_contact: cfg.include_contact !== false,
        delay_minutes: data.delay_minutes ?? 5,
        delay_type: data.delay_type || 'business',
        is_active: data.is_active ?? false,
      })
      setLoading(false)
    }
    load()
  }, [id, isNew, navigate])

  const pickRecipe = (recipe: RecipePreset) => {
    const suggestedHsm = recipe.preset.suggested_hsm_template
    // HSM default: se a receita sugere um, pre-seleciona e prepara 1 param {{contact.primeiro_nome}}
    //   (o usuário pode trocar depois; número correto de params é recalculado no picker)
    const initialMode: FormState['message_mode'] = suggestedHsm
      ? 'hsm'
      : recipe.preset.suggested_message
        ? 'custom'
        : 'template'
    setFormState({
      ...DEFAULT_FORM,
      name: recipe.name,
      event_type: recipe.preset.event_type,
      event_config: recipe.preset.event_config || {},
      action_type: recipe.preset.action_type,
      template_id: (recipe.preset.action_config?.template_id as string) || null,
      message_body: recipe.preset.suggested_message || '',
      message_mode: initialMode,
      hsm_template_name: suggestedHsm || null,
      hsm_params: suggestedHsm ? ['{{contact.primeiro_nome}}'] : [],
      task_title: recipe.preset.suggested_task_title || '',
      target_stage_id: (recipe.preset.action_config?.target_stage_id as string) || null,
      target_cadence_template_id: (recipe.preset.action_config?.target_template_id as string) || null,
      tag_id: (recipe.preset.action_config?.tag_id as string) || null,
      notify_recipient_mode: (recipe.preset.action_config?.recipient_mode as 'card_owner' | 'specific' | 'admins') || 'card_owner',
      notify_user_id: (recipe.preset.action_config?.user_id as string) || null,
      notify_title: (recipe.preset.action_config?.title as string) || '',
      notify_body: (recipe.preset.action_config?.body as string) || '',
      update_field_key: (recipe.preset.action_config?.field_key as string) || null,
      update_field_value: recipe.preset.action_config?.value != null ? String(recipe.preset.action_config.value) : '',
      webhook_url: (recipe.preset.action_config?.url as string) || '',
      webhook_include_contact: recipe.preset.action_config?.include_contact !== false,
    })
    setStep('editor')
  }

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Dê um nome à automação'
    if (form.action_type === 'send_message') {
      if (form.message_mode === 'hsm' && !form.hsm_template_name) return 'Selecione um template HSM aprovado'
      if (form.message_mode === 'template' && !form.template_id) return 'Selecione um template'
      if (form.message_mode === 'custom' && !form.message_body.trim()) return 'Escreva o texto da mensagem'
    }
    if (form.action_type === 'create_task' && !form.task_title.trim()) return 'Dê um título à tarefa'
    if (form.action_type === 'change_stage' && !form.target_stage_id) return 'Selecione a etapa alvo'
    if (form.action_type === 'start_cadence' && !form.target_cadence_template_id) return 'Selecione a cadência'
    if ((form.action_type === 'add_tag' || form.action_type === 'remove_tag') && !form.tag_id) {
      return 'Selecione a tag'
    }
    if (form.action_type === 'notify_internal') {
      if (!form.notify_title.trim()) return 'Escreva um título pra notificação'
      if (form.notify_recipient_mode === 'specific' && !form.notify_user_id) {
        return 'Selecione quem vai receber a notificação'
      }
    }
    if (form.action_type === 'update_field' && !form.update_field_key) {
      return 'Selecione o campo pra atualizar'
    }
    if (form.action_type === 'trigger_n8n_webhook') {
      if (!form.webhook_url.trim()) return 'Informe a URL do webhook'
      try {
        const u = new URL(form.webhook_url.trim())
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'URL precisa ser http(s)'
      } catch {
        return 'URL inválida'
      }
    }
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
        if (form.message_mode === 'hsm' && form.hsm_template_name) {
          actionConfig.hsm_template_name = form.hsm_template_name
          actionConfig.hsm_language = form.hsm_language
          actionConfig.hsm_params = form.hsm_params
        }
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
      if (form.action_type === 'add_tag' || form.action_type === 'remove_tag') {
        actionConfig.tag_id = form.tag_id
      }
      if (form.action_type === 'notify_internal') {
        actionConfig.recipient_mode = form.notify_recipient_mode
        if (form.notify_recipient_mode === 'specific' && form.notify_user_id) {
          actionConfig.user_id = form.notify_user_id
        }
        actionConfig.title = form.notify_title.trim()
        actionConfig.body = form.notify_body.trim()
      }
      if (form.action_type === 'update_field') {
        actionConfig.field_key = form.update_field_key
        const fieldMeta = UPDATE_FIELD_OPTIONS.find((f) => f.key === form.update_field_key)
        const raw = form.update_field_value
        if (raw === '' || raw == null) {
          actionConfig.value = null
        } else if (fieldMeta?.type === 'number') {
          actionConfig.value = Number(raw)
        } else if (fieldMeta?.type === 'boolean') {
          actionConfig.value = raw === 'true'
        } else {
          actionConfig.value = raw
        }
      }
      if (form.action_type === 'trigger_n8n_webhook') {
        actionConfig.url = form.webhook_url.trim()
        actionConfig.include_contact = form.webhook_include_contact
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
              {form.action_type === 'send_message' && form.message_mode === 'hsm' && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  HSM: <code className="text-xs">{form.hsm_template_name}</code> ({form.hsm_params.length} params)
                </p>
              )}
              {form.action_type === 'send_message' && form.message_mode === 'template' && (
                <p className="text-xs text-slate-500 mt-1">
                  Template: {messageTemplates.find((t) => t.id === form.template_id)?.nome || '—'}
                </p>
              )}
              {form.action_type === 'send_message' && form.message_mode === 'custom' && (
                <p className="text-xs text-slate-500 mt-1">Texto livre ({form.message_body.length} caracteres)</p>
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
              {(form.action_type === 'add_tag' || form.action_type === 'remove_tag') && (
                <p className="text-xs text-slate-500 mt-1">
                  Tag: {cardTags.find((t) => t.id === form.tag_id)?.name || '—'}
                </p>
              )}
              {form.action_type === 'notify_internal' && (
                <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                  <p>Destinatário: {
                    form.notify_recipient_mode === 'card_owner' ? 'Dono do card'
                    : form.notify_recipient_mode === 'specific'
                        ? (userOptions.find((u) => u.id === form.notify_user_id)?.nome_completo || '—')
                    : 'Todos os admins'
                  }</p>
                  <p>Título: {form.notify_title || '—'}</p>
                </div>
              )}
              {form.action_type === 'update_field' && (
                <p className="text-xs text-slate-500 mt-1">
                  Campo: {UPDATE_FIELD_OPTIONS.find((f) => f.key === form.update_field_key)?.label || '—'}
                  {form.update_field_value && <> → <strong>{form.update_field_value}</strong></>}
                </p>
              )}
              {form.action_type === 'trigger_n8n_webhook' && (
                <p className="text-xs text-slate-500 mt-1 break-all">
                  Webhook: {form.webhook_url || '—'}
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

        <SimulatePanel form={form} currentProduct={currentProduct} />

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
            <SendMessageEditor
              form={form}
              setForm={setForm}
              templates={messageTemplates}
              waTemplates={waTemplates}
              waTemplatesLoading={waTemplatesLoading}
            />
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
          {form.action_type === 'add_tag' && (
            <TagActionEditor form={form} setForm={setForm} tags={cardTags} mode="add" />
          )}
          {form.action_type === 'remove_tag' && (
            <TagActionEditor form={form} setForm={setForm} tags={cardTags} mode="remove" />
          )}
          {form.action_type === 'notify_internal' && (
            <NotifyInternalEditor form={form} setForm={setForm} users={userOptions} />
          )}
          {form.action_type === 'update_field' && (
            <UpdateFieldEditor form={form} setForm={setForm} />
          )}
          {form.action_type === 'trigger_n8n_webhook' && (
            <WebhookEditor form={form} setForm={setForm} />
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
