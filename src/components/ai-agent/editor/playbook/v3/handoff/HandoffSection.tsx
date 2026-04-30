import { Handshake, Tag, Bell, MessageCircle, Pause, GitBranch, CalendarPlus, AlertTriangle, LifeBuoy, Info, CheckCircle2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { HANDOFF_SIGNALS_CATALOG, type AgentEditorForm, type BookMeetingConfig } from '../../../types'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
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
export function HandoffSection({ form, setForm, agentOrgId }: Props) {
  const { pipelineId } = useCurrentProductMeta()
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

  const toggleSignal = (slug: string) => {
    setForm(f => ({
      ...f,
      handoff_signals: f.handoff_signals.map(s =>
        s.slug === slug ? { ...s, enabled: !s.enabled } : s
      ),
    }))
  }

  const updateSignalDescription = (slug: string, description: string) => {
    setForm(f => ({
      ...f,
      handoff_signals: f.handoff_signals.map(s =>
        s.slug === slug ? { ...s, description } : s
      ),
    }))
  }

  // Cross-check do responsável da reunião
  const responsavelCheck = useResponsavelOrgCheck(bookMeeting?.responsavel_id, agentOrgId)
  const responsavelProfile = profiles.find(p => p.id === bookMeeting?.responsavel_id)

  const activeSignalsCount = form.handoff_signals.filter(s => s.enabled).length
  const meetingActive = !!bookMeeting?.enabled && !!bookMeeting?.responsavel_id

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
            Configure aqui <strong>3 caminhos</strong>: 1) sinais que ela detecta na conversa
            e disparam handoff, 2) o que acontece quando dispara, 3) agendamento automático
            quando o lead qualifica.
          </p>
        </div>
      </div>

      {/* Status compacto */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatusCard
          icon={Handshake}
          label="Sinais ativos"
          value={`${activeSignalsCount}`}
          tone={activeSignalsCount === 0 ? 'warning' : 'normal'}
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

      {/* ── Bloco 1: Sinais ─────────────────────────────────────────── */}
      <Section
        Icon={Handshake}
        iconClass="text-orange-500"
        title="1. Sinais que disparam handoff"
        subtitle="Situações em que o agente passa a conversa para um humano. O agente decide com julgamento, sem regex."
      >
        <div className="space-y-2">
          {HANDOFF_SIGNALS_CATALOG.map(cat => {
            const signal = form.handoff_signals.find(s => s.slug === cat.slug)
            if (!signal) return null
            return (
              <div
                key={cat.slug}
                className={cn(
                  'border rounded-lg p-3 space-y-2 transition-colors',
                  signal.enabled ? 'border-orange-200 bg-orange-50/40' : 'border-slate-200'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900 flex-1 min-w-0">{cat.label}</p>
                  <Switch
                    aria-label={`Ligar/desligar sinal: ${cat.label}`}
                    checked={signal.enabled}
                    onCheckedChange={() => toggleSignal(cat.slug)}
                  />
                </div>
                {signal.enabled && (
                  <Textarea
                    value={signal.description}
                    onChange={e => updateSignalDescription(cat.slug, e.target.value)}
                    rows={2}
                    className="text-xs"
                    placeholder={cat.defaultDescription}
                  />
                )}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── Bloco 2: O que acontece ─────────────────────────────────── */}
      <Section
        Icon={Bell}
        iconClass="text-rose-500"
        title="2. O que acontece quando dispara"
        subtitle="Ações automáticas ao detectar qualquer sinal habilitado."
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
              <Input
                type="color"
                value={form.handoff_actions.apply_tag?.color ?? '#f59e0b'}
                onChange={e => {
                  const color = e.target.value
                  setForm(f => ({
                    ...f,
                    handoff_actions: {
                      ...f.handoff_actions,
                      apply_tag: f.handoff_actions.apply_tag ? { ...f.handoff_actions.apply_tag, color } : null,
                    },
                  }))
                }}
                disabled={!form.handoff_actions.apply_tag?.name}
                className="h-10"
              />
            </div>
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
                value={bookMeeting.titulo_template}
                onChange={e => updateBookMeeting({ titulo_template: e.target.value })}
                placeholder="Ex: Reunião com {contact_name} — Wedding Planner"
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem de confirmação pro lead</Label>
              <Textarea
                rows={3}
                value={bookMeeting.mensagem_confirmacao_template}
                onChange={e => updateBookMeeting({ mensagem_confirmacao_template: e.target.value })}
              />
              <p className="text-[11px] text-slate-400">
                Variáveis: <code className="bg-slate-100 px-1 rounded">{'{contact_name}'}</code> ·{' '}
                <code className="bg-slate-100 px-1 rounded">{'{responsavel_name}'}</code> ·{' '}
                <code className="bg-slate-100 px-1 rounded">{'{data}'}</code> ·{' '}
                <code className="bg-slate-100 px-1 rounded">{'{hora}'}</code>
              </p>
            </div>
          </div>
        )}
      </Section>

      {/* ── Bloco 4 NOVO: Fallback ──────────────────────────────────── */}
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
