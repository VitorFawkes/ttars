import { LADO_TAGS, type LadoKey, type LadoLabels } from '../../../lib/convidados/types'
import { cn } from '../../../lib/utils'

interface Props {
  value: LadoKey | ''
  labels: LadoLabels
  onChange: (value: LadoKey | '') => void
}

export function LadoSegmented({ value, labels, onChange }: Props) {
  const options: Array<{ key: LadoKey; label: string }> = [
    { key: 'ambos', label: 'Ambos' },
    { key: 'noiva', label: labels.noiva },
    { key: 'noivo', label: labels.noivo },
  ]
  return (
    <div className="inline-flex items-stretch rounded-md bg-ww-paper border border-ww-sand-dk overflow-hidden h-7 text-[11px]">
      {options.map((opt) => {
        const isActive = value === opt.key
        const tag = LADO_TAGS[opt.key]
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(isActive ? '' : opt.key)}
            className={cn(
              'px-2 transition-colors min-w-[44px] max-w-[96px] truncate',
              isActive ? 'font-semibold' : 'text-ww-n500 hover:text-ww-n700 hover:bg-white',
            )}
            style={isActive ? { background: tag.hue, color: tag.ink } : undefined}
            title={opt.label}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
