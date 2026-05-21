import { useState } from 'react'
import { Loader2, Plus, Trash2, Save, ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { useAgentSilentSignals, type PlaybookSilentSignal, type PlaybookSignalInput, type SignalDetectionPatterns } from '@/hooks/v2/playbook/useAgentSilentSignals'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { SingleFieldPicker } from '@/components/ai-agent-v2/editor/CRMFieldPicker'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'
import { cn } from '@/lib/utils'

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
  const [patterns, setPatterns] = useState<SignalDetectionPatterns | null>(
    signal.detection_patterns ?? null,
  )
  const [showPatterns, setShowPatterns] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const patternsActive = !!patterns && (
    (patterns.question_keywords?.length ?? 0) > 0 ||
    (patterns.answer_yes_keywords?.length ?? 0) > 0 ||
    (patterns.answer_no_keywords?.length ?? 0) > 0
  )

  const updatePatterns = (patch: Partial<SignalDetectionPatterns>) => {
    setPatterns(prev => {
      const next = { ...(prev ?? {}), ...patch }
      // Limpa o objeto inteiro se todas as listas ficarem vazias
      const empty =
        (!next.question_keywords || next.question_keywords.length === 0) &&
        (!next.answer_yes_keywords || next.answer_yes_keywords.length === 0) &&
        (!next.answer_no_keywords || next.answer_no_keywords.length === 0) &&
        !next.max_answer_length
      return empty ? null : next
    })
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
        enabled: signal.enabled,
        display_order: signal.display_order,
        detection_patterns: patterns,
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
      </div>

      {/* Palavras-chave de detecção (fallback ao LLM) */}
      <div className="border-t border-slate-100 pt-2">
        <button
          type="button"
          onClick={() => setShowPatterns(s => !s)}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-700"
        >
          {showPatterns ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <Zap className={cn('w-3.5 h-3.5', patternsActive ? 'text-amber-500' : 'text-slate-400')} />
          <span className="font-medium">Palavras-chave de detecção</span>
          {patternsActive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
              ativo
            </span>
          )}
          <span className="text-[11px] text-slate-400 ml-1">(opcional — fallback ao LLM)</span>
        </button>

        {showPatterns && (
          <div className="mt-2 space-y-2 bg-slate-50 border border-slate-200 rounded-md p-3">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Quando o agente faz a pergunta sobre o tema e o lead responde, o sistema também tenta
              detectar a resposta com essas palavras (proteção caso o LLM esqueça de registrar).
              Deixe tudo vazio pra confiar só no LLM.
            </p>
            <KeywordListField
              label="Quando o AGENTE pergunta (palavras que aparecem na pergunta dele)"
              hint="Ex: família, ajuda, apoio, pais, sogros, sozinhos"
              value={patterns?.question_keywords ?? []}
              onChange={(v) => updatePatterns({ question_keywords: v })}
            />
            <KeywordListField
              label="Resposta POSITIVA do lead"
              hint="Ex: sim, ajudam, contribuem, pais"
              value={patterns?.answer_yes_keywords ?? []}
              onChange={(v) => updatePatterns({ answer_yes_keywords: v })}
            />
            <KeywordListField
              label="Resposta NEGATIVA do lead"
              hint="Ex: não, nenhuma, sozinhos, conta própria"
              value={patterns?.answer_no_keywords ?? []}
              onChange={(v) => updatePatterns({ answer_no_keywords: v })}
            />
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                Resposta longa demais ignora detecção (caracteres)
              </label>
              <input
                type="number"
                min={20}
                max={1000}
                value={patterns?.max_answer_length ?? 200}
                onChange={(e) => {
                  const v = Number(e.target.value) || 200
                  updatePatterns({ max_answer_length: Math.max(20, Math.min(1000, v)) })
                }}
                className="w-24 rounded-md border border-slate-200 px-2 py-1 text-xs"
              />
              <span className="text-[11px] text-slate-400 ml-2">default 200</span>
            </div>
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

/**
 * Chip-list editor de palavras-chave. Cada chip = uma palavra/expressão.
 * Suporta entrada via Enter ou vírgula. Não usa regex — palavras são
 * escapadas no router antes de virar pattern.
 */
function KeywordListField({
  label, hint, value, onChange,
}: {
  label: string
  hint: string
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  const addKeyword = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    if (value.some(v => v.toLowerCase() === text.toLowerCase())) return
    onChange([...value, text])
  }

  const removeKeyword = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <label className="block text-[11px] text-slate-600 font-medium mb-1">{label}</label>
      <div className="flex flex-wrap gap-1 mb-1">
        {value.length === 0 && (
          <span className="text-[11px] text-slate-400 italic">(nenhuma palavra-chave)</span>
        )}
        {value.map((kw, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] text-slate-700"
          >
            {kw}
            <button
              type="button"
              onClick={() => removeKeyword(i)}
              className="text-slate-400 hover:text-red-600"
              title="Remover"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addKeyword(draft)
              setDraft('')
            }
          }}
          onBlur={() => { if (draft) { addKeyword(draft); setDraft('') } }}
          placeholder={hint}
          className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs bg-white"
        />
        <button
          type="button"
          onClick={() => { addKeyword(draft); setDraft('') }}
          className="px-2 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-100"
          title="Adicionar"
        >
          +
        </button>
      </div>
    </div>
  )
}
