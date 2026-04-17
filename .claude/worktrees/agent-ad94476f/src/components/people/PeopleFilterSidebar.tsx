import { Filter, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import type { PeopleFilters } from '../../hooks/usePeopleIntelligence'

interface PeopleFilterSidebarProps {
    isOpen: boolean
    onClose: () => void
    filters: PeopleFilters
    setFilters: (filters: PeopleFilters) => void
}

export default function PeopleFilterSidebar({ isOpen, onClose, filters, setFilters }: PeopleFilterSidebarProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white border-l border-gray-200 shadow-xl transform transition-transform duration-300 z-50 overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white/50 backdrop-blur-sm sticky top-0">
                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                    <Filter className="h-4 w-4" />
                    <h3>Filtros Avançados</h3>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                </button>
            </div>

            <div className="p-4 space-y-6">
                {/* Type Section */}
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-900">Tipo de Pessoa</h4>
                    <div className="flex gap-2">
                        {(['all', 'adulto', 'crianca'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilters({ ...filters, type })}
                                className={`flex-1 px-3 py-2 text-xs font-medium rounded-md border transition-colors ${filters.type === type
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                {type === 'all' ? 'Todos' : type === 'adulto' ? 'Adultos' : 'Crianças'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Financial Section */}
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-900">Financeiro</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Mínimo</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs z-10">R$</span>
                                <Input
                                    type="number"
                                    value={filters.minSpend || ''}
                                    onChange={(e) => setFilters({ ...filters, minSpend: e.target.value ? Number(e.target.value) : undefined })}
                                    className="pl-8"
                                    placeholder="0"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Máximo</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs z-10">R$</span>
                                <Input
                                    type="number"
                                    value={filters.maxSpend || ''}
                                    onChange={(e) => setFilters({ ...filters, maxSpend: e.target.value ? Number(e.target.value) : undefined })}
                                    className="pl-8"
                                    placeholder="∞"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Travel History Section */}
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-900">Histórico de Viagens</h4>

                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Última viagem após</label>
                        <Input
                            type="date"
                            value={filters.lastTripAfter || ''}
                            onChange={(e) => setFilters({ ...filters, lastTripAfter: e.target.value })}
                        />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={filters.isGroupLeader || false}
                            onChange={(e) => setFilters({ ...filters, isGroupLeader: e.target.checked })}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-600 group-hover:text-gray-900">Apenas Líderes de Grupo</span>
                    </label>
                </div>

                {/* Actions */}
                <div className="pt-6 border-t border-gray-100">
                    <Button
                        variant="outline"
                        onClick={() => setFilters({ search: '', type: 'all' })}
                        className="w-full text-gray-600"
                    >
                        Limpar Filtros
                    </Button>
                </div>
            </div>
        </div>
    )
}
