import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Search, Loader2, type LucideIcon } from 'lucide-react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { useLibrarySearch, type LibraryCategory, type LibrarySearchResult } from '@/hooks/useLibrary'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ItemCreatorDrawer } from '@/components/proposals/builder/ItemCreatorDrawer'
import type { ProposalItemType } from '@/types/proposals'

interface ProposalCatalogSectionProps {
    type: 'flights' | 'hotels' | 'experiences' | 'transfers'
    label: string
    icon: LucideIcon
    color: string
    isActive: boolean
    onActivate: () => void
    isPreview?: boolean
}

// Map section type to library category
const TYPE_TO_CATEGORY: Record<string, LibraryCategory> = {
    flights: 'flight',
    hotels: 'hotel',
    experiences: 'experience',
    transfers: 'transfer',
}

/**
 * Catalog Section - Visual item browser like Traviata
 * 
 * Features:
 * - Collapsible section with icon
 * - Search within library
 * - Visual cards for items
 * - Add/remove items to proposal
 */
export function ProposalCatalogSection({
    type,
    label,
    icon: Icon,
    color,
    isActive,
    onActivate,
    isPreview = false
}: ProposalCatalogSectionProps) {
    const { sections, addItemFromLibrary } = useProposalBuilder()
    const [search, setSearch] = useState('')
    const [isCreatorOpen, setIsCreatorOpen] = useState(false)

    // Get items from library
    const category = TYPE_TO_CATEGORY[type]
    const { data: libraryItems, isLoading } = useLibrarySearch(
        { search, category },
        isActive // Only fetch when section is active
    )

    // Note: proposalItemCount could be used for badge display if needed
    // const proposalItemCount = sections.flatMap(s => s.items || []).length

    // Color configurations
    const colorConfig: Record<string, { bg: string; text: string; border: string; light: string }> = {
        blue: { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200', light: 'bg-blue-50' },
        emerald: { bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200', light: 'bg-emerald-50' },
        amber: { bg: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200', light: 'bg-amber-50' },
        purple: { bg: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-200', light: 'bg-purple-50' },
    }

    const colors = colorConfig[color] || colorConfig.blue

    const handleAddItem = (item: LibrarySearchResult) => {
        // Find or create appropriate section
        let sectionId = sections.find(s =>
            s.title?.toLowerCase().includes(type.slice(0, -1))
        )?.id

        if (!sectionId && sections.length > 0) {
            sectionId = sections[0].id
        }

        if (!sectionId) {
            toast.error('Crie uma seção primeiro para adicionar itens')
            return
        }

        addItemFromLibrary(sectionId, item)
        toast.success(`${item.name || 'Item'} adicionado!`)
    }

    // Get section ID for creating new items
    const getTargetSectionId = () => {
        let sectionId = sections.find(s =>
            s.title?.toLowerCase().includes(type.slice(0, -1))
        )?.id
        if (!sectionId && sections.length > 0) {
            sectionId = sections[0].id
        }
        return sectionId
    }

    // Map section type to item type
    const TYPE_TO_ITEM_TYPE: Record<string, ProposalItemType> = {
        flights: 'flight',
        hotels: 'hotel',
        experiences: 'experience',
        transfers: 'transfer',
    }

    const handleOpenCreator = () => {
        const sectionId = getTargetSectionId()
        if (!sectionId) {
            toast.error('Crie uma seção primeiro para adicionar itens')
            return
        }
        setIsCreatorOpen(true)
    }

    return (
        <div className={cn(
            'bg-white rounded-xl border transition-all duration-200 overflow-hidden',
            isActive ? colors.border : 'border-slate-200'
        )}>
            {/* Section Header */}
            <button
                onClick={onActivate}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
                        isActive ? colors.bg : 'bg-slate-100'
                    )}>
                        <Icon className={cn(
                            'h-5 w-5',
                            isActive ? 'text-white' : 'text-slate-500'
                        )} />
                    </div>
                    <div className="text-left">
                        <h3 className="font-semibold text-slate-900">{label}</h3>
                        <p className="text-xs text-slate-500">
                            Clique para buscar na biblioteca
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {!isPreview && (
                        <span className={cn(
                            'text-xs px-2 py-1 rounded-full',
                            colors.light, colors.text
                        )}>
                            + Adicionar
                        </span>
                    )}
                    {isActive ? (
                        <ChevronUp className="h-5 w-5 text-slate-400" />
                    ) : (
                        <ChevronDown className="h-5 w-5 text-slate-400" />
                    )}
                </div>
            </button>

            {/* Expanded Content */}
            {isActive && (
                <div className="border-t border-slate-100 p-4">
                    {/* Search and Create */}
                    {!isPreview && (
                        <div className="flex items-center gap-2 mb-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={`Buscar ${label.toLowerCase()}...`}
                                    className="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
                                />
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleOpenCreator}
                                className="h-10 px-3 whitespace-nowrap"
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Criar
                            </Button>
                        </div>
                    )}

                    {/* Library Items */}
                    {!isPreview && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                                Biblioteca - {label}
                            </h4>

                            {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                                </div>
                            ) : libraryItems && libraryItems.length > 0 ? (
                                <div className="grid grid-cols-2 gap-3">
                                    {libraryItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className="group relative bg-white rounded-lg border border-slate-200 p-3 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                                            onClick={() => handleAddItem(item)}
                                        >
                                            <h5 className="font-medium text-sm text-slate-900 truncate">
                                                {item.name}
                                            </h5>
                                            <p className="text-xs text-slate-500 line-clamp-1">
                                                {item.destination || 'Sem descrição'}
                                            </p>
                                            {item.base_price && Number(item.base_price) > 0 && (
                                                <p className="text-sm font-semibold text-slate-900 mt-1">
                                                    R$ {Number(item.base_price).toLocaleString('pt-BR')}/pp
                                                </p>
                                            )}

                                            {/* Add Button Overlay */}
                                            <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="bg-white text-slate-900 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1">
                                                    <Plus className="h-4 w-4" />
                                                    Adicionar
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-sm text-slate-500">
                                        {search
                                            ? `Nenhum resultado para "${search}"`
                                            : 'Nenhum item encontrado na biblioteca'
                                        }
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-2"
                                        onClick={handleOpenCreator}
                                    >
                                        <Plus className="h-4 w-4 mr-1" />
                                        Criar Novo
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {/* Item Creator Drawer */}
            <ItemCreatorDrawer
                isOpen={isCreatorOpen}
                onClose={() => setIsCreatorOpen(false)}
                sectionId={getTargetSectionId() || ''}
                itemType={TYPE_TO_ITEM_TYPE[type] || 'custom'}
            />
        </div>
    )
}
