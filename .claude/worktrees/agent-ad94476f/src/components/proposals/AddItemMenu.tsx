import { useState } from 'react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { useIncrementLibraryUsage } from '@/hooks/useLibrary'
import { ITEM_TYPE_CONFIG } from '@/types/proposals'
import type { ProposalItemType } from '@/types/proposals'
import type { LibrarySearchResult } from '@/hooks/useLibrary'
import type { Json } from '@/database.types'
import { LibrarySearch } from './LibrarySearch'
import { Button } from '@/components/ui/Button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Plus, Library } from 'lucide-react'
import * as LucideIcons from 'lucide-react'

interface AddItemMenuProps {
    sectionId: string
}

export function AddItemMenu({ sectionId }: AddItemMenuProps) {
    const { addItem, updateItem } = useProposalBuilder()
    const incrementUsage = useIncrementLibraryUsage()
    const [showLibrarySearch, setShowLibrarySearch] = useState(false)

    const itemTypes = Object.entries(ITEM_TYPE_CONFIG) as [ProposalItemType, typeof ITEM_TYPE_CONFIG[ProposalItemType]][]

    const handleAddItem = (type: ProposalItemType) => {
        const config = ITEM_TYPE_CONFIG[type]
        addItem(sectionId, type, `Novo ${config.label}`)
    }

    const handleSelectFromLibrary = (libraryItem: LibrarySearchResult) => {
        // Map library category to item type
        const typeMap: Record<string, ProposalItemType> = {
            hotel: 'hotel',
            experience: 'experience',
            transfer: 'transfer',
            flight: 'flight',
            service: 'service',
            text_block: 'custom',
            custom: 'custom',
        }

        const itemType = typeMap[libraryItem.category] || 'custom'

        // Add item with library data
        addItem(sectionId, itemType, libraryItem.name)

        // Get the newly created item and update it with library content
        const state = useProposalBuilder.getState()
        const section = state.sections.find(s => s.id === sectionId)
        if (section && section.items.length > 0) {
            const newItem = section.items[section.items.length - 1]

            // Extract content from library item
            const content = libraryItem.content as {
                description?: string
                images?: string[]
                highlights?: string[]
                specs?: Record<string, unknown>
            }

            updateItem(newItem.id, {
                description: content.description || '',
                rich_content: libraryItem.content as Json,
                base_price: Number(libraryItem.base_price) || 0,
            })
        }

        // Increment usage count
        incrementUsage.mutate(libraryItem.id)

        // Close search
        setShowLibrarySearch(false)
    }

    if (showLibrarySearch) {
        return (
            <div className="p-2">
                <LibrarySearch
                    onSelectItem={handleSelectFromLibrary}
                    onCreateNew={() => setShowLibrarySearch(false)}
                />
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLibrarySearch(false)}
                    className="mt-2 w-full"
                >
                    Voltar
                </Button>
            </div>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-500">
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar Item
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
                {/* Library Search Option */}
                <DropdownMenuItem
                    onClick={() => setShowLibrarySearch(true)}
                    className="flex items-center gap-2 text-blue-600"
                >
                    <Library className="h-4 w-4" />
                    <span>Buscar na Biblioteca</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-slate-400">
                    Criar do Zero
                </DropdownMenuLabel>

                {itemTypes.map(([type, config]) => {
                    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[config.icon] || LucideIcons.Package
                    return (
                        <DropdownMenuItem
                            key={type}
                            onClick={() => handleAddItem(type)}
                            className="flex items-center gap-2"
                        >
                            <IconComponent className="h-4 w-4 text-slate-500" />
                            <span>{config.label}</span>
                        </DropdownMenuItem>
                    )
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
