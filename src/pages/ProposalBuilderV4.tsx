import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    DndContext,
    DragOverlay,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useProposal } from '@/hooks/useProposal'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { useAutoSave } from '@/hooks/useAutoSave'
import { BlockPalette } from '@/components/proposals/v4/BlockPalette'
import { BuilderCanvas } from '@/components/proposals/v4/BuilderCanvas'
import { PricingSidebar } from '@/components/proposals/v4/PricingSidebar'
import { BlockSearchDrawer } from '@/components/proposals/v4/BlockSearchDrawer'
import { BuilderHeader } from '@/components/proposals/v4/BuilderHeader'
import { BlockDragOverlay } from '@/components/proposals/v4/BlockDragOverlay'
import { Loader2 } from 'lucide-react'
import type { ProposalSectionType, ProposalItemType } from '@/types/proposals'

/**
 * ProposalBuilderV4 - Elite Proposal Builder with Block-based Architecture
 * 
 * Layout:
 * - Left: BlockPalette (200px) - Draggable blocks
 * - Center: BuilderCanvas - Proposal content
 * - Right: PricingSidebar (250px) - Pricing summary
 * 
 * Features:
 * - Drag & drop blocks from palette to canvas
 * - Smart search when dropping travel blocks (Hotel, Flight, etc.)
 * - AI extraction for flight images
 * - Real-time pricing updates
 */

// Block type definitions
export type BlockType =
    // Travel
    | 'hotel'
    | 'flight'
    | 'cruise'
    | 'car'
    | 'transfer'    // Aeroporto ↔ Hotel
    | 'experience'  // Passeios com data/hora
    | 'insurance'   // Seguro viagem
    | 'custom'      // Seção livre "Outros"
    // Content
    | 'title'
    | 'text'
    | 'image'
    | 'video'
    // Layout
    | 'divider'
    | 'table'

// Blocks that require library search
export const SEARCHABLE_BLOCKS: BlockType[] = ['hotel', 'flight', 'cruise', 'car', 'experience']

// Map block type to section type
export const BLOCK_TO_SECTION_TYPE: Record<BlockType, ProposalSectionType> = {
    hotel: 'hotels',
    flight: 'flights',
    cruise: 'custom',
    car: 'transfers',
    transfer: 'transfers',
    experience: 'custom',
    insurance: 'custom',
    custom: 'custom',
    title: 'custom',
    text: 'custom',
    image: 'custom',
    video: 'custom',
    divider: 'custom',
    table: 'custom',
}

// Map block type to item type
export const BLOCK_TO_ITEM_TYPE: Record<BlockType, ProposalItemType> = {
    hotel: 'hotel',
    flight: 'flight',
    cruise: 'custom',
    car: 'transfer',
    transfer: 'transfer',
    experience: 'experience',
    insurance: 'insurance',
    custom: 'custom',
    title: 'custom',
    text: 'custom',
    image: 'custom',
    video: 'custom',
    divider: 'custom',
    table: 'custom',
}

export default function ProposalBuilderV4() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()

    // Data fetching
    const { data: proposal, isLoading, error } = useProposal(id!)
    const { initialize, reset, isDirty, isSaving, sections, insertSectionAt } = useProposalBuilder()

    // Auto-save
    useAutoSave()

    // DnD state
    const [activeBlockType, setActiveBlockType] = useState<BlockType | null>(null)
    const [searchDrawer, setSearchDrawer] = useState<{
        isOpen: boolean
        blockType: BlockType | null
        sectionId: string | null
    }>({ isOpen: false, blockType: null, sectionId: null })

    // DnD sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor)
    )

    // Initialize builder when proposal loads - FIXED: useEffect instead of useState
    useEffect(() => {
        if (proposal?.active_version) {
            initialize(
                proposal,
                proposal.active_version,
                proposal.active_version.sections || []
            )
        }
        return () => reset()
    }, [proposal, initialize, reset])

    // Handle drag start
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const blockType = event.active.data.current?.blockType as BlockType
        if (blockType) {
            setActiveBlockType(blockType)
        }
    }, [])

    // Handle drag end - block dropped on canvas
    // Refactored: No more setTimeout race conditions - uses sync returns from Zustand
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event
        setActiveBlockType(null)

        if (!over) return

        const blockType = active.data.current?.blockType as BlockType
        if (!blockType) return

        // Determine insertion index from drop zone
        const overId = String(over.id)
        let insertIndex = sections.length // default: end

        if (overId.startsWith('drop-zone-')) {
            insertIndex = parseInt(overId.replace('drop-zone-', ''), 10)
        }

        const sectionType = BLOCK_TO_SECTION_TYPE[blockType]
        const { addItem, updateItem } = useProposalBuilder.getState()

        // Helper: Create section and add item with rich_content in one sync flow
        const createBlockWithContent = (
            title: string,
            richContent: Record<string, unknown>
        ) => {
            const sectionId = insertSectionAt(insertIndex, sectionType, '')
            const itemId = addItem(sectionId, 'custom', title)
            updateItem(itemId, {
                title: (richContent.title as string) || '',
                rich_content: richContent as any, // Json type from Supabase
            })
        }

        // Content blocks - create section + item immediately
        switch (blockType) {
            case 'text':
                createBlockWithContent('Texto', { is_text_block: true, content: '' })
                return

            case 'title':
                createBlockWithContent('Título', { is_title_block: true, title: 'Novo Título' })
                return

            case 'divider':
                createBlockWithContent('Divisor', { is_divider_block: true })
                return

            case 'image':
                createBlockWithContent('Imagem', { is_image_block: true, image_url: '' })
                return

            case 'video':
                createBlockWithContent('Vídeo', { is_video_block: true, video_url: '' })
                return
        }

        // Searchable blocks - create section then open drawer
        if (SEARCHABLE_BLOCKS.includes(blockType)) {
            const sectionId = insertSectionAt(insertIndex, sectionType, getDefaultTitle(blockType))

            // Open search drawer with the section ID (no setTimeout needed)
            setSearchDrawer({
                isOpen: true,
                blockType,
                sectionId,
            })
            return
        }

        // Other blocks - just create section with default title
        insertSectionAt(insertIndex, sectionType, getDefaultTitle(blockType))
    }, [insertSectionAt, sections])

    // Close search drawer
    const handleCloseSearchDrawer = useCallback(() => {
        setSearchDrawer({ isOpen: false, blockType: null, sectionId: null })
    }, [])

    // Loading state
    if (isLoading) {
        return (
            <div className="h-dvh flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-slate-500">Carregando proposta...</p>
                </div>
            </div>
        )
    }

    // Error state
    if (error || !proposal) {
        return (
            <div className="h-dvh flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <p className="text-red-500 mb-4">Erro ao carregar proposta</p>
                    <button
                        onClick={() => navigate('/proposals')}
                        className="text-blue-600 hover:underline"
                    >
                        Voltar para propostas
                    </button>
                </div>
            </div>
        )
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="h-dvh flex flex-col bg-slate-50 overflow-hidden">
                {/* Header */}
                <BuilderHeader
                    proposal={proposal}
                    isDirty={isDirty}
                    isSaving={isSaving}
                />

                {/* Main Content - 3 Column Layout */}
                <div className="flex-1 flex min-h-0">
                    {/* Left: Block Palette (200px) */}
                    <BlockPalette />

                    {/* Center: Canvas */}
                    <div className="flex-1 h-full overflow-hidden">
                        <SortableContext
                            items={sections.map(s => s.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <BuilderCanvas sections={sections} />
                        </SortableContext>
                    </div>

                    {/* Right: Pricing Sidebar (250px) */}
                    <PricingSidebar sections={sections} />
                </div>
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
                {activeBlockType && (
                    <BlockDragOverlay blockType={activeBlockType} />
                )}
            </DragOverlay>

            {/* Search Drawer */}
            <BlockSearchDrawer
                isOpen={searchDrawer.isOpen}
                blockType={searchDrawer.blockType}
                sectionId={searchDrawer.sectionId}
                onClose={handleCloseSearchDrawer}
            />
        </DndContext>
    )
}

// Helper function for default titles
function getDefaultTitle(blockType: BlockType): string {
    const titles: Record<BlockType, string> = {
        hotel: 'Hospedagem',
        flight: 'Passagem Aérea',
        cruise: 'Cruzeiro',
        car: 'Locação de Carro',
        transfer: 'Transfers',
        experience: 'Experiências',
        insurance: 'Seguro Viagem',
        custom: 'Nova Seção',
        title: 'Título',
        text: 'Texto',
        image: 'Imagem',
        video: 'Vídeo',
        divider: '',
        table: 'Tabela',
    }
    return titles[blockType] || 'Seção'
}

