import { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { QualificationFlowSection } from './QualificationFlowEditor'
import {
  useAgentQualificationFlow,
  type QualificationStageInput,
} from '@/hooks/useAgentQualificationFlow'
import { useAiAgentDetail } from '@/hooks/useAiAgents'
import { useProducts } from '@/hooks/useProducts'

interface Props {
  agentId: string | undefined
}

function stripForInput(stages: Array<Record<string, unknown>>): QualificationStageInput[] {
  return stages.map((s) => ({
    stage_order: (s.stage_order as number) ?? 0,
    stage_name: (s.stage_name as string) ?? '',
    stage_key: (s.stage_key as string | null) ?? '',
    question: (s.question as string) ?? '',
    subquestions: (s.subquestions as string[]) ?? [],
    disqualification_triggers: (s.disqualification_triggers as Array<{ trigger: string; message: string }>) ?? [],
    advance_to_stage_id: (s.advance_to_stage_id as string | null) ?? null,
    advance_condition: (s.advance_condition as string | null) ?? null,
    response_options: (s.response_options as string[] | null) ?? null,
    maps_to_field: (s.maps_to_field as string | null) ?? null,
    skip_if_filled: (s.skip_if_filled as boolean) ?? true,
  }))
}

export function TabFunilQualificacao({ agentId }: Props) {
  const { stages, isLoading, replaceAll } = useAgentQualificationFlow(agentId)
  const { data: agent } = useAiAgentDetail(agentId)
  const { products } = useProducts()
  const [local, setLocal] = useState<QualificationStageInput[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derive local state from server data
    setLocal(stripForInput(stages as unknown as Array<Record<string, unknown>>))
    setDirty(false)
  }, [stages])

  const handleChange = (next: QualificationStageInput[]) => {
    setLocal(next)
    setDirty(true)
  }

  const handleSave = async () => {
    try {
      await replaceAll.mutateAsync(local)
      toast.success('Funil de qualificação salvo')
      setDirty(false)
    } catch (err) {
      toast.error('Erro ao salvar funil')
      console.error(err)
    }
  }

  if (!agentId) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <p className="text-sm text-slate-500">Salve o agente primeiro para configurar o funil de qualificação.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando funil...
        </div>
      </div>
    )
  }

  const agentProduto = (agent as { produto?: string } | undefined)?.produto
  const pipelineId = products.find(p => p.slug === agentProduto)?.pipeline_id ?? undefined

  return (
    <div className="space-y-4">
      <QualificationFlowSection
        value={local}
        onChange={handleChange}
        pipelineId={pipelineId}
        produto={agentProduto}
      />

      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-amber-600">• alterações não salvas</span>}
        <Button onClick={handleSave} disabled={!dirty || replaceAll.isPending} className="gap-2">
          {replaceAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {replaceAll.isPending ? 'Salvando...' : 'Salvar funil'}
        </Button>
      </div>
    </div>
  )
}
