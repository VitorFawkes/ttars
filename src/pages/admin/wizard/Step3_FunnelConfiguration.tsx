import { useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { QualificationTimeline } from '@/components/ai-agent/QualificationTimeline'
import { AgentChatPreview, type PreviewMessage } from '@/components/ai-agent/AgentChatPreview'
import type { QualificationStage, useAgentWizard } from '@/hooks/useAgentWizard'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

const EXAMPLE_ANSWERS: Record<string, string> = {
  destination: 'Paris!',
  destino: 'Paris!',
  travelers: 'Somos um casal',
  viajantes: 'Somos um casal',
  dates: 'Em junho',
  datas: 'Em junho',
  period: 'Em junho',
  budget: 'Uns 30 mil por pessoa',
  orcamento: 'Uns 30 mil por pessoa',
  experiences: 'Queremos gastronomia e cultura',
  experiencias: 'Queremos gastronomia e cultura',
}

function guessExampleAnswer(stage: QualificationStage): string {
  const key = (stage.stage_key || stage.stage_name || '').toLowerCase()
  for (const [hint, answer] of Object.entries(EXAMPLE_ANSWERS)) {
    if (key.includes(hint)) return answer
  }
  return 'Entendi!'
}

export default function Step3_FunnelConfiguration({ wizard }: WizardProps) {
  const stages = (wizard.wizardData.step3?.stages || []) as QualificationStage[]
  const agentName = wizard.wizardData.step1?.agent_name?.trim() || 'Agente'

  const handleStagesChange = (newStages: QualificationStage[]) => {
    wizard.updateStep('step3', { stages: newStages })
  }

  const isFormValid = stages.length > 0 && stages.every((s) => s.stage_name && s.question)

  // Build live preview: alternate user/agent for first 3 stages
  const previewMessages = useMemo<PreviewMessage[]>(() => {
    const msgs: PreviewMessage[] = [
      { role: 'user', content: 'Oi, queria saber sobre uma viagem' },
      { role: 'agent', content: `Oi! Sou ${agentName}, vou te ajudar. ${stages[0]?.question || 'Me conta mais sobre o que você quer'}` },
    ]
    stages.slice(0, 3).forEach((stage, idx) => {
      if (idx === 0) return // already used for first agent message
      msgs.push({ role: 'user', content: guessExampleAnswer(stages[idx - 1]) })
      msgs.push({ role: 'agent', content: stage.question || '...' })
    })
    if (stages.length > 3) {
      msgs.push({ role: 'user', content: guessExampleAnswer(stages[2]) })
      msgs.push({
        role: 'agent',
        content: `Perfeito! Tenho mais ${stages.length - 3} ${stages.length - 3 === 1 ? 'pergunta' : 'perguntas'} e aí posso te ajudar a montar tudo.`,
      })
    }
    return msgs
  }, [stages, agentName])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Funil de qualificação</h2>
          <p className="text-slate-500 mt-1 text-sm">
            Defina as etapas que o agente vai usar para qualificar o lead. Arraste para reordenar.
          </p>
        </div>

        <QualificationTimeline stages={stages} onChange={handleStagesChange} />

        <div className="flex justify-between pt-2">
          <Button onClick={() => wizard.goBack()} variant="outline">
            ← Voltar
          </Button>
          <Button onClick={() => wizard.goNext()} disabled={!isFormValid}>
            Próximo passo →
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-24 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Como a conversa flui</p>
          </div>
          <AgentChatPreview
            agentName={agentName}
            subtitle={`${stages.length} etapa${stages.length === 1 ? '' : 's'} de qualificação`}
            messages={previewMessages}
            className="h-[520px]"
          />
          <p className="text-xs text-slate-500 leading-relaxed">
            O agente vai perguntar uma etapa de cada vez, respeitando a ordem. As regras de desqualificação são aplicadas só quando o cliente confirma.
          </p>
        </div>
      </div>
    </div>
  )
}
