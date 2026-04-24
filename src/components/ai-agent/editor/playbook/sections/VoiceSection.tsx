import { useEffect, useState } from 'react'
import { Loader2, Save, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAgentVoice, type VoiceConfig } from '@/hooks/playbook/useAgentVoice'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'

const TONE_OPTIONS = ['empática', 'elegante', 'direta', 'formal', 'calorosa', 'descontraída', 'profissional', 'acolhedora', 'paciente', 'clara', 'objetiva']
const EMOJI_OPTIONS: Array<{ value: VoiceConfig['emoji_policy']; label: string }> = [
  { value: 'never', label: 'Nunca' },
  { value: 'after_rapport', label: 'Só depois de rapport (máx 1)' },
  { value: 'anytime', label: 'À vontade' },
]

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

export function VoiceSection({ agentId, agentName, companyName }: Props) {
  const { voice, isLoading, save } = useAgentVoice(agentId)
  const [toneTags, setToneTags] = useState<string[]>([])
  const [formality, setFormality] = useState(3)
  const [emojiPolicy, setEmojiPolicy] = useState<VoiceConfig['emoji_policy']>('after_rapport')
  const [regA, setRegA] = useState(true)
  const [regV, setRegV] = useState(false)
  const [regG, setRegG] = useState(false)
  const [regT, setRegT] = useState(false)
  const [typical, setTypical] = useState<string[]>([])
  const [forbidden, setForbidden] = useState<string[]>([])
  const [newTypical, setNewTypical] = useState('')
  const [newForbidden, setNewForbidden] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (voice) {
      setToneTags(voice.tone_tags ?? [])
      setFormality(voice.formality ?? 3)
      setEmojiPolicy(voice.emoji_policy ?? 'after_rapport')
      setRegA(voice.regionalisms?.uses_a_gente ?? true)
      setRegV(voice.regionalisms?.uses_voces_casal ?? false)
      setRegG(voice.regionalisms?.uses_gerundio ?? false)
      setRegT(voice.regionalisms?.casual_tu_mano ?? false)
      setTypical(voice.typical_phrases ?? [])
      setForbidden(voice.forbidden_phrases ?? [])
      setDirty(false)
    }
  }, [voice?.tone_tags, voice?.formality, voice?.emoji_policy])

  const markDirty = () => setDirty(true)

  const toggleTone = (t: string) => {
    if (toneTags.includes(t)) {
      setToneTags(toneTags.filter(x => x !== t)); markDirty()
    } else if (toneTags.length < 3) {
      setToneTags([...toneTags, t]); markDirty()
    }
  }

  const handleSave = async () => {
    const config: VoiceConfig = {
      tone_tags: toneTags,
      formality,
      emoji_policy: emojiPolicy,
      regionalisms: { uses_a_gente: regA, uses_voces_casal: regV, uses_gerundio: regG, casual_tu_mano: regT },
      typical_phrases: typical,
      forbidden_phrases: forbidden,
    }
    try {
      await save.mutateAsync(config); toast.success('Voz salva'); setDirty(false)
    } catch (err) {
      console.error(err); toast.error('Não consegui salvar.')
    }
  }

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Tom (até 3)</label>
        <div className="flex flex-wrap gap-1.5">
          {TONE_OPTIONS.map(t => (
            <button key={t} type="button" onClick={() => toggleTone(t)}
              className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                toneTags.includes(t) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Formalidade: {formality}/5</label>
        <input type="range" min="1" max="5" step="1" value={formality}
          onChange={(e) => { setFormality(Number(e.target.value)); markDirty() }}
          className="w-full" />
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>muito casual</span><span>muito formal</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Emoji</label>
        {EMOJI_OPTIONS.map(o => (
          <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700 mb-1">
            <input type="radio" checked={emojiPolicy === o.value} onChange={() => { setEmojiPolicy(o.value); markDirty() }} />
            {o.label}
          </label>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Regionalismos</label>
        {[
          { v: regA, s: setRegA, l: 'Usa "a gente" em vez de "nós"' },
          { v: regV, s: setRegV, l: 'Usa "vocês" pro casal/grupo' },
          { v: regG, s: setRegG, l: 'Usa gerúndio ("tô vendo")' },
          { v: regT, s: setRegT, l: 'Casual com "mano/cara"' },
        ].map((r, i) => (
          <label key={i} className="flex items-center gap-2 text-sm text-slate-700 mb-1">
            <input type="checkbox" checked={r.v} onChange={(e) => { r.s(e.target.checked); markDirty() }} />
            {r.l}
          </label>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-700">Frases típicas do agente</label>
          <SuggestVariationsButton
            text=""
            fieldType="typical_phrase"
            context={{ agent_nome: agentName, company_name: companyName, voice_tone_tags: toneTags, voice_formality: formality }}
            onSelect={(t) => { setTypical([...typical, t]); markDirty() }}
            label="Sugerir +"
          />
        </div>
        <ChipList items={typical} onRemove={(i) => { setTypical(typical.filter((_, j) => j !== i)); markDirty() }} />
        <div className="flex gap-2 mt-2">
          <input value={newTypical} onChange={(e) => setNewTypical(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newTypical.trim()) { setTypical([...typical, newTypical.trim()]); setNewTypical(''); markDirty() } } }}
            placeholder="Ex: Que bom que você me chamou"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          <Button size="sm" variant="outline" onClick={() => { if (newTypical.trim()) { setTypical([...typical, newTypical.trim()]); setNewTypical(''); markDirty() } }} className="gap-1">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-700">Frases que NÃO é o agente</label>
          <SuggestVariationsButton
            text=""
            fieldType="forbidden_phrase"
            context={{ agent_nome: agentName, company_name: companyName }}
            onSelect={(t) => { setForbidden([...forbidden, t]); markDirty() }}
            label="Sugerir +"
          />
        </div>
        <ChipList items={forbidden} onRemove={(i) => { setForbidden(forbidden.filter((_, j) => j !== i)); markDirty() }} variant="danger" />
        <div className="flex gap-2 mt-2">
          <input value={newForbidden} onChange={(e) => setNewForbidden(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newForbidden.trim()) { setForbidden([...forbidden, newForbidden.trim()]); setNewForbidden(''); markDirty() } } }}
            placeholder="Ex: Prezado cliente"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          <Button size="sm" variant="outline" onClick={() => { if (newForbidden.trim()) { setForbidden([...forbidden, newForbidden.trim()]); setNewForbidden(''); markDirty() } }} className="gap-1">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        {dirty && <span className="text-xs text-amber-600 self-center mr-3">• alterações não salvas</span>}
        <Button onClick={handleSave} disabled={!dirty || save.isPending} size="sm" className="gap-1.5">
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
        </Button>
      </div>
    </div>
  )
}

function ChipList({ items, onRemove, variant = 'default' }: { items: string[]; onRemove: (i: number) => void; variant?: 'default' | 'danger' }) {
  if (items.length === 0) return <p className="text-xs text-slate-400 italic">(nenhuma configurada)</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={i} className={cn('text-xs px-2 py-1 rounded-md border inline-flex items-center gap-1.5',
          variant === 'danger' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-700')}>
          {t}
          <button type="button" onClick={() => onRemove(i)} className="hover:text-slate-900"><X className="w-3 h-3" /></button>
        </span>
      ))}
    </div>
  )
}
