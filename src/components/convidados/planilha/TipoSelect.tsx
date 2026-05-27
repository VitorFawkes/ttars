import { TIPOS, TIPO_TAGS, type TipoKey } from '../../../lib/convidados/types'

interface Props {
  value: TipoKey | ''
  onChange: (value: TipoKey | '') => void
}

export function TipoSelect({ value, onChange }: Props) {
  const tag = value ? TIPO_TAGS[value] : null
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TipoKey | '')}
      className="text-[13px] rounded px-1.5 py-1 border border-transparent focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none cursor-pointer w-full"
      style={tag ? { background: tag.hue, color: tag.ink, fontWeight: 500 } : { background: 'transparent', color: '#5C5751' }}
    >
      <option value="">—</option>
      {TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
    </select>
  )
}
