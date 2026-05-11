import { Radio, Eye, Edit3, ShieldCheck } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { MultiFieldPicker } from './CRMFieldPicker'
import { useAiAgentDetail } from '@/hooks/useAiAgents'
import { useProducts } from '@/hooks/useProducts'
import type { AgentEditorForm } from './types'

type EvidenceLevel = 'low' | 'medium' | 'high'
const EVIDENCE_LEVELS: Array<{ value: EvidenceLevel; label: string; color: string }> = [
  { value: 'low', label: 'Baixa', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  { value: 'medium', label: 'Média', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'high', label: 'Alta', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
]

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
  agentId?: string
}

export function TabContextoCampos({ form, setForm, agentId }: Props) {
  const { data: agent } = useAiAgentDetail(agentId)
  const { products } = useProducts()
  const agentProduto = (agent as { produto?: string } | undefined)?.produto
  const pipelineId = products.find(p => p.slug === agentProduto)?.pipeline_id ?? undefined

  const setVisible = (next: string[]) => {
    setForm(f => ({
      ...f,
      context_fields_config: { ...f.context_fields_config, visible_fields: next },
    }))
  }

  const setUpdatable = (next: string[]) => {
    setForm(f => {
      const currentEvidence = f.context_fields_config.evidence_level ?? {}
      const keepEvidence: Record<string, EvidenceLevel> = {}
      for (const key of next) {
        if (currentEvidence[key]) keepEvidence[key] = currentEvidence[key]
      }
      return {
        ...f,
        context_fields_config: {
          ...f.context_fields_config,
          updatable_fields: next,
          evidence_level: keepEvidence,
        },
      }
    })
  }

  const setEvidence = (key: string, level: EvidenceLevel) => {
    setForm(f => ({
      ...f,
      context_fields_config: {
        ...f.context_fields_config,
        evidence_level: { ...f.context_fields_config.evidence_level, [key]: level },
      },
    }))
  }

  const updatable = form.context_fields_config.updatable_fields

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
      <header className="flex items-center gap-2">
        <Radio className="w-5 h-5 text-fuchsia-500" />
        <div>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Contexto & Campos do CRM</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Escolha quais campos o agente enxerga e quais ele pode atualizar.
          </p>
        </div>
      </header>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs text-slate-600">
            <Eye className="w-3.5 h-3.5 text-indigo-600" />
            Campos que o agente vê ao decidir
          </Label>
          <MultiFieldPicker
            value={form.context_fields_config.visible_fields}
            onChange={setVisible}
            scope="any"
            pipelineId={pipelineId}
            produto={agentProduto}
            allowCustom
            placeholder="Escolha os campos visíveis para o agente"
          />
          <p className="text-[11px] text-slate-400">
            O agente usa esses campos como contexto ao conversar. Quanto mais relevante, melhor ele responde.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs text-slate-600">
            <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
            Campos que o agente pode atualizar
          </Label>
          <MultiFieldPicker
            value={updatable}
            onChange={setUpdatable}
            scope="any"
            pipelineId={pipelineId}
            produto={agentProduto}
            allowCustom
            placeholder="Escolha os campos que o agente pode escrever"
          />
          <p className="text-[11px] text-slate-400">
            Nunca atualiza <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-600">pessoa_principal_id</code> — restrição do sistema.
          </p>
        </div>

        {updatable.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <Label className="text-xs font-semibold text-slate-700">Evidência exigida por campo</Label>
            </div>
            <p className="text-[11px] text-slate-500 -mt-1">
              O quão forte precisa ser o sinal do cliente para o agente atualizar.
              <strong> Alta</strong> = só quando 100% certo. <strong>Baixa</strong> = atualiza na primeira menção.
            </p>
            <div className="space-y-1.5">
              {updatable.map(key => {
                const currentEvidence = (form.context_fields_config.evidence_level?.[key] as EvidenceLevel | undefined) ?? 'medium'
                return (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="font-mono text-xs text-slate-700">{key}</span>
                    <div className="flex gap-1">
                      {EVIDENCE_LEVELS.map(lvl => (
                        <button
                          key={lvl.value}
                          type="button"
                          onClick={() => setEvidence(key, lvl.value)}
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
                            currentEvidence === lvl.value
                              ? lvl.color
                              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600',
                          )}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
