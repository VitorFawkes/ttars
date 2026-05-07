import { useState, useMemo } from 'react'
import { Loader2, Plus, Trash2, Save, Info, ChevronDown, ChevronRight, Target, Play, ShieldAlert, TrendingUp, Sparkles, ArrowRight, Trophy, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useAgentScoring,
  type ScoringRule,
  type ScoringRuleInput,
  type ConditionType,
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
  const { config, rules, isLoading, upsertConfig, upsertRule, deleteRule } = useAgentScoring(agentId)

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
          {/* Como funciona o score (visual) */}
          <ScoringExplainer rules={rules} threshold={threshold} maxBonus={maxBonus} />

          {/* Config geral */}
          <ConfigSection
            threshold={threshold}
            maxBonus={maxBonus}
            fallbackAction={fallbackAction}
            onSave={handleConfigSave}
            isSaving={upsertConfig.isPending}
          />

          {/* Critérios organizados por categoria */}
          <CriteriaSection
            rules={rules}
            maxBonus={maxBonus}
            onSaveRule={async (input) => {
              try {
                await upsertRule.mutateAsync(input)
                toast.success(input.id ? 'Critério atualizado' : 'Critério criado')
              } catch (err) {
                toast.error('Erro ao salvar critério')
                console.error(err)
              }
            }}
            onDeleteRule={async (ruleId) => {
              if (!confirm('Deletar este critério?')) return
              try {
                await deleteRule.mutateAsync(ruleId)
                toast.success('Critério deletado')
              } catch (err) {
                toast.error('Erro ao deletar critério')
                console.error(err)
              }
            }}
          />

          {/* Simulador */}
          <SimulatorSection threshold={threshold} maxBonus={maxBonus} rules={rules} />
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
// Scoring Explainer — visualização de como o score funciona
// ============================================================================

function ScoringExplainer({
  rules,
  threshold,
  maxBonus,
}: {
  rules: ScoringRule[]
  threshold: number
  maxBonus: number
}) {
  const { disqualify, qualifyGroups, qualifyStandalone, bonus, paths } = useMemo(() => {
    const active = rules.filter((r) => r.ativa)
    const disqualify = active.filter((r) => r.rule_type === 'disqualify')
    const qualify = active.filter((r) => r.rule_type === 'qualify')
    const bonus = active.filter((r) => r.rule_type === 'bonus')

    // Agrupa qualify por exclusion_group
    const groupMap = new Map<string, ScoringRule[]>()
    const standalone: ScoringRule[] = []
    for (const r of qualify) {
      if (r.exclusion_group) {
        if (!groupMap.has(r.exclusion_group)) groupMap.set(r.exclusion_group, [])
        groupMap.get(r.exclusion_group)!.push(r)
      } else {
        standalone.push(r)
      }
    }
    // Ordena cada grupo por peso (asc) pra mostrar a escala
    const qualifyGroups = Array.from(groupMap.entries()).map(([name, gRules]) => ({
      name,
      rules: gRules.sort((a, b) => Number(a.weight) - Number(b.weight)),
    }))

    // Calcula caminhos típicos pra atingir threshold (top 4)
    const paths = computePaths(qualifyGroups, standalone, threshold)

    return {
      disqualify,
      qualifyGroups,
      qualifyStandalone: standalone.sort((a, b) => Number(b.weight) - Number(a.weight)),
      bonus,
      paths,
    }
  }, [rules, threshold])

  const hasAnyQualify = qualifyGroups.length > 0 || qualifyStandalone.length > 0
  if (!hasAnyQualify && disqualify.length === 0 && bonus.length === 0) {
    return null
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Info className="w-5 h-5 text-indigo-600" />
        <h3 className="text-base font-semibold text-slate-900 tracking-tight">Como o score funciona</h3>
      </div>
      <p className="text-sm text-slate-600 mb-5">
        A cada turno, a IA avalia a conversa e calcula a pontuação seguindo estes 3 passos.
      </p>

      {/* 3 passos do cálculo */}
      <div className="grid md:grid-cols-3 gap-3 mb-6">
        {/* Passo 1: Alertas vermelhos */}
        <div className="border border-red-200 bg-red-50/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">1</div>
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h4 className="text-sm font-semibold text-slate-900">Alertas vermelhos</h4>
          </div>
          <p className="text-xs text-slate-600 mb-3 leading-relaxed">
            Se qualquer um destes bater, o lead é desqualificado direto, sem somar pontos.
          </p>
          {disqualify.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Nenhum configurado</p>
          ) : (
            <ul className="space-y-1.5">
              {disqualify.map((r) => (
                <li key={r.id} className="flex items-start gap-1.5 text-xs">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span className="text-slate-700">{r.label || r.dimension}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Passo 2: Pontos positivos */}
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">2</div>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-semibold text-slate-900">Pontos positivos</h4>
          </div>
          <p className="text-xs text-slate-600 mb-2 leading-relaxed">
            Cada sinal soma pontos. Quando atinge <strong className="text-slate-900">{threshold}</strong>, o lead é qualificado.
          </p>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-xs text-slate-500">Mínimo pra qualificar:</span>
            <span className="text-2xl font-bold text-indigo-700 leading-none">{threshold}</span>
            <span className="text-xs text-slate-500">pts</span>
          </div>
        </div>

        {/* Passo 3: Bônus */}
        <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">3</div>
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-semibold text-slate-900">Bônus</h4>
          </div>
          <p className="text-xs text-slate-600 mb-3 leading-relaxed">
            Sinais extras somam até <strong className="text-slate-900">{maxBonus}</strong> pontos no total. Reforçam o caso, não definem sozinhos.
          </p>
          {bonus.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Nenhum configurado</p>
          ) : (
            <ul className="space-y-1.5">
              {bonus.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 truncate pr-2">{r.label || r.dimension}</span>
                  <span className="font-semibold text-emerald-700 flex-shrink-0">+{r.weight}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Grupos exclusivos + sinais individuais */}
      {qualifyGroups.length > 0 && (
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
            Grupos exclusivos (só uma regra do grupo pontua)
          </h4>
          <div className="space-y-3">
            {qualifyGroups.map((g) => (
              <ExclusionGroupBars key={g.name} group={g} />
            ))}
          </div>
        </div>
      )}

      {qualifyStandalone.length > 0 && (
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
            Sinais individuais (somam ao score)
          </h4>
          <div className="grid sm:grid-cols-2 gap-2">
            {qualifyStandalone.map((r) => (
              <div key={r.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 bg-white">
                <span className="text-sm text-slate-700 truncate pr-2">{r.label || r.dimension}</span>
                <span className="text-sm font-semibold text-indigo-700 flex-shrink-0">+{r.weight}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Caminhos pra qualificar */}
      {paths.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Caminhos típicos pra qualificar (≥ {threshold} pts)
            </h4>
          </div>
          <div className="space-y-1.5">
            {paths.map((path, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                  {path.steps.map((s, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 && <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                      <span className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-md px-2 py-0.5 text-xs">
                        <span className="text-slate-700 truncate max-w-[180px]">{s.label}</span>
                        <span className="font-semibold text-indigo-700">+{s.weight}</span>
                      </span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs text-slate-500">=</span>
                  <span className="text-sm font-bold text-emerald-700">{path.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// Card de um grupo exclusivo (visualização leitura no Explainer): escala visual
function ExclusionGroupBars({ group }: { group: { name: string; rules: ScoringRule[] } }) {
  const maxWeight = Math.max(...group.rules.map((r) => Number(r.weight)))

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
        <span className="text-xs font-mono font-medium text-slate-700">{group.name}</span>
        <span className="text-[10px] uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
          é OU é (não soma)
        </span>
      </div>
      <div className="p-2 space-y-1">
        {group.rules.map((r) => {
          const pct = maxWeight > 0 ? (Number(r.weight) / maxWeight) * 100 : 0
          return (
            <div key={r.id} className="flex items-center gap-2 text-xs">
              <div className="flex-1 relative h-6 bg-slate-100 rounded">
                <div
                  className="absolute inset-y-0 left-0 bg-indigo-200/60 rounded"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-0 flex items-center px-2 text-slate-700 truncate">
                  {r.label || r.dimension}
                </span>
              </div>
              <span className="font-semibold text-indigo-700 w-10 text-right flex-shrink-0">+{r.weight}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Calcula combinações típicas pra atingir threshold.
// Estratégia: 1 sinal sozinho que já basta + combos de 2-3 sinais de grupos diferentes.
function computePaths(
  groups: { name: string; rules: ScoringRule[] }[],
  standalone: ScoringRule[],
  threshold: number,
): { steps: { label: string; weight: number }[]; total: number }[] {
  type Step = { label: string; weight: number; sourceKey: string }
  const paths: { steps: Step[]; total: number }[] = []
  const seen = new Set<string>()

  const allBuckets: { key: string; bestRules: ScoringRule[] }[] = [
    ...groups.map((g) => ({ key: `g:${g.name}`, bestRules: [...g.rules].sort((a, b) => Number(b.weight) - Number(a.weight)) })),
    ...standalone.map((r) => ({ key: `s:${r.id}`, bestRules: [r] })),
  ]

  const ruleToStep = (r: ScoringRule, sourceKey: string): Step => ({
    label: r.label || r.dimension,
    weight: Number(r.weight),
    sourceKey,
  })

  const tryAddPath = (steps: Step[]) => {
    const total = steps.reduce((s, x) => s + x.weight, 0)
    if (total < threshold) return
    // Dedup por chaves (ordem importa pra exibição mas não pra dedup)
    const key = [...steps.map((s) => s.sourceKey)].sort().join('|')
    if (seen.has(key)) return
    seen.add(key)
    paths.push({ steps, total })
  }

  // 1 sinal sozinho >= threshold
  for (const b of allBuckets) {
    const top = b.bestRules[0]
    if (!top) continue
    if (Number(top.weight) >= threshold) {
      tryAddPath([ruleToStep(top, b.key)])
    }
  }

  // 2 sinais de buckets diferentes
  for (let i = 0; i < allBuckets.length; i++) {
    for (let j = i + 1; j < allBuckets.length; j++) {
      const a = allBuckets[i].bestRules[0]
      const b = allBuckets[j].bestRules[0]
      if (!a || !b) continue
      tryAddPath([ruleToStep(a, allBuckets[i].key), ruleToStep(b, allBuckets[j].key)])
    }
  }

  // 3 sinais (só se ainda não temos paths suficientes)
  if (paths.length < 4) {
    for (let i = 0; i < allBuckets.length; i++) {
      for (let j = i + 1; j < allBuckets.length; j++) {
        for (let k = j + 1; k < allBuckets.length; k++) {
          const a = allBuckets[i].bestRules[allBuckets[i].bestRules.length - 1] // pior do bucket
          const b = allBuckets[j].bestRules[allBuckets[j].bestRules.length - 1]
          const c = allBuckets[k].bestRules[allBuckets[k].bestRules.length - 1]
          if (!a || !b || !c) continue
          tryAddPath([
            ruleToStep(a, allBuckets[i].key),
            ruleToStep(b, allBuckets[j].key),
            ruleToStep(c, allBuckets[k].key),
          ])
          if (paths.length >= 6) break
        }
        if (paths.length >= 6) break
      }
      if (paths.length >= 6) break
    }
  }

  // Ordena por total desc (mais fácil primeiro = maior score) depois por menor nº de steps
  return paths
    .sort((p1, p2) => {
      if (p1.steps.length !== p2.steps.length) return p1.steps.length - p2.steps.length
      return p2.total - p1.total
    })
    .slice(0, 4)
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
            className="no-spin w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="no-spin w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
// Criteria Section — organiza regras por categoria (4 buckets)
// ============================================================================

function CriteriaSection({
  rules,
  maxBonus,
  onSaveRule,
  onDeleteRule,
}: {
  rules: ScoringRule[]
  maxBonus: number
  onSaveRule: (input: ScoringRuleInput) => Promise<void>
  onDeleteRule: (ruleId: string) => Promise<void>
}) {
  const buckets = useMemo(() => {
    const disqualify = rules.filter((r) => r.rule_type === 'disqualify')
    const bonus = rules.filter((r) => r.rule_type === 'bonus')
    const qualify = rules.filter((r) => r.rule_type === 'qualify')

    const groupMap = new Map<string, ScoringRule[]>()
    const individual: ScoringRule[] = []
    for (const r of qualify) {
      if (r.exclusion_group) {
        if (!groupMap.has(r.exclusion_group)) groupMap.set(r.exclusion_group, [])
        groupMap.get(r.exclusion_group)!.push(r)
      } else {
        individual.push(r)
      }
    }
    const exclusionGroups = Array.from(groupMap.entries())
      .map(([name, gRules]) => ({ name, rules: gRules.sort((a, b) => Number(b.weight) - Number(a.weight)) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return { disqualify, exclusionGroups, individual, bonus }
  }, [rules])

  const generateDimensionKey = (prefix: string): string => {
    const id = Math.random().toString(36).slice(2, 6)
    return `${prefix}_${id}`
  }

  const handleCreateDisqualify = async () => {
    await onSaveRule({
      dimension: generateDimensionKey('alerta'),
      condition_type: 'ai_subjective',
      condition_value: { question: '' },
      weight: 0,
      label: 'Novo alerta',
      ordem: 100 + buckets.disqualify.length,
      ativa: true,
      rule_type: 'disqualify',
    })
  }

  const handleCreateGroup = async (groupName: string) => {
    await onSaveRule({
      dimension: generateDimensionKey(groupName),
      condition_type: 'ai_subjective',
      condition_value: { question: '' },
      weight: 10,
      label: 'Nova opção',
      ordem: 10,
      ativa: true,
      rule_type: 'qualify',
      exclusion_group: groupName,
    })
  }

  const handleCreateOption = async (groupName: string) => {
    const existing = buckets.exclusionGroups.find((g) => g.name === groupName)
    // Detecta grupos conhecidos com fórmula determinística — admin não precisa
    // escrever pergunta, só ajustar os limites numéricos.
    const isValuePerGuestGroup = groupName === 'valor_convidado'
    const conditionValue = isValuePerGuestGroup
      ? { formula: 'value_per_guest', min: null, max: null }
      : { question: '' }
    await onSaveRule({
      dimension: generateDimensionKey(groupName),
      condition_type: 'ai_subjective',
      condition_value: conditionValue,
      weight: 10,
      // Pra grupos com fórmula o label é derivado em tempo real do condition_value;
      // o salvamento depois vai gravar o label correto.
      label: isValuePerGuestGroup ? 'Valor por convidado: configurar faixa' : 'Nova opção',
      ordem: (existing?.rules.length ?? 0) * 10 + 10,
      ativa: true,
      rule_type: 'qualify',
      exclusion_group: groupName,
    })
  }

  const handleCreateIndividual = async () => {
    await onSaveRule({
      dimension: generateDimensionKey('sinal'),
      condition_type: 'ai_subjective',
      condition_value: { question: '' },
      weight: 10,
      label: 'Novo sinal',
      ordem: 10 + buckets.individual.length,
      ativa: true,
      rule_type: 'qualify',
    })
  }

  const handleCreateBonus = async () => {
    await onSaveRule({
      dimension: generateDimensionKey('bonus'),
      condition_type: 'ai_subjective',
      condition_value: { question: '' },
      weight: 5,
      label: 'Novo bônus',
      ordem: 10 + buckets.bonus.length,
      ativa: true,
      rule_type: 'bonus',
    })
  }

  return (
    <section className="space-y-4">
      {/* Bucket: Alertas vermelhos */}
      <BucketCard
        icon={<ShieldAlert className="w-5 h-5 text-red-600" />}
        title="Alertas vermelhos"
        subtitle="Se qualquer um bater, desqualifica direto. Sem somar pontos."
        accent="red"
        onAdd={handleCreateDisqualify}
        addLabel="Adicionar alerta"
      >
        {buckets.disqualify.length === 0 ? (
          <EmptyState message="Nenhum alerta configurado." />
        ) : (
          <div className="space-y-2">
            {buckets.disqualify.map((rule) => (
              <CriterionRow
                key={rule.id}
                rule={rule}
                hideWeight
                onSave={(updated) => onSaveRule({ ...updated, id: rule.id })}
                onDelete={() => onDeleteRule(rule.id)}
              />
            ))}
          </div>
        )}
      </BucketCard>

      {/* Bucket: Grupos exclusivos */}
      <BucketCard
        icon={<Target className="w-5 h-5 text-indigo-600" />}
        title="Grupos exclusivos"
        subtitle="Critérios mutuamente excludentes — só uma opção do grupo pode pontuar."
        accent="indigo"
        onAdd={async () => {
          const name = prompt('Nome do novo grupo (ex: destino, valor_convidado, urgencia):')
          if (!name) return
          const slug = name.toLowerCase().replace(/[^a-z0-9_]/g, '_')
          if (!slug) return
          if (buckets.exclusionGroups.some((g) => g.name === slug)) {
            toast.error('Já existe um grupo com esse nome')
            return
          }
          await handleCreateGroup(slug)
        }}
        addLabel="Novo grupo"
      >
        {buckets.exclusionGroups.length === 0 ? (
          <EmptyState message="Nenhum grupo exclusivo." />
        ) : (
          <div className="space-y-3">
            {buckets.exclusionGroups.map((group) => (
              <ExclusionGroupCard
                key={group.name}
                group={group}
                onSaveRule={onSaveRule}
                onDeleteRule={onDeleteRule}
                onAddOption={() => handleCreateOption(group.name)}
              />
            ))}
          </div>
        )}
      </BucketCard>

      {/* Bucket: Sinais individuais */}
      <BucketCard
        icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
        title="Sinais individuais"
        subtitle="Critérios independentes que somam ao score (não excluem outros)."
        accent="indigo"
        onAdd={handleCreateIndividual}
        addLabel="Adicionar sinal"
      >
        {buckets.individual.length === 0 ? (
          <EmptyState message="Nenhum sinal individual." />
        ) : (
          <div className="space-y-2">
            {buckets.individual.map((rule) => (
              <CriterionRow
                key={rule.id}
                rule={rule}
                onSave={(updated) => onSaveRule({ ...updated, id: rule.id })}
                onDelete={() => onDeleteRule(rule.id)}
              />
            ))}
          </div>
        )}
      </BucketCard>

      {/* Bucket: Bônus */}
      <BucketCard
        icon={<Sparkles className="w-5 h-5 text-emerald-600" />}
        title="Bônus"
        subtitle={`Reforçam o caso. Somam até ${maxBonus} pontos no total (cap configurável acima).`}
        accent="emerald"
        onAdd={handleCreateBonus}
        addLabel="Adicionar bônus"
      >
        {buckets.bonus.length === 0 ? (
          <EmptyState message="Nenhum bônus configurado." />
        ) : (
          <div className="space-y-2">
            {buckets.bonus.map((rule) => (
              <CriterionRow
                key={rule.id}
                rule={rule}
                onSave={(updated) => onSaveRule({ ...updated, id: rule.id })}
                onDelete={() => onDeleteRule(rule.id)}
              />
            ))}
          </div>
        )}
      </BucketCard>
    </section>
  )
}

// Bucket card wrapper
function BucketCard({
  icon,
  title,
  subtitle,
  accent,
  onAdd,
  addLabel,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  accent: 'red' | 'indigo' | 'emerald'
  onAdd: () => void | Promise<void>
  addLabel: string
  children: React.ReactNode
}) {
  const accentBorder = {
    red: 'border-l-red-400',
    indigo: 'border-l-indigo-400',
    emerald: 'border-l-emerald-400',
  }[accent]

  return (
    <section className={cn('bg-white border border-slate-200 border-l-4 shadow-sm rounded-xl p-5', accentBorder)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {icon}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h3>
            <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd} className="gap-1.5 flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> {addLabel}
        </Button>
      </div>
      {children}
    </section>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-6 text-slate-400 text-xs italic border border-dashed border-slate-200 rounded-lg">
      {message}
    </div>
  )
}

// Card de um grupo exclusivo (lista de opções com pesos)
function ExclusionGroupCard({
  group,
  onSaveRule,
  onDeleteRule,
  onAddOption,
}: {
  group: { name: string; rules: ScoringRule[] }
  onSaveRule: (input: ScoringRuleInput) => Promise<void>
  onDeleteRule: (ruleId: string) => Promise<void>
  onAddOption: () => void | Promise<void>
}) {
  const [collapsed, setCollapsed] = useState(false)
  const friendlyName = group.name.replace(/_/g, ' ')
  const totalActive = group.rules.filter((r) => r.ativa).length
  const maxWeight = Math.max(...group.rules.map((r) => Number(r.weight)), 0)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        {collapsed ? <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        <span className="text-sm font-semibold text-slate-900 capitalize flex-1 truncate">{friendlyName}</span>
        <span className="text-[10px] uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
          é OU é (não soma)
        </span>
        <span className="text-xs text-slate-500 ml-2 flex-shrink-0">
          {totalActive} {totalActive === 1 ? 'opção' : 'opções'} · máx +{maxWeight}
        </span>
      </button>

      {!collapsed && (
        <div className="p-3 space-y-2">
          {group.rules.map((rule) => (
            <CriterionRow
              key={rule.id}
              rule={rule}
              onSave={(updated) => onSaveRule({ ...updated, id: rule.id })}
              onDelete={() => onDeleteRule(rule.id)}
            />
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={onAddOption}
            className="gap-1.5 w-full justify-center"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar opção em {friendlyName}
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Criterion Row — linha editável de um critério individual
// ============================================================================

function CriterionRow({
  rule,
  hideWeight = false,
  onSave,
  onDelete,
}: {
  rule: ScoringRule
  hideWeight?: boolean
  onSave: (input: ScoringRuleInput) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [labelManual, setLabelManual] = useState(rule.label ?? '')
  const [weight, setWeight] = useState(rule.weight)
  const [ativa, setAtiva] = useState(rule.ativa)
  const [conditionValue, setConditionValue] = useState(rule.condition_value)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Quando a regra usa fórmula determinística (ex: valor por convidado), o
  // label é DERIVADO do condition_value — impede divergência label-vs-pergunta
  // que existia antes (label dizia "1.000-1.500" e pergunta dizia "3.500-4.000").
  const derivedLabel = deriveLabelFromFormula(conditionValue)
  const usesFormula = derivedLabel !== null
  const label = usesFormula ? (derivedLabel ?? '') : labelManual

  const dirty =
    label !== (rule.label ?? '') ||
    weight !== rule.weight ||
    ativa !== rule.ativa ||
    JSON.stringify(conditionValue) !== JSON.stringify(rule.condition_value)

  // Validação:
  // - regras com fórmula: precisam de pelo menos um limite numérico definido
  // - regras ai_subjective sem fórmula: precisam de pergunta não-vazia
  const formulaIncomplete = (() => {
    if (!hasFormula(conditionValue)) return false
    if (conditionValue.formula === 'value_per_guest') {
      return conditionValue.min == null && conditionValue.max == null
    }
    if (conditionValue.formula === 'budget_below' || conditionValue.formula === 'budget_above') {
      return conditionValue.value == null && conditionValue.min == null && conditionValue.max == null
    }
    return false
  })()
  const questionEmpty =
    rule.condition_type === 'ai_subjective' &&
    !usesFormula &&
    !((conditionValue as { question?: string })?.question ?? '').trim()
  const labelEmpty = !usesFormula && !labelManual.trim()
  const saveBlocked = questionEmpty || labelEmpty || formulaIncomplete

  const handleSave = async () => {
    if (saveBlocked) {
      if (formulaIncomplete) toast.error('Preencha pelo menos um limite numérico antes de salvar.')
      else if (questionEmpty) toast.error('Preencha a pergunta antes de salvar — ela é o que a IA usa para avaliar este critério.')
      else if (labelEmpty) toast.error('Dê um nome ao critério antes de salvar.')
      if ((questionEmpty || formulaIncomplete) && !showAdvanced) setShowAdvanced(true)
      return
    }
    setIsSaving(true)
    try {
      await onSave({
        dimension: rule.dimension,
        condition_type: rule.condition_type,
        condition_value: conditionValue,
        weight,
        label,
        ordem: rule.ordem,
        ativa,
        rule_type: rule.rule_type ?? 'qualify',
        exclusion_group: rule.exclusion_group ?? null,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDiscard = () => {
    setLabelManual(rule.label ?? '')
    setWeight(rule.weight)
    setAtiva(rule.ativa)
    setConditionValue(rule.condition_value)
  }

  const conditionLabel: Record<ConditionType, string> = {
    ai_subjective: 'Pergunta que a IA avalia (responde sim/não com base na conversa)',
    equals: 'Tipo legado',
    range: 'Tipo legado',
    boolean_true: 'Tipo legado',
  }

  return (
    <div className={cn(
      'border rounded-lg overflow-hidden',
      dirty ? 'border-amber-300 ring-2 ring-amber-100' : ativa ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/50',
    )}>
      {/* Linha principal: label + peso + toggle */}
      <div className={cn('flex items-center gap-2 p-3', dirty ? 'bg-white' : '')}>
        {usesFormula ? (
          <div
            className="flex-1 min-w-0 border border-slate-200 bg-slate-50 rounded px-3 py-1.5 text-sm text-slate-700"
            title="Nome gerado a partir da fórmula. Edite os limites no painel avançado."
          >
            {label}
            <span className="ml-2 text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded">auto</span>
          </div>
        ) : (
          <input
            type="text"
            value={labelManual}
            onChange={(e) => setLabelManual(e.target.value)}
            placeholder="Descreva esse critério..."
            className="flex-1 min-w-0 border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        )}
        {!hideWeight && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-slate-500">peso</span>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              step={1}
              className="no-spin w-16 border border-slate-300 rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}
        <ToggleSwitch checked={ativa} onChange={setAtiva} />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowAdvanced((v) => !v)}
          className="h-8 w-8 p-0"
          title={showAdvanced ? 'Ocultar detalhes' : 'Ver detalhes'}
        >
          {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="h-8 w-8 p-0" title="Deletar">
          <Trash2 className="w-4 h-4 text-red-500" />
        </Button>
      </div>

      {/* Detalhes expandidos: condição + chave técnica */}
      {showAdvanced && (
        <div className="border-t border-slate-200 px-3 py-3 space-y-3 bg-slate-50/30">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {conditionLabel[rule.condition_type]}
              {rule.condition_type === 'ai_subjective' && <span className="text-red-600 ml-1">*</span>}
            </label>
            <ConditionEditor
              type={rule.condition_type}
              value={conditionValue}
              onChange={setConditionValue}
              hasError={questionEmpty || formulaIncomplete}
            />
            {questionEmpty && (
              <p className="text-[11px] text-red-600 mt-1">
                Sem pergunta a IA não consegue avaliar este critério (resultado fica sempre em zero). Preencha antes de salvar.
              </p>
            )}
            {formulaIncomplete && (
              <p className="text-[11px] text-red-600 mt-1">
                Defina pelo menos um limite numérico (mínimo ou máximo) — sem isso a IA não consegue avaliar.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Chave técnica</label>
              <code className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded px-2 py-1 block truncate">
                {rule.dimension}
              </code>
            </div>
            {rule.exclusion_group && (
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Grupo</label>
                <code className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded px-2 py-1 block truncate">
                  {rule.exclusion_group}
                </code>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barra de salvamento — visível quando há mudanças não salvas */}
      {dirty && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-amber-50 border-t border-amber-200">
          <span className="text-xs font-medium text-amber-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Você tem mudanças não salvas
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDiscard}
              disabled={isSaving}
              className="gap-1.5 h-8"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Descartar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || saveBlocked}
              title={saveBlocked ? (questionEmpty ? 'Preencha a pergunta primeiro' : 'Preencha o nome primeiro') : undefined}
              className="gap-1.5 h-8 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-300"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Condition Editor (depende do condition_type)
// ============================================================================

// Detecta se a regra usa fórmula determinística (valor por convidado, faixa
// numérica, etc). Quando tem formula, a UI mostra inputs estruturados em vez
// de textarea de pergunta — impede o admin de criar label e pergunta divergentes.
function hasFormula(value: unknown): value is { formula: string; min?: number | null; max?: number | null; value?: number | null } {
  return typeof value === 'object' && value !== null && typeof (value as { formula?: unknown }).formula === 'string'
}

// Gera o label humano automaticamente a partir do condition_value estruturado.
// Mantém label e pergunta sempre alinhados — o admin não consegue divergir.
export function deriveLabelFromFormula(cv: unknown): string | null {
  if (!hasFormula(cv)) return null
  const fmt = (n: number | null | undefined) =>
    n == null ? '' : `R$ ${n.toLocaleString('pt-BR')}`
  if (cv.formula === 'value_per_guest') {
    if (cv.min != null && cv.max != null) return `Valor por convidado: ${fmt(cv.min)} a ${fmt(cv.max)}/convidado`
    if (cv.min != null) return `Valor por convidado: ${fmt(cv.min)}/convidado ou mais`
    if (cv.max != null) return `Valor por convidado: até ${fmt(cv.max)}/convidado`
    return 'Valor por convidado: configurar faixa'
  }
  if (cv.formula === 'budget_below') return `Orçamento abaixo de ${fmt(cv.value ?? cv.max)}`
  if (cv.formula === 'budget_above') return `Orçamento acima de ${fmt(cv.value ?? cv.min)}`
  return null
}

function ConditionEditor({
  type,
  value,
  onChange,
  hasError,
}: {
  type: ConditionType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (v: any) => void
  hasError?: boolean
}) {
  // Editor estruturado: faixa de valor por convidado (sem espaço pra divergir
  // de label/pergunta — UI gera tudo a partir dos números).
  if (type === 'ai_subjective' && hasFormula(value) && value.formula === 'value_per_guest') {
    const min = value.min ?? null
    const max = value.max ?? null
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-slate-500">
          Valor calculado dividindo o investimento total pelo número de convidados.
          A IA usa esses números diretamente — sem ambiguidade.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-600 flex items-center gap-1">
            de R$
            <input
              type="number"
              value={min ?? ''}
              onChange={(e) => onChange({ ...value, min: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="—"
              className="no-spin w-24 border border-slate-300 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            /convidado
          </label>
          <label className="text-xs text-slate-600 flex items-center gap-1">
            até R$
            <input
              type="number"
              value={max ?? ''}
              onChange={(e) => onChange({ ...value, max: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="∞ (sem teto)"
              className="no-spin w-32 border border-slate-300 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            /convidado
          </label>
        </div>
        <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          Pergunta gerada para a IA: "Valor por convidado entre {min != null ? `R$ ${min.toLocaleString('pt-BR')}` : '0'} e {max != null ? `R$ ${max.toLocaleString('pt-BR')}` : '∞'}?"
        </p>
      </div>
    )
  }
  if (type === 'ai_subjective' && hasFormula(value) && (value.formula === 'budget_below' || value.formula === 'budget_above')) {
    const cmp = value.formula === 'budget_below' ? 'abaixo de' : 'acima de'
    const numVal = value.value ?? value.min ?? value.max ?? null
    return (
      <div className="space-y-2">
        <label className="text-xs text-slate-600 flex items-center gap-2">
          Orçamento total {cmp} R$
          <input
            type="number"
            value={numVal ?? ''}
            onChange={(e) => onChange({ formula: value.formula, value: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="—"
            className="no-spin w-32 border border-slate-300 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          Comparação ESTRITA: {value.formula === 'budget_below' ? `< R$ ${(numVal ?? 0).toLocaleString('pt-BR')}` : `> R$ ${(numVal ?? 0).toLocaleString('pt-BR')}`}.
          Igual ao valor não conta.
        </p>
      </div>
    )
  }
  if (type === 'ai_subjective') {
    return (
      <textarea
        value={value?.question ?? ''}
        onChange={(e) => onChange({ question: e.target.value })}
        placeholder='ex: "O casal mencionou que quer casar no Caribe?"'
        rows={3}
        className={cn(
          'w-full border rounded px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 resize-y',
          hasError
            ? 'border-red-400 ring-1 ring-red-200 focus:ring-red-500'
            : 'border-slate-300 focus:ring-indigo-500',
        )}
      />
    )
  }
  // Tipos legados (equals, range, boolean_true) caem no editor genérico de
  // pergunta da IA. Toda regra nova deve ser ai_subjective. Se uma regra
  // antiga ainda for desses tipos, mostramos um aviso pra reconfigurá-la.
  return (
    <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
      Esse critério usa um tipo de avaliação antigo ({type}). Apague e crie
      um novo critério — todos os critérios agora usam avaliação por IA
      (uma pergunta que ela responde sim/não com base na conversa).
    </div>
  )
}

// ============================================================================
// Simulator — testa inputs hipoteticos e mostra o score calculado
// ============================================================================

function SimulatorSection({
  threshold,
  maxBonus,
  rules,
}: {
  threshold: number
  maxBonus: number
  rules: ScoringRule[]
}) {
  // Estado: conjunto de IDs de regras "ativadas" pelo admin (como se a IA
  // tivesse respondido YES). Pra grupos exclusivos, só uma regra fica ativa.
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())

  const buckets = useMemo(() => {
    const active = rules.filter((r) => r.ativa)
    const disqualify = active.filter((r) => r.rule_type === 'disqualify')
    const bonus = active.filter((r) => r.rule_type === 'bonus')
    const qualify = active.filter((r) => r.rule_type === 'qualify')

    const groupMap = new Map<string, ScoringRule[]>()
    const standalone: ScoringRule[] = []
    for (const r of qualify) {
      if (r.exclusion_group) {
        if (!groupMap.has(r.exclusion_group)) groupMap.set(r.exclusion_group, [])
        groupMap.get(r.exclusion_group)!.push(r)
      } else {
        standalone.push(r)
      }
    }
    const exclusionGroups = Array.from(groupMap.entries())
      .map(([name, gRules]) => ({ name, rules: gRules.sort((a, b) => Number(b.weight) - Number(a.weight)) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return { disqualify, exclusionGroups, individual: standalone, bonus }
  }, [rules])

  // Cálculo local — replica a lógica da RPC pra ai_subjective
  const result = useMemo(() => {
    const breakdown: { label: string; weight: number; ruleType: string }[] = []
    const disqualifiersHit: string[] = []

    // 1. Disqualify
    for (const r of buckets.disqualify) {
      if (activeIds.has(r.id)) {
        disqualifiersHit.push(r.label || r.dimension)
      }
    }
    if (disqualifiersHit.length > 0) {
      return { score: 0, qualificado: false, disqualified: true, disqualifiersHit, breakdown: [], bonusApplied: 0 }
    }

    // 2. Qualify (inclui grupos exclusivos)
    let score = 0
    for (const g of buckets.exclusionGroups) {
      const activeInGroup = g.rules.filter((r) => activeIds.has(r.id))
      // Em grupo exclusivo, só conta a primeira ativa (UI não deixa marcar 2)
      if (activeInGroup.length > 0) {
        const r = activeInGroup[0]
        score += Number(r.weight)
        breakdown.push({ label: r.label || r.dimension, weight: Number(r.weight), ruleType: 'qualify' })
      }
    }
    for (const r of buckets.individual) {
      if (activeIds.has(r.id)) {
        score += Number(r.weight)
        breakdown.push({ label: r.label || r.dimension, weight: Number(r.weight), ruleType: 'qualify' })
      }
    }

    // 3. Bonus (com cap)
    let bonusRaw = 0
    const bonusBreakdown: { label: string; weight: number; ruleType: string }[] = []
    for (const r of buckets.bonus) {
      if (activeIds.has(r.id)) {
        bonusRaw += Number(r.weight)
        bonusBreakdown.push({ label: r.label || r.dimension, weight: Number(r.weight), ruleType: 'bonus' })
      }
    }
    const bonusApplied = Math.min(bonusRaw, maxBonus)
    score += bonusApplied
    breakdown.push(...bonusBreakdown)

    return {
      score,
      qualificado: score >= threshold,
      disqualified: false,
      disqualifiersHit: [],
      breakdown,
      bonusApplied,
      bonusRaw,
    }
  }, [activeIds, buckets, threshold, maxBonus])

  const toggleRule = (ruleId: string) => {
    const next = new Set(activeIds)
    if (next.has(ruleId)) next.delete(ruleId)
    else next.add(ruleId)
    setActiveIds(next)
  }

  const selectInGroup = (groupRules: ScoringRule[], ruleId: string | null) => {
    const next = new Set(activeIds)
    for (const r of groupRules) next.delete(r.id)
    if (ruleId) next.add(ruleId)
    setActiveIds(next)
  }

  const reset = () => setActiveIds(new Set())

  if (buckets.disqualify.length === 0 && buckets.exclusionGroups.length === 0 && buckets.individual.length === 0 && buckets.bonus.length === 0) {
    return null
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Play className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-semibold text-slate-900 tracking-tight">Simulador</h3>
          </div>
          {activeIds.size > 0 && (
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 h-8 text-xs">
              <Undo2 className="w-3.5 h-3.5" />
              Limpar
            </Button>
          )}
        </div>
        <p className="text-sm text-slate-600">
          Marque os critérios que um casal hipotético atenderia e veja o score. É como se a IA respondesse "sim" pras perguntas marcadas.
        </p>
      </div>

      {/* Barra de resultado sticky no topo do simulador — sempre visível */}
      <div className="sticky top-0 z-20 border-y border-slate-200 backdrop-blur-md bg-white/95">
        <SimResultBar result={result} threshold={threshold} maxBonus={maxBonus} />
      </div>

      {/* Critérios em 2 colunas */}
      <div className="px-6 py-5">
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-5">
          {/* Alertas vermelhos */}
          {buckets.disqualify.length > 0 && (
            <SimSection title="Alertas vermelhos" subtitle="Qualquer um marcado desqualifica direto." icon={<ShieldAlert className="w-4 h-4 text-red-600" />}>
              {buckets.disqualify.map((r) => (
                <SimCheckbox key={r.id} checked={activeIds.has(r.id)} onChange={() => toggleRule(r.id)} label={r.label || r.dimension} accent="red" />
              ))}
            </SimSection>
          )}

          {/* Grupos exclusivos */}
          {buckets.exclusionGroups.map((g) => {
            const activeInGroup = g.rules.find((r) => activeIds.has(r.id))
            return (
              <SimSection
                key={g.name}
                title={g.name.replace(/_/g, ' ')}
                subtitle="Escolha uma opção (ou nenhuma)."
                icon={<Target className="w-4 h-4 text-indigo-600" />}
                capitalizeTitle
              >
                <SimRadio
                  checked={!activeInGroup}
                  onChange={() => selectInGroup(g.rules, null)}
                  label="Nenhuma"
                  weight={null}
                  muted
                />
                {g.rules.map((r) => (
                  <SimRadio
                    key={r.id}
                    checked={activeIds.has(r.id)}
                    onChange={() => selectInGroup(g.rules, r.id)}
                    label={r.label || r.dimension}
                    weight={Number(r.weight)}
                  />
                ))}
              </SimSection>
            )
          })}

          {/* Sinais individuais */}
          {buckets.individual.length > 0 && (
            <SimSection title="Sinais individuais" subtitle="Marque todos que se aplicam." icon={<TrendingUp className="w-4 h-4 text-indigo-600" />}>
              {buckets.individual.map((r) => (
                <SimCheckbox
                  key={r.id}
                  checked={activeIds.has(r.id)}
                  onChange={() => toggleRule(r.id)}
                  label={r.label || r.dimension}
                  weight={Number(r.weight)}
                />
              ))}
            </SimSection>
          )}

          {/* Bônus */}
          {buckets.bonus.length > 0 && (
            <SimSection title="Bônus" subtitle={`Cap de ${maxBonus} pontos no total.`} icon={<Sparkles className="w-4 h-4 text-emerald-600" />}>
              {buckets.bonus.map((r) => (
                <SimCheckbox
                  key={r.id}
                  checked={activeIds.has(r.id)}
                  onChange={() => toggleRule(r.id)}
                  label={r.label || r.dimension}
                  weight={Number(r.weight)}
                  accent="emerald"
                />
              ))}
            </SimSection>
          )}
        </div>
      </div>
    </section>
  )
}

// Barra de resultado horizontal compacta — sticky no topo do simulador.
// Sempre visível enquanto o usuário rola dentro da seção.
function SimResultBar({
  result,
  threshold,
  maxBonus,
}: {
  result: {
    score: number
    qualificado: boolean
    disqualified: boolean
    disqualifiersHit: string[]
    breakdown: { label: string; weight: number; ruleType: string }[]
    bonusApplied: number
    bonusRaw?: number
  }
  threshold: number
  maxBonus: number
}) {
  const [expanded, setExpanded] = useState(false)
  const progress = Math.min(100, (result.score / Math.max(threshold, 1)) * 100)

  if (result.disqualified) {
    return (
      <div className="px-6 py-3 bg-red-50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span className="text-sm font-bold uppercase tracking-wider text-red-900">Desqualificado</span>
            </div>
            <span className="text-sm text-red-700 truncate">
              {result.disqualifiersHit.join(' · ')}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('transition-colors', result.qualificado ? 'bg-emerald-50' : 'bg-slate-50')}>
      <div className="px-6 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Score */}
          <div className="flex items-baseline gap-2 flex-shrink-0">
            <span className="text-3xl font-bold tracking-tight text-slate-900 leading-none">{result.score}</span>
            <span className="text-xs text-slate-500">/ {threshold} pra qualificar</span>
          </div>

          {/* Barra de progresso */}
          <div className="flex-1 min-w-[120px] max-w-md">
            <div className="w-full bg-white rounded-full h-2 overflow-hidden border border-slate-200">
              <div
                className={cn('h-full transition-all', result.qualificado ? 'bg-emerald-500' : 'bg-indigo-400')}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Status */}
          <span className={cn(
            'text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex-shrink-0',
            result.qualificado ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-700',
          )}>
            {result.qualificado ? 'qualifica' : 'não qualifica'}
          </span>

          {/* Toggle detalhes */}
          {result.breakdown.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="h-8 text-xs gap-1.5 flex-shrink-0"
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {result.breakdown.length} {result.breakdown.length === 1 ? 'critério' : 'critérios'}
            </Button>
          )}
        </div>

        {/* Detalhamento expandido */}
        {expanded && result.breakdown.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 grid sm:grid-cols-2 gap-1.5">
            {result.breakdown.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded px-2 py-1">
                <span className="text-slate-700 truncate pr-2">{b.label}</span>
                <span className={cn('font-semibold flex-shrink-0', b.ruleType === 'bonus' ? 'text-emerald-700' : 'text-indigo-700')}>
                  +{b.weight}
                </span>
              </div>
            ))}
            {result.bonusRaw !== undefined && result.bonusRaw > maxBonus && (
              <p className="text-[11px] text-slate-500 italic sm:col-span-2 mt-1">
                Bônus bruto: {result.bonusRaw} → aplicado {result.bonusApplied} (cap {maxBonus})
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SimSection({
  title,
  subtitle,
  icon,
  children,
  capitalizeTitle,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  children: React.ReactNode
  capitalizeTitle?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className={cn('text-sm font-semibold text-slate-900', capitalizeTitle && 'capitalize')}>{title}</h4>
      </div>
      <p className="text-xs text-slate-500 mb-2">{subtitle}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function SimCheckbox({
  checked,
  onChange,
  label,
  weight,
  accent = 'indigo',
}: {
  checked: boolean
  onChange: () => void
  label: string
  weight?: number
  accent?: 'indigo' | 'emerald' | 'red'
}) {
  const accentColor = {
    indigo: 'text-indigo-700',
    emerald: 'text-emerald-700',
    red: 'text-red-700',
  }[accent]
  return (
    <label className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition', checked ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
      />
      <span className="flex-1 text-sm text-slate-800">{label}</span>
      {weight !== undefined && (
        <span className={cn('text-sm font-semibold', accentColor)}>{weight >= 0 ? `+${weight}` : weight}</span>
      )}
    </label>
  )
}

function SimRadio({
  checked,
  onChange,
  label,
  weight,
  muted,
}: {
  checked: boolean
  onChange: () => void
  label: string
  weight: number | null
  muted?: boolean
}) {
  return (
    <label className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition', checked ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 border-slate-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
      />
      <span className={cn('flex-1 text-sm', muted ? 'text-slate-500 italic' : 'text-slate-800')}>{label}</span>
      {weight !== null && (
        <span className="text-sm font-semibold text-indigo-700">+{weight}</span>
      )}
    </label>
  )
}

