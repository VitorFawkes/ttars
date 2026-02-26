import { cn } from '@/lib/utils'
import { SOURCE_LIST } from '@/lib/reports/sourceMap'
import type { DataSource } from '@/lib/reports/reportTypes'

interface SourceSelectorProps {
    value: DataSource | null
    onChange: (source: DataSource) => void
}

export default function SourceSelector({ value, onChange }: SourceSelectorProps) {
    return (
        <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Fonte de Dados
            </label>
            <div className="grid grid-cols-1 gap-1.5">
                {SOURCE_LIST.map((source) => {
                    const Icon = source.icon
                    const isActive = value === source.key
                    return (
                        <button
                            key={source.key}
                            onClick={() => onChange(source.key)}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-150',
                                isActive
                                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                                    : 'text-slate-600 hover:bg-slate-50'
                            )}
                        >
                            <div className={cn(
                                'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
                                isActive ? 'bg-indigo-100' : source.bgColor
                            )}>
                                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-indigo-600' : source.color)} />
                            </div>
                            <div className="min-w-0">
                                <div className="font-medium truncate">{source.label}</div>
                                <div className="text-xs text-slate-400 truncate">{source.description}</div>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
