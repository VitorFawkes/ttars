import { FAIXAS, type FaixaKey } from '../../../lib/convidados/types'

interface Props {
  value: FaixaKey
  onChange: (value: FaixaKey) => void
}

export function FaixaSelect({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as FaixaKey)}
      className="text-[13px] rounded px-1.5 py-1 border border-transparent focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none cursor-pointer w-full bg-transparent text-ww-n700"
    >
      {FAIXAS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
    </select>
  )
}
