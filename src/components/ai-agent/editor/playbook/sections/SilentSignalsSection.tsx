import { useState } from 'react'
import { Loader2, Plus, Trash2, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { useAgentSilentSignals, type PlaybookSilentSignal, type PlaybookSignalInput } from '@/hooks/playbook/useAgentSilentSignals'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

export function SilentSignalsSection({ agentId, agentName, companyName }: Props) {
  const { signals, isLoading, upsert, remove } = useAgentSilentSignals(agentId)

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  const handleAddBlank = async () => {
    const slug = `sinal_${Date.now().toString(36).slice(-4)}`
    const input: PlaybookSignalInput = {
      signal_key: slug,
      signal_label: 'Novo sinal',
      detection_hint: '',
      crm_field_key: null,
      how_to_use: null,
      enabled: true,
      display_order: (signals[signals.length - 1]?.display_order ?? 0) + 1,
    }
    try { await upsert.mutateAsync(input); toast.success('Sinal criado — edite abaixo') }
    catch (err) { console.error(err); toast.error('Não consegui criar.') }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Coisas que o agente registra discretamente ao detectar, <strong>sem comentar</strong> com o lead.
        Ex: "menciona viagem internacional recente" → registra em campo do CRM pra calibrar próximas decisões.
      </p>

      {signals.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-sm text-slate-400 mb-3">Nenhum sinal configurado.</p>
          <Button onClick={handleAddBlank} size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Adicionar sinal</Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {signals.map(s => (
              <SignalEditorCard key={s.id} agentId={agentId} agentName={agentName} companyName={companyName} signal={s} onSave={(data) => upsert.mutateAsync({ ...data, id: s.id })} onRemove={() => remove.mutateAsync(s.id)} />
            ))}
          </div>
          <Button onClick={handleAddBlank} variant="outline" size="sm" className="gap-1.5" disabled={upsert.isPending}>
            <Plus className="w-3.5 h-3.5" /> Adicionar sinal
          </Button>
        </>
      )}
    </div>
  )
}

function SignalEditorCard({
  agentId: _agentId, agentName, companyName, signal, onSave, onRemove,
}: {
  agentId: string; agentName: string; companyName: string; signal: PlaybookSilentSignal;
  onSave: (data: PlaybookSignalInput) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const [label, setLabel] = useState(signal.signal_label)
  const [hint, setHint] = useState(signal.detection_hint)
  const [crmField, setCrmField] = useState(signal.crm_field_key ?? '')
  const [howTo, setHowTo] = useState(signal.how_to_use ?? '')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        signal_key: signal.signal_key,
        signal_label: label.trim(),
        detection_hint: hint.trim(),
        crm_field_key: crmField.trim() || null,
        how_to_use: howTo.trim() || null,
        enabled: signal.enabled,
        display_order: signal.display_order,
      })
      toast.success('Sinal salvo'); setDirty(false)
    } catch (err) { console.error(err); toast.error('Não consegui salvar.') }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
      <input value={label} onChange={(e) => { setLabel(e.target.value); setDirty(true) }}
        placeholder="Nome do sinal"
        className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium" />

      <div>
        <div className="flex justify-between mb-1">
          <label className="text-xs text-slate-500">Como detectar</label>
          <SuggestVariationsButton text={hint} fieldType="signal_hint" context={{ agent_nome: agentName, company_name: companyName, related_moment_label: label }}
            onSelect={(t) => { setHint(t); setDirty(true) }} />
        </div>
        <textarea value={hint} onChange={(e) => { setHint(e.target.value); setDirty(true) }}
          placeholder="Ex: Lead menciona viagem internacional nos últimos 12 meses"
          className="w-full min-h-[50px] rounded-md border border-slate-200 px-3 py-1.5 text-sm" />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Campo do CRM que recebe o registro (opcional)</label>
        <input value={crmField} onChange={(e) => { setCrmField(e.target.value); setDirty(true) }}
          placeholder="Ex: ww_sdr_perfil_viagem_internacional"
          className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm font-mono" />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Como o agente usa esse sinal</label>
        <textarea value={howTo} onChange={(e) => { setHowTo(e.target.value); setDirty(true) }}
          placeholder="Ex: usa como teto de orçamento, sem confrontar"
          className="w-full min-h-[40px] rounded-md border border-slate-200 px-3 py-1.5 text-sm" />
      </div>

      <div className="flex justify-between pt-1">
        <Button variant="outline" size="sm" onClick={onRemove} className="gap-1 text-slate-500 hover:text-red-600">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
        <div className="flex gap-3 items-center">
          {dirty && <span className="text-xs text-amber-600">• não salvo</span>}
          <Button onClick={handleSave} disabled={!dirty || saving} size="sm" className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}
