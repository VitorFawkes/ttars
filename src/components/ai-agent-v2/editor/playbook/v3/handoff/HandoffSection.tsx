import { useRef } from 'react'
import { Handshake, Tag, Bell, MessageCircle, Pause, GitBranch, CalendarPlus, AlertTriangle, LifeBuoy, Info, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { DEFAULT_AUTO_HANDOFF_INVISIBLE, type AgentEditorForm, type AutoHandoffInvisibleConfig, type BookMeetingConfig } from '../../../types'
import { useCurrentProductMeta, useProductBySlug } from '@/hooks/useCurrentProductMeta'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useFilterProfiles } from '@/hooks/analytics/useFilterOptions'
import { cn } from '@/lib/utils'
import { useResponsavelOrgCheck } from './useResponsavelOrgCheck'

const DEFAULT_BOOK_MEETING: BookMeetingConfig = {
  enabled: true,
  responsavel_id: null,
  tipo: 'reuniao_video',
  duracao_minutos: 60,
  titulo_template: 'Reunião com {contact_name} — {agent_name}',
  mensagem_confirmacao_template: 'Perfeito! Marquei {responsavel_first_name} pra falar com vocês {data} às {hora}. Vocês vão receber o convite e ela já chega com contexto.',
}

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
  /** Org ID do agente — usada pra cross-check de responsável. */
  agentOrgId?: string | null
  /**
   * Slug do produto do agente (TRIPS/WEDDING/etc). Usado pra buscar
   * pipeline correto do agente, não da sessão atual do admin.
   * Se não passado, fallback pra useCurrentProductMeta (sessão atual).
   */
  agentProductSlug?: string | null
}

/**
 * Área "Handoff" da redesign UI v3 — Fase 4.
 *
 * Mantém os 3 blocos do TabHandoff original (sinais, ações, agendamento)
 * e adiciona:
 *   1. Banner explicativo no topo (regra de quando ela passa pra humano)
 *   2. Status compacto dos sinais ativos
 *   3. **Cross-check de responsável** — alerta inline se o closer escolhido
 *      não tem acesso à org do agente (resolve o falso alarme do plano).
 *   4. Bloco novo "Fallback" — fallback_message + fallback_agent_id que
 *      antes ficavam invisíveis no form mas sem UI.
 *
 * Reusa todos os hooks existentes (zero duplicação).
 */
export function HandoffSection({ form, setForm, agentOrgId, agentProductSlug }: Props) {
  const tituloRef = useRef<HTMLInputElement>(null)
  const mensagemRef = useRef<HTMLTextAreaElement>(null)

  /** Insere `{token}` na posição do cursor do campo, ou no fim se sem foco. */
  const insertAtCursor = (target: 'titulo' | 'mensagem', token: string) => {
    const wrapped = `{${token}}`
    if (target === 'titulo') {
      const el = tituloRef.current
      if (!el) {
        updateBookMeeting({ titulo_template: (bookMeeting?.titulo_template ?? '') + wrapped })
        return
      }
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      const next = el.value.slice(0, start) + wrapped + el.value.slice(end)
      updateBookMeeting({ titulo_template: next })
      requestAnimationFrame(() => {
        el.focus()
        const pos = start + wrapped.length
        el.setSelectionRange(pos, pos)
      })
    } else {
      const el = mensagemRef.current
      if (!el) {
        updateBookMeeting({ mensagem_confirmacao_template: (bookMeeting?.mensagem_confirmacao_template ?? '') + wrapped })
        return
      }
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      const next = el.value.slice(0, start) + wrapped + el.value.slice(end)
      updateBookMeeting({ mensagem_confirmacao_template: next })
      requestAnimationFrame(() => {
        el.focus()
        const pos = start + wrapped.length
        el.setSelectionRange(pos, pos)
      })
    }
  }

  // Resolve pipelineId baseado no produto do AGENTE (não da sessão).
  // Garante que stages mostradas são do pipeline correto em multi-org.
  const productOfAgent = useProductBySlug(agentProductSlug)
  const { pipelineId: currentPipelineId } = useCurrentProductMeta()
  const pipelineId = productOfAgent?.pipeline_id ?? currentPipelineId
  const { data: stages = [] } = usePipelineStages(pipelineId)
  const { data: profiles = [] } = useFilterProfiles()

  const stageOptions = [
    { value: '', label: 'Não mudar etapa' },
    ...stages.map(s => ({ value: s.id, label: s.nome })),
  ]

  const profileOptions = [
    { value: '', label: '— escolha uma pessoa —' },
    ...profiles.map(p => ({ value: p.id, label: p.nome })),
  ]

  const bookMeeting = form.handoff_actions.book_meeting
  const updateBookMeeting = (patch: Partial<BookMeetingConfig>) => {
    setForm(f => {
      const current = f.handoff_actions.book_meeting ?? DEFAULT_BOOK_MEETING
      return {
        ...f,
        handoff_actions: {
          ...f.handoff_actions,
          book_meeting: { ...current, ...patch },
        },
      }
    })
  }
  const toggleBookMeeting = (checked: boolean) => {
    setForm(f => ({
      ...f,
      handoff_actions: {
        ...f.handoff_actions,
        book_meeting: checked
          ? (f.handoff_actions.book_meeting ?? DEFAULT_BOOK_MEETING)
          : null,
      },
    }))
  }

  // Cross-check do responsável da reunião
  const responsavelCheck = useResponsavelOrgCheck(bookMeeting?.responsavel_id, agentOrgId)
  const responsavelProfile = profiles.find(p => p.id === bookMeeting?.responsavel_id)

  const meetingActive = !!bookMeeting?.enabled && !!bookMeeting?.responsavel_id

  // Auto-handoff invisível (dispara após N bloqueios do validador em M turnos)
  const autoHandoff: AutoHandoffInvisibleConfig =
    form.handoff_actions.auto_handoff_invisible ?? DEFAULT_AUTO_HANDOFF_INVISIBLE
  const updateAutoHandoff = (patch: Partial<AutoHandoffInvisibleConfig>) => {
    setForm(f => ({
      ...f,
      handoff_actions: {
        ...f.handoff_actions,
        auto_handoff_invisible: {
          ...(f.handoff_actions.auto_handoff_invisible ?? DEFAULT_AUTO_HANDOFF_INVISIBLE),
          ...patch,
        },
      },
    }))
  }

  return (
    <div className="space-y-6">
      {/* Banner explicativo */}
      <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 flex gap-3">
        <Info className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-0.5">
            Quando ela passa o bastão pra um humano
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            O agente decide com julgamento quando travar é melhor do que insistir. Configure aqui
            o que acontece nessa hora: ação no card, agendamento automático e mensagem de fallback.
          </p>
        </div>
      </div>

      {/* Status compacto */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatusCard
          icon={ShieldAlert}
          label="Auto-handoff"
          value={autoHandoff.enabled ? `${autoHandoff.block_threshold} em ${autoHandoff.window_turns}` : 'desligado'}
          tone={autoHandoff.enabled ? 'success' : 'normal'}
        />
        <StatusCard
          icon={CalendarPlus}
          label="Agendamento auto"
          value={meetingActive ? 'ativo' : 'desligado'}
          tone={meetingActive ? 'success' : 'normal'}
        />
        <StatusCard
          icon={LifeBuoy}
          label="Fallback"
          value={form.fallback_message ? 'configurado' : 'sem mensagem'}
          tone={form.fallback_message ? 'success' : 'warning'}
        />
      </div>

      {/* ── Bloco 1: Auto-handoff invisível ─────────────────────────── */}
      <Section
        Icon={ShieldAlert}
        iconClass="text-amber-500"
        title="1. Quando ela trava sozinha (auto-handoff invisível)"
        subtitle="Quando o validador bloqueia várias mensagens seguidas, ela passa o bastão sem o lead perceber."
        right={
          <Switch
            aria-label="Ativar auto-handoff invisível"
            checked={autoHandoff.enabled}
            onCheckedChange={v => updateAutoHandoff({ enabled: v })}
          />
        }
      >
        {autoHandoff.enabled && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed -mt-1">
              Quando o agente tenta responder mas o validador rejeita a mensagem repetidas
              vezes, isso é sinal de que ela está travada. Em vez de loop de fallback ("deixa
              eu verificar e já volto" infinito), ela manda uma frase humana coerente e aciona
              o handoff de verdade.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Bloqueios pra disparar</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={autoHandoff.block_threshold}
                  onChange={e => updateAutoHandoff({
                    block_threshold: Math.max(1, Math.min(10, Number(e.target.value) || 3)),
                  })}
                />
                <p className="text-[11px] text-slate-500">
                  Quantos bloqueios do validador disparam o handoff. Default 3 (1-2 é agressivo demais).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Janela de turnos olhada</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={autoHandoff.window_turns}
                  onChange={e => updateAutoHandoff({
                    window_turns: Math.max(1, Math.min(20, Number(e.target.value) || 5)),
                  })}
                />
                <p className="text-[11px] text-slate-500">
                  Em quantos turnos recentes a gente conta os bloqueios. Default 5.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <p className="text-[11px] text-slate-700">
                <strong>Regra atual:</strong> se o validador bloquear <strong>{autoHandoff.block_threshold}+</strong>{' '}
                mensagens nos últimos <strong>{autoHandoff.window_turns}</strong> turnos do agente,
                força o momento <code className="bg-white px-1 rounded text-[10px]">handoff_humano_invisivel</code> e
                executa as ações do handoff (etapa, pausa, notificar, tag) imediatamente.
              </p>
            </div>
          </div>
        )}
      </Section>

      {/* ── Bloco 2: O que acontece ─────────────────────────────────── */}
      <Section
        Icon={Bell}
        iconClass="text-rose-500"
        title="2. O que acontece quando ela passa o bastão"
        subtitle="Ações automáticas no card e no contato quando o handoff dispara."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-slate-400" />
              Mover card para etapa (opcional)
            </Label>
            <Select
              value={form.handoff_actions.change_stage_id ?? ''}
              onChange={(v: string) => setForm(f => ({
                ...f,
                handoff_actions: { ...f.handoff_actions, change_stage_id: v || null },
              }))}
              options={stageOptions}
            />
          </div>

          <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <Bell className="w-4 h-4 text-slate-400 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Notificar o responsável</p>
                <p className="text-xs text-slate-500">Avisa o humano dono do card via notificação interna.</p>
              </div>
            </div>
            <Switch
              aria-label="Notificar o responsável"
              checked={form.handoff_actions.notify_responsible}
              onCheckedChange={v => setForm(f => ({ ...f, handoff_actions: { ...f.handoff_actions, notify_responsible: v } }))}
            />
          </div>

          <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <Pause className="w-4 h-4 text-slate-400 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Pausar agente permanentemente no card</p>
                <p className="text-xs text-slate-500">Se desligado, agente volta a responder depois que o humano fecha a conversa.</p>
              </div>
            </div>
            <Switch
              aria-label="Pausar agente permanentemente"
              checked={form.handoff_actions.pause_permanently}
              onCheckedChange={v => setForm(f => ({ ...f, handoff_actions: { ...f.handoff_actions, pause_permanently: v } }))}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-slate-400" />
              Mensagem de transição (opcional)
            </Label>
            <Input
              value={form.handoff_actions.transition_message ?? ''}
              onChange={e => setForm(f => ({ ...f, handoff_actions: { ...f.handoff_actions, transition_message: e.target.value || null } }))}
              placeholder="Deixe vazio pra não anunciar a transição (mais natural)"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-slate-400" />
              Aplicar tag (opcional)
            </Label>
            <Input
              value={form.handoff_actions.apply_tag?.name ?? ''}
              onChange={e => {
                const name = e.target.value
                setForm(f => ({
                  ...f,
                  handoff_actions: {
                    ...f.handoff_actions,
                    apply_tag: name ? { name, color: f.handoff_actions.apply_tag?.color || '#f59e0b' } : null,
                  },
                }))
              }}
              placeholder="Nome da tag"
            />
            {form.handoff_actions.apply_tag?.name && (
              <TagColorPicker
                value={form.handoff_actions.apply_tag?.color ?? '#f59e0b'}
                onChange={color => setForm(f => ({
                  ...f,
                  handoff_actions: {
                    ...f.handoff_actions,
                    apply_tag: f.handoff_actions.apply_tag ? { ...f.handoff_actions.apply_tag, color } : null,
                  },
                }))}
              />
            )}
          </div>
        </div>
      </Section>

      {/* ── Bloco 3: Agendamento automático ─────────────────────────── */}
      <Section
        Icon={CalendarPlus}
        iconClass="text-emerald-500"
        title="3. Agendar reunião automática"
        subtitle="Quando o lead aceitar um horário, agente cria a reunião na agenda do responsável."
        right={
          <Switch
            aria-label="Ativar agendamento automático"
            checked={!!bookMeeting?.enabled}
            onCheckedChange={toggleBookMeeting}
          />
        }
      >
        {bookMeeting?.enabled && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-400" />
                Quem recebe a reunião
              </Label>
              <Select
                value={bookMeeting.responsavel_id ?? ''}
                onChange={(v: string) => updateBookMeeting({ responsavel_id: v || null })}
                options={profileOptions}
              />

              {/* Cross-check de responsável */}
              {bookMeeting.responsavel_id && responsavelProfile && (
                <ResponsavelOrgCheckBanner
                  profileName={responsavelProfile.nome}
                  isMember={responsavelCheck.isMember}
                  isLoading={responsavelCheck.isLoading}
                  hasOrgId={!!agentOrgId}
                />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo de reunião</Label>
                <Select
                  value={bookMeeting.tipo}
                  onChange={(v: string) => updateBookMeeting({ tipo: v as BookMeetingConfig['tipo'] })}
                  options={[
                    { value: 'reuniao_video', label: 'Vídeo (Zoom/Meet/Teams)' },
                    { value: 'reuniao_telefone', label: 'Ligação' },
                    { value: 'reuniao_presencial', label: 'Presencial' },
                    { value: 'reuniao', label: 'Genérica (sem especificar)' },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label>Duração (minutos)</Label>
                <Input
                  type="number"
                  min={15}
                  step={15}
                  value={bookMeeting.duracao_minutos}
                  onChange={e => updateBookMeeting({ duracao_minutos: Number(e.target.value) || 60 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Título da reunião na agenda</Label>
              <Input
                ref={tituloRef}
                value={bookMeeting.titulo_template}
                onChange={e => updateBookMeeting({ titulo_template: e.target.value })}
                placeholder="Ex: Reunião com {contact_name} — Wedding Planner"
              />
              <VariableChips
                variables={['contact_name', 'responsavel_name', 'agent_name']}
                onInsert={(token) => insertAtCursor('titulo', token)}
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem de confirmação pro lead</Label>
              <Textarea
                ref={mensagemRef}
                rows={3}
                value={bookMeeting.mensagem_confirmacao_template}
                onChange={e => updateBookMeeting({ mensagem_confirmacao_template: e.target.value })}
              />
              <VariableChips
                variables={['contact_name', 'responsavel_name', 'data', 'hora']}
                onInsert={(token) => insertAtCursor('mensagem', token)}
              />
            </div>

          </div>
        )}
      </Section>

      {/* ── Bloco 4: Fallback ──────────────────────────────────── */}
      <Section
        Icon={LifeBuoy}
        iconClass="text-slate-500"
        title="4. Fallback (quando nada deu certo)"
        subtitle="Mensagem que a agente envia quando trava — erro técnico, desconexão, etc."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Mensagem de fallback</Label>
            <Textarea
              rows={2}
              value={form.fallback_message}
              onChange={e => setForm(f => ({ ...f, fallback_message: e.target.value }))}
              placeholder="Ex: Deixa eu verificar uma coisa aqui e já volto."
            />
            <p className="text-[11px] text-slate-400">
              Mantém um tom natural — evita expor que houve erro técnico.
            </p>
          </div>

        </div>
      </Section>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function Section({
  Icon, iconClass, title, subtitle, right, children,
}: {
  Icon: typeof Handshake
  iconClass: string
  title: string
  subtitle: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className={cn('w-5 h-5 flex-shrink-0', iconClass)} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
        </div>
        {right}
      </header>
      {children}
    </section>
  )
}

function StatusCard({
  icon: Icon, label, value, tone,
}: {
  icon: typeof Handshake
  label: string
  value: string
  tone: 'success' | 'warning' | 'normal'
}) {
  const toneClass = {
    success: 'border-emerald-200 bg-emerald-50/30',
    warning: 'border-amber-200 bg-amber-50/30',
    normal: 'border-slate-200 bg-white',
  }[tone]
  const iconClass = {
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    normal: 'text-slate-500',
  }[tone]
  return (
    <div className={cn('rounded-xl border p-3 shadow-sm', toneClass)}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('w-3.5 h-3.5', iconClass)} />
        <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      </div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function ResponsavelOrgCheckBanner({
  profileName, isMember, isLoading, hasOrgId,
}: {
  profileName: string
  isMember: boolean | null
  isLoading: boolean
  hasOrgId: boolean
}) {
  if (!hasOrgId || isLoading || isMember === null) return null

  if (isMember) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 mt-1">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-700">
          <strong>{profileName}</strong> tem acesso a esta organização. Reunião deve agendar normalmente.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 mt-1">
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
      <div className="text-xs text-slate-700">
        <p className="font-medium mb-0.5">
          <strong>{profileName}</strong> não é membro desta organização
        </p>
        <p className="text-slate-600">
          A reunião pode falhar com erro 406. Adicione esta pessoa como membro da org do agente
          (via Configurações → Usuários) ou escolha outro responsável.
        </p>
      </div>
    </div>
  )
}

// ── TagColorPicker ──────────────────────────────────────────────────────
//
// Substitui o input type="color" nativo (que abre picker macOS gigante e
// aceita qualquer cor — fora da paleta do produto) por uma grade de
// 12 cores curadas da paleta Tailwind, alinhadas com o resto do design.
const TAG_COLORS: Array<{ value: string; label: string }> = [
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#f97316', label: 'Laranja' },
  { value: '#f59e0b', label: 'Âmbar' },
  { value: '#eab308', label: 'Amarelo' },
  { value: '#22c55e', label: 'Verde' },
  { value: '#10b981', label: 'Esmeralda' },
  { value: '#06b6d4', label: 'Ciano' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#6366f1', label: 'Índigo' },
  { value: '#8b5cf6', label: 'Violeta' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#64748b', label: 'Cinza' },
]

function TagColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const current = TAG_COLORS.find(c => c.value.toLowerCase() === value.toLowerCase()) ?? null
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] text-slate-500">Cor:</span>
        {current && (
          <span className="text-[11px] text-slate-700 font-medium">{current.label}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TAG_COLORS.map(c => {
          const selected = c.value.toLowerCase() === value.toLowerCase()
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              title={c.label}
              aria-label={`Cor ${c.label}`}
              className={cn(
                'w-7 h-7 rounded-lg border-2 transition-all',
                selected ? 'border-slate-900 scale-110 shadow-md' : 'border-white shadow-sm hover:scale-105',
              )}
              style={{ backgroundColor: c.value }}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── VariableChips ──────────────────────────────────────────────────────
//
// Chips clicáveis que inserem variáveis no campo do form (cursor position).
// Antes era apenas <code> mostrando o nome da variável — agora copy-on-click.
const VARIABLE_LABELS: Record<string, string> = {
  contact_name: 'Nome do lead',
  responsavel_name: 'Wedding Planner',
  agent_name: 'Nome do agente',
  data: 'Data',
  hora: 'Hora',
}

function VariableChips({
  variables, onInsert,
}: {
  variables: string[]
  onInsert: (token: string) => void
}) {
  return (
    <div>
      <p className="text-[11px] text-slate-500 mb-1">
        Variáveis disponíveis (clique pra inserir onde o cursor está):
      </p>
      <div className="flex flex-wrap gap-1.5">
        {variables.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onInsert(v)}
            className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 font-mono inline-flex items-center gap-1 transition-colors"
            title={VARIABLE_LABELS[v] ?? v}
          >
            {`{${v}}`}
            {VARIABLE_LABELS[v] && (
              <span className="text-[10px] text-slate-400 font-sans">{VARIABLE_LABELS[v]}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
