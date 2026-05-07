interface PrioridadeSelectProps {
  value: string
  onChange: (value: string) => void
}

export function PrioridadeSelect({ value, onChange }: PrioridadeSelectProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
        Prioridade
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
      >
        <option value="baixa">Baixa</option>
        <option value="media">Média</option>
        <option value="alta">Alta</option>
      </select>
    </div>
  )
}
