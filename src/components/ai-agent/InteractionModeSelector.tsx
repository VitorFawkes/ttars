import { useState } from 'react'
import {
  MessageCircle, Send, ArrowLeftRight, ChevronDown, ChevronUp,
  Clock, Calendar, Zap,
} from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type {
  InteractionMode, FirstMessageConfig, OutboundTriggerConfig,
} from '@/hooks/useAgentWizard'

interface InteractionModeSelectorProps {
  mode: InteractionMode
  firstMessageConfig?: FirstMessageConfig
  outboundTriggerConfig?: OutboundTriggerConfig
  onModeChange: (mode: InteractionMode) => void
  onFirstMessageConfigChange: (config: FirstMessageConfig) => void
  onOutboundTriggerConfigChange: (config: OutboundTriggerConfig) => void
}

const MODES = [
  {
    value: 'inbound' as const,
    label: 'O cliente fala primeiro',
    description: 'Agente so responde quando receber mensagem.',
    Icon: MessageCircle,
  },
  {
    value: 'outbound' as const,
    label: 'Nos falamos primeiro',
    description: 'Agente inicia a conversa apos gatilho.',
    Icon: Send,
  },
  {
    value: 'hybrid' as const,
    label: 'Ambos',
    description: 'Agente pode iniciar ou responder.',
    Icon: ArrowLeftRight,
  },
]

const ORIGENS = [
  { value: 'form', label: 'Formulario' },
  { value: 'landing_page', label: 'Landing page' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'indicacao', label: 'Indicacao' },
]

const WEEKDAYS = [
  { value: 'mon', label: 'Seg' },
  { value: 'tue', label: 'Ter' },
  { value: 'wed', label: 'Qua' },
  { value: 'thu', label: 'Qui' },
  { value: 'fri', label: 'Sex' },
  { value: 'sat', label: 'Sab' },
  { value: 'sun', label: 'Dom' },
]

const DEFAULT_FIRST_MESSAGE: FirstMessageConfig = {
  type: 'fixed',
  fixed_template: 'Oi {{contact_name}}! Vi que voce tem interesse em viajar. Posso te ajudar a planejar tudo!',
  ai_instructions: '',
  delay_seconds: 30,
}

const DEFAULT_OUTBOUND_CONFIG: OutboundTriggerConfig = {
  triggers: [
    { type: 'card_created', conditions: { origem: ['form', 'landing_page'], has_phone: true }, enabled: true },
  ],
  business_hours: {
    start: '09:00',
    end: '18:00',
    timezone: 'America/Sao_Paulo',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  },
  max_daily_outbound: 50,
}

export function InteractionModeSelector({
  mode,
  firstMessageConfig,
  outboundTriggerConfig,
  onModeChange,
  onFirstMessageConfigChange,
  onOutboundTriggerConfigChange,
}: InteractionModeSelectorProps) {
  const [expanded, setExpanded] = useState(mode !== 'inbound')
  const isOutbound = mode === 'outbound' || mode === 'hybrid'

  const fmc = firstMessageConfig || DEFAULT_FIRST_MESSAGE
  const otc = outboundTriggerConfig || DEFAULT_OUTBOUND_CONFIG

  const handleModeChange = (newMode: InteractionMode) => {
    onModeChange(newMode)
    if (newMode !== 'inbound') {
      setExpanded(true)
      if (!firstMessageConfig) onFirstMessageConfigChange(DEFAULT_FIRST_MESSAGE)
      if (!outboundTriggerConfig) onOutboundTriggerConfigChange(DEFAULT_OUTBOUND_CONFIG)
    } else {
      setExpanded(false)
    }
  }

  const updateFmc = (patch: Partial<FirstMessageConfig>) => {
    onFirstMessageConfigChange({ ...fmc, ...patch })
  }

  const toggleOrigem = (origem: string) => {
    const trigger = otc.triggers.find(t => t.type === 'card_created')
    if (!trigger) return
    const current = (trigger.conditions.origem as string[]) || []
    const next = current.includes(origem)
      ? current.filter(o => o !== origem)
      : [...current, origem]
    const updatedTriggers = otc.triggers.map(t =>
      t.type === 'card_created' ? { ...t, conditions: { ...t.conditions, origem: next } } : t
    )
    onOutboundTriggerConfigChange({ ...otc, triggers: updatedTriggers })
  }

  const toggleDay = (day: string) => {
    const bh = otc.business_hours
    const next = bh.days.includes(day)
      ? bh.days.filter(d => d !== day)
      : [...bh.days, day]
    onOutboundTriggerConfigChange({
      ...otc,
      business_hours: { ...bh, days: next },
    })
  }

  const cardCreatedTrigger = otc.triggers.find(t => t.type === 'card_created')
  const selectedOrigens = (cardCreatedTrigger?.conditions?.origem as string[]) || []

  return (
    <div className="space-y-4">
      <Label className="block text-sm font-medium text-slate-900">Modo de interacao</Label>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {MODES.map(({ value, label, description, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleModeChange(value)}
            className={cn(
              'flex flex-col items-start gap-2 p-4 border rounded-xl text-left transition-all',
              mode === value
                ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500'
                : 'border-slate-200 bg-white hover:border-slate-300'
            )}
          >
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              mode === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
            )}>
              <Icon className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className={cn(
                'text-sm font-semibold',
                mode === value ? 'text-indigo-900' : 'text-slate-900'
              )}>
                {label}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            </div>
          </button>
        ))}
      </div>

      {isOutbound && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm text-indigo-600 font-medium hover:underline"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? 'Ocultar configuracoes de abordagem' : 'Configurar abordagem automatica'}
        </button>
      )}

      {isOutbound && expanded && (
        <div className="space-y-4">
          {/* First Message Config */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-indigo-600" />
              <Label className="text-sm font-semibold text-slate-900">Primeira mensagem</Label>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => updateFmc({ type: 'fixed' })}
                className={cn(
                  'flex-1 px-3 py-2 text-sm rounded-lg border transition-colors',
                  fmc.type === 'fixed'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                Mensagem fixa
              </button>
              <button
                type="button"
                onClick={() => updateFmc({ type: 'ai_generated' })}
                className={cn(
                  'flex-1 px-3 py-2 text-sm rounded-lg border transition-colors',
                  fmc.type === 'ai_generated'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                IA gera automaticamente
              </button>
            </div>

            {fmc.type === 'fixed' ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Template da mensagem</Label>
                <Textarea
                  value={fmc.fixed_template}
                  onChange={(e) => updateFmc({ fixed_template: e.target.value })}
                  placeholder="Oi {{contact_name}}! Vi que voce..."
                  className="min-h-[80px]"
                />
                <p className="text-[11px] text-slate-400">
                  Use {'{{contact_name}}'} para o nome e {'{{form_field:campo}}'} para dados do formulario.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Instrucoes para a IA</Label>
                <Textarea
                  value={fmc.ai_instructions}
                  onChange={(e) => updateFmc({ ai_instructions: e.target.value })}
                  placeholder="Gere uma saudacao calorosa usando os dados do formulario. Mencione o destino se disponivel."
                  className="min-h-[80px]"
                />
                <p className="text-[11px] text-slate-400">
                  A IA vai usar os dados do formulario e essas instrucoes para criar a mensagem.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-slate-400" />
              <div className="flex items-center gap-2 flex-1">
                <Label className="text-xs whitespace-nowrap">Delay antes de enviar</Label>
                <Input
                  type="number"
                  min={10}
                  max={3600}
                  value={fmc.delay_seconds}
                  onChange={(e) => updateFmc({ delay_seconds: parseInt(e.target.value) || 30 })}
                  className="w-24"
                />
                <span className="text-xs text-slate-500">segundos</span>
              </div>
            </div>
          </div>

          {/* Outbound Triggers */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-600" />
              <Label className="text-sm font-semibold text-slate-900">Gatilhos de disparo</Label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Quando card e criado</p>
                  <p className="text-xs text-slate-500">Dispara quando um novo lead entra no CRM</p>
                </div>
                <Switch
                  checked={cardCreatedTrigger?.enabled ?? true}
                  onCheckedChange={(checked) => {
                    const updated = otc.triggers.map(t =>
                      t.type === 'card_created' ? { ...t, enabled: checked } : t
                    )
                    onOutboundTriggerConfigChange({ ...otc, triggers: updated })
                  }}
                />
              </div>

              {cardCreatedTrigger?.enabled && (
                <div className="ml-4 pl-4 border-l-2 border-slate-100 space-y-2">
                  <Label className="text-xs text-slate-600">Somente leads vindos de:</Label>
                  <div className="flex flex-wrap gap-2">
                    {ORIGENS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleOrigem(value)}
                        className={cn(
                          'px-3 py-1.5 text-xs rounded-full border transition-colors',
                          selectedOrigens.includes(value)
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between opacity-50">
                <div>
                  <p className="text-sm font-medium text-slate-900">Quando muda de etapa</p>
                  <p className="text-xs text-slate-400">Em breve</p>
                </div>
                <Switch disabled checked={false} />
              </div>

              <div className="flex items-center justify-between opacity-50">
                <div>
                  <p className="text-sm font-medium text-slate-900">Quando parado ha X dias</p>
                  <p className="text-xs text-slate-400">Em breve</p>
                </div>
                <Switch disabled checked={false} />
              </div>
            </div>
          </div>

          {/* Business Hours */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <Label className="text-sm font-semibold text-slate-900">Horario comercial</Label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Inicio</Label>
                <Input
                  type="time"
                  value={otc.business_hours.start}
                  onChange={(e) => onOutboundTriggerConfigChange({
                    ...otc,
                    business_hours: { ...otc.business_hours, start: e.target.value },
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fim</Label>
                <Input
                  type="time"
                  value={otc.business_hours.end}
                  onChange={(e) => onOutboundTriggerConfigChange({
                    ...otc,
                    business_hours: { ...otc.business_hours, end: e.target.value },
                  })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Dias da semana</Label>
              <div className="flex gap-1.5">
                {WEEKDAYS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleDay(value)}
                    className={cn(
                      'w-10 h-10 rounded-lg text-xs font-medium transition-colors',
                      otc.business_hours.days.includes(value)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label className="text-xs whitespace-nowrap">Maximo de envios por dia</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={otc.max_daily_outbound}
                onChange={(e) => onOutboundTriggerConfigChange({
                  ...otc,
                  max_daily_outbound: parseInt(e.target.value) || 50,
                })}
                className="w-24"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
