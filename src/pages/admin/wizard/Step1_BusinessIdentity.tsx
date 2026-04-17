import { useMemo, useState } from 'react'
import { Building2, Bot, Globe, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ToneSelector } from '@/components/ai-agent/ToneSelector'
import { TONE_OPTIONS, type Tone } from '@/components/ai-agent/agent-constants'
import { AgentChatPreview, type PreviewMessage } from '@/components/ai-agent/AgentChatPreview'
import { InteractionModeEditor } from '@/components/ai-agent/editor/InteractionModeEditor'
import {
  DEFAULT_FIRST_MESSAGE,
  DEFAULT_OUTBOUND_TRIGGER,
  type FirstMessageConfig as EditorFirstMessage,
  type OutboundTriggerConfig as EditorOutbound,
} from '@/components/ai-agent/editor/types'
import type {
  WizardStep1, InteractionMode, useAgentWizard,
} from '@/hooks/useAgentWizard'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

export default function Step1_BusinessIdentity({ wizard }: WizardProps) {
  const step1 = (wizard.wizardData.step1 || {}) as Partial<WizardStep1>
  const [formData, setFormData] = useState<Partial<WizardStep1>>({
    agent_name: step1.agent_name || '',
    company_name: step1.company_name || '',
    company_description: step1.company_description || '',
    agent_persona: step1.agent_persona || '',
    tone: step1.tone || 'professional',
    language: step1.language || 'pt-BR',
    interaction_mode: step1.interaction_mode || 'inbound',
    first_message_config: step1.first_message_config,
    outbound_trigger_config: step1.outbound_trigger_config,
  })

  const handleChange = (field: keyof WizardStep1, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleNext = () => {
    wizard.updateStep('step1', formData)
    wizard.goNext()
  }

  const isValid = Boolean(formData.agent_name?.trim() && formData.company_name?.trim())

  // Preview dynamically updated
  const previewMessages = useMemo<PreviewMessage[]>(() => {
    const toneExample = TONE_OPTIONS.find((t) => t.value === formData.tone)?.example
      ?? TONE_OPTIONS[0].example
    const introName = formData.agent_name?.trim() || 'seu agente'
    return [
      { role: 'user', content: 'Oi, vi o anúncio de vocês e queria saber mais!' },
      { role: 'agent', content: toneExample },
      { role: 'user', content: 'Estou pensando em Europa em junho' },
      { role: 'agent', content: `Perfeito! Europa em junho é lindo. Sou ${introName}, vou te ajudar a organizar tudo 😊` },
    ]
  }, [formData.tone, formData.agent_name])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Form (3/5) */}
      <div className="lg:col-span-3 space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Identidade do agente</h2>
          <p className="text-slate-500 mt-1 text-sm">
            Defina como seu agente vai se apresentar e conversar com os clientes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setFormData({
            agent_name: 'Julia',
            company_name: formData.company_name || '',
            company_description: 'Consultoria de viagens personalizadas com foco em experiências completas.',
            agent_persona: 'Consultora de viagens experiente, calorosa e atenta a detalhes. Pergunta uma coisa de cada vez. Nunca menciona que é IA.',
            tone: 'friendly',
            language: 'pt-BR',
          })}
          className="w-full flex items-center gap-3 p-3 border border-indigo-200 bg-indigo-50/40 rounded-lg text-left hover:bg-indigo-50 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-indigo-900">Usar a Julia como ponto de partida</p>
            <p className="text-xs text-indigo-700">Pré-preenche persona, tom e descrição com os valores da Julia (referência da Welcome). Você ajusta nos passos seguintes.</p>
          </div>
        </button>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="agent_name" className="flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-slate-400" />
                Nome do agente
              </Label>
              <Input
                id="agent_name"
                placeholder="Ex: Julia, Sofia, Léo..."
                value={formData.agent_name || ''}
                onChange={(e) => handleChange('agent_name', e.target.value)}
              />
              <p className="text-xs text-slate-400">Como o agente vai se apresentar ao cliente</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company_name" className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                Nome da empresa
              </Label>
              <Input
                id="company_name"
                placeholder="Ex: Welcome Viagens"
                value={formData.company_name || ''}
                onChange={(e) => handleChange('company_name', e.target.value)}
              />
              <p className="text-xs text-slate-400">Nome comercial que aparece nas conversas</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company_description">O que a empresa faz (opcional)</Label>
            <Textarea
              id="company_description"
              placeholder="Ex: Agência de viagens especializada em experiências personalizadas pela Europa e América do Sul..."
              value={formData.company_description || ''}
              onChange={(e) => handleChange('company_description', e.target.value)}
              className="min-h-[72px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent_persona">Personalidade do agente (opcional)</Label>
            <Textarea
              id="agent_persona"
              placeholder="Ex: consultora de viagens empática, atenciosa com detalhes, com 10 anos de experiência..."
              value={formData.agent_persona || ''}
              onChange={(e) => handleChange('agent_persona', e.target.value)}
              className="min-h-[72px]"
            />
            <p className="text-xs text-slate-400">Como o agente pensa e se comporta</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <Label className="mb-3 block">Tom de voz</Label>
          <ToneSelector
            value={(formData.tone as Tone) || 'professional'}
            onChange={(v) => handleChange('tone', v)}
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <Label htmlFor="language" className="flex items-center gap-1.5 mb-2">
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            Idioma
          </Label>
          <select
            id="language"
            value={formData.language || 'pt-BR'}
            onChange={(e) => handleChange('language', e.target.value)}
            className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="pt-BR">🇧🇷 Português (Brasil)</option>
            <option value="en">🇺🇸 English</option>
            <option value="es">🇪🇸 Español</option>
          </select>
        </div>

        <InteractionModeEditor
          mode={(formData.interaction_mode as InteractionMode) || 'inbound'}
          firstMessage={(formData.first_message_config ?? DEFAULT_FIRST_MESSAGE) as EditorFirstMessage}
          outbound={(formData.outbound_trigger_config ?? DEFAULT_OUTBOUND_TRIGGER) as EditorOutbound}
          onModeChange={(mode) => setFormData(prev => ({ ...prev, interaction_mode: mode }))}
          onFirstMessageChange={(config) => setFormData(prev => ({ ...prev, first_message_config: config }))}
          onOutboundChange={(config) => setFormData(prev => ({ ...prev, outbound_trigger_config: config }))}
        />

        <div className="flex justify-end">
          <Button onClick={handleNext} disabled={!isValid} className="gap-2">
            Próximo passo →
          </Button>
        </div>
      </div>

      {/* Preview (2/5) — sticky on desktop */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-24 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Prévia ao vivo</p>
            <span className="text-xs text-slate-400">Atualiza conforme você digita</span>
          </div>
          <AgentChatPreview
            agentName={formData.agent_name?.trim() || 'Seu agente'}
            subtitle={formData.company_name?.trim() || 'sua empresa'}
            messages={previewMessages}
            className="h-[460px]"
          />
          <p className="text-xs text-slate-500 leading-relaxed">
            Essa é uma simulação de como seu agente vai soar ao se apresentar, baseada no tom escolhido. O comportamento real é moldado nos próximos passos.
          </p>
        </div>
      </div>
    </div>
  )
}
