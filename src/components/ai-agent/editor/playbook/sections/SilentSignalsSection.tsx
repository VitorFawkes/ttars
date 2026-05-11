import { useState } from 'react'
import { Loader2, Plus, Trash2, Save, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { useAgentSilentSignals, type PlaybookSilentSignal, type PlaybookSignalInput } from '@/hooks/playbook/useAgentSilentSignals'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { SingleFieldPicker } from '@/components/ai-agent/editor/CRMFieldPicker'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

export function SilentSignalsSection({ agentId, agentName, companyName }: Props) {
  const { signals, isLoading, upsert, remove } = useAgentSilentSignals(agentId)
  const meta = useCurrentProductMeta()
  const pipelineId: string | undefined = meta?.pipelineId ?? undefined
  const produtoSlug: string | undefined = meta?.slug ?? undefined

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  const handleAddBlank = async () => {
    const slug = `sinal_${Date.now().toString(36).slice(-4)}`
    const input: PlaybookSignalInput = {
      signal_key: slug,
      signal_label: 'Novo sinal',
      detection_hint: '',
      crm_field_key: null,
      how_to_use: null,
      detection_mode: 'inferred',
      evidence_keywords: [],
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
              <SignalEditorCard key={s.id} agentName={agentName} companyName={companyName} signal={s}
                pipelineId={pipelineId} produtoSlug={produtoSlug}
                onSave={(data) => upsert.mutateAsync({ ...data, id: s.id })} onRemove={() => remove.mutateAsync(s.id)} />
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
  agentName, companyName, signal, pipelineId, produtoSlug, onSave, onRemove,
}: {
  agentName: string; companyName: string; signal: PlaybookSilentSignal;
  pipelineId?: string; produtoSlug?: string;
  onSave: (data: PlaybookSignalInput) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const [label, setLabel] = useState(signal.signal_label)
  const [hint, setHint] = useState(signal.detection_hint)
  const [crmField, setCrmField] = useState<string | null>(signal.crm_field_key ?? null)
  const [howTo, setHowTo] = useState(signal.how_to_use ?? '')
  const [detectionMode, setDetectionMode] = useState<'inferred' | 'explicit'>(signal.detection_mode ?? 'inferred')
  const [evidenceKeywords, setEvidenceKeywords] = useState<string[]>(signal.evidence_keywords ?? [])
  const [newKeyword, setNewKeyword] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const addKeyword = () => {
    const v = newKeyword.trim()
    if (!v) return
    setEvidenceKeywords([...evidenceKeywords, v])
    setNewKeyword('')
    setDirty(true)
  }

  const removeKeyword = (i: number) => {
    setEvidenceKeywords(evidenceKeywords.filter((_, j) => j !== i))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        signal_key: signal.signal_key,
        signal_label: label.trim(),
        detection_hint: hint.trim(),
        crm_field_key: crmField || null,
        how_to_use: howTo.trim() || null,
        detection_mode: detectionMode,
        evidence_keywords: detectionMode === 'explicit' ? evidenceKeywords : [],
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
        <SingleFieldPicker
          value={crmField}
          onChange={(v) => { setCrmField(v); setDirty(true) }}
          scope="card"
          pipelineId={pipelineId}
          produto={produtoSlug}
          placeholder="Escolha um campo do card..."
        />
        <p className="text-[11px] text-slate-400 mt-1">
          Hoje este campo é referência descritiva (a IA sabe onde registrar mentalmente). Gravação automática chega no Marco 2.1.
        </p>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Como o agente usa esse sinal</label>
        <textarea value={howTo} onChange={(e) => { setHowTo(e.target.value); setDirty(true) }}
          placeholder="Ex: usa como teto de orçamento, sem confrontar"
          className="w-full min-h-[40px] rounded-md border border-slate-200 px-3 py-1.5 text-sm" />
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
          💡 Vai pro prompt como diretiva quando o sinal for detectado: <em>"Quando detectar, USE ASSIM: ..."</em>. Escreva imperativo (<em>"usa como teto"</em>, <em>"menciona em silêncio"</em>) — não descritivo.
        </p>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
        <label className="block text-xs font-medium text-emerald-900 mb-1">
          Como detectar este sinal
        </label>
        <div className="flex gap-2">
          <label className={cn(
            'flex-1 flex items-start gap-2 p-2 rounded border cursor-pointer text-xs',
            detectionMode === 'inferred' ? 'border-emerald-400 bg-emerald-100' : 'border-slate-200 bg-white',
          )}>
            <input type="radio" checked={detectionMode === 'inferred'}
              onChange={() => { setDetectionMode('inferred'); setDirty(true) }} className="mt-0.5" />
            <div>
              <div className="font-medium text-slate-900">Por contexto (inferred)</div>
              <div className="text-[10px] text-slate-600">Agente julga pelo contexto. ~60-80% obediência. Use só se não dá pra listar palavras-chave.</div>
            </div>
          </label>
          <label className={cn(
            'flex-1 flex items-start gap-2 p-2 rounded border cursor-pointer text-xs',
            detectionMode === 'explicit' ? 'border-emerald-400 bg-emerald-100' : 'border-slate-200 bg-white',
          )}>
            <input type="radio" checked={detectionMode === 'explicit'}
              onChange={() => { setDetectionMode('explicit'); setDirty(true) }} className="mt-0.5" />
            <div>
              <div className="font-medium text-slate-900">Por palavra-chave (explicit)</div>
              <div className="text-[10px] text-slate-600">Só credita se lead mencionar uma das palavras abaixo. ~95%+ obediência.</div>
            </div>
          </label>
        </div>

        {detectionMode === 'explicit' && (
          <div className="border-t border-emerald-200 pt-2">
            <label className="block text-[11px] font-medium text-emerald-900 mb-1">
              Palavras/frases que contam como evidência <span className="text-emerald-700 font-normal">(lead deve mencionar pelo menos uma)</span>
            </label>
            {evidenceKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {evidenceKeywords.map((kw, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-md bg-emerald-100 border border-emerald-200 text-emerald-900 inline-flex items-center gap-1.5">
                    "{kw}"
                    <button onClick={() => removeKeyword(i)} className="text-emerald-600 hover:text-rose-600">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addKeyword()
                  }
                }}
                placeholder='Ex: internacional'
                className="flex-1 rounded-md border border-emerald-200 px-2.5 py-1 text-xs"
              />
              <Button size="sm" variant="outline" onClick={addKeyword} className="gap-1">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-emerald-800 mt-1.5 leading-relaxed">
              💡 Liste palavras/frases que o lead pode usar pra revelar este sinal. Ex: pra "viagem internacional recente", liste <em>"internacional"</em>, <em>"fora do Brasil"</em>, <em>"Europa"</em>, <em>"EUA"</em>, países específicos. Só essas palavras na fala do lead creditam o sinal.
            </p>
          </div>
        )}
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
