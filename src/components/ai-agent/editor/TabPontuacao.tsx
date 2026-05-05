import { useState, useMemo } from 'react'
import { Loader2, Plus, Trash2, Save, Info, ChevronDown, ChevronRight, Target, Play, AlertCircle, ShieldAlert, TrendingUp, Sparkles, ArrowRight, Trophy } from 'lucide-react'
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
    await onSaveRule({
      dimension: generateDimensionKey(groupName),
      condition_type: 'ai_subjective',
      condition_value: { question: '' },
      weight: 10,
      label: 'Nova opção',
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
  const [label, setLabel] = useState(rule.label ?? '')
  const [weight, setWeight] = useState(rule.weight)
  const [ativa, setAtiva] = useState(rule.ativa)
  const [conditionValue, setConditionValue] = useState(rule.condition_value)
  const [showAdvanced, setShowAdvanced] = useState(false)

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
      rule_type: rule.rule_type ?? 'qualify',
      exclusion_group: rule.exclusion_group ?? null,
    })
  }

  const conditionLabel: Record<ConditionType, string> = {
    ai_subjective: 'Pergunta que a IA avalia (responde sim/não com base na conversa)',
    equals: 'Valor que precisa bater (texto exato)',
    range: 'Faixa numérica',
    boolean_true: 'Nome do campo booleano',
  }

  return (
    <div className={cn('border rounded-lg', ativa ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/50')}>
      {/* Linha principal: label + peso + toggle */}
      <div className="flex items-center gap-2 p-3">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Descreva esse critério..."
          className="flex-1 min-w-0 border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
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
        {dirty && (
          <Button size="sm" variant="ghost" onClick={handleSave} className="h-8 w-8 p-0" title="Salvar">
            <Save className="w-4 h-4 text-indigo-600" />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDelete} className="h-8 w-8 p-0" title="Deletar">
          <Trash2 className="w-4 h-4 text-red-500" />
        </Button>
      </div>

      {/* Detalhes expandidos: condição + chave técnica */}
      {showAdvanced && (
        <div className="border-t border-slate-200 px-3 py-3 space-y-3 bg-slate-50/30">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{conditionLabel[rule.condition_type]}</label>
            <ConditionEditor
              type={rule.condition_type}
              value={conditionValue}
              onChange={setConditionValue}
            />
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
  if (type === 'ai_subjective') {
    return (
      <textarea
        value={value?.question ?? ''}
        onChange={(e) => onChange({ question: e.target.value })}
        placeholder='ex: "O casal mencionou que quer casar no Caribe?"'
        rows={3}
        className="w-full border border-slate-300 rounded px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
      />
    )
  }
  if (type === 'equals') {
    return (
      <input
        type="text"
        value={value?.value ?? ''}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder="ex: Caribe"
        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    )
  }
  if (type === 'range') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value?.min ?? ''}
          onChange={(e) => onChange({ ...value, min: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="mínimo"
          className="no-spin flex-1 border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-slate-400 text-xs">até</span>
        <input
          type="number"
          value={value?.max ?? ''}
          onChange={(e) => onChange({ ...value, max: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="máximo"
          className="no-spin flex-1 border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
        className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
