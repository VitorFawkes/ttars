import { useState } from 'react'
import { Loader2, Plus, Trash2, Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { useAgentFewShotExamples, type PlaybookFewShotExample, type PlaybookExampleInput } from '@/hooks/playbook/useAgentFewShotExamples'
import { useAgentSuggestVariations } from '@/hooks/playbook/useAgentSuggestVariations'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

export function ExamplesSection({ agentId, agentName, companyName }: Props) {
  const { examples, isLoading, upsert, remove } = useAgentFewShotExamples(agentId)
  const suggest = useAgentSuggestVariations()

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  const handleAddBlank = async () => {
    const input: PlaybookExampleInput = {
      lead_message: '',
      agent_response: '',
      context_note: null,
      related_moment_key: null,
      related_signal_key: null,
      display_order: (examples[examples.length - 1]?.display_order ?? 0) + 1,
      enabled: true,
    }
    try { await upsert.mutateAsync(input); toast.success('Exemplo criado') }
    catch (err) { console.error(err); toast.error('Não consegui criar.') }
  }

  const handleGenerateExamples = async () => {
    try {
      const resLead = await suggest.mutateAsync({ text: '', field_type: 'example_lead_message', context: { agent_nome: agentName, company_name: companyName }, num_variations: 3 })
      // Pra cada lead gerado, gera a resposta ideal
      for (const s of resLead.suggestions.slice(0, 3)) {
        const resResp = await suggest.mutateAsync({ text: '', field_type: 'example_agent_response', context: { agent_nome: agentName, company_name: companyName, related_lead_message: s.text }, num_variations: 1 })
        if (resResp.suggestions[0]) {
          await upsert.mutateAsync({
            lead_message: s.text,
            agent_response: resResp.suggestions[0].text,
            context_note: s.rationale,
            related_moment_key: null,
            related_signal_key: null,
            display_order: (examples[examples.length - 1]?.display_order ?? 0) + 1,
            enabled: true,
          })
        }
      }
      toast.success('3 exemplos gerados — revise e salve')
    } catch (err) { console.error(err); toast.error('Não consegui gerar.') }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Exemplos de conversa ideal. O agente aprende por contraste: o que o lead diz → o que ele deveria responder.
      </p>

      {examples.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg space-y-3">
          <p className="text-sm text-slate-400">Nenhum exemplo ainda.</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={handleGenerateExamples} size="sm" className="gap-1.5" disabled={suggest.isPending}>
              <Sparkles className="w-3.5 h-3.5" /> Gerar 3 exemplos com IA
            </Button>
            <Button onClick={handleAddBlank} variant="outline" size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Em branco
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {examples.map(e => (
              <ExampleEditorCard key={e.id} agentName={agentName} companyName={companyName} example={e}
                onSave={(data) => upsert.mutateAsync({ ...data, id: e.id })}
                onRemove={() => remove.mutateAsync(e.id)} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerateExamples} variant="outline" size="sm" className="gap-1.5" disabled={suggest.isPending}>
              <Sparkles className="w-3.5 h-3.5" /> Gerar +3 com IA
            </Button>
            <Button onClick={handleAddBlank} variant="outline" size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Em branco
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function ExampleEditorCard({
  agentName, companyName, example, onSave, onRemove,
}: {
  agentName: string; companyName: string; example: PlaybookFewShotExample;
  onSave: (data: PlaybookExampleInput) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const [leadMsg, setLeadMsg] = useState(example.lead_message)
  const [agentResp, setAgentResp] = useState(example.agent_response)
  const [note, setNote] = useState(example.context_note ?? '')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const handleSave = async () => {
    if (!leadMsg.trim() || !agentResp.trim()) { toast.error('Preencha mensagem do lead e resposta do agente'); return }
    setSaving(true)
    try {
      await onSave({
        lead_message: leadMsg.trim(),
        agent_response: agentResp.trim(),
        context_note: note.trim() || null,
        related_moment_key: example.related_moment_key,
        related_signal_key: example.related_signal_key,
        display_order: example.display_order,
        enabled: example.enabled,
      })
      toast.success('Exemplo salvo'); setDirty(false)
    } catch (err) { console.error(err); toast.error('Não consegui salvar.') }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
      <div>
        <label className="block text-xs text-slate-500 mb-1">Lead disse</label>
        <textarea value={leadMsg} onChange={(e) => { setLeadMsg(e.target.value); setDirty(true) }}
          placeholder="Ex: Ah, quanto custa um casamento de vocês?"
          className="w-full min-h-[50px] rounded-md border border-slate-200 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <div className="flex justify-between mb-1">
          <label className="text-xs text-slate-500">Agente responde</label>
          <SuggestVariationsButton text={agentResp} fieldType="example_agent_response"
            context={{ agent_nome: agentName, company_name: companyName, related_lead_message: leadMsg }}
            onSelect={(t) => { setAgentResp(t); setDirty(true) }} />
        </div>
        <textarea value={agentResp} onChange={(e) => { setAgentResp(e.target.value); setDirty(true) }}
          placeholder="Ex: Preço é coisa que só nossa especialista consegue..."
          className="w-full min-h-[70px] rounded-md border border-slate-200 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Observação (opcional)</label>
        <input value={note} onChange={(e) => { setNote(e.target.value); setDirty(true) }}
          placeholder="Ex: Caso típico de objeção cedo" className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs" />
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
