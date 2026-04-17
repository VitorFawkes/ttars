import { useState, useEffect } from 'react'
import { Lightbulb, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { SpecialScenarioInput, ScenarioTriggerType } from '@/hooks/useAgentSpecialScenarios'

const TRIGGER_OPTIONS: Array<{ value: ScenarioTriggerType; label: string }> = [
  { value: 'keyword', label: 'Palavras-chave na mensagem' },
  { value: 'tag', label: 'Tag aplicada ao card' },
  { value: 'field_value', label: 'Valor de campo' },
  { value: 'intent', label: 'Intenção detectada' },
  { value: 'custom', label: 'Customizado (JSON livre)' },
]

export interface SpecialScenariosEditorProps {
  value: SpecialScenarioInput[]
  onChange: (next: SpecialScenarioInput[]) => void
}

function emptyScenario(): SpecialScenarioInput {
  return {
    scenario_name: '',
    trigger_type: 'keyword',
    trigger_config: { keywords: [] },
    response_adjustment: '',
    simplified_qualification: null,
    skip_fee_presentation: false,
    skip_meeting_scheduling: false,
    auto_assign_tag: null,
    handoff_message: null,
    target_agent_id: null,
    enabled: true,
    priority: 0,
  }
}

export function SpecialScenariosEditor({ value, onChange }: SpecialScenariosEditorProps) {
  const [local, setLocal] = useState<SpecialScenarioInput[]>(value)
  useEffect(() => { setLocal(value) }, [value])

  const commit = (next: SpecialScenarioInput[]) => {
    setLocal(next)
    onChange(next)
  }

  const update = (idx: number, patch: Partial<SpecialScenarioInput>) => {
    commit(local.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const remove = (idx: number) => commit(local.filter((_, i) => i !== idx))

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= local.length) return
    const next = [...local]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    // Higher priority first (descending)
    commit(next.map((s, i) => ({ ...s, priority: (next.length - i) * 10 })))
  }

  const add = () => commit([...local, { ...emptyScenario(), priority: (local.length + 1) * 10 }])

  return (
    <div className="space-y-3">
      {local.length === 0 && (
        <div className="text-center py-8 border border-dashed border-slate-300 rounded-lg">
          <p className="text-sm text-slate-500">Nenhum cenário cadastrado.</p>
          <Button variant="outline" size="sm" onClick={add} className="mt-3 gap-2">
            <Plus className="w-4 h-4" /> Adicionar primeiro cenário
          </Button>
        </div>
      )}

      {local.map((scenario, idx) => (
        <div
          key={idx}
          className={cn(
            'border rounded-lg p-4 space-y-3',
            scenario.enabled ? 'border-purple-200 bg-purple-50/30' : 'border-slate-200 bg-slate-50/30 opacity-80'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex flex-col">
                <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === local.length - 1} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <Switch checked={scenario.enabled} onCheckedChange={v => update(idx, { enabled: v })} />
              <Input
                value={scenario.scenario_name}
                onChange={e => update(idx, { scenario_name: e.target.value })}
                placeholder="Nome do cenário (ex: Club Med)"
                className="font-medium"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove(idx)} className="text-red-500 hover:bg-red-50 h-8 w-8 p-0 flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Tipo de gatilho</Label>
              <Select
                value={scenario.trigger_type}
                onChange={(v: string) => update(idx, { trigger_type: v as ScenarioTriggerType })}
                options={TRIGGER_OPTIONS}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Prioridade (maior = verificado primeiro)</Label>
              <Input
                type="number"
                value={scenario.priority}
                onChange={e => update(idx, { priority: Number(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">
              Configuração do gatilho
              {scenario.trigger_type === 'keyword' && ' (palavras separadas por vírgula)'}
              {scenario.trigger_type === 'tag' && ' (nome da tag)'}
              {scenario.trigger_type !== 'keyword' && scenario.trigger_type !== 'tag' && ' (JSON)'}
            </Label>
            {scenario.trigger_type === 'keyword' ? (
              <Input
                value={((scenario.trigger_config.keywords as string[]) ?? []).join(', ')}
                onChange={e => {
                  const kws = e.target.value.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
                  update(idx, { trigger_config: { keywords: kws } })
                }}
                placeholder="club med, clubmed"
              />
            ) : scenario.trigger_type === 'tag' ? (
              <Input
                value={(scenario.trigger_config.tag_name as string) ?? ''}
                onChange={e => update(idx, { trigger_config: { tag_name: e.target.value } })}
                placeholder="vip"
              />
            ) : (
              <Textarea
                rows={3}
                value={JSON.stringify(scenario.trigger_config ?? {}, null, 2)}
                onChange={e => {
                  try { update(idx, { trigger_config: JSON.parse(e.target.value || '{}') }) } catch { /* ignora até JSON válido */ }
                }}
                className="font-mono text-xs"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Ajuste de resposta (instruções extras injetadas no prompt)</Label>
            <Textarea
              rows={3}
              value={scenario.response_adjustment ?? ''}
              onChange={e => update(idx, { response_adjustment: e.target.value || null })}
              placeholder="Ex: Para leads de Club Med, seguir fluxo simplificado de 3 perguntas..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Switch
                checked={scenario.skip_fee_presentation}
                onCheckedChange={v => update(idx, { skip_fee_presentation: v })}
              />
              Pular apresentação de taxa
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Switch
                checked={scenario.skip_meeting_scheduling}
                onCheckedChange={v => update(idx, { skip_meeting_scheduling: v })}
              />
              Pular agendamento
            </label>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Tag automática</Label>
              <Input
                value={scenario.auto_assign_tag ?? ''}
                onChange={e => update(idx, { auto_assign_tag: e.target.value || null })}
                placeholder="Club Med"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Mensagem de handoff (opcional)</Label>
            <Textarea
              rows={2}
              value={scenario.handoff_message ?? ''}
              onChange={e => update(idx, { handoff_message: e.target.value || null })}
              placeholder="Mensagem que o agente envia ao encerrar o cenário (ex: 'Um Planner especializado entrará em contato...')."
            />
          </div>

          <details className="border-t border-slate-100 pt-2">
            <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-900">
              Funil simplificado (opcional) — substitui o funil principal quando este cenário ativa
            </summary>
            <div className="mt-2 space-y-1.5">
              <Textarea
                rows={3}
                value={JSON.stringify(scenario.simplified_qualification ?? [], null, 2)}
                onChange={e => {
                  try {
                    const parsed = JSON.parse(e.target.value || '[]')
                    update(idx, { simplified_qualification: Array.isArray(parsed) && parsed.length > 0 ? parsed : null })
                  } catch { /* ignora */ }
                }}
                className="font-mono text-xs"
                placeholder={'[\n  { "question": "Qual resort?", "stage_key": "resort" }\n]'}
              />
            </div>
          </details>
        </div>
      ))}

      {local.length > 0 && (
        <Button variant="outline" onClick={add} className="gap-2 w-full">
          <Plus className="w-4 h-4" /> Adicionar cenário
        </Button>
      )}
    </div>
  )
}

export function SpecialScenariosSection(props: SpecialScenariosEditorProps) {
  const enabled = props.value.filter(s => s.enabled).length
  const total = props.value.length
  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
      <header className="flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-purple-500" />
        <div>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Cenários especiais</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {total > 0
              ? `${enabled} de ${total} cenários ativos. Cada um muda o comportamento do agente quando o gatilho bate.`
              : 'Ex: Club Med dispara funil de 3 perguntas, não pede taxa, não agenda reunião.'}
          </p>
        </div>
      </header>

      <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
        <p className="text-xs text-purple-900">
          <strong>Ordem de verificação:</strong> cenários com prioridade maior são testados primeiro. Se um gatilho bate, o agente aplica os ajustes daquele cenário (ignora os de prioridade menor).
        </p>
      </div>

      <SpecialScenariosEditor {...props} />
    </section>
  )
}
