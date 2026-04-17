import { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { SpecialScenariosSection } from './SpecialScenariosEditor'
import {
  useAgentSpecialScenarios,
  type SpecialScenarioInput,
  type SpecialScenario,
} from '@/hooks/useAgentSpecialScenarios'

interface Props {
  agentId: string | undefined
}

function fromRemote(scenarios: SpecialScenario[]): SpecialScenarioInput[] {
  return scenarios.map((s) => ({
    scenario_name: s.scenario_name,
    trigger_type: s.trigger_type,
    trigger_config: s.trigger_config,
    response_adjustment: s.response_adjustment,
    simplified_qualification: s.simplified_qualification,
    skip_fee_presentation: s.skip_fee_presentation,
    skip_meeting_scheduling: s.skip_meeting_scheduling,
    auto_assign_tag: s.auto_assign_tag,
    handoff_message: s.handoff_message,
    target_agent_id: s.target_agent_id,
    enabled: s.enabled,
    priority: s.priority,
  }))
}

export function TabCenariosEspeciais({ agentId }: Props) {
  const { scenarios, isLoading, replaceAll } = useAgentSpecialScenarios(agentId)
  const [local, setLocal] = useState<SpecialScenarioInput[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derive local state from server data (pattern estabelecida em AiAgentDetailPage)
    setLocal(fromRemote(scenarios))
    setDirty(false)
  }, [scenarios])

  const handleChange = (next: SpecialScenarioInput[]) => {
    setLocal(next)
    setDirty(true)
  }

  const handleSave = async () => {
    const invalid = local.find(s => !s.scenario_name.trim())
    if (invalid) {
      toast.error('Todo cenário precisa de um nome')
      return
    }
    try {
      await replaceAll.mutateAsync(local)
      toast.success('Cenários salvos')
      setDirty(false)
    } catch (err) {
      toast.error('Erro ao salvar cenários')
      console.error(err)
    }
  }

  if (!agentId) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <p className="text-sm text-slate-500">Salve o agente primeiro para configurar cenários especiais.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando cenários...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SpecialScenariosSection value={local} onChange={handleChange} />

      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-amber-600">• alterações não salvas</span>}
        <Button onClick={handleSave} disabled={!dirty || replaceAll.isPending} className="gap-2">
          {replaceAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {replaceAll.isPending ? 'Salvando...' : 'Salvar cenários'}
        </Button>
      </div>
    </div>
  )
}
