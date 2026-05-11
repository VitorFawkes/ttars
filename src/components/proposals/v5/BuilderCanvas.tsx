import { useDroppable } from '@dnd-kit/core'
import { CoverEditor } from '@/components/proposals/v4/CoverEditor'
import { SectionContainer } from './sections/SectionContainer'
import { EmptyState } from './EmptyState'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { ProposalSectionWithItems, ProposalSectionType } from '@/types/proposals'

interface DropZoneProps {
    id: string
}

function DropZone({ id }: DropZoneProps) {
    const { isOver, setNodeRef } = useDroppable({ id })
    return (
        <div ref={setNodeRef} className="relative h-2">
            <div className={cn(
                'absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 rounded-full transition-all duration-200',
                isOver ? 'bg-indigo-500 scale-y-[3]' : 'bg-transparent',
            )} />
        </div>
    )
}

interface BuilderCanvasProps {
    sections: ProposalSectionWithItems[]
    onAddBlock: (sectionType: ProposalSectionType, label: string, blockType: string) => void
}

export function BuilderCanvas({ sections, onAddBlock }: BuilderCanvasProps) {
    const hasSections = sections.length > 0

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto py-6 px-4 space-y-1">
                {/* Cover */}
                <CoverEditor className="mb-4" />

                {/* Sections */}
                {hasSections ? (
                    <>
                        {sections.map((section, index) => (
                            <div key={section.id}>
                                <DropZone id={`drop-zone-${index}`} />
                                <SectionContainer section={section} />
                            </div>
                        ))}
                        <DropZone id={`drop-zone-${sections.length}`} />

                        {/* Add section button at bottom */}
                        <div className="flex justify-center pt-4 pb-8">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onAddBlock('custom', 'Nova Secao', 'custom')}
                                className="text-slate-400 hover:text-slate-600 gap-1.5"
                            >
                                <Plus className="h-4 w-4" />
                                Adicionar secao
                            </Button>
                        </div>
                    </>
                ) : (
                    <EmptyState onAddSection={onAddBlock} />
                )}
            </div>
        </div>
    )
}
