import { useState, useMemo } from 'react'
import { Loader2, Plus, Trash2, Save, Info, ChevronDown, ChevronRight, Target, Play, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useAgentScoring,
  type ScoringRule,
  type ScoringRuleInput,
  type ConditionType,
  type ScoringResult,
  type FallbackAction,
  DEFAULT_SCORING_CONFIG,
} from '@/hooks/useAgentScoring'

interface Props {
  agentId: string | undefined
}

// ============================================================================
// Main Tab
// ============================================================================

export function TabPontuacao({ agentId }: Props) {
  const { config, rules, isLoading, upsertConfig, upsertRule, deleteRule, simulate } = useAgentScoring(agentId)

  if (!agentId) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <p className="text-sm text-slate-500">Salve o agente primeiro para configurar pontuação.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando configuração...
        </div>
      </div>
    )
  }

  const enabled = config?.enabled ?? false
  const threshold = config?.threshold_qualify ?? DEFAULT_SCORING_CONFIG.threshold_qualify ?? 25
  const maxBonus = config?.max_sinal_bonus ?? DEFAULT_SCORING_CONFIG.max_sinal_bonus ?? 10
  const fallbackAction = (config?.fallback_action ?? DEFAULT_SCORING_CONFIG.fallback_action ?? 'material_informativo') as FallbackAction

  const handleToggle = async (nextEnabled: boolean) => {
    try {
      await upsertConfig.mutateAsync({
        enabled: nextEnabled,
        threshold_qualify: threshold,
        fallback_action: fallbackAction,
        max_sinal_bonus: maxBonus,
      })
      toast.success(nextEnabled ? 'Pontuação ativada' : 'Pontuação desativada')
    } catch (err) {
      toast.error('Erro ao atualizar configuração')
      console.error(err)
    }
  }

  const handleConfigSave = async (updates: { threshold_qualify?: number; fallback_action?: string; max_sinal_bonus?: number }) => {
    try {
      await upsertConfig.mutateAsync({
        enabled,
        threshold_qualify: updates.threshold_qualify ?? threshold,
        fallback_action: updates.fallback_action ?? fallbackAction,
        max_sinal_bonus: updates.max_sinal_bonus ?? maxBonus,
      })
      toast.success('Configuração salva')
    } catch (err) {
      toast.error('Erro ao salvar')
      console.error(err)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toggle + Explicacao */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Pontuação (Scoring)</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              O agente pode calcular uma pontuação durante a conversa para decidir quando encaminhar o lead
              para a etapa seguinte. Você define as dimensões que importam para o seu negócio (destino,
              orçamento, urgência, sinais, o que for) e os pesos de cada uma.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <ToggleSwitch checked={enabled} onChange={handleToggle} disabled={upsertConfig.isPending} />
            <span className="text-xs text-slate-500">{enabled ? 'Ativa' : 'Desligada'}</span>
          </div>
        </div>

        {!enabled && (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 flex gap-2">
            <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Enquanto estiver desligada, o agente não calcula pontuação e a ferramenta{' '}
              <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">calculate_qualification_score</code>{' '}
              não fica disponível pra ele. As regras abaixo ficam preservadas e voltam a funcionar quando você ligar de novo.
            </p>
          </div>
        )}
      </section>

      {enabled && (
        <>
          {/* Config geral */}
          <ConfigSection
            threshold={threshold}
            maxBonus={maxBonus}
            fallbackAction={fallbackAction}
            onSave={handleConfigSave}
            isSaving={upsertConfig.isPending}
          />

          {/* Dimensoes + Regras */}
          <DimensionsSection
            rules={rules}
            onSaveRule={async (input) => {
              try {
                await upsertRule.mutateAsync(input)
                toast.success(input.id ? 'Regra atualizada' : 'Regra criada')
              } catch (err) {
                toast.error('Erro ao salvar regra')
                console.error(err)
              }
            }}
            onDeleteRule={async (ruleId) => {
              if (!confirm('Deletar esta regra?')) return
              try {
                await deleteRule.mutateAsync(ruleId)
                toast.success('Regra deletada')
              } catch (err) {
                toast.error('Erro ao deletar regra')
                console.error(err)
              }
            }}
          />

          {/* Simulador */}
          <SimulatorSection
            threshold={threshold}
            rules={rules}
            onSimulate={async (inputs) => {
              try {
                return await simulate.mutateAsync(inputs)
              } catch (err) {
                toast.error('Erro ao simular')
                console.error(err)
                return null
              }
            }}
            isSimulating={simulate.isPending}
          />
        </>
      )}
    </div>
  )
}

// ============================================================================
// Toggle Switch
// ============================================================================

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-indigo-600' : 'bg-slate-300',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

// ============================================================================
// Config Section (threshold, fallback, max_bonus)
// ============================================================================

function ConfigSection({
  threshold, maxBonus, fallbackAction, onSave, isSaving,
}: {
  threshold: number
  maxBonus: number
  fallbackAction: FallbackAction
  onSave: (updates: { threshold_qualify?: number; fallback_action?: string; max_sinal_bonus?: number }) => Promise<void>
  isSaving: boolean
}) {
  const [localThreshold, setLocalThreshold] = useState(threshold)
  const [localMaxBonus, setLocalMaxBonus] = useState(maxBonus)
  const [localFallback, setLocalFallback] = useState(fallbackAction)
  const dirty = localThreshold !== threshold || localMaxBonus !== maxBonus || localFallback !== fallbackAction

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
      <h3 className="text-base font-semibold text-slate-900 tracking-tight mb-4">Configuração geral</h3>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Score mínimo pra qualificar</label>
          <input
            type="number"
            value={localThreshold}
            onChange={(e) => setLocalThreshold(Number(e.target.value))}
            min={0}
            step={1}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-slate-500 mt-1">Lead com score maior ou igual vira qualificado.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Bônus máximo de sinais</label>
          <input
            type="number"
            value={localMaxBonus}
            onChange={(e) => setLocalMaxBonus(Number(e.target.value))}
            min={0}
            step={1}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-slate-500 mt-1">Limite que sinais indiretos podem somar juntos.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Quando não qualifica</label>
          <select
            value={localFallback}
            onChange={(e) => setLocalFallback(e.target.value as FallbackAction)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="material_informativo">Enviar material informativo e encerrar</option>
            <option value="encerrar_cordial">Encerrar cordialmente</option>
            <option value="nota_interna">Registrar nota interna</option>
            <option value="request_handoff">Passar pra humano</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-4">
        {dirty && <span className="text-xs text-amber-600">• alterações não salvas</span>}
        <Button
          onClick={() => onSave({ threshold_qualify: localThreshold, max_sinal_bonus: localMaxBonus, fallback_action: localFallback })}
          disabled={!dirty || isSaving}
          className="gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar configuração
        </Button>
      </div>
    </section>
  )
}

// ============================================================================
// Dimensions Section — agrupa regras por dimension e permite CRUD
// ============================================================================

function DimensionsSection({
  rules,
  onSaveRule,
  onDeleteRule,
}: {
  rules: ScoringRule[]
  onSaveRule: (input: ScoringRuleInput) => Promise<void>
  onDeleteRule: (ruleId: string) => Promise<void>
}) {
  const grouped = useMemo(() => {
    const map: Record<string, ScoringRule[]> = {}
    for (const r of rules) {
      if (!map[r.dimension]) map[r.dimension] = []
      map[r.dimension].push(r)
    }
    return map
  }, [rules])

  const [addingDimension, setAddingDimension] = useState(false)
  const [newDimensionName, setNewDimensionName] = useState('')
  const [newDimensionType, setNewDimensionType] = useState<ConditionType>('equals')

  const dimensionNames = Object.keys(grouped).sort()
  const [expanded, setExpanded] = useState<Set<string>>(new Set(dimensionNames))

  const toggleExpanded = (dim: string) => {
    const next = new Set(expanded)
    if (next.has(dim)) next.delete(dim)
    else next.add(dim)
    setExpanded(next)
  }

  const handleCreateRule = async (dimension: string, conditionType: ConditionType) => {
    const defaultValue =
      conditionType === 'equals'
        ? { value: '' }
        : conditionType === 'range'
          ? { min: 0, max: null }
          : { field: '' }

    await onSaveRule({
      dimension,
      condition_type: conditionType,
      condition_value: defaultValue,
      weight: 10,
      label: 'Nova regra',
      ordem: (grouped[dimension]?.length ?? 0) * 10 + 10,
      ativa: true,
    })
  }

  const handleCreateDimension = async () => {
    const name = newDimensionName.trim()
    if (!name) {
      toast.error('Nome da dimensão é obrigatório')
      return
    }
    if (grouped[name]) {
      toast.error('Já existe uma dimensão com esse nome')
      return
    }
    await handleCreateRule(name, newDimensionType)
    setAddingDimension(false)
    setNewDimensionName('')
    setNewDimensionType('equals')
    setExpanded(new Set([...expanded, name]))
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">Dimensões e regras</h3>
          <p className="text-sm text-slate-600 mt-0.5">
            Cada dimensão agrupa regras de um mesmo tipo (ex: "região", "valor por convidado", "urgência").
          </p>
        </div>
        {!addingDimension && (
          <Button variant="outline" size="sm" onClick={() => setAddingDimension(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Nova dimensão
          </Button>
        )}
      </div>

      {addingDimension && (
        <div className="bg-indigo-50/50 border border-indigo-200 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-slate-900 mb-3">Nova dimensão</h4>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Nome técnico (chave)</label>
              <input
                type="text"
                value={newDimensionName}
                onChange={(e) => setNewDimensionName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="ex: regiao, valor_convidado, urgencia"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Só letras minúsculas, números e underscore. É a chave que o agente vai passar no input.</p>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Tipo de avaliação</label>
              <select
                value={newDimensionType}
                onChange={(e) => setNewDimensionType(e.target.value as ConditionType)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="equals">Valor igual a... (ex: destino = "Caribe")</option>
                <option value="range">Dentro de uma faixa... (ex: orçamento entre X e Y)</option>
                <option value="boolean_true">Campo booleano = true (ex: viajou_fora = true)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={() => { setAddingDimension(false); setNewDimensionName('') }}>Cancelar</Button>
            <Button size="sm" onClick={handleCreateDimension}>Criar dimensão</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {dimensionNames.length === 0 && !addingDimension && (
          <div className="text-center py-8 text-slate-500 text-sm">
            Nenhuma dimensão ainda. Crie uma pra começar a pontuar leads.
          </div>
        )}

        {dimensionNames.map((dim) => {
          const dimRules = grouped[dim] ?? []
          const isExpanded = expanded.has(dim)
          const totalWeight = dimRules.filter(r => r.ativa).reduce((sum, r) => sum + Number(r.weight), 0)
          const conditionType = dimRules[0]?.condition_type ?? 'equals'

          return (
            <div key={dim} className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpanded(dim)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                <span className="font-mono text-sm font-medium text-slate-900">{dim}</span>
                <span className="text-xs text-slate-500">
                  ({dimRules.length} {dimRules.length === 1 ? 'regra' : 'regras'}, soma máx: {totalWeight})
                </span>
                <span className="text-xs bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-600 ml-2">
                  {conditionType === 'equals' && 'igual a'}
                  {conditionType === 'range' && 'faixa'}
                  {conditionType === 'boolean_true' && 'booleano'}
                </span>
              </button>

              {isExpanded && (
                <div className="p-3 space-y-2 bg-white">
                  {dimRules.map((rule) => (
                    <RuleRow
                      key={rule.id}
                      rule={rule}
                      onSave={(updated) => onSaveRule({ ...updated, id: rule.id })}
                      onDelete={() => onDeleteRule(rule.id)}
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCreateRule(dim, conditionType)}
                    className="gap-1.5 w-full justify-center"
                  >
                    <Plus className="w-3.5 h-3.5" /> Nova regra em "{dim}"
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ============================================================================
// Rule Row — editor inline de uma regra individual
// ============================================================================

function RuleRow({
  rule,
  onSave,
  onDelete,
}: {
  rule: ScoringRule
  onSave: (input: ScoringRuleInput) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [label, setLabel] = useState(rule.label ?? '')
  const [weight, setWeight] = useState(rule.weight)
  const [ativa, setAtiva] = useState(rule.ativa)
  const [conditionValue, setConditionValue] = useState(rule.condition_value)

  const dirty =
    label !== (rule.label ?? '') ||
    weight !== rule.weight ||
    ativa !== rule.ativa ||
    JSON.stringify(conditionValue) !== JSON.stringify(rule.condition_value)

  const handleSave = async () => {
    await onSave({
      dimension: rule.dimension,
      condition_type: rule.condition_type,
      condition_value: conditionValue,
      weight,
      label,
      ordem: rule.ordem,
      ativa,
    })
  }

  return (
    <div className={cn('border rounded-lg p-3', ativa ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/50')}>
      <div className="flex items-start gap-2">
        <div className="flex-1 grid md:grid-cols-12 gap-2 items-start">
          <div className="md:col-span-4">
            <label className="block text-[11px] text-slate-500 mb-0.5">Descrição (aparece no breakdown)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex: Caribe (top tier)"
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-[11px] text-slate-500 mb-0.5">Condição</label>
            <ConditionEditor
              type={rule.condition_type}
              value={conditionValue}
              onChange={setConditionValue}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] text-slate-500 mb-0.5">Peso</label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              step={1}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="md:col-span-1 flex items-end justify-center h-full pb-1">
            <ToggleSwitch checked={ativa} onChange={setAtiva} />
          </div>
        </div>

        <div className="flex items-center gap-1 pt-5">
          {dirty && (
            <Button size="sm" variant="ghost" onClick={handleSave} className="h-8 w-8 p-0" title="Salvar">
              <Save className="w-4 h-4 text-indigo-600" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete} className="h-8 w-8 p-0" title="Deletar">
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Condition Editor (depende do condition_type)
// ============================================================================

function ConditionEditor({
  type,
  value,
  onChange,
}: {
  type: ConditionType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (v: any) => void
}) {
  if (type === 'equals') {
    return (
      <input
        type="text"
        value={value?.value ?? ''}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder="ex: Caribe"
        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    )
  }
  if (type === 'range') {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value?.min ?? ''}
          onChange={(e) => onChange({ ...value, min: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="mín"
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-slate-400 text-xs">até</span>
        <input
          type="number"
          value={value?.max ?? ''}
          onChange={(e) => onChange({ ...value, max: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="máx"
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
    )
  }
  if (type === 'boolean_true') {
    return (
      <input
        type="text"
        value={value?.field ?? ''}
        onChange={(e) => onChange({ field: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
        placeholder="ex: viajou_fora"
        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    )
  }
  return null
}

// ============================================================================
// Simulator — testa inputs hipoteticos e mostra o score calculado
// ============================================================================

function SimulatorSection({
  threshold,
  rules,
  onSimulate,
  isSimulating,
}: {
  threshold: number
  rules: ScoringRule[]
  onSimulate: (inputs: Record<string, unknown>) => Promise<ScoringResult | null>
  isSimulating: boolean
}) {
  // Inicializa inputs com um exemplo de cada dimensao
  const initialInputs = useMemo(() => {
    const out: Record<string, string> = {}
    const byDim: Record<string, ScoringRule[]> = {}
    for (const r of rules) {
      if (!byDim[r.dimension]) byDim[r.dimension] = []
      byDim[r.dimension].push(r)
    }
    for (const [dim, dimRules] of Object.entries(byDim)) {
      const first = dimRules[0]
      if (first.condition_type === 'equals') {
        out[dim] = (first.condition_value as { value?: string })?.value ?? ''
      } else if (first.condition_type === 'range') {
        const cv = first.condition_value as { min?: number | null; max?: number | null }
        out[dim] = String(cv?.min ?? 0)
      } else if (first.condition_type === 'boolean_true') {
        const field = (first.condition_value as { field?: string })?.field
        if (field) out[field] = 'true'
      }
    }
    return out
  }, [rules])

  const [inputs, setInputs] = useState<Record<string, string>>(initialInputs)
  const [result, setResult] = useState<ScoringResult | null>(null)

  const handleRun = async () => {
    // Converte strings pra valores certos (numero, boolean)
    const parsed: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(inputs)) {
      if (v === 'true') parsed[k] = true
      else if (v === 'false') parsed[k] = false
      else if (v === '') continue
      else if (!isNaN(Number(v))) parsed[k] = Number(v)
      else parsed[k] = v
    }
    const res = await onSimulate(parsed)
    setResult(res)
  }

  // Lista todos os "campos" que as regras referem (chaves usadas em input)
  const allInputKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const r of rules) {
      if (r.condition_type === 'boolean_true') {
        const field = (r.condition_value as { field?: string })?.field
        if (field) keys.add(field)
      } else {
        keys.add(r.dimension)
      }
    }
    return Array.from(keys).sort()
  }, [rules])

  if (allInputKeys.length === 0) {
    return null
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Play className="w-5 h-5 text-emerald-600" />
        <h3 className="text-base font-semibold text-slate-900 tracking-tight">Simulador</h3>
      </div>
      <p className="text-sm text-slate-600 mb-4">
        Teste com valores hipotéticos pra ver como o score sai antes de ativar o agente em produção.
      </p>

      <div className="grid md:grid-cols-2 gap-3">
        {allInputKeys.map((key) => (
          <div key={key}>
            <label className="block text-xs font-mono text-slate-600 mb-1">{key}</label>
            <input
              type="text"
              value={inputs[key] ?? ''}
              onChange={(e) => setInputs({ ...inputs, [key]: e.target.value })}
              placeholder={key}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-4">
        <Button onClick={handleRun} disabled={isSimulating} className="gap-2">
          {isSimulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Calcular score
        </Button>
      </div>

      {result && (
        <div className={cn(
          'mt-4 rounded-lg p-4 border',
          result.enabled === false
            ? 'bg-slate-50 border-slate-200'
            : result.qualificado
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
        )}>
          {result.enabled === false ? (
            <div className="flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700">{result.message ?? 'Scoring desligado'}</p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-slate-900">{result.score}</span>
                  <span className="text-xs text-slate-600">de mínimo {threshold}</span>
                </div>
                <span className={cn(
                  'text-xs font-semibold px-2 py-1 rounded-full',
                  result.qualificado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                )}>
                  {result.qualificado ? 'QUALIFICADO' : 'NÃO QUALIFICADO'}
                </span>
              </div>

              {result.breakdown && result.breakdown.length > 0 && (
                <div className="space-y-1 mt-3">
                  <p className="text-xs font-medium text-slate-700 mb-1">Detalhamento:</p>
                  {result.breakdown.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs bg-white/60 rounded px-2 py-1">
                      <span className="text-slate-700">
                        <span className="font-mono text-slate-500 text-[10px] mr-1.5">{item.dimension}</span>
                        {item.label}
                      </span>
                      <span className="font-medium text-slate-900">+{item.weight}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.sinal_bonus_applied !== undefined && result.sinal_bonus_applied > 0 && (
                <p className="text-[11px] text-slate-500 mt-2">
                  Bônus de sinais aplicado: {result.sinal_bonus_applied} / {result.max_sinal_bonus} máx
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
