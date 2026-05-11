import { useEffect, useCallback, useMemo } from 'react'
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
} from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Loader2 } from 'lucide-react'
import { useProposal } from '@/hooks/useProposal'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { useAutoSave } from '@/hooks/useAutoSave'
import { BuilderHeader } from './BuilderHeader'
import { BuilderSidebar } from './BuilderSidebar'
import { BuilderCanvas } from './BuilderCanvas'
import { PricingSidebar } from './pricing/PricingSidebar'
import { CommandPalette } from './CommandPalette'
import { useCommandPalette } from './hooks/useCommandPalette'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { BlockDragOverlay } from '@/components/proposals/v4/BlockDragOverlay'
import { BlockSearchDrawer } from '@/components/proposals/v4/BlockSearchDrawer'
import { useState } from 'react'
import type { ProposalSectionType } from '@/types/proposals'

// Blocks that open the search drawer when added
const SEARCHABLE_BLOCKS = ['hotel', 'flight', 'cruise', 'car', 'experience']

// Map block type → section type
const BLOCK_SECTION_MAP: Record<string, ProposalSectionType> = {
    hotel: 'hotels', flight: 'flights', cruise: 'custom', car: 'transfers',
    transfer: 'transfers', experience: 'custom', insurance: 'custom', custom: 'custom',
    title: 'custom', text: 'custom', image: 'custom', video: 'custom', divider: 'custom',
}

// Default section titles
const DEFAULT_TITLES: Record<string, string> = {
    hotel: 'Hospedagem', flight: 'Passagem Aerea', cruise: 'Cruzeiro', car: 'Locacao de Carro',
    transfer: 'Transfers', experience: 'Experiencias', insurance: 'Seguro Viagem', custom: 'Nova Secao',
    title: '', text: '', image: '', video: '', divider: '',
}

export default function BuilderPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { data: proposal, isLoading, error } = useProposal(id!)
    const { initialize, reset, sections, addSection, save } = useProposalBuilder()
    const commandPalette = useCommandPalette()

    useAutoSave()

    // DnD
    const [activeBlockType, setActiveBlockType] = useState<string | null>(null)
    const [searchDrawer, setSearchDrawer] = useState<{ isOpen: boolean; blockType: string | null; sectionId: string | null }>({
        isOpen: false, blockType: null, sectionId: null,
    })

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor),
    )

    // Initialize store
    useEffect(() => {
        if (proposal?.active_version) {
            initialize(proposal, proposal.active_version, proposal.active_version.sections || [])
        }
        return () => reset()
    }, [proposal, initialize, reset])

    // Keyboard shortcuts
    const shortcuts = useMemo(() => ({
        'mod+/': () => commandPalette.toggle(),
        'mod+s': () => save(),
        'escape': () => commandPalette.close(),
    }), [commandPalette, save])
    useKeyboardShortcuts(shortcuts)

    // Add block from sidebar (click-to-add)
    const handleAddBlock = useCallback((sectionType: ProposalSectionType, label: string, blockType: string) => {
        const resolvedSectionType = BLOCK_SECTION_MAP[blockType] || sectionType

        // Helper: find existing section of same type to reuse
        const findExistingSection = (type: ProposalSectionType) =>
            sections.find(s => s.section_type === type)

        // Content blocks — create section + item immediately (always new section)
        if (['text', 'title', 'divider', 'image', 'video'].includes(blockType)) {
            const { addItem: storeAddItem, updateItem: storeUpdateItem } = useProposalBuilder.getState()
            const sectionId = addSection(resolvedSectionType, '')
            const itemId = storeAddItem(sectionId, 'custom', label)
            const richContentMap: Record<string, Record<string, unknown>> = {
                text: { is_text_block: true, content: '' },
                title: { is_title_block: true, title: 'Novo Titulo' },
                divider: { is_divider_block: true },
                image: { is_image_block: true, image_url: '' },
                video: { is_video_block: true, video_url: '' },
            }
            storeUpdateItem(itemId, { title: label, rich_content: richContentMap[blockType] as unknown as import('@/database.types').Json })
            return
        }

        // Searchable blocks — reuse existing section if available, otherwise create
        if (SEARCHABLE_BLOCKS.includes(blockType)) {
            const existing = findExistingSection(resolvedSectionType)
            const sectionId = existing?.id || addSection(resolvedSectionType, DEFAULT_TITLES[blockType] || label)
            setSearchDrawer({ isOpen: true, blockType, sectionId })
            return
        }

        // Other — reuse or create
        const existing = findExistingSection(resolvedSectionType)
        if (!existing) {
            addSection(resolvedSectionType, DEFAULT_TITLES[blockType] || label)
        }
    }, [addSection, sections])

    // DnD handlers (for section reordering in canvas)
    const handleDragStart = useCallback((e: DragStartEvent) => {
        const bt = e.active.data.current?.blockType as string | undefined
        if (bt) setActiveBlockType(bt)
    }, [])

    const handleDragEnd = useCallback(function onDragEnd() {
        setActiveBlockType(null)
        // Section reordering is handled inside BuilderCanvas via SortableContext
    }, [])

    // Loading / Error states
    if (isLoading) {
        return (
            <div className="h-dvh flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">Carregando proposta...</p>
                </div>
            </div>
        )
    }

    if (error || !proposal) {
        return (
            <div className="h-dvh flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <p className="text-red-500 mb-3 text-sm">Erro ao carregar proposta</p>
                    <button onClick={() => navigate('/proposals')} className="text-sm text-indigo-600 hover:underline">
                        Voltar para propostas
                    </button>
                </div>
            </div>
        )
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="h-dvh flex flex-col bg-slate-50 overflow-hidden">
                <BuilderHeader proposal={proposal} />

                <div className="flex-1 flex min-h-0">
                    <BuilderSidebar onAddBlock={handleAddBlock} onOpenCommandPalette={commandPalette.open} />

                    <div className="flex-1 h-full overflow-hidden">
                        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                            <BuilderCanvas sections={sections} onAddBlock={handleAddBlock} />
                        </SortableContext>
                    </div>

                    <PricingSidebar sections={sections} />
                </div>
            </div>

            <DragOverlay>
                {activeBlockType && <BlockDragOverlay blockType={activeBlockType as import('@/pages/ProposalBuilderV4').BlockType} />}
            </DragOverlay>

            <BlockSearchDrawer
                isOpen={searchDrawer.isOpen}
                blockType={searchDrawer.blockType as import('@/pages/ProposalBuilderV4').BlockType | null}
                sectionId={searchDrawer.sectionId}
                onClose={() => setSearchDrawer({ isOpen: false, blockType: null, sectionId: null })}
            />

            <CommandPalette onAddBlock={handleAddBlock} />
        </DndContext>
    )
}
