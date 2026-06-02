import { useState } from 'react'
import { Plus, X } from 'lucide-react'

// Edita uma lista de dias (ex: [1, 3, 7]) como "chips" removíveis + um campo pra adicionar.
// Usado pelos dias da retomada (follow-up). Mantém os dias em ordem e sem repetir.
export function DaysField({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  const [novo, setNovo] = useState('')
  const dias = [...value].sort((a, b) => a - b)

  const add = () => {
    const n = parseInt(novo.trim(), 10)
    if (Number.isFinite(n) && n > 0 && !dias.includes(n)) onChange([...dias, n].sort((a, b) => a - b))
    setNovo('')
  }
  const remove = (d: number) => onChange(dias.filter(x => x !== d))

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dias.map(d => (
        <span key={d} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-md bg-violet-50 text-violet-700 text-sm border border-violet-200">
          {d === 1 ? 'no 1º dia' : `${d} dias depois`}
          <button type="button" onClick={() => remove(d)} className="p-0.5 rounded hover:bg-violet-100 active:scale-90 transition-transform" title="Remover">
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="number" min={1} value={novo}
          onChange={e => setNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="ex: 14"
          className="w-20 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
        <button type="button" onClick={add} disabled={!novo.trim()} className="shrink-0 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white active:scale-95 transition-transform" title="Adicionar dia">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
