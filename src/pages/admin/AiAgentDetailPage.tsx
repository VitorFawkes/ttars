import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Save, Bot, Plus,
  Brain, Sparkles, HeadphonesIcon, ShieldCheck, ArrowRightLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useAiAgentDetail } from '@/hooks/useAiAgents'
import { useAiSkills, type AiSkill } from '@/hooks/useAiSkills'
import type { AgentTipo } from '@/hooks/useAiAgents'
import { cn } from '@/lib/utils'

const TIPO_OPTIONS: { value: AgentTipo; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'sales', label: 'Vendas', icon: Sparkles },
  { value: 'support', label: 'Suporte', icon: HeadphonesIcon },
  { value: 'success', label: 'Customer Success', icon: ShieldCheck },
  { value: 'specialist', label: 'Especialista', icon: Brain },
  { value: 'router', label: 'Roteador', icon: ArrowRightLeft },
]

const MODELO_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { value: 'gpt-5.1', label: 'GPT-5.1' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
]

interface FormData {
  nome: string
  descricao: string
  persona: string
  tipo: AgentTipo
  modelo: string
  temperature: number
  max_tokens: number
  system_prompt: string
  fallback_message: string
  n8n_webhook_url: string
  routing_keywords: string
  escalation_message: string
  escalation_turn_limit: number
  ativa: boolean
}

const DEFAULT_FORM: FormData = {
  nome: '',
  descricao: '',
  persona: '',
  tipo: 'sales',
  modelo: 'claude-sonnet-4-6',
  temperature: 0.7,
  max_tokens: 1024,
  system_prompt: '',
  fallback_message: 'Desculpe, não consegui processar sua mensagem. Um agente humano vai ajudá-lo em breve.',
  n8n_webhook_url: '',
  routing_keywords: '',
  escalation_message: 'Vou transferir você para um especialista...',
  escalation_turn_limit: 10,
  ativa: false,
}

export default function AiAgentDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const { slug: currentProduct } = useCurrentProductMeta()

  const { data: existingAgent, isLoading: loadingAgent } = useAiAgentDetail(isNew ? undefined : id)
  const { skills: allSkills } = useAiSkills()

  const [form, setForm] = useState<FormData>(DEFAULT_FORM)
  const [assignedSkillIds, setAssignedSkillIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (existingAgent) {
      const keywords = (existingAgent.routing_criteria as Record<string, unknown>)?.keywords as string[] | undefined
      const escalationRules = existingAgent.escalation_rules as Array<Record<string, unknown>>
      setForm({
        nome: existingAgent.nome,
        descricao: existingAgent.descricao || '',
        persona: existingAgent.persona || '',
        tipo: existingAgent.tipo,
        modelo: existingAgent.modelo,
        temperature: existingAgent.temperature,
        max_tokens: existingAgent.max_tokens,
        system_prompt: existingAgent.system_prompt,
        fallback_message: existingAgent.fallback_message || '',
        n8n_webhook_url: existingAgent.n8n_webhook_url || '',
        routing_keywords: keywords?.join(', ') || '',
        escalation_message: escalationRules?.[0]?.message as string || '',
        escalation_turn_limit: (escalationRules?.[0]?.turn_limit as number) || 10,
        ativa: existingAgent.ativa,
      })
      setAssignedSkillIds(
        existingAgent.ai_agent_skills
          ?.filter(s => s.enabled)
          .map(s => s.skill_id) || []
      )
    }
  }, [existingAgent])

  const handleSave = async () => {
    if (!form.nome.trim() || !form.system_prompt.trim()) {
      toast.error('Nome e System Prompt são obrigatórios')
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
        fallback_message: form.fallback_message || null,
        n8n_webhook_url: form.n8n_webhook_url || null,
        ativa: form.ativa,
        routing_criteria: {
          keywords: form.routing_keywords
            .split(',')
            .map(k => k.trim())
            .filter(Boolean),
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
          .from('ai_agents')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        agentId = data.id
        toast.success('Agente criado com sucesso')
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('ai_agents')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) throw error
        toast.success('Agente atualizado')
      }

      // Sync skills
      if (agentId && agentId !== 'new') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('ai_agent_skills').delete().eq('agent_id', agentId)
        if (assignedSkillIds.length > 0) {
          const skillRows = assignedSkillIds.map((skillId, i) => ({
            agent_id: agentId,
            skill_id: skillId,
            enabled: true,
            priority: i,
          }))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('ai_agent_skills').insert(skillRows)
        }
      }

      navigate('/settings/ai-agents')
    } catch (err) {
      toast.error('Erro ao salvar agente')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const toggleSkill = (skillId: string) => {
    setAssignedSkillIds(prev =>
      prev.includes(skillId)
        ? prev.filter(id => id !== skillId)
        : [...prev, skillId]
    )
  }

  if (!isNew && loadingAgent) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-12 bg-slate-200 rounded-lg w-64 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings/ai-agents')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {isNew ? 'Novo Agente IA' : form.nome || 'Editar Agente'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {isNew ? 'Configure um novo agente WhatsApp inteligente' : 'Edite as configurações do agente'}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      {/* Identidade */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Bot className="w-5 h-5 text-indigo-500" />
          Identidade
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nome do Agente *</Label>
            <Input
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Julia Sales"
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select
              value={form.tipo}
              onChange={(v: string) => setForm(f => ({ ...f, tipo: v as AgentTipo }))}
              options={TIPO_OPTIONS.map(t => ({ value: t.value, label: t.label }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Persona (descrição curta)</Label>
          <Input
            value={form.persona}
            onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
            placeholder="Consultora de viagens especializada em destinos internacionais"
          />
        </div>

        <div className="space-y-2">
          <Label>Descrição</Label>
          <Textarea
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Descreva o que este agente faz e quando ele é acionado"
            rows={2}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Switch
            checked={form.ativa}
            onCheckedChange={v => setForm(f => ({ ...f, ativa: v }))}
          />
          <Label className="cursor-pointer">Agente ativo</Label>
        </div>
      </section>

      {/* Modelo */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          Modelo & Configuração
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Modelo LLM</Label>
            <Select
              value={form.modelo}
              onChange={(v: string) => setForm(f => ({ ...f, modelo: v }))}
              options={MODELO_OPTIONS}
            />
          </div>

          <div className="space-y-2">
            <Label>Temperature ({form.temperature})</Label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={form.temperature}
              onChange={e => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) }))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>Preciso</span>
              <span>Criativo</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Max Tokens</Label>
            <Input
              type="number"
              value={form.max_tokens}
              onChange={e => setForm(f => ({ ...f, max_tokens: parseInt(e.target.value) || 1024 }))}
            />
          </div>
        </div>
      </section>

      {/* System Prompt */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          System Prompt *
        </h2>

        <Textarea
          value={form.system_prompt}
          onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
          placeholder="Você é Julia, consultora de viagens da Welcome Viagens..."
          rows={12}
          className="font-mono text-sm"
        />

        <p className="text-xs text-slate-400">
          Variáveis disponíveis: {'{{contact.nome}}'}, {'{{card.titulo}}'}, {'{{card.destino}}'}, {'{{agent.nome}}'}
        </p>
      </section>

      {/* Roteamento */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-blue-500" />
          Roteamento
        </h2>

        <div className="space-y-2">
          <Label>Keywords de roteamento (separadas por vírgula)</Label>
          <Input
            value={form.routing_keywords}
            onChange={e => setForm(f => ({ ...f, routing_keywords: e.target.value }))}
            placeholder="viagem, cotação, pacote, passagem"
          />
          <p className="text-xs text-slate-400">
            O agente será acionado quando a mensagem contiver alguma dessas palavras
          </p>
        </div>

        <div className="space-y-2">
          <Label>Webhook n8n</Label>
          <Input
            value={form.n8n_webhook_url}
            onChange={e => setForm(f => ({ ...f, n8n_webhook_url: e.target.value }))}
            placeholder="https://n8n.example.com/webhook/agent-julia"
          />
        </div>
      </section>

      {/* Escalação */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <HeadphonesIcon className="w-5 h-5 text-red-500" />
          Escalação para Humano
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Mensagem de escalação</Label>
            <Input
              value={form.escalation_message}
              onChange={e => setForm(f => ({ ...f, escalation_message: e.target.value }))}
              placeholder="Vou transferir você para um especialista..."
            />
          </div>

          <div className="space-y-2">
            <Label>Limite de turns antes de escalar</Label>
            <Input
              type="number"
              value={form.escalation_turn_limit}
              onChange={e => setForm(f => ({ ...f, escalation_turn_limit: parseInt(e.target.value) || 10 }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Mensagem de fallback</Label>
          <Input
            value={form.fallback_message}
            onChange={e => setForm(f => ({ ...f, fallback_message: e.target.value }))}
            placeholder="Desculpe, não consegui processar..."
          />
        </div>
      </section>

      {/* Skills */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Brain className="w-5 h-5 text-green-500" />
            Skills ({assignedSkillIds.length} atribuídas)
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings/ai-skills')}
            className="gap-1"
          >
            <Plus className="w-3 h-3" />
            Gerenciar Skills
          </Button>
        </div>

        {allSkills.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma skill disponível. Crie skills primeiro.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allSkills.map((skill: AiSkill) => {
              const isAssigned = assignedSkillIds.includes(skill.id)
              return (
                <button
                  key={skill.id}
                  onClick={() => toggleSkill(skill.id)}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                    isAssigned
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', isAssigned ? 'text-indigo-900' : 'text-slate-900')}>
                      {skill.nome}
                    </p>
                    {skill.descricao && (
                      <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{skill.descricao}</p>
                    )}
                    <div className="flex gap-1 mt-1">
                      <Badge variant="outline" className="text-xs">{skill.categoria}</Badge>
                      <Badge variant="outline" className="text-xs">{skill.tipo}</Badge>
                    </div>
                  </div>
                  {isAssigned && (
                    <div className="text-indigo-600 mt-0.5">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
