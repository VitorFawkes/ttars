import { LADO_TAGS, type LadoKey } from '../../../lib/convidados/types'
import { cn } from '../../../lib/utils'

interface Props {
  value: LadoKey | ''
  onChange: (value: LadoKey | '') => void
}

const OPTIONS: Array<{ key: LadoKey; label: string }> = [
  { key: 'ambos', label: 'Ambos' },
  { key: 'noiva', label: 'Noiva' },
  { key: 'noivo', label: 'Noivo' },
]

export function LadoSegmented({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-stretch rounded-md bg-ww-paper border border-ww-sand-dk overflow-hidden h-7 text-[11px]">
      {OPTIONS.map((opt) => {
        const isActive = value === opt.key
        const tag = LADO_TAGS[opt.key]
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(isActive ? '' : opt.key)}
            className={cn(
              'px-2 transition-colors min-w-[44px]',
              isActive ? 'font-semibold' : 'text-ww-n500 hover:text-ww-n700 hover:bg-white',
            )}
            style={isActive ? { background: tag.hue, color: tag.ink } : undefined}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
