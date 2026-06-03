import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useUpdatableCardFields } from '@/hooks/useUpdatableCardFields'

// Seleção MÚLTIPLA dos campos do card que a Sofia pode preencher. Carrega o catálogo
// real de campos do workspace + produto atual (useUpdatableCardFields já isola por org
// e produto), mostrando rótulos amigáveis em vez de chaves técnicas. Campos já marcados
// que não aparecem no catálogo (ex: campo desativado) continuam visíveis pra não sumirem
// em silêncio.
export function CrmFieldsPicker({ value, onChange }: { value: string[]; onChange: (keys: string[]) => void }) {
  const { data: fields, isLoading } = useUpdatableCardFields()

  const toggle = (key: string) => onChange(value.includes(key) ? value.filter(k => k !== key) : [...value, key])

  // Agrupa por seção (igual ao card) e acrescenta os marcados órfãos no fim.
  const groups = useMemo(() => {
    const list = fields ?? []
    const known = new Set(list.map(f => f.key))
    const bySection = new Map<string, { key: string; label: string }[]>()
    for (const f of list) {
      const arr = bySection.get(f.sectionLabel) ?? []
      arr.push({ key: f.key, label: f.label })
      bySection.set(f.sectionLabel, arr)
    }
    const orphans = value.filter(k => !known.has(k)).map(k => ({ key: k, label: k }))
    const out = [...bySection.entries()].map(([section, items]) => ({ section, items }))
    if (orphans.length) out.push({ section: 'Outros campos marcados', items: orphans })
    return out
  }, [fields, value])

  if (isLoading) {
    return <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />Carregando campos…</p>
  }
  if (!groups.length) {
    return <p className="text-[11px] text-amber-600">Nenhum campo disponível neste workspace.</p>
  }

  return (
    <div className="space-y-3">
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
        {groups.map(g => (
          <div key={g.section} className="py-1">
            <p className="px-3 pt-1.5 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">{g.section}</p>
            {g.items.map(f => (
              <label key={f.key} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={value.includes(f.key)} onChange={() => toggle(f.key)} className="accent-ww-gold" />
                {f.label}
              </label>
            ))}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">{value.length} campo{value.length === 1 ? '' : 's'} marcado{value.length === 1 ? '' : 's'} — a Sofia só preenche o que estiver marcado aqui.</p>
    </div>
  )
}
