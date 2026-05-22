import { useEffect, useState } from 'react'
import { Loader2, Save, Brain, ChevronDown, ChevronRight, X, Plus, Calculator } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useAgentCognitiveAudit,
  ROUTINE_DEFAULTS,
  type CognitiveAuditConfig,
  type ViabilityRoutine,
  type SimpleRoutine,
} from '@/hooks/v2/playbook/useAgentCognitiveAudit'

interface Props {
  agentId: string
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
 * Editor do "cérebro analítico" do agente — 5 auditorias que o agente
 * roda mentalmente a cada turno. Admin escolhe quais rodam (toggle ON/OFF)
 * + edita parâmetros estruturados da auditoria de viabilidade (zonas R$/conv +
 * cotações de moeda). Instruções textuais ficam no código (decisão de
 * prompt engineering, não de negócio).
 */
export function CognitiveAuditSection({ agentId }: Props) {
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

              {/* Body expandido — só audit_viability tem sub-form com params editáveis.
                  Outros toggles são ON/OFF puros (instrução fica no código). */}
              {isOpen && key === 'audit_viability' && (
                <div className="border-t border-slate-100 p-3 space-y-3 bg-slate-50/30">
                  <ViabilitySubForm
                    routine={(local.audit_viability ?? {}) as ViabilityRoutine}
                    onChange={(patch) => updateRoutine('audit_viability', patch as Partial<ViabilityRoutine>)}
                  />
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
