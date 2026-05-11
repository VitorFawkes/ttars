import { Loader2 } from 'lucide-react'
import {
  PRESENTATION_SCENARIOS,
  useAiAgentPresentations,
} from '@/hooks/useAiAgentPresentations'
import { PresentationScenarioCard } from './PresentationScenarioCard'

interface Props {
  agentId: string | undefined
}

export function TabApresentacao({ agentId }: Props) {
  const { presentations, isLoading } = useAiAgentPresentations(agentId)

  if (!agentId) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <p className="text-sm text-slate-500">
          Salve o agente primeiro para configurar a apresentação.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando apresentações...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-indigo-50/40 to-white border border-indigo-100 rounded-xl p-5">
        <h2 className="font-medium text-slate-900 tracking-tight">Como o agente se apresenta</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Defina o que o agente diz em cada momento de abertura de conversa. Pode ser um texto fixo
          (com variáveis) ou uma diretriz que a IA parafrasea mantendo a persona. Se um cenário ficar
          sem configuração, o agente usa o header genérico.
        </p>
      </div>

      {PRESENTATION_SCENARIOS.map((scenario) => {
        const current = presentations.find((p) => p.scenario === scenario.key)
        return (
          <PresentationScenarioCard
            key={scenario.key}
            agentId={agentId}
            scenarioKey={scenario.key}
            scenarioLabel={scenario.label}
            scenarioDescription={scenario.description}
            current={current}
          />
        )
      })}
    </div>
  )
}
