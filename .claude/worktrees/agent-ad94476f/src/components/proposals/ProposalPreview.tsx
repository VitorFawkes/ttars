import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { SECTION_TYPE_CONFIG } from '@/types/proposals'
import { Eye, Smartphone, Monitor } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { FlightItinerary } from './public/FlightItinerary'

type ViewMode = 'desktop' | 'mobile'

export function ProposalPreview() {
    const { version, sections } = useProposalBuilder()
    const [viewMode, setViewMode] = useState<ViewMode>('desktop')

    if (!version) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50">
                <div className="text-center text-slate-400">
                    <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Pré-visualização</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col bg-slate-100">
            {/* Preview Header */}
            <div className="flex-none h-10 px-3 flex items-center justify-between bg-slate-200/50 border-b border-slate-300/50">
                <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    Pré-visualização
                </span>
                <div className="flex items-center gap-1 bg-slate-300/50 rounded-md p-0.5">
                    <button
                        onClick={() => setViewMode('desktop')}
                        className={cn(
                            'p-1 rounded transition-colors',
                            viewMode === 'desktop' ? 'bg-white shadow-sm' : 'hover:bg-white/50'
                        )}
                    >
                        <Monitor className="h-3.5 w-3.5 text-slate-600" />
                    </button>
                    <button
                        onClick={() => setViewMode('mobile')}
                        className={cn(
                            'p-1 rounded transition-colors',
                            viewMode === 'mobile' ? 'bg-white shadow-sm' : 'hover:bg-white/50'
                        )}
                    >
                        <Smartphone className="h-3.5 w-3.5 text-slate-600" />
                    </button>
                </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-auto p-4 flex justify-center">
                <div
                    className={cn(
                        'bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300',
                        viewMode === 'mobile' ? 'w-[375px]' : 'w-full max-w-3xl'
                    )}
                >
                    {/* Simulated Proposal Content */}
                    <div className="p-6">
                        {/* Header */}
                        <div className="text-center mb-8 pb-6 border-b border-slate-100">
                            <h1 className="text-2xl font-bold text-slate-900 mb-2">
                                {version.title || 'Nova Proposta'}
                            </h1>
                            <p className="text-sm text-slate-500">
                                Proposta de viagem personalizada
                            </p>
                        </div>

                        {/* Sections Preview */}
                        {sections.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <p className="text-sm">Adicione seções para ver a prévia</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {sections.map((section) => {
                                    const config = SECTION_TYPE_CONFIG[section.section_type]
                                    return (
                                        <div key={section.id} className="border border-slate-100 rounded-lg p-4">
                                            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                                <span className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-xs">
                                                    {config?.icon || '📄'}
                                                </span>
                                                {section.title}
                                            </h3>

                                            {section.items && section.items.length > 0 ? (
                                                <div className="space-y-2">
                                                    {section.items.map((item) => {
                                                        if (item.item_type === 'flight') {
                                                            return (
                                                                <div key={item.id} className="mb-4">
                                                                    <FlightItinerary
                                                                        item={item}
                                                                        isSelected={false}
                                                                        onToggle={() => { }}
                                                                    />
                                                                </div>
                                                            )
                                                        }

                                                        return (
                                                            <div
                                                                key={item.id}
                                                                className="flex items-center justify-between p-3 bg-slate-50 rounded-md"
                                                            >
                                                                <div>
                                                                    <p className="font-medium text-sm text-slate-700">
                                                                        {item.title}
                                                                    </p>
                                                                    {item.description && (
                                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                                            {item.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                {item.base_price && item.base_price > 0 && (
                                                                    <span className="text-sm font-semibold text-green-600">
                                                                        R$ {item.base_price.toLocaleString('pt-BR')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-400 italic">
                                                    Nenhum item adicionado
                                                </p>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* Footer */}
                        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                            <p className="text-xs text-slate-400">
                                Esta é uma pré-visualização. O cliente verá uma versão mais completa.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
