import { useState, useEffect } from 'react'
import { Lightbulb, Plus, Trash2, ChevronUp, ChevronDown, Sparkles, Tag, MoveRight, Bell } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { TagPicker, StagePicker } from './pickers'
import { FieldAwareTextarea } from './FieldAwareTextarea'
import type { SpecialScenarioInput } from '@/hooks/useAgentSpecialScenarios'

export interface SpecialScenariosEditorProps {
  value: SpecialScenarioInput[]
  onChange: (next: SpecialScenarioInput[]) => void
  /** Pipeline do agente — usado pelo StagePicker da transição automática */
  pipelineId?: string
  /** Slug do produto do agente — usado pelo TagPicker para filtrar tags */
  produto?: string
}

function emptyScenario(): SpecialScenarioInput {
  return {
    scenario_name: '',
    trigger_type: 'intent',
    trigger_config: {},
    trigger_description: null,
    response_adjustment: '',
    simplified_qualification: null,
    skip_fee_presentation: false,
    skip_meeting_scheduling: false,
    auto_assign_tag: null,
    auto_transition_stage_id: null,
    auto_notify_responsible: false,
    handoff_message: null,
    target_agent_id: null,
    enabled: true,
    priority: 0,
  }
}

export function SpecialScenariosEditor({ value, onChange, pipelineId, produto }: SpecialScenariosEditorProps) {
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

      {local.map((scenario, idx) => {
        const hasDescription = (scenario.trigger_description?.trim().length ?? 0) > 0

        return (
          <div
            key={idx}
            className={cn(
              'border rounded-lg p-4 space-y-4',
              scenario.enabled ? 'border-purple-200 bg-purple-50/30' : 'border-slate-200 bg-slate-50/30 opacity-80'
            )}
          >
            {/* Header */}
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
                  placeholder="Nome do cenário (ex: Família co-financiadora)"
                  className="font-medium"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(idx)} className="text-red-500 hover:bg-red-50 h-8 w-8 p-0 flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {/* ── Bloco: Quando disparar ── */}
            <div className="rounded-lg border border-slate-200 bg-white/60 p-3 space-y-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <Label className="text-xs font-semibold text-slate-700">Quando disparar este cenário</Label>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Descreva em linguagem natural quando este cenário deve ativar</Label>
                <Textarea
                  rows={3}
                  value={scenario.trigger_description ?? ''}
                  onChange={e => update(idx, { trigger_description: e.target.value || null })}
                  placeholder="Ex: quando o casal menciona que a família, pais ou sogros estão ajudando a pagar, bancando ou co-financiando a viagem"
                />
                <p className="text-[11px] text-slate-400">
                  O agente entende variações naturais (&ldquo;meu pai paga&rdquo;, &ldquo;papai vai bancar&rdquo;, &ldquo;mamãe está ajudando&rdquo;). Seja específico sobre a situação — o agente decide pelo contexto da conversa.
                </p>
              </div>

              {!hasDescription && (
                <div className="rounded bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800">
                  Descreva quando este cenário deve ativar — sem descrição, o cenário nunca dispara.
                </div>
              )}
            </div>

            {/* ── Bloco: Ajuste no comportamento ── */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Como o agente deve responder neste cenário (instruções injetadas no prompt)</Label>
              <FieldAwareTextarea
                rows={3}
                value={scenario.response_adjustment ?? ''}
                onChange={v => update(idx, { response_adjustment: v || null })}
                placeholder="Ex: Validar presença dos decisores e sugerir incluir os pais numa videoconferência com a Planner. Registrar no campo do CRM correspondente."
                pipelineId={pipelineId}
                produto={produto}
                enabledTypes={['field', 'tag', 'stage']}
              />
              <p className="text-[11px] text-slate-400">
                Escreva em linguagem natural. Digite <kbd className="rounded border border-slate-300 bg-slate-50 px-1 py-0.5 font-mono text-[10px]">@</kbd> pra inserir campo, tag ou etapa — cada um aparece com uma cor diferente.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700 rounded-lg border border-slate-200 bg-white/60 p-2.5">
                <Switch
                  checked={scenario.skip_fee_presentation}
                  onCheckedChange={v => update(idx, { skip_fee_presentation: v })}
                />
                Pular apresentação de taxa
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 rounded-lg border border-slate-200 bg-white/60 p-2.5">
                <Switch
                  checked={scenario.skip_meeting_scheduling}
                  onCheckedChange={v => update(idx, { skip_meeting_scheduling: v })}
                />
                Pular agendamento de reunião
              </label>
            </div>

            {/* ── Bloco: Ações automáticas (agente executa via tool calling) ── */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <Label className="text-xs font-semibold text-emerald-800">Ações automáticas quando o cenário dispara</Label>
              </div>
              <p className="text-[11px] text-emerald-700 -mt-1">
                O agente aplica essas ações quando identificar que o cenário se encaixa na conversa, com base na descrição acima.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Tag className="w-3 h-3" /> Aplicar tag
                  </Label>
                  <TagPicker
                    value={scenario.auto_assign_tag ?? null}
                    onChange={v => update(idx, { auto_assign_tag: v })}
                    produto={produto}
                    placeholder="Sem tag"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <MoveRight className="w-3 h-3" /> Mover para etapa
                  </Label>
                  <StagePicker
                    value={scenario.auto_transition_stage_id ?? null}
                    onChange={v => update(idx, { auto_transition_stage_id: v })}
                    pipelineId={pipelineId}
                    placeholder="Não mover"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Switch
                  checked={scenario.auto_notify_responsible}
                  onCheckedChange={v => update(idx, { auto_notify_responsible: v })}
                />
                <Bell className="w-3.5 h-3.5 text-slate-500" />
                Notificar o responsável do card
              </label>
            </div>
          </div>
        )
      })}

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
              : 'Ex: Família co-financiadora dispara instruções específicas + aplica tag + move etapa automaticamente.'}
          </p>
        </div>
      </header>

      <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
        <p className="text-xs text-purple-900">
          <strong>Como funciona:</strong> o agente lê cada cenário junto com a conversa e decide qual se aplica pelo contexto. Cenários com prioridade maior são avaliados primeiro. Quando um cenário se aplica, o agente ajusta a resposta e dispara as ações configuradas (tag, etapa, notificação).
        </p>
      </div>

      <SpecialScenariosEditor {...props} />
    </section>
  )
}
