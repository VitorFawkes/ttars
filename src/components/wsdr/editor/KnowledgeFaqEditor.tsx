import { useState } from 'react'
import { Plus, Trash2, Loader2, Save, Search } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useSofiaKnowledge, type KnowledgeItem } from '@/hooks/wsdr/useSofiaKnowledge'

// Editor da base de conhecimento por BUSCA. A lista é simples (pergunta/resposta),
// mas cada item é INDEXADO no servidor (embedding) ao salvar — assim a Sofia busca só
// o relevante a cada conversa, sem inflar o prompt. Auto-contido (não mexe na config JSONB).
export function KnowledgeFaqEditor({ agentSlug = 'sofia-weddings' }: { agentSlug?: string }) {
  const { items, loading, upsert, remove } = useSofiaKnowledge(agentSlug)
  const [novaP, setNovaP] = useState('')
  const [novaR, setNovaR] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const addNew = async () => {
    if (!novaP.trim() || !novaR.trim()) return
    setSavingId('new')
    const ok = await upsert({ pergunta: novaP.trim(), resposta: novaR.trim(), enabled: true })
    setSavingId(null)
    if (ok) { setNovaP(''); setNovaR('') }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50/70 border border-slate-200 rounded-lg p-2.5">
        <Search className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
        <span>A Sofia <strong>busca</strong> só as respostas relevantes a cada conversa (não cola tudo no prompt). Cada item é indexado automaticamente ao salvar.</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Loader2 className="w-4 h-4 animate-spin" />Carregando…</div>
      ) : (
        <>
          {items.length === 0 && <p className="text-xs text-slate-400 italic">Nenhuma pergunta cadastrada ainda.</p>}
          {items.map(item => (
            <KnowledgeRow key={item.id} item={item} busy={savingId === item.id}
              onSave={async patch => { setSavingId(item.id); await upsert({ id: item.id, ...patch }); setSavingId(null) }}
              onDelete={() => remove(item.id)} />
          ))}
        </>
      )}

      {/* Nova pergunta */}
      <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2 bg-white">
        <span className="text-xs font-medium text-slate-400">Nova pergunta</span>
        <Input value={novaP} onChange={e => setNovaP(e.target.value)} placeholder="O que o casal costuma perguntar?" />
        <Textarea value={novaR} onChange={e => setNovaR(e.target.value)} placeholder="Como a Sofia deve responder" className="min-h-[60px]" />
        <button type="button" onClick={addNew} disabled={savingId === 'new' || !novaP.trim() || !novaR.trim()}
          className="flex items-center gap-1.5 text-sm text-ww-gold-ink hover:text-ww-gold disabled:opacity-40">
          {savingId === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Adicionar e indexar
        </button>
      </div>
    </div>
  )
}

function KnowledgeRow({ item, busy, onSave, onDelete }: {
  item: KnowledgeItem
  busy: boolean
  onSave: (patch: Partial<KnowledgeItem>) => Promise<void>
  onDelete: () => void
}) {
  const [p, setP] = useState(item.pergunta)
  const [r, setR] = useState(item.resposta)
  const dirty = p !== item.pergunta || r !== item.resposta

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/40">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          {item.enabled ? 'Ativa' : 'Desativada'}
          <Switch checked={item.enabled} onCheckedChange={v => onSave({ enabled: v })} className={item.enabled ? 'bg-ww-gold' : ''} />
        </label>
        <button type="button" onClick={onDelete} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <Input value={p} onChange={e => setP(e.target.value)} placeholder="Pergunta" />
      <Textarea value={r} onChange={e => setR(e.target.value)} placeholder="Resposta" className="min-h-[60px]" />
      {dirty && (
        <button type="button" onClick={() => onSave({ pergunta: p, resposta: r })} disabled={busy}
          className="flex items-center gap-1.5 text-xs text-ww-gold-ink hover:text-ww-gold disabled:opacity-40">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Salvar e reindexar
        </button>
      )}
    </div>
  )
}
