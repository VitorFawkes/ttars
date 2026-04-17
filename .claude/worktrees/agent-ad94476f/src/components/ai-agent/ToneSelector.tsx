import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONE_OPTIONS, type Tone } from './agent-constants'

interface ToneSelectorProps {
  value: Tone
  onChange: (value: Tone) => void
}

export function ToneSelector({ value, onChange }: ToneSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {TONE_OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'text-left p-4 rounded-xl border-2 transition-all',
              active
                ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5',
                  active ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
                )}
              >
                {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('font-semibold tracking-tight', active ? 'text-indigo-900' : 'text-slate-900')}>
                    {opt.label}
                  </span>
                  <span className="text-xs text-slate-500">— {opt.description}</span>
                </div>
                <p className={cn('text-sm mt-1.5 italic', active ? 'text-slate-700' : 'text-slate-500')}>
                  "{opt.example}"
                </p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
