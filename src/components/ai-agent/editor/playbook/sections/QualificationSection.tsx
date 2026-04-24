import { useState } from 'react'
import { Loader2, Plus, Sparkles, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useAgentScoring, type ScoringRule, type ScoringRuleInput, type FallbackAction } from '@/hooks/useAgentScoring'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { QualificationRuleBuilder } from '../qualification/QualificationRuleBuilder'

interface Props {
  agentId: string
}

const FALLBACK_OPTIONS: Array<{ value: FallbackAction; label: string; description: string }> = [
  { value: 'material_informativo', label: 'Enviar material informativo', description: 'Manda guia/PDF e encerra' },
  { value: 'encerrar_cordial', label: 'Encerrar cordial', description: 'Agradece e fecha sem material' },
  { value: 'nota_interna', label: 'Criar nota interna', description: 'Registra lead pra revisão humana' },
  { value: 'request_handoff', label: 'Passar pra humano', description: 'Escala imediatamente pra equipe' },
]

export function QualificationSection({ agentId }: Props) {
  const { rules, config, isLoading, upsertRule, deleteRule, upsertConfig } = useAgentScoring(agentId)
  const meta = useCurrentProductMeta()
  const pipelineId: string | undefined = meta?.pipelineId ?? undefined
  const produtoSlug: string | undefined = meta?.slug ?? undefined

  const [creating, setCreating] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  const handleSaveRule = async (input: ScoringRuleInput) => {
    await upsertRule.mutateAsync(input)
    setCreating(false)
    setEditingRuleId(null)
  }

  const handleDeleteRule = async (ruleId: string) => {
    await deleteRule.mutateAsync(ruleId)
    setEditingRuleId(null)
  }

  const byType = {
    qualify: rules.filter(r => r.rule_type === 'qualify' || !r.rule_type),
    bonus: rules.filter(r => r.rule_type === 'bonus'),
    disqualify: rules.filter(r => r.rule_type === 'disqualify'),
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-lg">
        <button onClick={() => setShowConfig(!showConfig)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left">
          {showConfig ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
          <span className="text-sm font-medium text-slate-700">Configuração da qualificação</span>
          <span className="ml-auto text-xs text-slate-500">
            {config?.enabled ? 'ativado' : 'desativado'} · score mín {config?.threshold_qualify ?? 25}
          </span>
        </button>
        {showConfig && (
          <div className="px-3 pb-3 space-y-3 border-t border-slate-200 pt-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={config?.enabled ?? false}
                onChange={(e) => upsertConfig.mutate({ enabled: e.target.checked })}
                className="h-4 w-4" />
              <label className="text-sm text-slate-700">Qualificação ativada (agente usa score pra decidir)</label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Score mínimo pra considerar qualificado</label>
              <input type="number" value={config?.threshold_qualify ?? 25}
                onChange={(e) => upsertConfig.mutate({ threshold_qualify: Number(e.target.value) })}
                className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Se não qualificar:</label>
              <select value={config?.fallback_action ?? 'material_informativo'}
                onChange={(e) => upsertConfig.mutate({ fallback_action: e.target.value as FallbackAction })}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                {FALLBACK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} — {o.description}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teto do bônus (sinais indiretos)</label>
              <input type="number" value={config?.max_sinal_bonus ?? 10}
                onChange={(e) => upsertConfig.mutate({ max_sinal_bonus: Number(e.target.value) })}
                className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-indigo-50 border border-indigo-100 text-sm">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
        <div className="text-indigo-900 text-xs">
          Crie critérios que definem o <strong>cliente ideal</strong>. O agente usa isso pra decidir quando propor
          próximo passo (score ≥ {config?.threshold_qualify ?? 25}) ou encerrar educadamente. Baseado em campo do CRM
          (objetivo) ou avaliação da IA (subjetivo).
        </div>
      </div>

      <RuleGroup title="🟢 Critérios que qualificam" description="Somam pontos ao score" rules={byType.qualify}
        editingRuleId={editingRuleId} setEditingRuleId={setEditingRuleId}
        onSaveRule={handleSaveRule} onDeleteRule={handleDeleteRule}
        pipelineId={pipelineId} produto={produtoSlug} />

      <RuleGroup title="🟡 Sinais de bônus" description="Pontos extras com teto (acumula até o máximo configurado)" rules={byType.bonus}
        editingRuleId={editingRuleId} setEditingRuleId={setEditingRuleId}
        onSaveRule={handleSaveRule} onDeleteRule={handleDeleteRule}
        pipelineId={pipelineId} produto={produtoSlug} />

      <RuleGroup title="🔴 Desqualificadores" description="Se bater, o lead é descartado imediatamente" rules={byType.disqualify}
        editingRuleId={editingRuleId} setEditingRuleId={setEditingRuleId}
        onSaveRule={handleSaveRule} onDeleteRule={handleDeleteRule}
        pipelineId={pipelineId} produto={produtoSlug} />

      {creating ? (
        <QualificationRuleBuilder pipelineId={pipelineId} produto={produtoSlug}
          onSave={handleSaveRule} onCancel={() => setCreating(false)} />
      ) : (
        <Button onClick={() => setCreating(true)} variant="outline" size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Adicionar critério
        </Button>
      )}
    </div>
  )
}

function RuleGroup({
  title, description, rules, editingRuleId, setEditingRuleId, onSaveRule, onDeleteRule, pipelineId, produto,
}: {
  title: string; description: string; rules: ScoringRule[]
  editingRuleId: string | null; setEditingRuleId: (id: string | null) => void
  onSaveRule: (input: ScoringRuleInput) => Promise<void>
  onDeleteRule: (id: string) => Promise<void>
  pipelineId?: string; produto?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-sm font-medium text-slate-900">{title}</h4>
        <span className="text-xs text-slate-400">· {rules.length}</span>
      </div>
      <p className="text-xs text-slate-500 mb-2">{description}</p>
      {rules.length === 0 ? <p className="text-xs text-slate-400 italic ml-2">(nenhum)</p> : (
        <div className="space-y-1.5">
          {rules.map(r => editingRuleId === r.id ? (
            <QualificationRuleBuilder key={r.id} rule={r} pipelineId={pipelineId} produto={produto}
              onSave={onSaveRule} onDelete={() => onDeleteRule(r.id)} onCancel={() => setEditingRuleId(null)} />
          ) : (
            <button key={r.id} onClick={() => setEditingRuleId(r.id)}
              className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 bg-white transition-colors">
              <RulePreview rule={r} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RulePreview({ rule }: { rule: ScoringRule }) {
  const isSubjective = rule.condition_type === 'ai_subjective'
  const cv = rule.condition_value as Record<string, unknown>
  const humanCondition = (() => {
    if (isSubjective) return `"${cv.question}"`
    if (rule.condition_type === 'equals') return `= ${cv.value}`
    if (rule.condition_type === 'range') {
      if (cv.min != null && cv.max != null) return `entre ${cv.min} e ${cv.max}`
      if (cv.min != null) return `≥ ${cv.min}`
      if (cv.max != null) return `≤ ${cv.max}`
    }
    if (rule.condition_type === 'boolean_true') return `${cv.field ?? rule.dimension} = verdadeiro`
    return JSON.stringify(cv)
  })()
  const weightLabel = rule.rule_type === 'disqualify' ? 'corta na hora' : `+${rule.weight} pts`
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
          {isSubjective && <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
          <span className="truncate">{rule.label || rule.dimension}</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">
          {isSubjective ? <>IA avalia: {humanCondition}</> : <><span className="font-mono text-[11px]">{rule.dimension}</span> {humanCondition}</>}
        </div>
      </div>
      <div className={cn('text-xs px-2 py-0.5 rounded-full shrink-0',
        rule.rule_type === 'disqualify' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100')}>
        {weightLabel}
      </div>
    </div>
  )
}
