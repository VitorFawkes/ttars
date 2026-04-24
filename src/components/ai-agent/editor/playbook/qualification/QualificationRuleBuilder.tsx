import { useState, useEffect } from 'react'
import { Loader2, Save, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { SingleFieldPicker } from '@/components/ai-agent/editor/CRMFieldPicker'
import type { ScoringRule, ScoringRuleInput, ConditionType, RuleType } from '@/hooks/useAgentScoring'

type Mode = 'crm_field' | 'ai_subjective'

interface Props {
  rule?: ScoringRule        // se passado: editar; senão: criar
  pipelineId?: string
  produto?: string
  onSave: (input: ScoringRuleInput) => Promise<void>
  onDelete?: () => Promise<void>
  onCancel?: () => void
}

const RULE_TYPES: Array<{ value: RuleType; label: string; description: string; color: string }> = [
  { value: 'qualify', label: '🟢 Qualifica', description: 'Soma pontos ao score', color: 'emerald' },
  { value: 'bonus', label: '🟡 Bônus', description: 'Pontos extras com teto (sinal indireto)', color: 'amber' },
  { value: 'disqualify', label: '🔴 Desqualifica', description: 'Corta o lead imediatamente se bater', color: 'rose' },
]

const WEIGHT_OPTIONS = [
  { value: 1, label: 'Leve' },
  { value: 2, label: 'Médio' },
  { value: 3, label: 'Forte' },
  { value: 5, label: '5 pontos' },
  { value: 10, label: '10 pontos' },
  { value: 15, label: '15 pontos' },
]

export function QualificationRuleBuilder({ rule, pipelineId, produto, onSave, onDelete, onCancel }: Props) {
  const isNew = !rule

  const [mode, setMode] = useState<Mode>(rule?.condition_type === 'ai_subjective' ? 'ai_subjective' : 'crm_field')
  const [ruleType, setRuleType] = useState<RuleType>(rule?.rule_type ?? 'qualify')
  const [label, setLabel] = useState(rule?.label ?? '')
  const [weight, setWeight] = useState(rule?.weight ?? 3)

  // CRM-field mode state
  const [fieldKey, setFieldKey] = useState<string | null>(
    rule && rule.condition_type !== 'ai_subjective'
      ? (rule.dimension ?? null)
      : null,
  )
  const [conditionType, setConditionType] = useState<ConditionType>(
    rule?.condition_type ?? 'equals',
  )
  const [equalsValue, setEqualsValue] = useState<string>(
    rule?.condition_type === 'equals' ? ((rule.condition_value as { value: string }).value ?? '') : '',
  )
  const [rangeMin, setRangeMin] = useState<string>(
    rule?.condition_type === 'range' ? String((rule.condition_value as { min: number | null }).min ?? '') : '',
  )
  const [rangeMax, setRangeMax] = useState<string>(
    rule?.condition_type === 'range' ? String((rule.condition_value as { max: number | null }).max ?? '') : '',
  )
  const [booleanField, setBooleanField] = useState<string>(
    rule?.condition_type === 'boolean_true' ? (rule.condition_value as { field: string }).field ?? '' : '',
  )

  // AI-subjective mode state
  const [question, setQuestion] = useState<string>(
    rule?.condition_type === 'ai_subjective' ? (rule.condition_value as { question: string }).question ?? '' : '',
  )

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Reset quando troca modo
    if (mode === 'ai_subjective' && conditionType !== 'ai_subjective') setConditionType('ai_subjective')
    if (mode === 'crm_field' && conditionType === 'ai_subjective') setConditionType('equals')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const handleSave = async () => {
    if (!label.trim()) { toast.error('Dê um nome pra essa regra'); return }

    let dimension: string
    let condition_type: ConditionType
    let condition_value: ScoringRule['condition_value']

    if (mode === 'ai_subjective') {
      if (!question.trim()) { toast.error('Escreva a pergunta que a IA vai avaliar'); return }
      dimension = `ai_${label.toLowerCase().replace(/\s+/g, '_').slice(0, 40)}`
      condition_type = 'ai_subjective'
      condition_value = { question: question.trim() }
    } else {
      if (!fieldKey) { toast.error('Escolha um campo do CRM'); return }
      dimension = fieldKey
      condition_type = conditionType
      if (condition_type === 'equals') {
        if (!equalsValue.trim()) { toast.error('Informe o valor'); return }
        condition_value = { value: equalsValue.trim() }
      } else if (condition_type === 'range') {
        condition_value = {
          min: rangeMin.trim() ? Number(rangeMin) : null,
          max: rangeMax.trim() ? Number(rangeMax) : null,
        }
      } else if (condition_type === 'boolean_true') {
        condition_value = { field: booleanField.trim() || fieldKey }
      } else {
        toast.error('Tipo de condição inválido'); return
      }
    }

    const input: ScoringRuleInput = {
      dimension,
      condition_type,
      condition_value,
      weight,
      label: label.trim(),
      ordem: rule?.ordem ?? 0,
      ativa: rule?.ativa ?? true,
      rule_type: ruleType,
      ...(rule?.id ? { id: rule.id } : {}),
    }

    setSaving(true)
    try {
      await onSave(input)
      toast.success(isNew ? 'Regra criada' : 'Regra salva')
    } catch (err) {
      console.error('[QualificationRuleBuilder] save error', err)
      toast.error('Não consegui salvar.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    if (!confirm(`Apagar a regra "${label || 'sem nome'}"?`)) return
    try { await onDelete(); toast.success('Regra removida') }
    catch (err) { console.error(err); toast.error('Não consegui remover.') }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
      {/* Modo */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Tipo de critério</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('crm_field')}
            className={cn('text-left rounded-lg border p-2 transition-colors',
              mode === 'crm_field' ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300')}
          >
            <div className="text-sm font-medium text-slate-900">📋 Baseado em campo do CRM</div>
            <div className="text-xs text-slate-500 mt-0.5">Ex: orçamento ≥ R$ 80 mil, destino = Caribe</div>
          </button>
          <button
            type="button"
            onClick={() => setMode('ai_subjective')}
            className={cn('text-left rounded-lg border p-2 transition-colors',
              mode === 'ai_subjective' ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300')}
          >
            <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Avaliação da IA
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Ex: "Casal demonstra urgência clara?"</div>
          </button>
        </div>
      </div>

      {/* Nome */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Nome da regra (pra você identificar)</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder={mode === 'ai_subjective' ? 'Ex: Demonstra urgência' : 'Ex: Orçamento premium'}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
      </div>

      {/* Tipo da regra (qualify/bonus/disqualify) */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Efeito</label>
        <div className="space-y-1">
          {RULE_TYPES.map(rt => (
            <label key={rt.value} className={cn('flex items-start gap-2 p-2 rounded border cursor-pointer',
              ruleType === rt.value ? `border-${rt.color}-300 bg-${rt.color}-50` : 'border-slate-100 hover:border-slate-200')}>
              <input type="radio" checked={ruleType === rt.value} onChange={() => setRuleType(rt.value)} className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">{rt.label}</div>
                <div className="text-xs text-slate-500">{rt.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Condição */}
      {mode === 'crm_field' ? (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Qual campo do CRM?</label>
            <SingleFieldPicker
              value={fieldKey}
              onChange={setFieldKey}
              scope="card"
              pipelineId={pipelineId}
              produto={produto}
              placeholder="Escolha um campo..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Condição</label>
            <select value={conditionType} onChange={(e) => setConditionType(e.target.value as ConditionType)}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
              <option value="equals">é igual a</option>
              <option value="range">está entre</option>
              <option value="boolean_true">é verdadeiro (boolean)</option>
            </select>
          </div>

          {conditionType === 'equals' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Valor</label>
              <input value={equalsValue} onChange={(e) => setEqualsValue(e.target.value)}
                placeholder="Ex: Caribe, Entre R$ 100 e 200 mil"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            </div>
          )}
          {conditionType === 'range' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">De (mín)</label>
                <input type="number" value={rangeMin} onChange={(e) => setRangeMin(e.target.value)}
                  placeholder="Vazio = sem mínimo"
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Até (máx)</label>
                <input type="number" value={rangeMax} onChange={(e) => setRangeMax(e.target.value)}
                  placeholder="Vazio = sem máximo"
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
              </div>
            </div>
          )}
          {conditionType === 'boolean_true' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nome do campo boolean</label>
              <input value={booleanField} onChange={(e) => setBooleanField(e.target.value)}
                placeholder="Ex: viagem_internacional"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-mono" />
              <p className="text-[11px] text-slate-500 mt-1">A regra bate quando esse campo = true no card.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Pergunta que a IA vai avaliar do histórico</label>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Ex: "O casal demonstra urgência clara pra casar?"\n"A pessoa que responde tem poder de decisão?"`}
              className="w-full min-h-[70px] rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <p className="text-[11px] text-slate-500 mt-1">
              A IA responde sim/não com base no histórico da conversa. Se não houver evidência, responde "não" (conservador).
            </p>
          </div>
        </div>
      )}

      {/* Peso — só qualify/bonus */}
      {ruleType !== 'disqualify' && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Peso (quantos pontos somam se bater)</label>
          <div className="flex flex-wrap gap-1.5">
            {WEIGHT_OPTIONS.map(w => (
              <button key={w.value} type="button" onClick={() => setWeight(w.value)}
                className={cn('text-xs px-2.5 py-1 rounded-full border',
                  weight === w.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200')}>
                {w.label} <span className="opacity-60">({w.value})</span>
              </button>
            ))}
            <input type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))}
              className="w-20 rounded-full border border-slate-200 px-2 py-0.5 text-xs" placeholder="custom" />
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex justify-between pt-2 border-t border-slate-100">
        <div className="flex gap-2">
          {!isNew && onDelete && (
            <Button variant="outline" size="sm" onClick={handleDelete}
              className="gap-1.5 text-slate-500 hover:text-red-600">
              <Trash2 className="w-3.5 h-3.5" /> Remover
            </Button>
          )}
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
          )}
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isNew ? 'Criar regra' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
