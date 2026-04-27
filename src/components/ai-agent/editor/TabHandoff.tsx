import { Handshake, Tag, Bell, MessageCircle, Pause, GitBranch, CalendarPlus } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { HANDOFF_SIGNALS_CATALOG, type AgentEditorForm, type BookMeetingConfig } from './types'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useFilterProfiles } from '@/hooks/analytics/useFilterOptions'
import { cn } from '@/lib/utils'

const DEFAULT_BOOK_MEETING: BookMeetingConfig = {
  enabled: true,
  responsavel_id: null,
  tipo: 'reuniao_video',
  duracao_minutos: 60,
  titulo_template: 'Reunião com {contact_name} — {agent_name}',
  mensagem_confirmacao_template: 'Perfeito! Marquei {responsavel_name} pra falar com vocês {data} às {hora}. Vocês vão receber o convite e ela já chega com contexto.',
}

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

export function TabHandoff({ form, setForm }: Props) {
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

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Handshake className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Sinais de handoff</h2>
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          Situações em que o agente passa a conversa para um humano. O agente decide com julgamento — sem regex de palavra-chave. Só os sinais ligados entram no prompt.
        </p>

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
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{cat.label}</p>
                  </div>
                  <Switch
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
      </section>

      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
        <header className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-rose-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">O que acontece quando dispara</h2>
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          Ações automáticas ao detectar qualquer sinal habilitado.
        </p>

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
          <p className="text-[11px] text-slate-400">
            Útil para sinalizar no funil que o card chegou em um humano (ex: "Conectado" ou "Reunião Agendada").
          </p>
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
            placeholder="Deixe vazio para não anunciar a transição (natural, estilo Julia)"
          />
          <p className="text-[11px] text-slate-400">
            Se definido, o agente envia esta mensagem antes de passar. A Julia não envia — mais natural.
          </p>
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
              placeholder="Nome da tag (ex: handoff-ia)"
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
      </section>

      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Agendar reunião automática</h2>
          </div>
          <Switch
            checked={!!bookMeeting?.enabled}
            onCheckedChange={toggleBookMeeting}
          />
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          Quando o lead aceitar um horário, o agente cria uma reunião na agenda do CRM e atribui ao closer escolhido. A agenda fica visível pra ele(a) na hora.
        </p>

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
              <p className="text-[11px] text-slate-400">
                A reunião vai ser criada com essa pessoa como responsável. Ela vê na agenda dela do CRM.
              </p>
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
              <p className="text-[11px] text-slate-400">
                Variáveis: <code className="bg-slate-100 px-1 rounded">{'{contact_name}'}</code> ·{' '}
                <code className="bg-slate-100 px-1 rounded">{'{agent_name}'}</code> ·{' '}
                <code className="bg-slate-100 px-1 rounded">{'{responsavel_name}'}</code>
              </p>
            </div>

            <div className="space-y-2">
              <Label>O que a agente diz pro lead após agendar</Label>
              <Textarea
                rows={3}
                value={bookMeeting.mensagem_confirmacao_template}
                onChange={e => updateBookMeeting({ mensagem_confirmacao_template: e.target.value })}
                placeholder="Perfeito! Marquei {responsavel_name} pra falar com vocês {data} às {hora}..."
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
      </section>
    </div>
  )
}
