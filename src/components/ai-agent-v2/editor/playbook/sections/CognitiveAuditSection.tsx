import { useEffect, useState } from 'react'
import { Loader2, Save, Brain, ChevronDown, ChevronRight, X, Plus, Calculator } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useAgentCognitiveAudit,
  ROUTINE_DEFAULTS,
  type CognitiveAuditConfig,
  type PitchSaturationRoutine,
  type ViabilityRoutine,
  type SimpleRoutine,
} from '@/hooks/v2/playbook/useAgentCognitiveAudit'
import { VariableTextarea } from '../../shared/VariableTextarea'

interface Props {
  agentId: string
  produto?: string | null
}

type RoutineKey = keyof CognitiveAuditConfig

const ROUTINE_KEYS: RoutineKey[] = [
  'detect_contradictions',
  'detect_pending_promises',
  'detect_unanswered_questions',
  'detect_pitch_saturation',
  'audit_viability',
]

/**
 * Editor estruturado do "cérebro analítico" do agente. Cada uma das 5
 * sub-rotinas vira um card expansível com toggle + instrução (com suporte
 * a variáveis). 2 das 5 (saturação de pitch e auditoria de viabilidade)
 * têm sub-form de parâmetros avançados.
 *
 * Substitui o textão de 8.500 chars que vivia em prompts_extra.context
 * pela aba "Prompts" do layout antigo. Quando o admin não configura nada
 * aqui, o router faz fallback pro texto legado em prompts_extra.context.
 */
export function CognitiveAuditSection({ agentId, produto }: Props) {
  const { config, isLoading, save } = useAgentCognitiveAudit(agentId)
  const [local, setLocal] = useState<CognitiveAuditConfig>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [dirty, setDirty] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLocal(config ?? {})
    setDirty(false)
  }, [config])
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateRoutine = <K extends RoutineKey>(
    key: K,
    patch: Partial<NonNullable<CognitiveAuditConfig[K]>>,
  ) => {
    setLocal((prev) => {
      const existing = (prev[key] ?? {}) as Record<string, unknown>
      return { ...prev, [key]: { ...existing, ...patch } } as CognitiveAuditConfig
    })
    setDirty(true)
  }

  const toggleEnabled = (key: RoutineKey) => {
    const cur = (local[key] ?? { enabled: false, instruction: '' }) as SimpleRoutine
    updateRoutine(key, { enabled: !cur.enabled } as Partial<NonNullable<CognitiveAuditConfig[typeof key]>>)
  }

  const handleSave = async () => {
    try {
      await save.mutateAsync(local)
      toast.success('Cérebro analítico salvo')
      setDirty(false)
    } catch (err) {
      console.error('[CognitiveAuditSection] save error:', err)
      toast.error('Não consegui salvar.')
    }
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin inline" />
      </div>
    )
  }

  const enabledCount = ROUTINE_KEYS.filter((k) => local[k]?.enabled === true).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
          <Brain className="w-4 h-4 text-amber-600" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Cérebro analítico</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            O que o agente <strong>roda mentalmente a cada turno</strong> pra parecer consciente:
            detecta contradições, lembra promessas, calcula viabilidade, evita repetir pitch.
            {' '}<span className="text-slate-400">· {enabledCount} de {ROUTINE_KEYS.length} ativos</span>
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {ROUTINE_KEYS.map((key) => {
          const def = ROUTINE_DEFAULTS[key]
          const routine = (local[key] ?? { enabled: false, instruction: '' }) as SimpleRoutine
          const isOpen = expanded[key] ?? false
          const enabled = routine.enabled

          return (
            <li
              key={key}
              className={cn(
                'rounded-lg border bg-white transition-colors',
                enabled ? 'border-amber-200' : 'border-slate-200',
              )}
            >
              {/* Header colapsável */}
              <div className="flex items-center gap-2 p-2.5">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleEnabled(key)}
                  className="flex-shrink-0 cursor-pointer"
                  title={enabled ? 'Desativar' : 'Ativar'}
                />
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [key]: !s[key] }))}
                  className="flex-1 text-left min-w-0"
                >
                  <div className={cn('text-sm', enabled ? 'text-slate-900 font-medium' : 'text-slate-500')}>
                    {def.label}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {def.description}
                  </div>
                </button>
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [key]: !s[key] }))}
                  className="text-slate-400 hover:text-slate-700 flex-shrink-0"
                >
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>

              {/* Body expandido */}
              {isOpen && (
                <div className="border-t border-slate-100 p-3 space-y-3 bg-slate-50/30">
                  <div>
                    <label className="block text-[11px] text-slate-600 font-medium mb-1">
                      Instrução customizada (opcional — vazio usa o padrão)
                    </label>
                    <VariableTextarea
                      value={routine.instruction ?? ''}
                      onChange={(text) => updateRoutine(key, { instruction: text } as Partial<NonNullable<CognitiveAuditConfig[typeof key]>>)}
                      produto={produto}
                      rows={3}
                      placeholder={def.defaultInstruction}
                    />
                  </div>

                  {/* Sub-form: saturação de pitch */}
                  {key === 'detect_pitch_saturation' && (
                    <PitchSaturationSubForm
                      routine={(local.detect_pitch_saturation ?? {}) as PitchSaturationRoutine}
                      onChange={(patch) => updateRoutine('detect_pitch_saturation', patch as Partial<PitchSaturationRoutine>)}
                    />
                  )}

                  {/* Sub-form: auditoria de viabilidade */}
                  {key === 'audit_viability' && (
                    <ViabilitySubForm
                      routine={(local.audit_viability ?? {}) as ViabilityRoutine}
                      onChange={(patch) => updateRoutine('audit_viability', patch as Partial<ViabilityRoutine>)}
                    />
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        {dirty && <span className="text-xs text-amber-600 self-center mr-3">• alterações não salvas</span>}
        <Button onClick={handleSave} disabled={!dirty || save.isPending} size="sm" className="gap-1.5">
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
        </Button>
      </div>
    </div>
  )
}

// ── Sub-forms ─────────────────────────────────────────────────────────

function PitchSaturationSubForm({
  routine,
  onChange,
}: {
  routine: PitchSaturationRoutine
  onChange: (patch: Partial<PitchSaturationRoutine>) => void
}) {
  const [newKeyword, setNewKeyword] = useState('')
  const keywords = routine.pitch_keywords ?? []

  return (
    <div className="space-y-3 pt-2 border-t border-slate-200">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        Configuração avançada
      </div>

      <div>
        <label className="block text-[11px] text-slate-600 font-medium mb-1">
          Frases que contam como "pitch"
        </label>
        <div className="flex flex-wrap gap-1 mb-1">
          {keywords.length === 0 && (
            <span className="text-[11px] text-slate-400 italic">(nenhuma — adicione abaixo)</span>
          )}
          {keywords.map((kw, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] text-slate-700"
            >
              {kw}
              <button
                type="button"
                onClick={() => onChange({ pitch_keywords: keywords.filter((_, idx) => idx !== i) })}
                className="text-slate-400 hover:text-rose-600"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newKeyword.trim()) {
                e.preventDefault()
                onChange({ pitch_keywords: [...keywords, newKeyword.trim()] })
                setNewKeyword('')
              }
            }}
            placeholder='Ex: "reunião com a Wedding Planner"'
            className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              if (!newKeyword.trim()) return
              onChange({ pitch_keywords: [...keywords, newKeyword.trim()] })
              setNewKeyword('')
            }}
            className="px-2 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-100"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-slate-600 font-medium mb-1">Janela (turnos)</label>
          <input
            type="number"
            min={1}
            max={20}
            value={routine.window_turns ?? 5}
            onChange={(e) => onChange({ window_turns: Math.max(1, Math.min(20, Number(e.target.value) || 5)) })}
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-600 font-medium mb-1">Threshold</label>
          <input
            type="number"
            min={1}
            max={10}
            value={routine.threshold ?? 2}
            onChange={(e) => onChange({ threshold: Math.max(1, Math.min(10, Number(e.target.value) || 2)) })}
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
        </div>
      </div>
    </div>
  )
}

function ViabilitySubForm({
  routine,
  onChange,
}: {
  routine: ViabilityRoutine
  onChange: (patch: Partial<ViabilityRoutine>) => void
}) {
  const zones = routine.zones ?? []
  const rates = routine.currency_rates ?? []

  return (
    <div className="space-y-3 pt-2 border-t border-slate-200">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        <Calculator className="w-3 h-3 inline mr-1" />
        Configuração avançada
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-slate-600 font-medium mb-1">Campo de orçamento</label>
          <input
            type="text"
            value={routine.budget_field ?? ''}
            onChange={(e) => onChange({ budget_field: e.target.value || undefined })}
            placeholder="ww_orcamento_faixa"
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-600 font-medium mb-1">Campo de convidados</label>
          <input
            type="text"
            value={routine.guests_field ?? ''}
            onChange={(e) => onChange({ guests_field: e.target.value || undefined })}
            placeholder="ww_num_convidados"
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono"
          />
        </div>
      </div>

      {/* Zonas */}
      <div>
        <label className="block text-[11px] text-slate-600 font-medium mb-1">
          Zonas (R$/convidado — ordem ascendente)
        </label>
        {zones.length === 0 && (
          <p className="text-[11px] text-slate-400 italic">(nenhuma zona — adicione abaixo)</p>
        )}
        <div className="space-y-1.5">
          {zones.map((z, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">até</span>
              <input
                type="number"
                value={z.max_per_guest_brl}
                onChange={(e) => {
                  const next = [...zones]
                  next[i] = { ...z, max_per_guest_brl: Number(e.target.value) || 0 }
                  onChange({ zones: next })
                }}
                className="w-20 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs"
              />
              <span className="text-[11px] text-slate-500">→</span>
              <input
                type="text"
                value={z.label}
                onChange={(e) => {
                  const next = [...zones]
                  next[i] = { ...z, label: e.target.value }
                  onChange({ zones: next })
                }}
                placeholder="label"
                className="w-32 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs font-mono"
              />
              <input
                type="text"
                value={z.action}
                onChange={(e) => {
                  const next = [...zones]
                  next[i] = { ...z, action: e.target.value }
                  onChange({ zones: next })
                }}
                placeholder="ação"
                className="flex-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs"
              />
              <button
                type="button"
                onClick={() => onChange({ zones: zones.filter((_, idx) => idx !== i) })}
                className="text-slate-300 hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              zones: [
                ...zones,
                { max_per_guest_brl: 0, label: '', action: '' },
              ],
            })
          }
          className="mt-1.5 text-[11px] text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-0.5"
        >
          <Plus className="w-3 h-3" /> Adicionar zona
        </button>
      </div>

      {/* Cotações */}
      <div>
        <label className="block text-[11px] text-slate-600 font-medium mb-1">
          Cotações pra conversão de moeda
        </label>
        {rates.length === 0 && (
          <p className="text-[11px] text-slate-400 italic">(nenhuma cotação)</p>
        )}
        <div className="space-y-1.5">
          {rates.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">1</span>
              <input
                type="text"
                value={r.from}
                onChange={(e) => {
                  const next = [...rates]
                  next[i] = { ...r, from: e.target.value }
                  onChange({ currency_rates: next })
                }}
                placeholder="EUR"
                className="w-16 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs font-mono"
              />
              <span className="text-[11px] text-slate-500">≈ R$</span>
              <input
                type="number"
                value={r.to_brl}
                step={0.1}
                onChange={(e) => {
                  const next = [...rates]
                  next[i] = { ...r, to_brl: Number(e.target.value) || 0 }
                  onChange({ currency_rates: next })
                }}
                className="w-20 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs"
              />
              <button
                type="button"
                onClick={() => onChange({ currency_rates: rates.filter((_, idx) => idx !== i) })}
                className="text-slate-300 hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              currency_rates: [...rates, { from: '', to_brl: 0 }],
            })
          }
          className="mt-1.5 text-[11px] text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-0.5"
        >
          <Plus className="w-3 h-3" /> Adicionar cotação
        </button>
      </div>
    </div>
  )
}
