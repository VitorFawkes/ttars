/**
 * Patricia Redesign — Tab Modo de Interação
 *
 * Substitui: src/components/ai-agent-v2/InteractionModeSelector.tsx (e o wrapper
 * em src/components/ai-agent-v2/editor/TabModoInteracao.tsx)
 *
 * Mudanças vs hoje:
 *  - BUG A RESOLVIDO: estado `expanded` derivado de `mode`, sem useState
 *    espelhando prop. (Ver L?? — comentário "BUG FIX" inline.)
 *  - Modos viram cards horizontais com radio visual (estilo Linear/Stripe)
 *  - Configurações outbound viram 4 sub-seções com headers — não 4 cards isolados
 *  - Hierarquia visual clara: modo → (se outbound) configurações em sub-seções
 *  - Layout responsivo: grid 2 col em telas largas (Primeira mensagem | Gatilhos)
 *    horário comercial e anti-spam ocupam linha cheia
 */

import {
  MessageCircle, Send, ArrowLeftRight,
  Clock, Zap, ShieldAlert,
  Sparkles, FileText,
} from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { TabFrame } from './01-MasterLayout'
import { FormCard, Field } from './02-TabIdentidade'
import type { LucideIcon } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
//  Tipos (replicam o que vive em src/hooks/v2/useAgentWizard)
// ─────────────────────────────────────────────────────────────────────────────

export type InteractionMode = 'inbound' | 'outbound' | 'hybrid'

export interface FirstMessageConfig {
  type: 'fixed' | 'ai_generated'
  fixed_template: string
  ai_instructions: string
  delay_seconds: number
}

export interface OutboundTriggerConfig {
  triggers: Array<{
    type: 'card_created' | 'idle_days'
    enabled: boolean
    conditions: Record<string, unknown>
  }>
  business_hours: {
    start: string
    end: string
    timezone: string
    days: string[]
  }
  max_daily_outbound: number
  max_outbound_per_contact?: number
}

// ─────────────────────────────────────────────────────────────────────────────
//  Constantes de display
// ─────────────────────────────────────────────────────────────────────────────

const MODES: Array<{
  value: InteractionMode
  label: string
  helper: string
  icon: LucideIcon
}> = [
  {
    value: 'inbound',
    label: 'O cliente fala primeiro',
    helper: 'Patricia só responde quando recebe mensagem.',
    icon: MessageCircle,
  },
  {
    value: 'outbound',
    label: 'Patricia fala primeiro',
    helper: 'Após gatilho (card novo, lead parado, etc.).',
    icon: Send,
  },
  {
    value: 'hybrid',
    label: 'Os dois',
    helper: 'Pode iniciar e responder.',
    icon: ArrowLeftRight,
  },
]

const ORIGENS = [
  { value: 'form', label: 'Formulário' },
  { value: 'landing_page', label: 'Landing page' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'indicacao', label: 'Indicação' },
]

const WEEKDAYS = [
  { value: 'mon', label: 'Seg' },
  { value: 'tue', label: 'Ter' },
  { value: 'wed', label: 'Qua' },
  { value: 'thu', label: 'Qui' },
  { value: 'fri', label: 'Sex' },
  { value: 'sat', label: 'Sáb' },
  { value: 'sun', label: 'Dom' },
]

// ─────────────────────────────────────────────────────────────────────────────
//  Componente principal
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  mode: InteractionMode
  firstMessageConfig: FirstMessageConfig
  outboundTriggerConfig: OutboundTriggerConfig
  onModeChange: (m: InteractionMode) => void
  onFirstMessageConfigChange: (c: FirstMessageConfig) => void
  onOutboundTriggerConfigChange: (c: OutboundTriggerConfig) => void
}

export function TabModoInteracao({
  mode, firstMessageConfig, outboundTriggerConfig,
  onModeChange, onFirstMessageConfigChange, onOutboundTriggerConfigChange,
}: Props) {

  // ╭─ BUG FIX (Bug A) ─────────────────────────────────────────────────────╮
  // │ `showOutbound` é DERIVADO direto da prop `mode`. Sem useState.        │
  // │ Sempre coerente com o estado real, mesmo após reload do form.        │
  // ╰───────────────────────────────────────────────────────────────────────╯
  const showOutbound = mode === 'outbound' || mode === 'hybrid'

  return (
    <TabFrame
      title="Modo de interação"
      description="Quem inicia a conversa: o cliente, Patricia, ou os dois."
    >
      {/* ── Bloco 1: Seleção de modo ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {MODES.map(m => (
          <ModeCard
            key={m.value}
            {...m}
            selected={mode === m.value}
            onClick={() => onModeChange(m.value)}
          />
        ))}
      </div>

      {/* ── Outbound config (progressive disclosure, sem state local) ───── */}
      {showOutbound && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <FirstMessageBlock
            config={firstMessageConfig}
            onChange={onFirstMessageConfigChange}
            className="lg:col-span-1"
          />
          <TriggersBlock
            config={outboundTriggerConfig}
            onChange={onOutboundTriggerConfigChange}
            className="lg:col-span-1"
          />
          <BusinessHoursBlock
            config={outboundTriggerConfig}
            onChange={onOutboundTriggerConfigChange}
            className="lg:col-span-2"
          />
          <AntiSpamBlock
            config={outboundTriggerConfig}
            onChange={onOutboundTriggerConfigChange}
            className="lg:col-span-2"
          />
        </div>
      )}

      {/* ── Estado inbound: hint discreto sobre o que está acontecendo ──── */}
      {!showOutbound && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-8 text-center">
          <MessageCircle className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          <p className="text-[13px] text-slate-600 font-medium">
            Patricia espera o cliente falar primeiro
          </p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            Sem disparos automáticos. Quando o cliente mandar a primeira mensagem em uma linha conectada,
            Patricia entra em ação.
          </p>
        </div>
      )}
    </TabFrame>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mode card (radio visual estilo Linear)
// ─────────────────────────────────────────────────────────────────────────────

function ModeCard({
  value, label, helper, icon: Icon, selected, onClick,
}: {
  value: InteractionMode
  label: string
  helper: string
  icon: LucideIcon
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      className={cn(
        'group relative flex flex-col items-start gap-3 p-4 rounded-xl text-left transition-all duration-150',
        'border outline-none focus-visible:ring-2 focus-visible:ring-indigo-200',
        selected
          ? 'border-indigo-300 bg-indigo-50/60 shadow-[0_0_0_3px_rgba(99,102,241,0.08),0_1px_2px_rgba(15,23,42,0.04)]'
          : 'border-slate-200/80 bg-white hover:border-slate-300 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
      )}
    >
      {/* Indicador radio sutil */}
      <span className={cn(
        'absolute top-3 right-3 w-3.5 h-3.5 rounded-full transition-all',
        selected
          ? 'bg-indigo-600 shadow-[inset_0_0_0_3px_white]'
          : 'border border-slate-300 bg-white group-hover:border-slate-400',
      )} />

      <div className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
        selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500',
      )}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="space-y-1">
        <p className={cn(
          'text-[13px] font-semibold transition-colors',
          selected ? 'text-indigo-900' : 'text-slate-900',
        )}>
          {label}
        </p>
        <p className="text-[11px] text-slate-500 leading-relaxed">{helper}</p>
      </div>

      <span className="text-[10px] font-mono text-slate-400 mt-auto">{value}</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Primeira mensagem
// ─────────────────────────────────────────────────────────────────────────────

function FirstMessageBlock({
  config, onChange, className,
}: {
  config: FirstMessageConfig
  onChange: (c: FirstMessageConfig) => void
  className?: string
}) {
  const update = (patch: Partial<FirstMessageConfig>) => onChange({ ...config, ...patch })

  return (
    <FormCard
      eyebrow="Outbound · 1"
      title="Primeira mensagem"
      description="O que Patricia diz quando ela inicia a conversa."
    >
      <div className={cn('space-y-4', className)}>

        {/* Segmented control: fixa vs IA */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100/80 rounded-lg">
          <SegmentButton
            selected={config.type === 'fixed'}
            onClick={() => update({ type: 'fixed' })}
            icon={FileText}
          >
            Mensagem fixa
          </SegmentButton>
          <SegmentButton
            selected={config.type === 'ai_generated'}
            onClick={() => update({ type: 'ai_generated' })}
            icon={Sparkles}
          >
            IA gera
          </SegmentButton>
        </div>

        {config.type === 'fixed' ? (
          <Field
            label="Template da mensagem"
            hint="Use {{contact_name}} pra inserir o nome. Patricia substitui antes de enviar."
          >
            <Textarea
              value={config.fixed_template}
              onChange={e => update({ fixed_template: e.target.value })}
              placeholder="Oi {{contact_name}}! Vi que você tem interesse em viajar..."
              rows={4}
              className="font-mono text-[12px] leading-relaxed"
            />
          </Field>
        ) : (
          <Field
            label="Instruções para a IA"
            hint="A IA usa esses dados pra gerar uma saudação contextualizada com o que o cliente preencheu no formulário."
          >
            <Textarea
              value={config.ai_instructions}
              onChange={e => update({ ai_instructions: e.target.value })}
              placeholder="Gere uma saudação calorosa usando o nome e o destino preferido. Mencione um detalhe específico do casamento se disponível."
              rows={4}
              className="leading-relaxed"
            />
          </Field>
        )}

        <Field label="Atraso antes de enviar" hint="Tempo entre o gatilho e o envio. Evita parecer robô.">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={10}
              max={3600}
              value={config.delay_seconds}
              onChange={e => update({ delay_seconds: parseInt(e.target.value) || 30 })}
              className="w-24"
            />
            <span className="text-[12px] text-slate-500">segundos</span>
            <span className="ml-auto text-[10px] font-mono text-slate-400">
              ≈ {formatDelay(config.delay_seconds)}
            </span>
          </div>
        </Field>
      </div>
    </FormCard>
  )
}

function formatDelay(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m}min ${r}s` : `${m}min`
}

// ─────────────────────────────────────────────────────────────────────────────
//  Gatilhos
// ─────────────────────────────────────────────────────────────────────────────

function TriggersBlock({
  config, onChange, className,
}: {
  config: OutboundTriggerConfig
  onChange: (c: OutboundTriggerConfig) => void
  className?: string
}) {
  const cardCreated = config.triggers.find(t => t.type === 'card_created')
  const idleDays = config.triggers.find(t => t.type === 'idle_days')

  const toggleTrigger = (type: 'card_created' | 'idle_days', enabled: boolean) => {
    const existing = config.triggers.find(t => t.type === type)
    if (existing) {
      onChange({
        ...config,
        triggers: config.triggers.map(t => t.type === type ? { ...t, enabled } : t),
      })
    } else {
      onChange({
        ...config,
        triggers: [
          ...config.triggers,
          {
            type,
            enabled,
            conditions: type === 'idle_days'
              ? { days: 3, max_followups: 2 }
              : { origem: [], has_phone: true },
          },
        ],
      })
    }
  }

  const updateConditions = (
    type: 'card_created' | 'idle_days',
    patch: Record<string, unknown>,
  ) => {
    onChange({
      ...config,
      triggers: config.triggers.map(t =>
        t.type === type ? { ...t, conditions: { ...t.conditions, ...patch } } : t,
      ),
    })
  }

  const selectedOrigens = (cardCreated?.conditions?.origem as string[]) ?? []

  const toggleOrigem = (origem: string) => {
    const next = selectedOrigens.includes(origem)
      ? selectedOrigens.filter(o => o !== origem)
      : [...selectedOrigens, origem]
    updateConditions('card_created', { origem: next })
  }

  return (
    <FormCard
      eyebrow="Outbound · 2"
      title="Quando disparar"
      description="Eventos que fazem Patricia tomar iniciativa."
    >
      <div className={cn('space-y-4', className)}>
        <TriggerRow
          icon={Zap}
          title="Card novo entra no CRM"
          subtitle="Dispara quando lead vindo de formulário/landing/etc. cria um card"
          enabled={cardCreated?.enabled ?? false}
          onToggle={v => toggleTrigger('card_created', v)}
        >
          {cardCreated?.enabled && (
            <div className="pt-3 space-y-2">
              <p className="text-[11px] uppercase tracking-[0.04em] font-semibold text-slate-500">
                Apenas leads vindos de
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ORIGENS.map(o => (
                  <Chip
                    key={o.value}
                    selected={selectedOrigens.includes(o.value)}
                    onClick={() => toggleOrigem(o.value)}
                  >
                    {o.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </TriggerRow>

        <TriggerRow
          icon={Clock}
          title="Lead parado por X dias"
          subtitle="Follow-up automático personalizado pela IA"
          enabled={idleDays?.enabled ?? false}
          onToggle={v => toggleTrigger('idle_days', v)}
        >
          {idleDays?.enabled && (
            <div className="pt-3 grid grid-cols-2 gap-3">
              <Field label="Dias parado">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={(idleDays.conditions.days as number) ?? 3}
                  onChange={e => updateConditions('idle_days', {
                    days: Math.max(1, Math.min(30, parseInt(e.target.value) || 3)),
                  })}
                />
              </Field>
              <Field label="Máx. follow-ups por lead">
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={(idleDays.conditions.max_followups as number) ?? 2}
                  onChange={e => updateConditions('idle_days', {
                    max_followups: Math.max(1, Math.min(5, parseInt(e.target.value) || 2)),
                  })}
                />
              </Field>
            </div>
          )}
        </TriggerRow>

        <TriggerRow
          icon={ArrowLeftRight}
          title="Lead muda de etapa"
          subtitle="Em breve — não disponível ainda"
          enabled={false}
          onToggle={() => {}}
          disabled
        />
      </div>
    </FormCard>
  )
}

function TriggerRow({
  icon: Icon, title, subtitle, enabled, onToggle, disabled, children,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  enabled: boolean
  onToggle: (v: boolean) => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      enabled ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200',
      disabled && 'opacity-50',
    )}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          enabled ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500',
        )}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-slate-900">{title}</p>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>
          {children}
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={disabled} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Horário comercial
// ─────────────────────────────────────────────────────────────────────────────

function BusinessHoursBlock({
  config, onChange, className,
}: {
  config: OutboundTriggerConfig
  onChange: (c: OutboundTriggerConfig) => void
  className?: string
}) {
  const bh = config.business_hours

  const toggleDay = (day: string) => {
    const next = bh.days.includes(day) ? bh.days.filter(d => d !== day) : [...bh.days, day]
    onChange({ ...config, business_hours: { ...bh, days: next } })
  }

  return (
    <FormCard
      eyebrow="Outbound · 3"
      title="Quando ela pode falar"
      description="Patricia só inicia conversas dentro desse horário e nesses dias. Mensagens fora da janela ficam na fila."
    >
      <div className={cn('grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-6', className)}>
        <div className="space-y-3">
          <Field label="Horário de início">
            <Input
              type="time"
              value={bh.start}
              onChange={e => onChange({ ...config, business_hours: { ...bh, start: e.target.value } })}
            />
          </Field>
          <Field label="Horário de fim">
            <Input
              type="time"
              value={bh.end}
              onChange={e => onChange({ ...config, business_hours: { ...bh, end: e.target.value } })}
            />
          </Field>
          <p className="text-[10px] font-mono text-slate-400">
            Fuso: <span className="text-slate-600">{bh.timezone}</span>
          </p>
        </div>

        <div>
          <Field label="Dias da semana">
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAYS.map(d => {
                const active = bh.days.includes(d.value)
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={cn(
                      'w-11 h-11 rounded-xl text-[12px] font-medium transition-all',
                      active
                        ? 'bg-indigo-600 text-white shadow-[0_2px_4px_rgba(79,70,229,0.25)]'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </Field>
        </div>
      </div>
    </FormCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Anti-spam
// ─────────────────────────────────────────────────────────────────────────────

function AntiSpamBlock({
  config, onChange, className,
}: {
  config: OutboundTriggerConfig
  onChange: (c: OutboundTriggerConfig) => void
  className?: string
}) {
  return (
    <FormCard
      eyebrow="Outbound · 4"
      title="Anti-spam"
      description="Limites pra Patricia não martelar o mesmo contato nem estourar o WhatsApp."
    >
      <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-6', className)}>
        <Field
          label="Máximo de abordagens por contato"
          hint="Quando o contato atingir esse número, Patricia para de tentar — mesmo que os gatilhos disparem."
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={10}
              value={config.max_outbound_per_contact ?? 3}
              onChange={e => onChange({
                ...config,
                max_outbound_per_contact: Math.max(1, Math.min(10, parseInt(e.target.value) || 3)),
              })}
              className="w-24"
            />
            <span className="text-[12px] text-slate-500">mensagens</span>
          </div>
        </Field>

        <Field
          label="Máximo de envios por dia"
          hint="Capacidade total que Patricia pode disparar em 24h. Limita custo e protege o número."
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={500}
              value={config.max_daily_outbound}
              onChange={e => onChange({
                ...config,
                max_daily_outbound: parseInt(e.target.value) || 50,
              })}
              className="w-24"
            />
            <span className="text-[12px] text-slate-500">mensagens / dia</span>
          </div>
        </Field>

        <div className="md:col-span-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50/60 border border-amber-200/60">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Estouros frequentes desses limites podem indicar que o gatilho está muito amplo.
            Considere refinar as condições da seção <strong>Quando disparar</strong>.
          </p>
        </div>
      </div>
    </FormCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reusable primitives
// ─────────────────────────────────────────────────────────────────────────────

function SegmentButton({
  selected, onClick, icon: Icon, children,
}: {
  selected: boolean
  onClick: () => void
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all',
        selected
          ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
          : 'text-slate-500 hover:text-slate-700',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  )
}

function Chip({
  selected, onClick, children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all',
        selected
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
      )}
    >
      {children}
    </button>
  )
}
