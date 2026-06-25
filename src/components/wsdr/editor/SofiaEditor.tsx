import { useMemo, useState, type ComponentType } from 'react'
import {
  User, MessageSquare, Wallet, Zap, ShieldAlert, Eye, Loader2, CheckCircle, AlertCircle,
  Smile, Languages, Sparkles, Target, Coins, Info, ListOrdered, Search, Gauge,
  AlertTriangle, RotateCcw, Power, Code, ChevronDown, Phone, Eraser, Copy, Check,
} from 'lucide-react'
import { PricingEditor } from '@/components/wsdr/editor/PricingEditor'
import { MomentsEditor } from '@/components/wsdr/editor/MomentsEditor'
import { PhasesEditor } from '@/components/wsdr/editor/PhasesEditor'
import { ScoringEditor } from '@/components/wsdr/editor/ScoringEditor'
import { OpeningEditor } from '@/components/wsdr/editor/OpeningEditor'
import { OpeningStepsEditor } from '@/components/wsdr/editor/OpeningStepsEditor'
import { BoundariesEditor } from '@/components/wsdr/editor/BoundariesEditor'
import { ClosersPicker } from '@/components/wsdr/editor/WeddingPlannerPicker'
import { CrmFieldsPicker } from '@/components/wsdr/editor/CrmFieldsPicker'
import { DaysField } from '@/components/wsdr/editor/DaysField'
import { StagePicker } from '@/components/wsdr/editor/StagePicker'
import { StringListEditor } from '@/components/wsdr/StringListEditor'
import { CapabilityCard } from '@/components/wsdr/editor/CapabilityCard'
import { KnowledgeFaqEditor } from '@/components/wsdr/editor/KnowledgeFaqEditor'
import { WhoCanTalkEditor, ResetConversationEditor } from '@/components/wsdr/editor/SofiaAccessEditor'
import { EditorCard, EditorSectionGroup, Field, InfoBanner } from '@/components/wsdr/editor/ui/primitives'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  type SofiaConfigV2, type SofiaCapabilities, type Tom, type CapabilityKey, type AberturaMode,
  TOM_OPTIONS, CAPABILITY_META, humanPromptPreview, computeSofiaWarnings, defaultSofiaConfig,
} from '@/components/wsdr/sofiaConfig'
import {
  type PromptSegment, assembleSofiaPromptParts, promptPartsToText,
} from '@/components/wsdr/sofiaPromptStructured'
import { useSofiaConfig } from '@/hooks/wsdr/useSofiaConfig'

// Helper tipado: liga/desliga uma capacidade sem brigar com a união de tipos.
function setCapEnabled(x: SofiaConfigV2, key: CapabilityKey, enabled: boolean): SofiaConfigV2 {
  return {
    ...x,
    capabilities: {
      ...x.capabilities,
      [key]: { ...(x.capabilities[key] as Record<string, unknown>), enabled },
    } as SofiaCapabilities,
  }
}

// Temas da lista (acordeão) — substituem as 7 abas planas. Cada tema reúne 1+ blocos
// de conteúdo existentes (ver THEME_TABS) e abre inline (pra baixo) na própria linha.
type ThemeKey = 'identidade' | 'conversa' | 'negocio' | 'capacidades' | 'guardrails' | 'avancado'
type ThemeAccent = 'gold' | 'rosewood' | 'olive' | 'blush' | 'clay'
interface ThemeDef {
  key: ThemeKey; title: string; subtitle: string
  icon: ComponentType<{ className?: string }>; accent: ThemeAccent
}

const THEMES: ThemeDef[] = [
  { key: 'identidade', title: 'Identidade', subtitle: 'Quem é a Sofia, tom de voz e glossário', icon: User, accent: 'gold' },
  { key: 'conversa', title: 'Conversa & fluxo', subtitle: 'Abertura, roteiro e momentos', icon: MessageSquare, accent: 'rosewood' },
  { key: 'negocio', title: 'Qualificação & preço', subtitle: 'Pontuação, sinais e valores', icon: Gauge, accent: 'olive' },
  { key: 'capacidades', title: 'O que ela faz', subtitle: 'CRM, agenda, memória, handoff…', icon: Zap, accent: 'blush' },
  { key: 'guardrails', title: 'Pode & não pode', subtitle: 'Limites e concorrentes a evitar', icon: ShieldAlert, accent: 'clay' },
]
const ADVANCED_THEME: ThemeDef = { key: 'avancado', title: 'Configurações avançadas', subtitle: 'Ligar/desligar, prompt técnico, restaurar', icon: Eye, accent: 'gold' }

// Tema → blocos de conteúdo existentes (ids das antigas abas)
const THEME_TABS: Record<ThemeKey, string[]> = {
  identidade: ['quem'], conversa: ['conversa'], negocio: ['pontuacao', 'preco'],
  capacidades: ['faz'], guardrails: ['regras'], avancado: ['avancado'],
}
// Acento de marca por tema (5 tons quentes distintos — não cinza-genérico)
const THEME_ACCENT: Record<ThemeAccent, { bg: string; text: string }> = {
  gold: { bg: 'bg-ww-gold-soft', text: 'text-ww-gold-ink' },
  rosewood: { bg: 'bg-ww-rosewood-soft', text: 'text-ww-rosewood' },
  olive: { bg: 'bg-ww-olive-soft', text: 'text-ww-olive-ink' },
  blush: { bg: 'bg-ww-blush/20', text: 'text-ww-rosewood' },
  clay: { bg: 'bg-ww-error/10', text: 'text-ww-error' },
}
const REVEAL_LABEL: Record<string, string> = {
  always: 'revela sempre', on_question: 'quando perguntam',
  on_hesitation: 'quando hesitam', hand_to_planner: 'passa pra planner',
}

// Reestiliza os átomos (input/textarea de texto) SÓ no escopo da Sofia — sem tocar
// os componentes globais, e sem afetar range/checkbox. Atomos antes: h-8 text-xs slate.
const FIELD_SKIN = [
  '[&_input:not([type=range]):not([type=checkbox])]:h-9',
  '[&_input:not([type=range]):not([type=checkbox])]:text-sm',
  '[&_input:not([type=range]):not([type=checkbox])]:px-3',
  '[&_input:not([type=range]):not([type=checkbox])]:rounded-lg',
  '[&_input:not([type=range]):not([type=checkbox])]:border-ww-sand',
  '[&_textarea]:text-sm',
  '[&_textarea]:rounded-lg',
  '[&_textarea]:border-ww-sand',
].join(' ')

// Destaque por origem do trecho do prompt: campo (suas configs) vs preenchido na conversa.
const SEG_STYLE: Record<'field' | 'runtime', string> = {
  field: 'bg-ww-gold-soft text-ww-gold-ink rounded px-1 py-0.5 cursor-help',
  runtime: 'bg-ww-olive-soft text-ww-olive-ink rounded px-1 py-0.5 cursor-help',
}

function PromptLegend() {
  const items = [
    { cls: 'bg-ww-gold-soft text-ww-gold-ink', label: 'vem das suas configurações' },
    { cls: 'bg-ww-olive-soft text-ww-olive-ink', label: 'preenchido na conversa' },
    { cls: 'bg-ww-cream border border-ww-sand', label: 'fixo (inteligência da Sofia)' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map(it => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-ww-n600">
          <span className={cn('inline-block w-3 h-3 rounded-sm', it.cls)} />{it.label}
        </span>
      ))}
    </div>
  )
}

// Um dos dois textos reais (System ou User), com cada trecho colorido pela origem.
// Passar o mouse num trecho destacado mostra de qual ajuste da tela ele veio.
function PromptBlock({ title, desc, segments }: { title: string; desc: string; segments: PromptSegment[] }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ww-n700">{title}</span>
        <span className="text-[11px] text-ww-n400">{desc}</span>
      </div>
      <pre className="bg-ww-cream/60 border border-ww-sand rounded-lg p-4 text-xs text-ww-n700 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
        {segments.map((s, i) => s.kind === 'fixed'
          ? <span key={i}>{s.text}</span>
          : <span key={i} className={SEG_STYLE[s.kind]} title={s.label}>{s.text}</span>)}
      </pre>
    </div>
  )
}

export function SofiaEditor({ slug = 'sofia-weddings' }: { slug?: string }) {
  const { config, setConfig, loading, status, error, save } = useSofiaConfig(slug)
  const [activeTheme, setActiveTheme] = useState<ThemeKey | null>(null)
  const [dirty, setDirty] = useState(false)
  const [dirtyThemes, setDirtyThemes] = useState<Set<ThemeKey>>(() => new Set())

  // Qual bloco de conteúdo renderiza: só os do tema aberto.
  const isOpen = (id: string) => !!activeTheme && THEME_TABS[activeTheme].includes(id)

  const update = (fn: (c: SofiaConfigV2) => SofiaConfigV2) => {
    setConfig(prev => (prev ? fn(prev) : prev))
    setDirty(true)
    if (activeTheme) setDirtyThemes(s => { const n = new Set(s); n.add(activeTheme); return n })
  }

  const handleSave = async (cfg: SofiaConfigV2) => {
    const ok = await save(cfg)
    if (ok) { setDirty(false); setDirtyThemes(new Set()) }
  }

  const preview = useMemo(() => (config ? humanPromptPreview(config) : ''), [config])
  const promptParts = useMemo(() => (config ? assembleSofiaPromptParts(config) : null), [config])
  const warnings = useMemo(() => (config ? computeSofiaWarnings(config) : []), [config])
  const [showCru, setShowCru] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyPrompt = async () => {
    if (!promptParts) return
    try {
      await navigator.clipboard.writeText(promptPartsToText(promptParts))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard indisponível, ignora */ }
  }

  // Restaurar uma parte ao recomendado (rede de segurança do controle total).
  const restore = (key: keyof SofiaConfigV2) => {
    if (!confirm('Restaurar esta parte ao recomendado? Suas mudanças nela serão perdidas.')) return
    const def = defaultSofiaConfig()
    update(x => ({ ...x, [key]: def[key] }))
  }

  if (loading || !config) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-64 bg-slate-100 rounded animate-pulse" />
        <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  const c = config

  // capacidades separadas por status: prontas/em testes vs em breve (honestidade — nada finge)
  const capDisponiveis = CAPABILITY_META.filter(m => m.status !== 'em_breve')
  const capEmBreve = CAPABILITY_META.filter(m => m.status === 'em_breve')

  // Primeira mensagem da Sofia, pra prévia da persona.
  // Honestidade (F6): o preview reflete o MODO que roda de verdade, não sempre o texto literal.
  const openingMode = c.voice.abertura_mode ?? 'directive'
  const openingPreview = c.voice.opening_stepped
    ? (c.voice.opening_steps?.[0]?.fala ?? '')
    : openingMode === 'free'
      ? 'A Sofia compõe a abertura na hora (modo livre) — o texto abaixo NÃO é enviado.'
      : openingMode === 'directive'
        ? `Diretriz: ${c.voice.abertura ?? ''}`
        : (c.voice.abertura ?? '')

  // Completude por tema (selo X/Y na linha) — orienta onde falta trabalho.
  const themeCompleteness = (key: ThemeKey): { done: number; total: number } => {
    switch (key) {
      case 'identidade': {
        const f = [c.identity.persona_nome, c.identity.empresa, c.identity.proposta, c.identity.role || c.identity.mission_one_liner]
        return { done: f.filter(Boolean).length, total: 4 }
      }
      case 'conversa': {
        const aberturaOk = c.voice.opening_stepped ? (c.voice.opening_steps?.length ?? 0) > 0 : !!c.voice.abertura
        const f = [aberturaOk, (c.phases?.length ?? 0) > 0, (c.moments?.length ?? 0) > 0]
        return { done: f.filter(Boolean).length, total: 3 }
      }
      case 'negocio': {
        const f = [
          (c.qualification.criteria?.length ?? 0) > 0,
          c.qualification.threshold != null,
          c.pricing.mention_fee || (c.pricing.destination_ranges?.length ?? 0) > 0,
          (c.qualification.faixas_orcamento?.length ?? 0) > 0,
        ]
        return { done: f.filter(Boolean).length, total: 4 }
      }
      case 'capacidades':
        return { done: capDisponiveis.filter(m => c.capabilities[m.key].enabled).length, total: capDisponiveis.length }
      case 'guardrails': {
        const f = [
          Object.values(c.boundaries.curadas ?? {}).some(Boolean),
          (c.boundaries.comportamentos?.length ?? 0) > 0,
          (c.boundaries.custom?.length ?? 0) > 0,
        ]
        return { done: f.filter(Boolean).length, total: 3 }
      }
      default: return { done: 0, total: 0 }
    }
  }

  // Prévia de 2-3 dados por tema (entender sem abrir).
  const themePreview = (key: ThemeKey): string[] => {
    switch (key) {
      case 'identidade':
        return [`${c.identity.persona_nome || '—'} · ${c.identity.empresa || '—'}`, `Tom: ${TOM_OPTIONS.find(t => t.value === c.voice.tom)?.label ?? c.voice.tom}`]
      case 'conversa':
        return [`Abertura: ${c.voice.opening_stepped ? 'em passos' : openingMode === 'free' ? 'livre (ela compõe)' : openingMode === 'literal' ? 'mensagem exata' : 'por diretriz'}`, `${c.phases?.length ?? 0} fases · ${c.moments?.length ?? 0} momentos`]
      case 'negocio':
        return [`Nota mínima ${c.qualification.threshold ?? '—'}/100`, `${c.qualification.criteria?.length ?? 0} critérios · ${c.qualification.faixas_orcamento?.length ?? 0} faixas`, `Preço: ${REVEAL_LABEL[c.pricing.reveal_strategy] ?? '—'}`]
      case 'capacidades': {
        const on = capDisponiveis.filter(m => c.capabilities[m.key].enabled)
        const names = on.slice(0, 3).map(m => m.title).join(' · ')
        return [on.length ? names + (on.length > 3 ? ` +${on.length - 3}` : '') : 'Nenhuma capacidade ligada']
      }
      case 'guardrails':
        return [`${Object.values(c.boundaries.curadas ?? {}).filter(Boolean).length} regras ativas · ${c.boundaries.custom?.length ?? 0} extras`, `${c.boundaries.competitors_to_avoid?.length ?? 0} concorrentes a evitar`]
      default: return []
    }
  }

  const renderCap = (meta: typeof CAPABILITY_META[number]) => {
    const cap = c.capabilities[meta.key]
    return (
      <CapabilityCard key={meta.key} icon={meta.icon} color={meta.color} title={meta.title} subtitle={meta.subtitle}
        description={meta.description} status={meta.status} enabled={cap.enabled}
        onToggle={v => update(x => setCapEnabled(x, meta.key, v))}>
        {meta.key === 'crm_write' && (
          <div className="space-y-3">
            <Field label="Campos que ela preenche no CRM" hint="Conforme o casal vai contando, a Sofia guarda essas informações no card. Marque só o que ela pode preencher.">
              <CrmFieldsPicker value={c.capabilities.crm_write.writable_fields} onChange={keys => update(x => ({ ...x, capabilities: { ...x.capabilities, crm_write: { ...x.capabilities.crm_write, writable_fields: keys } } }))} />
            </Field>
            <label className="flex items-center justify-between text-sm text-ww-n700 pt-1 border-t border-ww-sand">
              <span>Mover o card de etapa automaticamente</span>
              <Switch checked={c.capabilities.crm_write.stage_move_enabled} onCheckedChange={v => update(x => ({ ...x, capabilities: { ...x.capabilities, crm_write: { ...x.capabilities.crm_write, stage_move_enabled: v } } }))} className={c.capabilities.crm_write.stage_move_enabled ? 'bg-ww-gold' : ''} />
            </label>
            {c.capabilities.crm_write.stage_move_enabled && (
              <StagePicker
                value={c.capabilities.crm_write.target_stage_id}
                onChange={id => update(x => ({ ...x, capabilities: { ...x.capabilities, crm_write: { ...x.capabilities.crm_write, target_stage_id: id } } }))}
              />
            )}
          </div>
        )}
        {meta.key === 'calendar' && (() => {
          const cal = c.capabilities.calendar
          const updCal = (patch: Partial<typeof cal>) => update(x => ({ ...x, capabilities: { ...x.capabilities, calendar: { ...x.capabilities.calendar, ...patch } } }))
          const win = cal.windows?.[0] || { dias: [1, 2, 3, 4, 5], inicio: '10:00', fim: '17:00' }
          const updWin = (p: Partial<typeof win>) => updCal({ windows: [{ ...win, ...p }] })
          return (
            <div className="space-y-3">
              <ClosersPicker value={cal.closer_ids ?? []} onChange={ids => updCal({ closer_ids: ids })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Horário de início" hint="dias úteis"><Input value={win.inicio} onChange={e => updWin({ inicio: e.target.value })} placeholder="10:00" /></Field>
                <Field label="Horário de fim"><Input value={win.fim} onChange={e => updWin({ fim: e.target.value })} placeholder="17:00" /></Field>
                <Field label="Duração da reunião (min)"><Input type="number" value={cal.slot_duration_minutes} onChange={e => updCal({ slot_duration_minutes: Number(e.target.value) })} /></Field>
                <Field label="Intervalo (min)" hint="ex: 30 → 14h, 14h30"><Input type="number" value={cal.slot_interval_minutes ?? 30} onChange={e => updCal({ slot_interval_minutes: Number(e.target.value) })} /></Field>
                <Field label="Horários por dia (máx)"><Input type="number" value={cal.slots_per_day ?? 6} onChange={e => updCal({ slots_per_day: Number(e.target.value) })} /></Field>
                <Field label="Antecedência mínima (h)" hint="1 = pode hoje, ≥ agora+1h"><Input type="number" value={cal.min_lead_hours ?? 1} onChange={e => updCal({ min_lead_hours: Number(e.target.value) })} /></Field>
                <Field label="Dias à frente (máx)"><Input type="number" value={cal.search_window_days} onChange={e => updCal({ search_window_days: Number(e.target.value) })} /></Field>
                <Field label="Total de horários a oferecer"><Input type="number" value={cal.max_slots} onChange={e => updCal({ max_slots: Number(e.target.value) })} /></Field>
              </div>
              <label className="flex items-center justify-between text-sm text-ww-n700"><span>Pular fins de semana</span><Switch checked={cal.skip_weekends} onCheckedChange={v => updCal({ skip_weekends: v })} className={cal.skip_weekends ? 'bg-ww-gold' : ''} /></label>
            </div>
          )
        })()}
        {meta.key === 'multimodal' && (
          <div className="space-y-2">
            {(['audio', 'image', 'pdf'] as const).map(k => (
              <label key={k} className="flex items-center justify-between text-sm text-ww-n700">
                <span>{k === 'audio' ? 'Ouvir áudios' : k === 'image' ? 'Entender fotos' : 'Ler PDFs'}</span>
                <Switch checked={c.capabilities.multimodal[k]} onCheckedChange={v => update(x => ({ ...x, capabilities: { ...x.capabilities, multimodal: { ...x.capabilities.multimodal, [k]: v } } }))} className={c.capabilities.multimodal[k] ? 'bg-ww-gold' : ''} />
              </label>
            ))}
          </div>
        )}
        {meta.key === 'memory' && (
          <div className="space-y-3">
            <label className="flex items-center justify-between text-sm text-ww-n700"><span>Responder em bolhas (mais humano)</span><Switch checked={c.capabilities.memory.bubbles_enabled} onCheckedChange={v => update(x => ({ ...x, capabilities: { ...x.capabilities, memory: { ...x.capabilities.memory, bubbles_enabled: v } } }))} className={c.capabilities.memory.bubbles_enabled ? 'bg-ww-gold' : ''} /></label>
            <Field label="Quantas mensagens lembrar"><Input type="number" value={c.capabilities.memory.window_messages} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, memory: { ...x.capabilities.memory, window_messages: Number(e.target.value) } } }))} /></Field>
            <Field label="Tempo de espera por novas mensagens (segundos)" hint="Quanto ela espera pra ver se o casal manda mais mensagens antes de responder. Ajuste se o comportamento sair diferente do esperado.">
              <Input type="number" value={Math.round((c.capabilities.memory.debounce_ms ?? 8000) / 1000)} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, memory: { ...x.capabilities.memory, debounce_ms: Math.max(1, Number(e.target.value)) * 1000 } } }))} />
            </Field>
            <Field label="Pausa entre as bolhas (segundos)" hint="O tempinho natural entre uma bolha e outra.">
              <Input type="number" step={0.5} value={(c.capabilities.memory.bubble_delay_ms ?? 1500) / 1000} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, memory: { ...x.capabilities.memory, bubble_delay_ms: Math.max(0, Number(e.target.value)) * 1000 } } }))} />
            </Field>
          </div>
        )}
        {meta.key === 'followup' && (
          <div className="space-y-3">
            <Field label="Quando retomar" hint="Depois de quantos dias sem resposta a Sofia tenta de novo. Pode ser mais de um momento.">
              <DaysField value={c.capabilities.followup.days ?? []} onChange={days => update(x => ({ ...x, capabilities: { ...x.capabilities, followup: { ...x.capabilities.followup, days } } }))} />
            </Field>
            <Field label="Horário padrão da retomada"><Input value={c.capabilities.followup.default_time} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, followup: { ...x.capabilities.followup, default_time: e.target.value } } }))} placeholder="ex: 10:30" /></Field>
          </div>
        )}
        {meta.key === 'knowledge' && (
          <KnowledgeFaqEditor agentSlug={slug} />
        )}
        {meta.key === 'handoff' && (
          <div className="space-y-3">
            <Field label="Quando passar pra um humano" hint="As situações em que a Sofia para de insistir e chama uma pessoa. Edite, adicione ou remova.">
              <StringListEditor items={c.capabilities.handoff.situations} onChange={items => update(x => ({ ...x, capabilities: { ...x.capabilities, handoff: { ...x.capabilities.handoff, situations: items } } }))} placeholder="ex: o casal pede pra falar com uma pessoa" />
            </Field>
            <Field label="O que ela diz ao passar" hint="Uma frase humana, sem prometer prazo.">
              <Input value={c.capabilities.handoff.transition_message} onChange={e => update(x => ({ ...x, capabilities: { ...x.capabilities, handoff: { ...x.capabilities.handoff, transition_message: e.target.value } } }))} />
            </Field>
            <Field label="Mover o card pra qual etapa ao passar (opcional)">
              <StagePicker value={c.capabilities.handoff.target_stage_id} onChange={id => update(x => ({ ...x, capabilities: { ...x.capabilities, handoff: { ...x.capabilities.handoff, target_stage_id: id } } }))} />
            </Field>
          </div>
        )}
      </CapabilityCard>
    )
  }

  // Conteúdo da seção aberta — reusa os blocos existentes; só os do tema ativo aparecem.
  const renderThemeBlocks = () => (
    <>
      {isOpen('quem') && (
        <>
          <EditorCard accent="indigo" icon={<User className="w-5 h-5" />} title="Nome & marca"
            desc="O nome da Sofia, a marca e como ela descreve a empresa durante a conversa.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nome da persona">
                <Input value={c.identity.persona_nome} onChange={e => update(x => ({ ...x, identity: { ...x.identity, persona_nome: e.target.value } }))} placeholder="ex: Sofia" />
              </Field>
              <Field label="Empresa / marca">
                <Input value={c.identity.empresa} onChange={e => update(x => ({ ...x, identity: { ...x.identity, empresa: e.target.value } }))} placeholder="ex: Welcome Weddings" />
              </Field>
            </div>
            <Field label="Descrição da empresa" hint="A frase que a Sofia usa pra se apresentar e explicar o que vocês fazem. (A primeira mensagem fica na aba 'Como ela conversa'.)">
              <Textarea value={c.identity.proposta} onChange={e => update(x => ({ ...x, identity: { ...x.identity, proposta: e.target.value } }))} className="min-h-[80px]" />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Papel dela" hint="Como ela se apresenta na função. Já vem escrito; edite se quiser.">
                <Input value={c.identity.role ?? ''} onChange={e => update(x => ({ ...x, identity: { ...x.identity, role: e.target.value } }))} placeholder="ex: especialista de casamentos" />
              </Field>
              <Field label="Missão em uma frase" hint="O que ela existe pra fazer. Opcional — ajuda a guiar o tom.">
                <Input value={c.identity.mission_one_liner ?? ''} onChange={e => update(x => ({ ...x, identity: { ...x.identity, mission_one_liner: e.target.value } }))} placeholder="ex: entender o sonho do casal e conectar com a Wedding Planner" />
              </Field>
            </div>
          </EditorCard>

          <EditorCard accent="violet" icon={<Smile className="w-5 h-5" />} title="Tom de voz" desc="O jeito da Sofia falar com os noivos.">
            <div className="flex flex-wrap gap-2">
              {TOM_OPTIONS.map(opt => {
                const active = c.voice.tom === opt.value
                return (
                  <button key={opt.value} type="button"
                    onClick={() => update(x => ({ ...x, voice: { ...x.voice, tom: opt.value as Tom } }))}
                    className={cn('px-3 py-2 rounded-lg border text-sm transition-all duration-150 active:scale-[0.97]', active ? 'bg-ww-gold text-white border-ww-gold shadow-sm' : 'bg-white text-ww-n700 border-ww-sand hover:border-ww-gold/50')}>
                    <span className="mr-1">{opt.emoji}</span>{opt.label}
                  </button>
                )
              })}
            </div>
            <Field label={`Formalidade: ${c.voice.formalidade < 0.34 ? 'bem casual' : c.voice.formalidade > 0.66 ? 'mais formal' : 'natural'}`} hint="Da esquerda (casual, gírias leves) à direita (formal, sóbrio).">
              <input type="range" min={0} max={1} step={0.1} value={c.voice.formalidade}
                onChange={e => update(x => ({ ...x, voice: { ...x.voice, formalidade: Number(e.target.value) } }))}
                className="w-full accent-ww-gold" />
            </Field>
            <InfoBanner icon={<Info className="w-4 h-4" />}>Exemplo neste tom: <span className="italic text-ww-n700">"{TOM_OPTIONS.find(t => t.value === c.voice.tom)?.exemplo}"</span></InfoBanner>
            <Field label="Temperos de tom" hint="Adjetivos que afinam a voz dela. Escreva os seus (ex: elegante, paciente, direta).">
              <StringListEditor items={c.voice.tone_tags ?? []} onChange={items => update(x => ({ ...x, voice: { ...x.voice, tone_tags: items } }))} placeholder="ex: elegante" />
            </Field>
          </EditorCard>

          <EditorCard accent="violet" icon={<Languages className="w-5 h-5" />} title="Glossário de voz" desc="Palavras que a Sofia deve usar e palavras que deve evitar.">
            <Field label="Palavras a USAR" hint="Ex: noivos, vocês, a gente.">
              <StringListEditor items={c.voice.glossary.marca} onChange={items => update(x => ({ ...x, voice: { ...x.voice, glossary: { ...x.voice.glossary, marca: items } } }))} placeholder="ex: noivos" />
            </Field>
            <Field label="Palavras/expressões a EVITAR" hint="Ex: parceiro, experiência inesquecível, premium.">
              <StringListEditor items={c.voice.glossary.proibida} onChange={items => update(x => ({ ...x, voice: { ...x.voice, glossary: { ...x.voice.glossary, proibida: items } } }))} placeholder="ex: parceiro" />
            </Field>
            <Field label="Regras de tom" hint="Jeitos de falar que ela sempre segue. Já vêm algumas; edite, adicione ou remova.">
              <StringListEditor items={c.voice.rules ?? []} onChange={items => update(x => ({ ...x, voice: { ...x.voice, rules: items } }))} placeholder='ex: use "a gente", nunca "nós"' />
            </Field>
            <Field label="Frases típicas dela" hint="Frases que ela costuma usar, pra calibrar o jeito. Opcional.">
              <StringListEditor items={c.voice.typical_phrases ?? []} onChange={items => update(x => ({ ...x, voice: { ...x.voice, typical_phrases: items } }))} placeholder="ex: que bom que vocês chamaram a gente" />
            </Field>
          </EditorCard>
        </>
      )}

      {isOpen('conversa') && (
        <>
          <EditorCard accent="sky" icon={<MessageSquare className="w-5 h-5" />} title="Mensagem de abertura"
            desc="A primeira coisa que a Sofia diz. Pode ser em PASSOS (ela pausa e espera a resposta, captura o que você definir) ou uma mensagem só.">
            <label className="flex items-center justify-between text-sm text-ww-n700 mb-3 pb-3 border-b border-ww-sand">
              <span>Abertura em passos <span className="text-xs text-ww-n400">(pausa e espera a resposta a cada passo)</span></span>
              <Switch checked={c.voice.opening_stepped ?? false} onCheckedChange={v => update(x => ({ ...x, voice: { ...x.voice, opening_stepped: v } }))} className={(c.voice.opening_stepped ?? false) ? 'bg-ww-gold' : ''} />
            </label>
            {(c.voice.opening_stepped ?? false) ? (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">No modo passos, a Sofia segue os passos abaixo. O texto e os modos de mensagem única ficam de fora.</p>
            ) : openingMode === 'free' ? (
              <p className="text-[11px] text-ww-n600 bg-ww-sand/40 border border-ww-sand rounded-lg px-3 py-2 mb-3">No modo livre, a Sofia compõe a abertura sozinha. O texto escrito abaixo não é enviado, serve só de referência.</p>
            ) : null}
            {(c.voice.opening_stepped ?? false) ? (
              <OpeningStepsEditor steps={c.voice.opening_steps ?? []} onChange={steps => update(x => ({ ...x, voice: { ...x.voice, opening_steps: steps } }))} />
            ) : (
              <OpeningEditor
                mode={c.voice.abertura_mode ?? 'directive'}
                abertura={c.voice.abertura}
                onChange={patch => update(x => ({ ...x, voice: { ...x.voice, ...patch as { abertura_mode?: AberturaMode; abertura?: string } } }))}
              />
            )}
          </EditorCard>
          <EditorCard accent="sky" icon={<MessageSquare className="w-5 h-5" />} title="Como ela reage ao que o casal diz"
            desc="Quando e como a Sofia reage ao que o casal escreve. Use pra ela reagir só ao que tem peso e NÃO comentar trivialidades (ex: 'que bom que veio do site').">
            <Textarea
              value={c.voice.reaction ?? ''}
              onChange={e => update(x => ({ ...x, voice: { ...x.voice, reaction: e.target.value } }))}
              className="min-h-[100px]"
              placeholder="Ex: Reaja ao que o casal disse quando tiver peso (uma pergunta, um sonho, uma dor). Não comente trivialidades nem repita o óbvio."
            />
          </EditorCard>
          <EditorCard accent="sky" icon={<ListOrdered className="w-5 h-5" />} title="Roteiro da conversa"
            desc="A ORDEM que a Sofia conduz (apresentar → sondar → qualificar → convidar). Em cada etapa você explica o que ela faz e o ritmo. Arraste pra reordenar.">
            <PhasesEditor phases={c.phases} onChange={items => update(x => ({ ...x, phases: items }))} />
          </EditorCard>
          <InfoBanner icon={<Search className="w-4 h-4" />}>
            O que a Sofia descobre (e como pergunta) agora mora junto da nota, na aba <strong>Qualificação</strong> — cada critério traz o alvo + a pergunta.
          </InfoBanner>
          <EditorCard accent="sky" icon={<Sparkles className="w-5 h-5" />} title="Momentos da conversa"
            desc="Reações que valem em QUALQUER fase (ex: quando perguntam preço, quando citam a família).">
            <MomentsEditor moments={c.moments} onChange={items => update(x => ({ ...x, moments: items }))} />
          </EditorCard>
        </>
      )}

      {isOpen('pontuacao') && (
        <>
          <EditorCard accent="indigo" icon={<Target className="w-5 h-5" />} title="Pontuação do casal"
            desc="Como a Sofia decide se o casal qualifica: pontos por critério, nota mínima e faixas. Ela usa isto como guia do julgamento, uma coisa de cada vez.">
            <ScoringEditor qual={c.qualification} onChange={q => update(x => ({ ...x, qualification: q }))} />
          </EditorCard>
          <EditorCard accent="indigo" icon={<Target className="w-5 h-5" />} title="Quando ela convida pra Wedding Planner"
            desc="As condições pra Sofia fazer o convite. Por padrão usa a SUA pontuação acima (uma qualificação só): nome + casal qualificado + sinal de vontade/data. Edite do seu jeito.">
            <Textarea
              value={c.qualification.invite_gates ?? ''}
              onChange={e => update(x => ({ ...x, qualification: { ...x.qualification, invite_gates: e.target.value } }))}
              className="min-h-[120px]"
              placeholder="Ex: Só convide quando souber o nome, o casal estiver qualificado e houver sinal de vontade/data."
            />
          </EditorCard>
          <EditorCard accent="violet" icon={<Eye className="w-5 h-5" />} title="Sinais que ela percebe sozinha"
            desc="Coisas que a Sofia capta no que o casal diz, sem precisar perguntar (ex: a família está ajudando a decidir, hesitação por valor). Ela leva isso em conta no julgamento e na hora de conduzir.">
            <StringListEditor items={c.qualification.silent_signals ?? []} onChange={items => update(x => ({ ...x, qualification: { ...x.qualification, silent_signals: items } }))} placeholder="ex: a família está ajudando a decidir" />
          </EditorCard>
        </>
      )}

      {isOpen('preco') && (
        <>
          <EditorCard accent="emerald" icon={<Wallet className="w-5 h-5" />} title="Preço e valores"
            desc="A Sofia pode falar de valor (assessoria + faixas por destino) e nunca negocia. Você decide quando e como ela revela.">
            <PricingEditor pricing={c.pricing} onChange={p => update(x => ({ ...x, pricing: p }))} />
          </EditorCard>
          <EditorCard accent="emerald" icon={<Coins className="w-5 h-5" />} title="Orçamento do casal"
            desc="Faixas que a Sofia oferece pro casal escolher quando ele não quer dizer um número. Isto é o orçamento DELES, não quanto a gente cobra.">
            <StringListEditor items={c.qualification.faixas_orcamento} onChange={items => update(x => ({ ...x, qualification: { ...x.qualification, faixas_orcamento: items } }))} placeholder="ex: R$ 80 a 150 mil" />
          </EditorCard>
        </>
      )}

      {isOpen('faz') && (
        <>
          <InfoBanner icon={<Info className="w-4 h-4" />}>
            Ligue as capacidades que a Sofia pode usar. Quando desligadas, ela só conversa.
          </InfoBanner>
          <div className="space-y-3">{capDisponiveis.map(renderCap)}</div>
          {capEmBreve.length > 0 && (
            <EditorSectionGroup label="Em breve" count={capEmBreve.length} defaultOpen={false}>
              <p className="text-xs text-ww-n400 -mt-1 mb-1">Você já deixa configurado; entram no ar quando a fiação ficar pronta.</p>
              {capEmBreve.map(renderCap)}
            </EditorSectionGroup>
          )}
        </>
      )}

      {isOpen('regras') && (
        <>
          <EditorCard accent="rose" icon={<ShieldAlert className="w-5 h-5" />} title="O que a Sofia pode e não pode fazer"
            desc="Tudo é editável (controle total). As regras que protegem a qualidade mostram um aviso ao desligar, mas a decisão é sua."
            aside={<button type="button" onClick={() => restore('boundaries')} className="flex items-center gap-1 text-xs text-ww-n400 hover:text-ww-gold-ink shrink-0"><RotateCcw className="w-3.5 h-3.5" />Restaurar recomendado</button>}>
            <BoundariesEditor boundaries={c.boundaries} onChange={b => update(x => ({ ...x, boundaries: b }))} />
          </EditorCard>
          <EditorCard accent="rose" icon={<ShieldAlert className="w-5 h-5" />} title="Concorrentes a não citar"
            desc="Nomes que a Sofia nunca deve mencionar ou recomendar. Deixe vazio se não houver.">
            <StringListEditor items={c.boundaries.competitors_to_avoid ?? []} onChange={items => update(x => ({ ...x, boundaries: { ...x.boundaries, competitors_to_avoid: items } }))} placeholder="ex: nome de uma produtora concorrente" />
          </EditorCard>
        </>
      )}

      {isOpen('avancado') && (
        <>
          <EditorCard accent="slate" icon={<Power className="w-5 h-5" />} title="Ligar / desligar a Sofia"
            desc="Quando desligada, a Sofia não responde (mesmo recebendo mensagem). Quem ela responde é controlado na lista de números abaixo.">
            <label className="flex items-center justify-between text-sm text-ww-n700">
              <span>{(c.ativa ?? true) ? 'Sofia ligada' : 'Sofia desligada'}</span>
              <Switch checked={c.ativa ?? true} onCheckedChange={v => update(x => ({ ...x, ativa: v }))} className={(c.ativa ?? true) ? 'bg-emerald-600' : ''} />
            </label>
          </EditorCard>

          <EditorCard accent="slate" icon={<Phone className="w-5 h-5" />} title="Quem pode falar com a Sofia"
            desc="A Sofia só responde os números desta lista — qualquer outro é ignorado, sem erro. Comece adicionando o seu pra testar; deixe vazio pra ela não falar com ninguém.">
            <WhoCanTalkEditor slug={slug} />
          </EditorCard>

          <EditorCard accent="slate" icon={<Eye className="w-5 h-5" />} title="O que a Sofia entende"
            desc="Como a Sofia se comporta com as configurações atuais. Em resumo simples, ou no prompt técnico real (System e User Prompt) com cada trecho marcado pela origem. Atualiza ao vivo."
            aside={
              <div className="flex items-center gap-3 shrink-0">
                {showCru && promptParts && (
                  <button type="button" onClick={copyPrompt} className="flex items-center gap-1 text-xs text-ww-n400 hover:text-ww-gold-ink">
                    {copied ? <Check className="w-3.5 h-3.5 text-ww-olive-ink" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copiado' : 'Copiar'}
                  </button>
                )}
                <button type="button" onClick={() => setShowCru(s => !s)} className="flex items-center gap-1 text-xs text-ww-n400 hover:text-ww-gold-ink">
                  <Code className="w-3.5 h-3.5" />{showCru ? 'Ver resumo simples' : 'Ver prompt técnico'}
                </button>
              </div>
            }>
            {showCru && promptParts ? (
              <div className="space-y-4">
                <p className="text-[11px] text-ww-n400">
                  Estes são os dois textos que a Sofia recebe de verdade, montados com as suas configurações. O que está destacado <strong className="text-ww-gold-ink">vem dos seus ajustes</strong>; o resto é fixo (o raciocínio dela) ou preenchido na hora da conversa.
                </p>
                <PromptLegend />
                <PromptBlock title="System Prompt" desc="quem ela é e como pensa (vale a conversa toda)" segments={promptParts.system} />
                <PromptBlock title="User Prompt" desc="o que ela recebe a cada nova mensagem do casal" segments={promptParts.user} />
              </div>
            ) : (
              <pre className="bg-ww-cream/60 border border-ww-sand rounded-lg p-4 text-xs text-ww-n700 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">{preview}</pre>
            )}
          </EditorCard>

          <EditorCard accent="slate" icon={<Eraser className="w-5 h-5" />} title="Zerar conversa pra começar do zero"
            desc="Faz a Sofia esquecer TUDO de um número pra refazer um teste limpo: a conversa, o histórico de mensagens e os dados que ela guardou no card — como se nunca tivesse falado com a pessoa. Dica: dá pra zerar pelo próprio WhatsApp mandando “/reset”.">
            <ResetConversationEditor slug={slug} />
          </EditorCard>

          <EditorCard accent="slate" icon={<RotateCcw className="w-5 h-5" />} title="Restaurar tudo ao recomendado"
            desc="Volta TODA a configuração da Sofia aos valores recomendados. Use se algo saiu do controle.">
            <Button type="button" variant="outline" onClick={() => { if (confirm('Restaurar TODA a configuração ao recomendado? Suas mudanças serão perdidas.')) { update(() => defaultSofiaConfig()) } }}>
              <RotateCcw className="w-4 h-4 mr-2" />Restaurar tudo
            </Button>
          </EditorCard>
        </>
      )}
    </>
  )

  return (
    <div className="space-y-6 pb-24">
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-1.5">
            <AlertTriangle className="w-4 h-4" />Avisos ({warnings.length})
          </div>
          <ul className="space-y-1 text-xs text-amber-800">
            {warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-0.5">{w.kind === 'risco' ? '⚠️' : '•'}</span><span>{w.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* LAUNCHER: lista de seções em acordeão (abre pra baixo, na própria linha) + prévia */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Coluna esquerda: lista-acordeão */}
        <div className="min-w-0 bg-white border border-ww-sand rounded-2xl shadow-ww-lift overflow-hidden divide-y divide-ww-sand">
          {[...THEMES, ADVANCED_THEME].map(t => {
            const a = THEME_ACCENT[t.accent]
            const Icon = t.icon
            const comp = themeCompleteness(t.key)
            const full = comp.done >= comp.total
            const showBadge = comp.total > 0
            const line = themePreview(t.key)[0]
            const open = activeTheme === t.key
            return (
              <div key={t.key}>
                <button type="button" onClick={() => setActiveTheme(open ? null : t.key)}
                  className={cn('group w-full flex items-center gap-4 px-5 py-4 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ww-gold/40', open ? 'bg-ww-cream/70' : 'hover:bg-ww-cream/50')}>
                  <span className={cn('flex items-center justify-center w-10 h-10 rounded-xl shrink-0', a.bg, a.text)}><Icon className="w-[18px] h-[18px]" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-ww-serif text-base text-ww-n700 tracking-tight truncate">{t.title}</h3>
                      {dirtyThemes.has(t.key) && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-label="não salvo" />}
                    </div>
                    <p className="text-xs text-ww-n500 truncate mt-0.5">{line ?? t.subtitle}</p>
                  </div>
                  {showBadge && (
                    <span className={cn('hidden sm:flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0', full ? 'bg-ww-olive-soft text-ww-olive-ink' : 'bg-ww-cream text-ww-n600')}>
                      {full && '✓ '}{comp.done}/{comp.total}
                    </span>
                  )}
                  <ChevronDown className={cn('w-4 h-4 shrink-0 transition-transform duration-200 ease-out', open ? 'rotate-180 text-ww-gold-ink' : 'text-ww-n400')} />
                </button>
                {open && (
                  <div className={cn('border-t border-ww-sand bg-white px-6 divide-y divide-ww-sand/70 [&>*]:py-6 [&>*:first-child]:pt-5 [&>*:last-child]:pb-6', FIELD_SKIN)}>
                    {renderThemeBlocks()}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Coluna direita: prévia da persona (sticky) — ocupa a tela e dá contexto vivo */}
        <aside className="lg:sticky lg:top-2">
          <div className="bg-white border border-ww-sand rounded-2xl shadow-ww-lift overflow-hidden">
            <div className="bg-ww-cream/70 px-5 py-6 flex flex-col items-center text-center border-b border-ww-sand">
              <span className="flex items-center justify-center w-16 h-16 rounded-full bg-white border border-ww-gold/30 shadow-ww-lift mb-3">
                <span className="font-ww-serif text-2xl text-ww-gold-ink">{(c.identity.persona_nome || 'S').slice(0, 1).toUpperCase()}</span>
              </span>
              <h3 className="font-ww-serif text-xl text-ww-n700 tracking-tight">{c.identity.persona_nome || 'Sofia'}</h3>
              <p className="text-xs text-ww-n500 mt-0.5">{c.identity.role || 'Consultora'} · {c.identity.empresa || 'Welcome Weddings'}</p>
              <div className="flex items-center gap-2 mt-3">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ww-gold-ink bg-ww-gold-soft rounded-full px-2.5 py-1">
                  {TOM_OPTIONS.find(o => o.value === c.voice.tom)?.emoji} {TOM_OPTIONS.find(o => o.value === c.voice.tom)?.label ?? c.voice.tom}
                </span>
                <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1', (c.ativa ?? true) ? 'bg-ww-olive-soft text-ww-olive-ink' : 'bg-ww-cream text-ww-n500')}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', (c.ativa ?? true) ? 'bg-ww-olive' : 'bg-ww-n400')} />
                  {(c.ativa ?? true) ? 'Ligada' : 'Desligada'}
                </span>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ww-n500">Como ela abre a conversa</p>
              <div className="flex items-start gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-ww-gold-soft text-ww-gold-ink font-ww-serif text-sm shrink-0 mt-0.5">{(c.identity.persona_nome || 'S').slice(0, 1).toUpperCase()}</span>
                <div className="bg-ww-cream/60 border border-ww-sand rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-ww-n700 leading-relaxed line-clamp-4">
                  {openingPreview || <span className="text-ww-n400 italic">defina a abertura em “Conversa &amp; fluxo”.</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div><p className="font-ww-serif text-lg text-ww-n700 leading-none">{c.phases?.length ?? 0}</p><p className="text-[11px] text-ww-n500 mt-1">fases</p></div>
                <div><p className="font-ww-serif text-lg text-ww-n700 leading-none">{capDisponiveis.filter(m => c.capabilities[m.key].enabled).length}</p><p className="text-[11px] text-ww-n500 mt-1">capacidades</p></div>
                <div><p className="font-ww-serif text-lg text-ww-n700 leading-none">{c.qualification.threshold ?? '—'}</p><p className="text-[11px] text-ww-n500 mt-1">nota mín.</p></div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Barra de salvar fixa (sempre visível) */}
      <div className="fixed bottom-0 inset-x-0 z-10 bg-white/90 backdrop-blur border-t border-ww-sand shadow-[0_-1px_8px_rgba(78,24,32,0.05)]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {status === 'success' && <span className="flex items-center gap-1.5 text-ww-olive-ink"><CheckCircle className="w-4 h-4" />Salvo</span>}
            {status === 'error' && <span className="flex items-center gap-1.5 text-ww-error"><AlertCircle className="w-4 h-4" />{error || 'Erro ao salvar'}</span>}
            {status !== 'success' && status !== 'error' && (dirty
              ? <span className="flex items-center gap-1.5 text-amber-600"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Alterações não salvas</span>
              : <span className="flex items-center gap-1.5 text-ww-n400"><CheckCircle className="w-4 h-4" />Tudo salvo</span>)}
          </div>
          <Button type="button" onClick={() => handleSave(c)} disabled={status === 'saving' || !dirty} className="bg-ww-gold hover:bg-ww-gold-ink text-white disabled:bg-slate-100 disabled:text-ww-n400 disabled:shadow-none shadow-sm active:scale-[0.98] transition-transform">
            {status === 'saving' ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar configuração'}
          </Button>
        </div>
      </div>
    </div>
  )
}
