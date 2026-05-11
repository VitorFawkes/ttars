import { SIMULATOR_PRESETS, type SimulatorPreset } from '@/lib/simulator-presets'
import { cn } from '@/lib/utils'

interface ScenarioPresetPickerProps {
  currentPresetId?: string | null
  onSelect: (preset: SimulatorPreset) => void
}

export function ScenarioPresetPicker({ currentPresetId, onSelect }: ScenarioPresetPickerProps) {
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {SIMULATOR_PRESETS.map((preset) => {
          const active = currentPresetId === preset.id
          return (
            <button
              key={preset.id}
              onClick={() => onSelect(preset)}
              className={cn(
                'w-full text-left p-2.5 rounded-lg border-2 transition-all',
                active
                  ? 'border-indigo-500 bg-indigo-50/50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{preset.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium truncate', active ? 'text-indigo-900' : 'text-slate-900')}>
                    {preset.label}
                  </p>
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{preset.description}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
