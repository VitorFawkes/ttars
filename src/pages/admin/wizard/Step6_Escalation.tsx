import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { WizardStep6 } from '@/hooks/useAgentWizard'
import type { useAgentWizard } from '@/hooks/useAgentWizard'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

interface EscalationTrigger extends Record<string, unknown> {
  id: string
  type: 'unanswered_messages' | 'negative_sentiment' | 'human_request' | 'agent_confidence' | 'custom'
  enabled: boolean
  threshold?: number
  keywords?: string
  customRule?: string
}

export default function Step6_Escalation({ wizard }: WizardProps) {
  const step6 = (wizard.wizardData.step6 || {}) as Partial<WizardStep6>

  const initializeTriggers = (): EscalationTrigger[] => {
    if (step6.escalation_triggers && Array.isArray(step6.escalation_triggers)) {
      return step6.escalation_triggers.map((trigger: any) => ({
        id: trigger.id || Math.random().toString(36).substr(2, 9),
        type: trigger.type || 'unanswered_messages',
        enabled: trigger.enabled !== false,
        threshold: trigger.threshold,
        keywords: trigger.keywords,
        customRule: trigger.customRule,
      }))
    }

    return [
      {
        id: 'unanswered',
        type: 'unanswered_messages',
        enabled: false,
        threshold: 15,
      },
      {
        id: 'sentiment',
        type: 'negative_sentiment',
        enabled: false,
      },
      {
        id: 'human',
        type: 'human_request',
        enabled: false,
        keywords: '',
      },
      {
        id: 'confidence',
        type: 'agent_confidence',
        enabled: false,
        threshold: 40,
      },
    ]
  }

  const [triggers, setTriggers] = useState<EscalationTrigger[]>(initializeTriggers())
  const [fallbackMessage, setFallbackMessage] = useState(step6.fallback_message || '')
  const [customRule, setCustomRule] = useState('')

  const toggleTrigger = (triggerId: string) => {
    setTriggers((prev) =>
      prev.map((t) => (t.id === triggerId ? { ...t, enabled: !t.enabled } : t))
    )
  }

  const updateTriggerThreshold = (triggerId: string, value: number) => {
    setTriggers((prev) =>
      prev.map((t) => (t.id === triggerId ? { ...t, threshold: value } : t))
    )
  }

  const updateTriggerKeywords = (triggerId: string, value: string) => {
    setTriggers((prev) =>
      prev.map((t) => (t.id === triggerId ? { ...t, keywords: value } : t))
    )
  }

  const addCustomTrigger = () => {
    if (customRule.trim()) {
      setTriggers((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
          type: 'custom',
          enabled: true,
          customRule,
        },
      ])
      setCustomRule('')
    }
  }

  const removeTrigger = (triggerId: string) => {
    setTriggers((prev) => prev.filter((t) => t.id !== triggerId))
  }

  const handleNext = () => {
    wizard.updateStep('step6', {
      escalation_triggers: triggers,
      fallback_message: fallbackMessage,
      escalation_rules: triggers.map((t) => ({
        id: t.id,
        type: t.type,
        enabled: t.enabled,
      })),
    })
    wizard.goNext()
  }

  const handleBack = () => {
    wizard.updateStep('step6', {
      escalation_triggers: triggers,
      fallback_message: fallbackMessage,
    })
    wizard.goBack()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Escalação para humano</h2>
        <p className="text-slate-500 mt-2">
          Configure quando o agente deve passar a conversa para um atendente humano.
        </p>
      </div>

      <div className="space-y-6">
        {/* Escalation Triggers */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          <div>
            <h3 className="font-semibold text-slate-900">Regras de escalação</h3>
            <p className="text-sm text-slate-500 mt-1">Selecione quando deve escalar para um humano</p>
          </div>

          {/* Unanswered Messages Trigger */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="unanswered"
                checked={triggers.find((t) => t.type === 'unanswered_messages')?.enabled || false}
                onChange={() =>
                  toggleTrigger(triggers.find((t) => t.type === 'unanswered_messages')?.id || '')
                }
                className="rounded border-slate-300"
              />
              <label htmlFor="unanswered" className="cursor-pointer">
                <span className="font-medium text-slate-900">Após N mensagens sem resposta</span>
              </label>
            </div>

            {triggers.find((t) => t.type === 'unanswered_messages')?.enabled && (
              <div className="ml-6 space-y-2">
                <Label htmlFor="messages_threshold">Número de mensagens</Label>
                <Input
                  id="messages_threshold"
                  type="number"
                  min="1"
                  value={
                    triggers.find((t) => t.type === 'unanswered_messages')?.threshold || 15
                  }
                  onChange={(e) =>
                    updateTriggerThreshold(
                      triggers.find((t) => t.type === 'unanswered_messages')?.id || '',
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="max-w-xs"
                />
                <p className="text-xs text-slate-500">Padrão: 15 mensagens</p>
              </div>
            )}
          </div>

          {/* Negative Sentiment Trigger */}
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="sentiment"
                checked={triggers.find((t) => t.type === 'negative_sentiment')?.enabled || false}
                onChange={() =>
                  toggleTrigger(triggers.find((t) => t.type === 'negative_sentiment')?.id || '')
                }
                className="rounded border-slate-300"
              />
              <label htmlFor="sentiment" className="cursor-pointer flex-1">
                <span className="font-medium text-slate-900">Se cliente frustrado (sentimento negativo)</span>
              </label>
            </div>
          </div>

          {/* Human Request Trigger */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="human_request"
                checked={triggers.find((t) => t.type === 'human_request')?.enabled || false}
                onChange={() =>
                  toggleTrigger(triggers.find((t) => t.type === 'human_request')?.id || '')
                }
                className="rounded border-slate-300"
              />
              <label htmlFor="human_request" className="cursor-pointer">
                <span className="font-medium text-slate-900">Se cliente pedir atendente (palavras-chave)</span>
              </label>
            </div>

            {triggers.find((t) => t.type === 'human_request')?.enabled && (
              <div className="ml-6 space-y-2">
                <Label htmlFor="keywords">Palavras-chave para detectar</Label>
                <Textarea
                  id="keywords"
                  placeholder="Ex: falar com humano, atendente, supervisor, gerente (uma por linha)"
                  value={triggers.find((t) => t.type === 'human_request')?.keywords || ''}
                  onChange={(e) =>
                    updateTriggerKeywords(
                      triggers.find((t) => t.type === 'human_request')?.id || '',
                      e.target.value
                    )
                  }
                  className="min-h-[80px] text-sm"
                />
              </div>
            )}
          </div>

          {/* Agent Confidence Trigger */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="confidence"
                checked={triggers.find((t) => t.type === 'agent_confidence')?.enabled || false}
                onChange={() =>
                  toggleTrigger(triggers.find((t) => t.type === 'agent_confidence')?.id || '')
                }
                className="rounded border-slate-300"
              />
              <label htmlFor="confidence" className="cursor-pointer">
                <span className="font-medium text-slate-900">Se confiança do agente cair abaixo de X%</span>
              </label>
            </div>

            {triggers.find((t) => t.type === 'agent_confidence')?.enabled && (
              <div className="ml-6 space-y-2">
                <Label htmlFor="confidence_threshold">Percentual mínimo (%)</Label>
                <Input
                  id="confidence_threshold"
                  type="number"
                  min="0"
                  max="100"
                  value={
                    triggers.find((t) => t.type === 'agent_confidence')?.threshold || 40
                  }
                  onChange={(e) =>
                    updateTriggerThreshold(
                      triggers.find((t) => t.type === 'agent_confidence')?.id || '',
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="max-w-xs"
                />
                <p className="text-xs text-slate-500">Padrão: 40%</p>
              </div>
            )}
          </div>

          {/* Custom Rule */}
          {triggers.filter((t) => t.type === 'custom').length > 0 && (
            <div className="space-y-3 bg-slate-50 rounded-lg p-4">
              <div className="font-medium text-slate-900">Regras personalizadas</div>
              {triggers.filter((t) => t.type === 'custom').map((trigger) => (
                <div
                  key={trigger.id}
                  className="flex items-center justify-between gap-2 bg-white p-3 rounded border border-slate-200"
                >
                  <span className="text-sm text-slate-900">{trigger.customRule}</span>
                  <button
                    onClick={() => removeTrigger(trigger.id)}
                    className="text-slate-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Custom Rule */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50">
            <Label htmlFor="custom_rule">Adicionar regra personalizada</Label>
            <div className="flex gap-2">
              <Input
                id="custom_rule"
                placeholder="Ex: Se cliente menciona legal ou contrato"
                value={customRule}
                onChange={(e) => setCustomRule(e.target.value)}
              />
              <Button
                onClick={addCustomTrigger}
                disabled={!customRule.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap"
              >
                Adicionar
              </Button>
            </div>
          </div>
        </div>

        {/* Fallback Message */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900">Mensagem quando ninguém está disponível</h3>
            <p className="text-sm text-slate-500 mt-1">Mensagem enviada se não houver atendente disponível</p>
          </div>
          <Textarea
            placeholder="Ex: Desculpe, nenhum atendente está disponível agora. Tentaremos atender sua solicitação em breve."
            value={fallbackMessage}
            onChange={(e) => setFallbackMessage(e.target.value)}
            className="min-h-[100px]"
          />
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button onClick={handleBack} variant="outline" className="text-slate-900 border-slate-300">
          Voltar
        </Button>
        <Button onClick={handleNext} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          Próximo
        </Button>
      </div>
    </div>
  )
}
