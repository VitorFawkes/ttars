import { useMemo, useState } from 'react'
import { AlertCircle, Frown, Target, UserCheck, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import type { WizardStep6, useAgentWizard } from '@/hooks/useAgentWizard'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

interface EscalationTrigger extends Record<string, unknown> {
  id: string
  type: 'unanswered_messages' | 'negative_sentiment' | 'human_request' | 'agent_confidence'
  enabled: boolean
  threshold?: number
  keywords?: string
}

const DEFAULT_TRIGGERS: EscalationTrigger[] = [
  { id: 'unanswered', type: 'unanswered_messages', enabled: true, threshold: 15 },
  { id: 'sentiment', type: 'negative_sentiment', enabled: true },
  { id: 'human', type: 'human_request', enabled: true, keywords: 'humano\natendente\nsupervisor\ngerente' },
  { id: 'confidence', type: 'agent_confidence', enabled: false, threshold: 40 },
]

function getToleranceLabel(turns: number): { text: string; color: string } {
  if (turns <= 5) return { text: 'Tolerância baixa — escala rápido', color: 'text-red-600' }
  if (turns <= 15) return { text: 'Equilibrado', color: 'text-green-600' }
  return { text: 'Alta autonomia — agente tenta muito', color: 'text-amber-600' }
}

export default function Step6_Escalation({ wizard }: WizardProps) {
  const step6 = (wizard.wizardData.step6 || {}) as Partial<WizardStep6>

  const [triggers, setTriggers] = useState<EscalationTrigger[]>(() => {
    if (step6.escalation_triggers && Array.isArray(step6.escalation_triggers) && step6.escalation_triggers.length > 0) {
      return step6.escalation_triggers.map((t: Record<string, unknown>, i) => ({
        id: (t.id as string) || `trig_${i}`,
        type: (t.type as EscalationTrigger['type']) || 'unanswered_messages',
        enabled: t.enabled !== false,
        threshold: t.threshold as number | undefined,
        keywords: t.keywords as string | undefined,
      }))
    }
    return DEFAULT_TRIGGERS
  })

  const [fallbackMessage, setFallbackMessage] = useState(step6.fallback_message || '')
  const [escalationMessage, setEscalationMessage] = useState(
    ((step6.escalation_rules?.[0] as Record<string, unknown> | undefined)?.message as string) || ''
  )

  const updateTrigger = (id: string, patch: Partial<EscalationTrigger>) => {
    setTriggers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  const unansweredTrigger = triggers.find((t) => t.type === 'unanswered_messages')
  const confidenceTrigger = triggers.find((t) => t.type === 'agent_confidence')

  const toleranceLabel = useMemo(
    () => getToleranceLabel(unansweredTrigger?.threshold ?? 15),
    [unansweredTrigger]
  )

  const persist = () => {
    wizard.updateStep('step6', {
      escalation_triggers: triggers,
      fallback_message: fallbackMessage,
      escalation_rules: [
        {
          message: escalationMessage,
          turn_limit: unansweredTrigger?.enabled ? unansweredTrigger.threshold : undefined,
        },
      ],
    })
  }

  const handleNext = () => { persist(); wizard.goNext() }
  const handleBack = () => { persist(); wizard.goBack() }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Passagem para humano</h2>
        <p className="text-slate-500 mt-1 text-sm">
          Defina quando o agente deve entregar a conversa para um atendente de verdade.
        </p>
      </div>

      {/* Turn limit slider */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Target className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Limite de tentativas</h3>
              <Switch
                checked={unansweredTrigger?.enabled || false}
                onCheckedChange={(v) => unansweredTrigger && updateTrigger(unansweredTrigger.id, { enabled: v })}
              />
            </div>
            <p className="text-xs text-slate-500">Após quantas trocas de mensagens sem progresso o agente escala</p>
          </div>
        </div>

        {unansweredTrigger?.enabled && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div className="flex-1">
                <input
                  type="range"
                  min="3"
                  max="50"
                  value={unansweredTrigger.threshold ?? 15}
                  onChange={(e) => updateTrigger(unansweredTrigger.id, { threshold: Number(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between mt-1 text-[11px] text-slate-400">
                  <span>3 msgs</span>
                  <span>25 msgs</span>
                  <span>50 msgs</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-semibold text-indigo-600 tracking-tight">
                  {unansweredTrigger.threshold ?? 15}
                </p>
                <p className="text-[11px] text-slate-500">mensagens</p>
              </div>
            </div>
            <p className={cn('text-xs font-medium', toleranceLabel.color)}>{toleranceLabel.text}</p>
          </div>
        )}
      </div>

      {/* Other triggers as toggle cards */}
      <div className="space-y-3">
        <Label className="text-xs uppercase tracking-wide text-slate-500">Gatilhos adicionais</Label>

        {/* Negative sentiment */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Frown className="w-4 h-4 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-slate-900">Cliente frustrado</p>
              <Switch
                checked={triggers.find((t) => t.type === 'negative_sentiment')?.enabled || false}
                onCheckedChange={(v) => {
                  const t = triggers.find((x) => x.type === 'negative_sentiment')
                  if (t) updateTrigger(t.id, { enabled: v })
                }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Escalar quando detectar sentimento negativo ou reclamação</p>
          </div>
        </div>

        {/* Human request */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-4 h-4 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900">Cliente pede humano</p>
                <Switch
                  checked={triggers.find((t) => t.type === 'human_request')?.enabled || false}
                  onCheckedChange={(v) => {
                    const t = triggers.find((x) => x.type === 'human_request')
                    if (t) updateTrigger(t.id, { enabled: v })
                  }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Escalar quando cliente usar certas palavras-chave</p>
            </div>
          </div>

          {triggers.find((t) => t.type === 'human_request')?.enabled && (
            <div className="mt-3 pt-3 border-t border-slate-100 ml-12 space-y-1.5">
              <Label className="text-xs">Palavras-chave (uma por linha)</Label>
              <Textarea
                placeholder={'humano\natendente\nsupervisor\ngerente'}
                value={triggers.find((t) => t.type === 'human_request')?.keywords || ''}
                onChange={(e) => {
                  const t = triggers.find((x) => x.type === 'human_request')
                  if (t) updateTrigger(t.id, { keywords: e.target.value })
                }}
                className="min-h-[80px] text-sm"
              />
            </div>
          )}
        </div>

        {/* Agent confidence */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900">Confiança baixa do agente</p>
                <Switch
                  checked={confidenceTrigger?.enabled || false}
                  onCheckedChange={(v) => confidenceTrigger && updateTrigger(confidenceTrigger.id, { enabled: v })}
                />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Escalar quando o agente não se sentir seguro para responder</p>
            </div>
          </div>

          {confidenceTrigger?.enabled && (
            <div className="mt-3 pt-3 border-t border-slate-100 ml-12 space-y-2">
              <Label className="text-xs">Limiar mínimo de confiança</Label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={confidenceTrigger.threshold ?? 40}
                  onChange={(e) => updateTrigger(confidenceTrigger.id, { threshold: Number(e.target.value) })}
                  className="flex-1 accent-indigo-600"
                />
                <span className="text-sm font-semibold text-indigo-600 min-w-[3rem] text-right">
                  {confidenceTrigger.threshold ?? 40}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-4 h-4 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900">Mensagens de transição</h3>
            <p className="text-xs text-slate-500">O que o agente fala quando passa a conversa adiante</p>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem ao escalar (opcional)</Label>
            <Input
              placeholder="Ex: Vou verificar aqui e te retorno em breve!"
              value={escalationMessage}
              onChange={(e) => setEscalationMessage(e.target.value)}
            />
            <p className="text-[11px] text-slate-400">
              Dica: soar natural, sem mencionar "transferência" ou "outro atendente"
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem de fallback (fora do horário)</Label>
            <Textarea
              placeholder="Ex: Nosso time de atendimento está offline no momento. Assim que alguém estiver disponível, vamos te retornar por aqui mesmo!"
              value={fallbackMessage}
              onChange={(e) => setFallbackMessage(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <Button onClick={handleBack} variant="outline">← Voltar</Button>
        <Button onClick={handleNext}>Próximo passo →</Button>
      </div>
    </div>
  )
}
