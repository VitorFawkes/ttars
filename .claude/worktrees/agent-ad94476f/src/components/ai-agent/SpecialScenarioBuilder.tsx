import { useState } from 'react'
import { Plus, Trash2, Zap, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { SpecialScenario } from '@/hooks/useAgentWizard'

interface SpecialScenarioBuilderProps {
  scenarios: SpecialScenario[]
  onChange: (scenarios: SpecialScenario[]) => void
  readOnly?: boolean
}

const TRIGGER_TYPES: Array<{ value: string; label: string; placeholder: string }> = [
  { value: 'keyword', label: 'Palavra-chave', placeholder: 'Ex: Club Med, clubmed' },
  { value: 'tag', label: 'Tag do lead', placeholder: 'Ex: vip' },
  { value: 'field_value', label: 'Valor de campo', placeholder: 'Ex: produto=club_med' },
  { value: 'intent', label: 'Intenção detectada', placeholder: 'Ex: booking_request' },
]

const EMPTY_SCENARIO: SpecialScenario = {
  scenario_name: '',
  trigger_type: 'keyword',
  trigger_config: {},
  response_adjustment: '',
  skip_fee_presentation: false,
  skip_meeting_scheduling: false,
  auto_assign_tag: '',
  handoff_message: '',
}

function formatTriggerDisplay(s: SpecialScenario): string {
  const cfg = s.trigger_config as Record<string, unknown>
  if (s.trigger_type === 'keyword') return (cfg.keywords as string) || '—'
  if (s.trigger_type === 'tag') return (cfg.tag as string) || '—'
  if (s.trigger_type === 'field_value') return (cfg.expression as string) || '—'
  if (s.trigger_type === 'intent') return (cfg.intent as string) || '—'
  return '—'
}

export function SpecialScenarioBuilder({ scenarios, onChange, readOnly = false }: SpecialScenarioBuilderProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(
    scenarios.length > 0 && !scenarios[0].scenario_name ? 0 : null
  )

  const updateScenario = (idx: number, updates: Partial<SpecialScenario>) => {
    const next = [...scenarios]
    next[idx] = { ...next[idx], ...updates }
    onChange(next)
  }

  const updateTriggerConfig = (idx: number, patch: Record<string, unknown>) => {
    const next = [...scenarios]
    next[idx] = { ...next[idx], trigger_config: { ...next[idx].trigger_config, ...patch } }
    onChange(next)
  }

  const addScenario = () => {
    const next = [...scenarios, { ...EMPTY_SCENARIO }]
    onChange(next)
    setExpandedIdx(next.length - 1)
  }

  const deleteScenario = (idx: number) => {
    onChange(scenarios.filter((_, i) => i !== idx))
    if (expandedIdx === idx) setExpandedIdx(null)
  }

  if (scenarios.length === 0) {
    return (
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
        <Zap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-600 font-medium">Nenhum cenário especial</p>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Cenários especiais permitem ao agente se comportar de forma diferente em situações específicas
          (ex: Club Med pula a taxa e agendamento). Opcional.
        </p>
        {!readOnly && (
          <Button onClick={addScenario} variant="outline" size="sm" className="mt-4 gap-2">
            <Plus className="w-4 h-4" />
            Criar cenário
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {scenarios.map((scenario, idx) => {
        const expanded = expandedIdx === idx
        const triggerLabel = TRIGGER_TYPES.find((t) => t.value === scenario.trigger_type)?.label ?? scenario.trigger_type
        return (
          <div
            key={idx}
            className={cn(
              'bg-white border rounded-xl transition-shadow',
              expanded ? 'border-indigo-300 shadow-sm' : 'border-slate-200 hover:border-slate-300'
            )}
          >
            {/* Header */}
            <div className="flex items-stretch">
              <div className="flex items-center justify-center px-3 border-r border-slate-100">
                <Zap className={cn('w-4 h-4', expanded ? 'text-indigo-600' : 'text-slate-400')} />
              </div>
              <button
                onClick={() => setExpandedIdx(expanded ? null : idx)}
                className="flex-1 flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 min-w-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 truncate">
                      {scenario.scenario_name || <span className="italic text-slate-400">Sem nome</span>}
                    </p>
                    <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200">
                      {triggerLabel}: {formatTriggerDisplay(scenario)}
                    </Badge>
                    {scenario.skip_fee_presentation && (
                      <Badge variant="outline" className="text-[11px] bg-green-50 text-green-700 border-green-200">
                        sem taxa
                      </Badge>
                    )}
                    {scenario.skip_meeting_scheduling && (
                      <Badge variant="outline" className="text-[11px] bg-green-50 text-green-700 border-green-200">
                        sem reunião
                      </Badge>
                    )}
                  </div>
                  {scenario.response_adjustment && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{scenario.response_adjustment}</p>
                  )}
                </div>
                {expanded
                  ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                }
              </button>
              {!readOnly && (
                <div className="flex items-center px-2">
                  <button
                    onClick={() => deleteScenario(idx)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    aria-label="Excluir cenário"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Body */}
            {expanded && !readOnly && (
              <div className="border-t border-slate-100 p-4 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome do cenário</Label>
                  <Input
                    placeholder="Ex: Atendimento Club Med, Cliente VIP..."
                    value={scenario.scenario_name}
                    onChange={(e) => updateScenario(idx, { scenario_name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Quando ativar</Label>
                    <select
                      value={scenario.trigger_type}
                      onChange={(e) => updateScenario(idx, { trigger_type: e.target.value, trigger_config: {} })}
                      className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {TRIGGER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor</Label>
                    {scenario.trigger_type === 'keyword' && (
                      <Input
                        placeholder="Ex: Club Med, clubmed"
                        value={(scenario.trigger_config.keywords as string) || ''}
                        onChange={(e) => updateTriggerConfig(idx, { keywords: e.target.value })}
                      />
                    )}
                    {scenario.trigger_type === 'tag' && (
                      <Input
                        placeholder="Ex: vip"
                        value={(scenario.trigger_config.tag as string) || ''}
                        onChange={(e) => updateTriggerConfig(idx, { tag: e.target.value })}
                      />
                    )}
                    {scenario.trigger_type === 'field_value' && (
                      <Input
                        placeholder="Ex: produto=club_med"
                        value={(scenario.trigger_config.expression as string) || ''}
                        onChange={(e) => updateTriggerConfig(idx, { expression: e.target.value })}
                      />
                    )}
                    {scenario.trigger_type === 'intent' && (
                      <Input
                        placeholder="Ex: booking_request"
                        value={(scenario.trigger_config.intent as string) || ''}
                        onChange={(e) => updateTriggerConfig(idx, { intent: e.target.value })}
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Ajuste de comportamento</Label>
                  <Textarea
                    placeholder="Ex: Um planner especializado em Club Med vai entrar em contato. Coletar: resort, datas, número de pessoas. Não mencionar taxa."
                    value={scenario.response_adjustment}
                    onChange={(e) => updateScenario(idx, { response_adjustment: e.target.value })}
                    className="min-h-[80px]"
                  />
                  <p className="text-[11px] text-slate-400">Instruções claras em português. O agente vai seguir literalmente.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                    <Switch
                      checked={scenario.skip_fee_presentation}
                      onCheckedChange={(v) => updateScenario(idx, { skip_fee_presentation: v })}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">Não apresentar taxa</p>
                      <p className="text-[11px] text-slate-500">Pula o passo de cobrar planejamento</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                    <Switch
                      checked={scenario.skip_meeting_scheduling}
                      onCheckedChange={(v) => updateScenario(idx, { skip_meeting_scheduling: v })}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">Não agendar reunião</p>
                      <p className="text-[11px] text-slate-500">Handoff direto sem passar por reunião</p>
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tag automática (opcional)</Label>
                    <Input
                      placeholder="Ex: Club Med"
                      value={scenario.auto_assign_tag}
                      onChange={(e) => updateScenario(idx, { auto_assign_tag: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mensagem de handoff (opcional)</Label>
                    <Input
                      placeholder="Ex: Um planner vai entrar em contato!"
                      value={scenario.handoff_message}
                      onChange={(e) => updateScenario(idx, { handoff_message: e.target.value })}
                    />
                  </div>
                </div>

                {!scenario.scenario_name && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Dê um nome claro ao cenário para identificá-lo depois.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {!readOnly && (
        <button
          onClick={addScenario}
          className="w-full bg-white border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/30 hover:text-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo cenário
        </button>
      )}
    </div>
  )
}
