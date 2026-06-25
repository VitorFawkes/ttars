import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import { FIELD, LBL } from './fieldStyles'

// Campos inline reaproveitados pelos blocos do Planejamento (salvam on-blur via
// usePlanejamentoCampos.save). Constantes/helper em ./fieldStyles (arquivo .ts).

export function TextField({
  label, value, type = 'text', placeholder, onSave,
}: { label: string; value: string; type?: string; placeholder?: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  return (
    <label className="block">
      <span className={LBL}>{label}</span>
      <input
        type={type}
        value={local}
        placeholder={placeholder}
        inputMode={type === 'number' ? 'decimal' : undefined}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onSave(local.trim()) }}
        className={cn(FIELD, 'mt-1')}
      />
    </label>
  )
}

export function SelectField({
  label, value, options, onSave,
}: { label: string; value: string; options: string[]; onSave: (v: string) => void }) {
  return (
    <label className="block">
      <span className={LBL}>{label}</span>
      <select value={value} onChange={(e) => onSave(e.target.value)} className={cn(FIELD, 'mt-1')}>
        <option value="">— selecionar —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

export function TextAreaField({
  label, value, rows = 3, placeholder, onSave,
}: { label: string; value: string; rows?: number; placeholder?: string; onSave: (v: string) => void }) {
  return (
    <label className="block">
      <span className={LBL}>{label}</span>
      <textarea
        defaultValue={value}
        rows={rows}
        placeholder={placeholder}
        onBlur={(e) => { if (e.target.value.trim() !== value) onSave(e.target.value.trim()) }}
        className={cn(FIELD, 'mt-1')}
      />
    </label>
  )
}

export function BoolField({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none py-1.5">
      <button
        type="button"
        onClick={() => onToggle(!checked)}
        className={cn(
          'w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors',
          checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-slate-400',
        )}
        aria-pressed={checked}
      >
        {checked && <Check className="w-3.5 h-3.5" />}
      </button>
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  )
}
