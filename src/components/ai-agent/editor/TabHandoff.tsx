import { Handshake, Tag, Bell, MessageCircle, Pause, GitBranch } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { HANDOFF_SIGNALS_CATALOG, type AgentEditorForm } from './types'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { cn } from '@/lib/utils'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

export function TabHandoff({ form, setForm }: Props) {
  const { pipelineId } = useCurrentProductMeta()
  const { data: stages = [] } = usePipelineStages(pipelineId)

  const stageOptions = [
    { value: '', label: 'Não mudar etapa' },
    ...stages.map(s => ({ value: s.id, label: s.nome })),
  ]

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
    </div>
  )
}
