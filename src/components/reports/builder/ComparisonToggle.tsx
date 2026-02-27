import { GitCompareArrows } from 'lucide-react'
import type { ComparisonSpec } from '@/lib/reports/reportTypes'

interface ComparisonToggleProps {
    value: ComparisonSpec | null
    onChange: (comp: ComparisonSpec | null) => void
}

export default function ComparisonToggle({ value }: ComparisonToggleProps) {
    // Comparison feature is not yet supported by the backend RPC.
    // Showing disabled state to avoid saving non-functional configs.
    return (
        <div className="space-y-2 opacity-50 cursor-not-allowed" title="Comparação com período anterior estará disponível em breve">
            <div className="flex items-center gap-2 text-xs text-slate-400 pointer-events-none">
                <div className="w-8 h-4 rounded-full bg-slate-200 relative">
                    <div className="absolute top-0.5 translate-x-0.5 w-3 h-3 rounded-full bg-white shadow" />
                </div>
                <GitCompareArrows className="w-3.5 h-3.5" />
                <span>Comparar com período anterior</span>
                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Em breve</span>
            </div>
            {value && (
                <p className="text-[10px] text-amber-600">
                    Comparação salva na configuração — será ignorada na execução.
                </p>
            )}
        </div>
    )
}

export type { ComparisonToggleProps }
