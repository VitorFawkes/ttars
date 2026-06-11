import { useEffect, useState, type ReactNode } from 'react'

export type ConsultorOption = { id: string; nome: string }

// Segmento DW × Elopement (Todos · DW · Elopement). É o corte de TIPO de casamento,
// não confundir com "Apenas o casal" (que é nº de convidados). Token canônico:
// 'DW' / 'Elopement' (igual ao backend). `tipos = []` significa Todos.
export function TipoSegment({ selected, onChange }: { selected: string[]; onChange: (n: string[]) => void }) {
  const cur = selected.includes('Elopement') && !selected.includes('DW') ? 'Elopement'
            : selected.includes('DW') && !selected.includes('Elopement') ? 'DW' : 'todos'
  const set = (v: 'todos' | 'DW' | 'Elopement') => onChange(v === 'todos' ? [] : [v])
  const opts: { k: 'todos' | 'DW' | 'Elopement'; label: string }[] = [
    { k: 'todos', label: 'Todos' },
    { k: 'DW', label: 'DW' },
    { k: 'Elopement', label: 'Elopement' },
  ]
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs text-ww-n500 font-medium px-1">💍 Tipo</span>
      <div className="inline-flex items-center gap-0.5 bg-ww-cream rounded-lg p-0.5">
        {opts.map(o => (
          <button key={o.k} onClick={() => set(o.k)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold ${cur === o.k ? 'bg-ww-gold text-white shadow-sm' : 'text-ww-n600 hover:text-ww-n700'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function useDropdown() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const t = setTimeout(() => document.addEventListener('click', close, { once: true }), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', close) }
  }, [open])
  return { open, setOpen }
}

// Texto do chip mostra O QUE foi escolhido (não só a contagem):
// nada → "todos" · 1 → o valor · 2+ → "primeiro +N"
function chipDisplay(selected: string[]): string {
  if (selected.length === 0) return 'todos'
  if (selected.length === 1) return selected[0]
  return `${selected[0]} +${selected.length - 1}`
}

export function MultiPill({ label, icon, options, selected, onChange }: { label: string; icon?: ReactNode; options: string[]; selected: string[]; onChange: (n: string[]) => void }) {
  const { open, setOpen } = useDropdown()
  const display = chipDisplay(selected)
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        title={selected.length > 1 ? `${label}: ${selected.join(', ')}` : undefined}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold focus-visible:ring-offset-1 ${
          selected.length === 0
            ? 'bg-white border-ww-sand text-ww-n600 hover:border-ww-sand-dk'
            : 'bg-ww-gold-soft border-ww-gold text-ww-gold-ink'
        }`}>
        {icon}{label}: <span className="font-semibold max-w-[140px] truncate">{display}</span>
      </button>
      <div className={`absolute z-50 mt-1 left-0 bg-white border border-ww-sand rounded-lg shadow-ww-modal max-h-72 overflow-y-auto w-72 transition-opacity duration-150 ease-out ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} aria-hidden={!open}>
          <div className="p-2 border-b border-ww-sand/70 flex items-center justify-between sticky top-0 bg-white">
            <span className="text-xs font-medium text-ww-n600">{label}</span>
            {selected.length > 0 && <button onClick={() => onChange([])} className="text-xs text-ww-gold-ink hover:text-ww-n700">limpar</button>}
          </div>
          <div className="p-1">
            {options.length === 0
              ? <div className="px-3 py-2 text-xs text-ww-n500">Nenhuma opção</div>
              : options.map(opt => {
                  const isSel = selected.includes(opt)
                  return (
                    <button key={opt} onClick={() => onChange(isSel ? selected.filter(o => o !== opt) : [...selected, opt])}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-ww-cream/60 flex items-center gap-2 transition-colors ${isSel ? 'text-ww-gold-ink font-medium' : 'text-ww-n600'}`}>
                      <span className={`w-4 h-4 shrink-0 inline-block border-2 rounded flex items-center justify-center ${isSel ? 'bg-ww-gold border-ww-gold' : 'border-ww-sand-dk'}`}>
                        {isSel && <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M13 4L6 11L3 8" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <span className="truncate">{opt}</span>
                    </button>
                  )
                })}
          </div>
      </div>
    </div>
  )
}

export function ConsultorPill({ icon, options, selected, onChange }: { icon?: ReactNode; options: ConsultorOption[]; selected: string[]; onChange: (n: string[]) => void }) {
  const { open, setOpen } = useDropdown()
  // Mostra o primeiro nome escolhido (não só a contagem)
  const nomes = selected.map(id => options.find(o => o.id === id)?.nome?.split(' ')[0] ?? '?')
  const display = chipDisplay(nomes)
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        title={nomes.length > 1 ? `Consultor: ${nomes.join(', ')}` : undefined}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold focus-visible:ring-offset-1 ${selected.length > 0 ? 'bg-ww-gold-soft border-ww-gold text-ww-gold-ink' : 'bg-white border-ww-sand text-ww-n600 hover:border-ww-sand-dk'}`}>
        {icon ?? '👤'} Consultor: <span className="font-semibold max-w-[140px] truncate">{display}</span>
      </button>
      <div className={`absolute z-50 mt-1 left-0 bg-white border border-ww-sand rounded-lg shadow-ww-modal max-h-72 overflow-y-auto w-72 transition-opacity duration-150 ease-out ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} aria-hidden={!open}>
          <div className="p-2 border-b border-ww-sand/70 flex items-center justify-between sticky top-0 bg-white">
            <span className="text-xs font-medium text-ww-n600">Consultor</span>
            {selected.length > 0 && <button onClick={() => onChange([])} className="text-xs text-ww-gold-ink hover:text-ww-n700">limpar</button>}
          </div>
          <div className="p-1">
            {options.length === 0
              ? <div className="px-3 py-2 text-xs text-ww-n500">Nenhum consultor</div>
              : options.map(o => {
                  const isSel = selected.includes(o.id)
                  return (
                    <button key={o.id} onClick={() => onChange(isSel ? selected.filter(x => x !== o.id) : [...selected, o.id])}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-ww-cream/60 flex items-center gap-2 transition-colors ${isSel ? 'text-ww-gold-ink font-medium' : 'text-ww-n600'}`}>
                      <span className={`w-4 h-4 shrink-0 inline-block border-2 rounded flex items-center justify-center ${isSel ? 'bg-ww-gold border-ww-gold' : 'border-ww-sand-dk'}`}>
                        {isSel && <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M13 4L6 11L3 8" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <span className="truncate">{o.nome}</span>
                    </button>
                  )
                })}
          </div>
      </div>
    </div>
  )
}
