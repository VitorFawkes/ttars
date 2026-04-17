import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Save, Bot, Sparkles, Brain, Wrench,
  MessageSquare, BarChart3, AlertTriangle, PowerOff, Phone,
  Database, Radio, ImageIcon, Power, Handshake, Lightbulb, BookOpen, PlayCircle, ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useAiAgentDetail, useTogglePhoneLineConfig } from '@/hooks/useAiAgents'
import { useAiAgentHubStats } from '@/hooks/useAiAgentHubStats'
import { useAiAgentMetrics } from '@/hooks/useAiConversations'
import { cn } from '@/lib/utils'
import { AgentEditorLayout, type EditorTab } from '@/components/ai-agent/editor/AgentEditorLayout'
import { TabIdentidade } from '@/components/ai-agent/editor/TabIdentidade'
import { TabPrompts } from '@/components/ai-agent/editor/TabPrompts'
import { TabModelosComportamento } from '@/components/ai-agent/editor/TabModelosComportamento'
import { TabFerramentas } from '@/components/ai-agent/editor/TabFerramentas'
import { TabMemoria } from '@/components/ai-agent/editor/TabMemoria'
import { TabContextoCampos } from '@/components/ai-agent/editor/TabContextoCampos'
import { TabMultimodal } from '@/components/ai-agent/editor/TabMultimodal'
import { TabAtivacao } from '@/components/ai-agent/editor/TabAtivacao'
import { TabHandoff } from '@/components/ai-agent/editor/TabHandoff'
import { TabDecisoes } from '@/components/ai-agent/editor/TabDecisoes'
import { TabValidatorRules } from '@/components/ai-agent/editor/TabValidatorRules'
import { TabConhecimento } from '@/components/ai-agent/editor/TabConhecimento'
import { TabTeste } from '@/components/ai-agent/editor/TabTeste'
import {
  type AgentEditorForm,
  DEFAULT_TIMINGS, DEFAULT_PIPELINE_MODELS, DEFAULT_MEMORY,
  DEFAULT_MULTIMODAL, DEFAULT_CONTEXT_FIELDS, DEFAULT_HANDOFF_ACTIONS,
  DEFAULT_PROMPTS_EXTRA, HANDOFF_SIGNALS_CATALOG,
} from '@/components/ai-agent/editor/types'

const DEFAULT_FORM: AgentEditorForm = {
  nome: '',
  descricao: '',
  persona: '',
  tipo: 'sales',
  ativa: false,
  execution_backend: 'edge_function',
  system_prompt: '',
  prompts_extra: { ...DEFAULT_PROMPTS_EXTRA },
  modelo: 'gpt-5.1',
  temperature: 0.7,
  max_tokens: 1024,
  pipeline_models: { ...DEFAULT_PIPELINE_MODELS },
  timings: { ...DEFAULT_TIMINGS },
  assigned_skill_ids: [],
  memory_config: { ...DEFAULT_MEMORY },
  context_fields_config: { ...DEFAULT_CONTEXT_FIELDS },
  multimodal_config: { ...DEFAULT_MULTIMODAL },
  handoff_signals: HANDOFF_SIGNALS_CATALOG.map(s => ({ slug: s.slug, enabled: false, description: s.defaultDescription })),
  handoff_actions: { ...DEFAULT_HANDOFF_ACTIONS },
  intelligent_decisions: {},
  validator_rules: [],
  routing_keywords: '',
  escalation_message: '',
  escalation_turn_limit: 10,
  fallback_message: 'Desculpe, não consegui processar sua mensagem. Um agente humano vai ajudá-lo em breve.',
  n8n_webhook_url: '',
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

export default function AiAgentDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const { slug: currentProduct } = useCurrentProductMeta()

  const { data: existingAgent, isLoading: loadingAgent } = useAiAgentDetail(isNew ? undefined : id)
  const togglePhoneLine = useTogglePhoneLineConfig(isNew ? undefined : id)

  const [form, setForm] = useState<AgentEditorForm>(DEFAULT_FORM)
  const [activeTab, setActiveTab] = useState<string>('identidade')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!existingAgent) return
    const a = existingAgent
    const keywords = (a.routing_criteria as Record<string, unknown>)?.keywords as string[] | undefined
    const escalationRules = a.escalation_rules as Array<Record<string, unknown>>
    const promptsExtra = a.prompts_extra as Partial<AgentEditorForm['prompts_extra']> | null | undefined

    const storedSignals = (a.handoff_signals ?? []) as AgentEditorForm['handoff_signals']
    const mergedSignals = HANDOFF_SIGNALS_CATALOG.map(cat => {
      const found = storedSignals.find(s => s.slug === cat.slug)
      return found ?? { slug: cat.slug, enabled: false, description: cat.defaultDescription }
    })

    setForm({
      nome: a.nome,
      descricao: a.descricao || '',
      persona: a.persona || '',
      tipo: a.tipo,
      ativa: a.ativa,
      execution_backend: a.execution_backend || 'edge_function',
      system_prompt: a.system_prompt || '',
      prompts_extra: {
        context: promptsExtra?.context ?? '',
        data_update: promptsExtra?.data_update ?? '',
        formatting: promptsExtra?.formatting ?? '',
        validator: promptsExtra?.validator ?? '',
      },
      modelo: a.modelo,
      temperature: a.temperature,
      max_tokens: a.max_tokens,
      pipeline_models: { ...DEFAULT_PIPELINE_MODELS, ...((a.pipeline_models ?? {}) as unknown as AgentEditorForm['pipeline_models']) },
      timings: { ...DEFAULT_TIMINGS, ...((a.timings ?? {}) as AgentEditorForm['timings']) },
      assigned_skill_ids: a.ai_agent_skills?.filter(s => s.enabled).map(s => s.skill_id) || [],
      memory_config: { ...DEFAULT_MEMORY, ...((a.memory_config ?? {}) as unknown as AgentEditorForm['memory_config']) },
      context_fields_config: { ...DEFAULT_CONTEXT_FIELDS, ...((a.context_fields_config ?? {}) as unknown as AgentEditorForm['context_fields_config']) },
      multimodal_config: { ...DEFAULT_MULTIMODAL, ...((a.multimodal_config ?? {}) as AgentEditorForm['multimodal_config']) },
      handoff_signals: mergedSignals,
      handoff_actions: { ...DEFAULT_HANDOFF_ACTIONS, ...((a.handoff_actions ?? {}) as AgentEditorForm['handoff_actions']) },
      intelligent_decisions: (a.intelligent_decisions ?? {}) as AgentEditorForm['intelligent_decisions'],
      validator_rules: (a.validator_rules ?? []) as AgentEditorForm['validator_rules'],
      routing_keywords: keywords?.join(', ') || '',
      escalation_message: (escalationRules?.[0]?.message as string) || '',
      escalation_turn_limit: (escalationRules?.[0]?.turn_limit as number) || 10,
      fallback_message: a.fallback_message || '',
      n8n_webhook_url: a.n8n_webhook_url || '',
    })
    setDirty(false)
  }, [existingAgent])

  const setFormWrapper: typeof setForm = (updater) => {
    setForm(updater)
    setDirty(true)
  }

  const handleSave = async () => {
    if (!form.nome.trim() || !form.system_prompt.trim()) {
      toast.error('Nome e prompt principal são obrigatórios')
      return
    }
    setSaving(true)
    try {
      const payload = {
        produto: currentProduct,
        nome: form.nome,
        descricao: form.descricao || null,
        persona: form.persona || null,
        tipo: form.tipo,
        modelo: form.modelo,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        system_prompt: form.system_prompt,
        prompts_extra: form.prompts_extra,
        pipeline_models: form.pipeline_models,
        timings: form.timings,
        memory_config: form.memory_config,
        context_fields_config: form.context_fields_config,
        multimodal_config: form.multimodal_config,
        handoff_signals: form.handoff_signals,
        handoff_actions: form.handoff_actions,
        intelligent_decisions: form.intelligent_decisions,
        validator_rules: form.validator_rules,
        fallback_message: form.fallback_message || null,
        n8n_webhook_url: form.n8n_webhook_url || null,
        ativa: form.ativa,
        routing_criteria: {
          keywords: form.routing_keywords.split(',').map(k => k.trim()).filter(Boolean),
        },
        escalation_rules: form.escalation_message
          ? [{
              condition: `turn_count > ${form.escalation_turn_limit}`,
              target_agent_id: null,
              message: form.escalation_message,
              turn_limit: form.escalation_turn_limit,
            }]
          : [],
      }

      let agentId = id
      if (isNew) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('ai_agents').insert(payload).select().single()
        if (error) throw error
        agentId = data.id
        toast.success('Agente criado')
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('ai_agents')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) throw error
        toast.success('Agente atualizado')
      }

      if (agentId && agentId !== 'new') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('ai_agent_skills').delete().eq('agent_id', agentId)
        if (form.assigned_skill_ids.length > 0) {
          const skillRows = form.assigned_skill_ids.map((skillId, i) => ({
            agent_id: agentId,
            skill_id: skillId,
            enabled: true,
            priority: i,
          }))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('ai_agent_skills').insert(skillRows)
        }
      }

      setDirty(false)
      if (isNew) navigate('/settings/ai-agents')
    } catch (err) {
      toast.error('Erro ao salvar agente')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const agentIds = isNew || !id ? [] : [id]
  const { data: hubStats } = useAiAgentHubStats(agentIds)
  const stat = !isNew && id ? hubStats?.[id] : undefined

  const { data: metrics = [] } = useAiAgentMetrics(isNew ? undefined : id, 30)
  const escalationRate = (() => {
    if (metrics.length === 0) return null
    const started = metrics.reduce((s, m) => s + m.conversations_started, 0)
    const escalated = metrics.reduce((s, m) => s + m.conversations_escalated, 0)
    return started > 0 ? escalated / started : null
  })()
  const avgTurns = (() => {
    const withTurns = metrics.filter(m => m.avg_turns_per_conversation != null)
    if (withTurns.length === 0) return null
    return withTurns.reduce((s, m) => s + (m.avg_turns_per_conversation ?? 0), 0) / withTurns.length
  })()

  const isN8n = form.execution_backend === 'n8n'

  const tabs: EditorTab[] = useMemo(() => [
    { id: 'identidade', label: 'Identidade', icon: Bot },
    { id: 'prompts', label: 'Prompts', icon: Sparkles, disabled: isN8n, disabledHint: 'Este agente usa n8n — edite os prompts no workflow' },
    { id: 'modelos', label: 'Modelos & Comportamento', icon: Brain, disabled: isN8n, disabledHint: 'Configuração mora no n8n' },
    { id: 'ferramentas', label: 'Ferramentas', icon: Wrench },
    { id: 'conhecimento', label: 'Conhecimento', icon: BookOpen },
    { id: 'memoria', label: 'Memória', icon: Database, disabled: isN8n, disabledHint: 'Memória mora no n8n' },
    { id: 'contexto', label: 'Contexto & Campos', icon: Radio },
    { id: 'multimodal', label: 'Multimodal', icon: ImageIcon, disabled: isN8n, disabledHint: 'Config mora no n8n' },
    { id: 'handoff', label: 'Handoff', icon: Handshake },
    { id: 'decisoes', label: 'Decisões inteligentes', icon: Lightbulb },
    { id: 'validador', label: 'Regras do validador', icon: ShieldAlert, disabled: isN8n, disabledHint: 'Validador mora no n8n' },
    { id: 'ativacao', label: 'Ativação', icon: Power },
    { id: 'teste', label: 'Teste ao vivo', icon: PlayCircle, disabled: isN8n, disabledHint: 'Julia roda no n8n — teste lá' },
  ], [isN8n])

  if (!isNew && loadingAgent) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-12 bg-slate-200 rounded-lg w-64 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings/ai-agents')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {isNew ? 'Novo agente IA' : form.nome || 'Editar agente'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {isNew ? 'Configure um novo agente WhatsApp' : 'Editor completo — todas as configurações em um lugar.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-amber-600">• alterações não salvas</span>}
          <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      {!isNew && isN8n && (
        <section className="bg-gradient-to-br from-orange-50/50 to-white border border-orange-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-semibold text-orange-600">n8n</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-orange-900">Este agente executa no n8n</p>
              <p className="text-sm text-orange-700 mt-1">
                Prompts e modelos moram no workflow do n8n. Este painel permite editar identidade, ativar/desativar linhas e ajustar handoff/decisões que o workflow consome do banco.
              </p>
              <Button
                variant="outline" size="sm" className="mt-3 gap-2"
                onClick={() => window.open('https://n8n-n8n.ymnmx7.easypanel.host/workflow/tvh1SN7VDgy8V3VI', '_blank')}
              >
                Abrir no n8n
              </Button>
            </div>
          </div>
        </section>
      )}

      {!isNew && id && (
        <section className="bg-gradient-to-br from-indigo-50/50 to-white border border-indigo-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-2.5 h-2.5 rounded-full', form.ativa ? 'bg-green-500 animate-pulse' : 'bg-slate-300')} />
              <p className="text-sm font-medium text-slate-700">
                {form.ativa ? 'Agente ativo — respondendo clientes' : 'Agente pausado'}
              </p>
              {!isNew && existingAgent && !existingAgent.ativa && existingAgent.ativa_changed_at && (
                <span className="text-xs text-slate-500 ml-1">
                  Desligado {formatRelative(existingAgent.ativa_changed_at)}
                  {existingAgent.ativa_changed_by_profile?.nome && ` por ${existingAgent.ativa_changed_by_profile.nome}`}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate(`/settings/ai-agents/conversations?agent=${id}`)} className="gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Conversas
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/settings/ai-agents/analytics?agent=${id}`)} className="gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> Analytics
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Conversas (7d)" value={stat?.conversations_count} />
            <StatCard label="Taxa resolução" value={stat?.resolution_rate != null ? `${Math.round(stat.resolution_rate * 100)}%` : undefined} />
            <StatCard label="Escalação (30d)" value={escalationRate != null ? `${Math.round(escalationRate * 100)}%` : undefined} />
            <StatCard label="Média de turnos" value={avgTurns != null ? avgTurns.toFixed(1) : undefined} />
          </div>
        </section>
      )}

      {!isNew && existingAgent && existingAgent.ai_agent_phone_line_config && existingAgent.ai_agent_phone_line_config.length > 0 && (
        <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-3">
          <header className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-teal-500" />
            <h3 className="text-sm font-semibold text-slate-900">Linhas WhatsApp que este agente atende</h3>
          </header>

          {!existingAgent.ativa && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <PowerOff className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">Agente desligado — nenhuma mensagem é respondida mesmo com linhas ativas.</p>
            </div>
          )}
          {existingAgent.ativa && existingAgent.ai_agent_phone_line_config.every(l => !l.ativa) && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">Agente ligado, mas nenhuma linha está ativa.</p>
            </div>
          )}

          <div className="space-y-2">
            {existingAgent.ai_agent_phone_line_config.map(line => (
              <div key={line.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', line.ativa && existingAgent.ativa ? 'bg-green-500' : 'bg-slate-300')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {line.whatsapp_linha_config?.phone_number_label || 'Linha sem nome'}
                    </p>
                    {line.whatsapp_linha_config?.phone_number_id && (
                      <p className="text-xs text-slate-500 truncate">ID: {line.whatsapp_linha_config.phone_number_id}</p>
                    )}
                  </div>
                </div>
                <Switch
                  checked={line.ativa}
                  disabled={togglePhoneLine.isPending}
                  onCheckedChange={(v) => {
                    togglePhoneLine.mutate(
                      { configId: line.id, ativa: v },
                      {
                        onSuccess: () => toast.success(v ? 'Linha ativada' : 'Linha desativada'),
                        onError: () => toast.error('Erro ao atualizar linha'),
                      }
                    )
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <AgentEditorLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'identidade' && <TabIdentidade form={form} setForm={setFormWrapper} />}
        {activeTab === 'prompts' && !isN8n && <TabPrompts form={form} setForm={setFormWrapper} />}
        {activeTab === 'modelos' && !isN8n && <TabModelosComportamento form={form} setForm={setFormWrapper} />}
        {activeTab === 'ferramentas' && <TabFerramentas form={form} setForm={setFormWrapper} />}
        {activeTab === 'conhecimento' && <TabConhecimento agentId={isNew ? undefined : id} />}
        {activeTab === 'teste' && !isN8n && <TabTeste agentId={isNew ? undefined : id} />}
        {activeTab === 'memoria' && !isN8n && <TabMemoria form={form} setForm={setFormWrapper} />}
        {activeTab === 'contexto' && <TabContextoCampos form={form} setForm={setFormWrapper} />}
        {activeTab === 'multimodal' && !isN8n && <TabMultimodal form={form} setForm={setFormWrapper} />}
        {activeTab === 'handoff' && <TabHandoff form={form} setForm={setFormWrapper} />}
        {activeTab === 'decisoes' && <TabDecisoes form={form} setForm={setFormWrapper} />}
        {activeTab === 'validador' && !isN8n && <TabValidatorRules form={form} setForm={setFormWrapper} />}
        {activeTab === 'ativacao' && (
          <TabAtivacao
            form={form}
            setForm={setFormWrapper}
            agentId={isNew ? undefined : id}
            phoneLines={existingAgent?.ai_agent_phone_line_config}
          />
        )}
      </AgentEditorLayout>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-slate-100">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-xl font-semibold text-slate-900 tracking-tight mt-0.5">
        {value ?? <span className="text-slate-300">—</span>}
      </p>
    </div>
  )
}
