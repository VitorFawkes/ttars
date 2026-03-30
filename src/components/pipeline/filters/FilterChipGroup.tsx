import { cn } from '../../../lib/utils'

interface ChipOption {
    value: string
    label: string
    color?: string
    description?: string
}

interface FilterChipGroupProps {
    options: ChipOption[]
    selected: string[]
    onToggle: (value: string) => void
}

export function FilterChipGroup({ options, selected, onToggle }: FilterChipGroupProps) {
    return (
        <div className="flex flex-wrap gap-2">
            {options.map(opt => {
                const isSelected = selected.includes(opt.value)
                return (
                    <button
                        key={opt.value}
                        onClick={() => onToggle(opt.value)}
                        className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                            isSelected
                                ? (opt.color || "bg-primary text-white border-primary") + " shadow-sm"
                                : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                        )}
                        title={opt.description}
                    >
                        {opt.label}
                    </button>
                )
            })}
        </div>
    )
}
