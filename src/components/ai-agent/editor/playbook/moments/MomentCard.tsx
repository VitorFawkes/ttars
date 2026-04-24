import { useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Trash2, Save, Loader2, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAgentMoments, type PlaybookMoment } from '@/hooks/playbook/useAgentMoments'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'

interface Props {
  agentId: string
  agentName: string
  companyName: string
  moment: PlaybookMoment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: { attributes?: any; listeners?: any }
}

const TRIGGER_OPTIONS: Array<{ value: PlaybookMoment['trigger_type']; label: string }> = [
  { value: 'primeiro_contato', label: 'Primeira mensagem do lead' },
  { value: 'lead_respondeu', label: 'Lead respondeu' },
  { value: 'keyword', label: 'Contém palavras-chave' },
  { value: 'score_threshold', label: 'Score atingiu valor' },
  { value: 'always', label: 'Sempre disponível (fallback)' },
]

const MODE_OPTIONS: Array<{ value: PlaybookMoment['message_mode']; label: string; subtitle: string }> = [
  { value: 'literal', label: 'Texto literal', subtitle: 'Envia exatamente esse texto' },
  { value: 'faithful', label: 'Diretriz fiel', subtitle: 'Segue estrutura, adapta só nome e variações mínimas' },
  { value: 'free', label: 'Estilo livre', subtitle: 'Tem liberdade, respeitando objetivo e red_lines' },
]

export function MomentCard({ agentId, agentName, companyName, moment, dragHandleProps }: Props) {
  const { upsert, remove } = useAgentMoments(agentId)
  const [expanded, setExpanded] = useState(false)
  const [label, setLabel] = useState(moment.moment_label)
  const [triggerType, setTriggerType] = useState(moment.trigger_type)
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(moment.trigger_config ?? {})
  const [mode, setMode] = useState(moment.message_mode)
  const [anchor, setAnchor] = useState(moment.anchor_text ?? '')
  const [redLines, setRedLines] = useState<string[]>(moment.red_lines ?? [])
  const [newRedLine, setNewRedLine] = useState('')
  const [dirty, setDirty] = useState(false)

  const markDirty = () => setDirty(true)

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({
        id: moment.id,
        moment_key: moment.moment_key,
        moment_label: label.trim(),
        display_order: moment.display_order,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        message_mode: mode,
        anchor_text: (mode === 'literal' || mode === 'faithful') ? anchor.trim() : (anchor.trim() || null),
        red_lines: redLines,
        collects_fields: moment.collects_fields ?? [],
        enabled: moment.enabled,
      })
      toast.success('Momento salvo'); setDirty(false)
    } catch (err) { console.error(err); toast.error('Não consegui salvar.') }
  }

  const handleRemove = async () => {
    if (!confirm(`Apagar o momento "${moment.moment_label}"?`)) return
    try { await remove.mutateAsync(moment.id); toast.success('Momento removido') }
    catch (err) { console.error(err); toast.error('Não consegui remover.') }
  }

  const addRedLine = () => {
    if (newRedLine.trim()) { setRedLines([...redLines, newRedLine.trim()]); setNewRedLine(''); markDirty() }
  }

  return (
    <div className={cn('bg-white border rounded-lg', expanded ? 'border-indigo-200' : 'border-slate-200')}>
      <header className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" {...(dragHandleProps?.attributes ?? {})} {...(dragHandleProps?.listeners ?? {})}
          className="text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">{label || moment.moment_key}</div>
          <div className="text-xs text-slate-500 truncate">
            {TRIGGER_OPTIONS.find(t => t.value === triggerType)?.label ?? triggerType}
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-700 p-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </header>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nome do momento</label>
            <input value={label} onChange={(e) => { setLabel(e.target.value); markDirty() }}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Quando acontece</label>
            <select value={triggerType} onChange={(e) => { setTriggerType(e.target.value as PlaybookMoment['trigger_type']); setTriggerConfig({}); markDirty() }}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
              {TRIGGER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {triggerType === 'keyword' && (
              <input
                value={Array.isArray(triggerConfig.keywords) ? (triggerConfig.keywords as string[]).join(', ') : ''}
                onChange={(e) => { setTriggerConfig({ keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }); markDirty() }}
                placeholder="preço, quanto custa, valor"
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            )}
            {triggerType === 'score_threshold' && (
              <div className="mt-2 flex gap-2 items-center text-sm">
                <select
                  value={(triggerConfig.operator as string) ?? 'gte'}
                  onChange={(e) => { setTriggerConfig({ ...triggerConfig, operator: e.target.value }); markDirty() }}
                  className="rounded-lg border border-slate-200 px-2 py-1">
                  <option value="gte">≥</option><option value="lte">≤</option>
                  <option value="gt">&gt;</option><option value="lt">&lt;</option>
                </select>
                <input type="number"
                  value={(triggerConfig.value as number) ?? 0}
                  onChange={(e) => { setTriggerConfig({ ...triggerConfig, value: Number(e.target.value) }); markDirty() }}
                  className="w-24 rounded-lg border border-slate-200 px-2 py-1" />
                <span className="text-xs text-slate-500">(threshold do score)</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Como responde</label>
            <div className="space-y-1">
              {MODE_OPTIONS.map(o => (
                <label key={o.value} className="flex items-start gap-2 text-sm p-2 rounded border border-slate-100 hover:border-slate-200 cursor-pointer">
                  <input type="radio" checked={mode === o.value} onChange={() => { setMode(o.value); markDirty() }} className="mt-0.5" />
                  <div>
                    <div className="font-medium text-slate-700">{o.label}</div>
                    <div className="text-xs text-slate-500">{o.subtitle}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-600">
                {mode === 'free' ? 'Objetivo / diretriz' : 'Texto da mensagem'}
              </label>
              <SuggestVariationsButton
                text={anchor}
                fieldType="anchor_text"
                context={{ agent_nome: agentName, company_name: companyName, related_moment_label: label }}
                onSelect={(t) => { setAnchor(t); markDirty() }}
              />
            </div>
            <textarea value={anchor} onChange={(e) => { setAnchor(e.target.value); markDirty() }}
              placeholder={mode === 'free' ? 'Descreva o objetivo' : 'Use {contact_name} para o nome do lead'}
              className="w-full min-h-[80px] rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Linhas vermelhas deste momento</label>
            {redLines.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {redLines.map((rl, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-md bg-rose-50 border border-rose-100 text-rose-700 inline-flex items-center gap-1.5">
                    {rl}<button onClick={() => { setRedLines(redLines.filter((_, j) => j !== i)); markDirty() }}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={newRedLine} onChange={(e) => setNewRedLine(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRedLine() } }}
                placeholder="Ex: Não pedir email ainda"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
              <Button size="sm" variant="outline" onClick={addRedLine} className="gap-1"><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          <div className="flex justify-between pt-3 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={handleRemove} disabled={remove.isPending}
              className="gap-1.5 text-slate-500 hover:text-red-600">
              <Trash2 className="w-3.5 h-3.5" /> Remover
            </Button>
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs text-amber-600">• não salvo</span>}
              <Button onClick={handleSave} disabled={!dirty || upsert.isPending} size="sm" className="gap-1.5">
                {upsert.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
