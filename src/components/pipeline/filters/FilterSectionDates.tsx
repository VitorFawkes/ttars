import { Calendar, Clock } from 'lucide-react'
import type { FilterState } from '../../../hooks/usePipelineFilters'

interface FilterSectionDatesProps {
    filters: FilterState
    onUpdate: (partial: Partial<FilterState>) => void
}

export function FilterSectionDates({ filters, onUpdate }: FilterSectionDatesProps) {
    return (
        <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Calendar className="h-3 w-3" /> Datas
            </h3>

            {/* Data da Viagem */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                <label className="text-sm font-semibold text-gray-700 block">Data da Viagem</label>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <span className="text-xs text-gray-500 ml-1">De</span>
                        <input
                            type="date"
                            className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                            value={filters.startDate || ''}
                            onChange={(e) => onUpdate({ startDate: e.target.value || undefined })}
                        />
                    </div>
                    <div className="space-y-1">
                        <span className="text-xs text-gray-500 ml-1">Até</span>
                        <input
                            type="date"
                            className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                            value={filters.endDate || ''}
                            onChange={(e) => onUpdate({ endDate: e.target.value || undefined })}
                        />
                    </div>
                </div>
            </div>

            {/* Data de Criação */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                <label className="text-sm font-semibold text-gray-700 block flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-gray-400" /> Data de Criação
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <span className="text-xs text-gray-500 ml-1">De</span>
                        <input
                            type="date"
                            className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                            value={filters.creationStartDate || ''}
                            onChange={(e) => onUpdate({ creationStartDate: e.target.value || undefined })}
                        />
                    </div>
                    <div className="space-y-1">
                        <span className="text-xs text-gray-500 ml-1">Até</span>
                        <input
                            type="date"
                            className="w-full h-10 rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-slate-50 outline-none transition-all px-3"
                            value={filters.creationEndDate || ''}
                            onChange={(e) => onUpdate({ creationEndDate: e.target.value || undefined })}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
