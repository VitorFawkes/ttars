import { Radio, Send, Clock } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type {
  InteractionMode,
  FirstMessageConfig,
  OutboundTriggerConfig,
  OutboundTrigger,
  BusinessHoursConfig,
} from './types'

const MODE_OPTIONS: Array<{ value: InteractionMode; label: string; description: string }> = [
  { value: 'inbound', label: 'Inbound (responde)', description: 'Agente só responde quando cliente manda mensagem.' },
  { value: 'outbound', label: 'Outbound (aborda)', description: 'Agente inicia conversa em gatilhos (card criado, etapa, inatividade).' },
  { value: 'hybrid', label: 'Híbrido', description: 'Inicia conversas E responde. Para SDRs proativos.' },
]

const TRIGGER_OPTIONS: Array<{ value: OutboundTrigger['type']; label: string }> = [
  { value: 'card_created', label: 'Card criado no pipeline' },
  { value: 'stage_changed', label: 'Card mudou de etapa' },
  { value: 'idle_days', label: 'N dias sem resposta' },
]

const DAYS: Array<{ value: string; label: string }> = [
  { value: 'mon', label: 'Seg' },
  { value: 'tue', label: 'Ter' },
  { value: 'wed', label: 'Qua' },
  { value: 'thu', label: 'Qui' },
  { value: 'fri', label: 'Sex' },
  { value: 'sat', label: 'Sáb' },
  { value: 'sun', label: 'Dom' },
]

export interface InteractionModeEditorProps {
  mode: InteractionMode
  firstMessage: FirstMessageConfig
  outbound: OutboundTriggerConfig
  onModeChange: (mode: InteractionMode) => void
  onFirstMessageChange: (cfg: FirstMessageConfig) => void
  onOutboundChange: (cfg: OutboundTriggerConfig) => void
}

export function InteractionModeEditor({
  mode, firstMessage, outbound,
  onModeChange, onFirstMessageChange, onOutboundChange,
}: InteractionModeEditorProps) {
  const patchFirst = (p: Partial<FirstMessageConfig>) => onFirstMessageChange({ ...firstMessage, ...p })
  const patchOutbound = (p: Partial<OutboundTriggerConfig>) => onOutboundChange({ ...outbound, ...p })
  const patchBusinessHours = (p: Partial<BusinessHoursConfig>) => patchOutbound({ business_hours: { ...outbound.business_hours, ...p } })

  const showOutboundConfig = mode === 'outbound' || mode === 'hybrid'

  const addTrigger = () => {
    patchOutbound({
      triggers: [
        ...outbound.triggers,
        { type: 'card_created', conditions: {}, enabled: true },
      ],
    })
  }

  const updateTrigger = (idx: number, patch: Partial<OutboundTrigger>) => {
    patchOutbound({
      triggers: outbound.triggers.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    })
  }

  const removeTrigger = (idx: number) => {
    patchOutbound({ triggers: outbound.triggers.filter((_, i) => i !== idx) })
  }

  const toggleDay = (day: string) => {
    const cur = outbound.business_hours.days ?? []
    const next = cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day]
    patchBusinessHours({ days: next })
  }

  return (
    <div className="space-y-6">
      {/* Seleção de modo */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-teal-500" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">Modo de interação</h3>
            <p className="text-xs text-slate-500">Define quando o agente entra em ação.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onModeChange(opt.value)}
              className={cn(
                'text-left border rounded-lg p-4 transition-colors',
                mode === opt.value
                  ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500'
                  : 'border-slate-200 hover:border-slate-300'
              )}
            >
              <div className="font-medium text-slate-900 mb-1">{opt.label}</div>
              <div className="text-xs text-slate-600">{opt.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Mensagem inicial (outbound/hybrid) */}
      {showOutboundConfig && (
        <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
          <header className="flex items-center gap-2">
            <Send className="w-5 h-5 text-indigo-500" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Primeira mensagem</h3>
              <p className="text-xs text-slate-500">Como o agente inicia conversas novas.</p>
            </div>
          </header>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Tipo</Label>
            <Select
              value={firstMessage.type}
              onChange={(v: string) => patchFirst({ type: v as 'fixed' | 'ai_generated' })}
              options={[
                { value: 'fixed', label: 'Mensagem fixa (template)' },
                { value: 'ai_generated', label: 'Gerada por IA (com instruções)' },
              ]}
            />
          </div>

          {firstMessage.type === 'fixed' ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Template (use {'{{contato.nome}}'}, {'{{agente.nome}}'})</Label>
              <Textarea
                rows={3}
                value={firstMessage.fixed_template}
                onChange={e => patchFirst({ fixed_template: e.target.value })}
                placeholder="Olá {{contato.nome}}! Sou {{agente.nome}}..."
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Instruções para a IA gerar a primeira mensagem</Label>
              <Textarea
                rows={4}
                value={firstMessage.ai_instructions}
                onChange={e => patchFirst({ ai_instructions: e.target.value })}
                placeholder="Gere uma mensagem de apresentação curta mencionando o destino do cliente e oferecendo ajuda."
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Delay antes de enviar (segundos)</Label>
            <Input
              type="number"
              min={0}
              value={firstMessage.delay_seconds}
              onChange={e => patchFirst({ delay_seconds: Number(e.target.value) || 0 })}
            />
          </div>
        </section>
      )}

      {/* Outbound triggers */}
      {showOutboundConfig && (
        <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
          <header className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Gatilhos de abordagem</h3>
              <p className="text-xs text-slate-500">Quando o agente inicia conversa e em qual horário.</p>
            </div>
          </header>

          {/* Triggers */}
          <div className="space-y-2">
            <Label className="text-xs text-slate-600">Gatilhos ativos</Label>
            {outbound.triggers.length === 0 && (
              <div className="text-xs text-slate-400 italic">Nenhum gatilho configurado.</div>
            )}
            {outbound.triggers.map((trigger, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg">
                <Switch checked={trigger.enabled} onCheckedChange={v => updateTrigger(idx, { enabled: v })} />
                <Select
                  value={trigger.type}
                  onChange={(v: string) => updateTrigger(idx, { type: v as OutboundTrigger['type'] })}
                  options={TRIGGER_OPTIONS}
                />
                {trigger.type === 'idle_days' && (
                  <Input
                    type="number"
                    min={1}
                    value={(trigger.conditions.days as number | undefined) ?? 3}
                    onChange={e => updateTrigger(idx, { conditions: { days: Number(e.target.value) || 1 } })}
                    placeholder="Dias"
                    className="w-20"
                  />
                )}
                <Button variant="ghost" size="sm" onClick={() => removeTrigger(idx)} className="text-red-500 hover:bg-red-50 h-8 w-8 p-0 ml-auto">
                  ×
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addTrigger} className="gap-2">
              + Adicionar gatilho
            </Button>
          </div>

          {/* Business hours */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <Label className="text-sm font-medium text-slate-900">Janela de envio</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Início</Label>
                <Input
                  type="time"
                  value={outbound.business_hours.start}
                  onChange={e => patchBusinessHours({ start: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Fim</Label>
                <Input
                  type="time"
                  value={outbound.business_hours.end}
                  onChange={e => patchBusinessHours({ end: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Fuso</Label>
                <Input
                  value={outbound.business_hours.timezone}
                  onChange={e => patchBusinessHours({ timezone: e.target.value })}
                  placeholder="America/Sao_Paulo"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Dias permitidos</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map(d => {
                  const active = (outbound.business_hours.days ?? []).includes(d.value)
                  return (
                    <button
                      key={d.value}
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Limits */}
          <div className="border-t border-slate-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Máximo de envios outbound por dia</Label>
              <Input
                type="number"
                min={0}
                value={outbound.max_daily_outbound}
                onChange={e => patchOutbound({ max_daily_outbound: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Máximo por contato (anti-spam)</Label>
              <Input
                type="number"
                min={1}
                value={outbound.max_outbound_per_contact ?? 3}
                onChange={e => patchOutbound({ max_outbound_per_contact: Number(e.target.value) || 1 })}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
