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
      <span className="text-xs text-slate-500 font-medium px-1">💍 Tipo</span>
      <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
        {opts.map(o => (
          <button key={o.k} onClick={() => set(o.k)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${cur === o.k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
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

export function MultiPill({ label, icon, options, selected, onChange }: { label: string; icon?: ReactNode; options: string[]; selected: string[]; onChange: (n: string[]) => void }) {
  const { open, setOpen } = useDropdown()
  const display = selected.length === 0 ? 'todos' : `${selected.length}`
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
          selected.length === 0
            ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
            : 'bg-indigo-50 border-indigo-300 text-indigo-700'
        }`}>
        {icon}{label}: <span className="font-semibold">{display}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto w-72">
          <div className="p-2 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
            <span className="text-xs font-medium text-slate-600">{label}</span>
            {selected.length > 0 && <button onClick={() => onChange([])} className="text-xs text-indigo-600 hover:text-indigo-700">limpar</button>}
          </div>
          <div className="p-1">
            {options.length === 0
              ? <div className="px-3 py-2 text-xs text-slate-500">Nenhuma opção</div>
              : options.map(opt => {
                  const isSel = selected.includes(opt)
                  return (
                    <button key={opt} onClick={() => onChange(isSel ? selected.filter(o => o !== opt) : [...selected, opt])}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center gap-2 ${isSel ? 'text-indigo-700 font-medium' : 'text-slate-700'}`}>
                      <span className={`w-3.5 h-3.5 inline-block border rounded flex items-center justify-center ${isSel ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                        {isSel && <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M13 4L6 11L3 8" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <span className="truncate">{opt}</span>
                    </button>
                  )
                })}
          </div>
        </div>
      )}
    </div>
  )
}

export function ConsultorPill({ icon, options, selected, onChange }: { icon?: ReactNode; options: ConsultorOption[]; selected: string[]; onChange: (n: string[]) => void }) {
  const { open, setOpen } = useDropdown()
  const display = selected.length === 0 ? 'todos' : `${selected.length}`
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${selected.length > 0 ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
        {icon}Consultor: <span className="font-semibold">{display}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto w-72">
          <div className="p-2 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
            <span className="text-xs font-medium text-slate-600">Consultor</span>
            {selected.length > 0 && <button onClick={() => onChange([])} className="text-xs text-indigo-600">limpar</button>}
          </div>
          <div className="p-1">
            {options.length === 0
              ? <div className="px-3 py-2 text-xs text-slate-500">Nenhum consultor</div>
              : options.map(o => {
                  const isSel = selected.includes(o.id)
                  return (
                    <button key={o.id} onClick={() => onChange(isSel ? selected.filter(x => x !== o.id) : [...selected, o.id])}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center gap-2 ${isSel ? 'text-indigo-700 font-medium' : 'text-slate-700'}`}>
                      <span className={`w-3.5 h-3.5 inline-block border rounded flex items-center justify-center ${isSel ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                        {isSel && <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M13 4L6 11L3 8" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <span className="truncate">{o.nome}</span>
                    </button>
                  )
                })}
          </div>
        </div>
      )}
    </div>
  )
}
