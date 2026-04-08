/**
 * EditorCanvas — Canvas central do editor de portal da viagem.
 *
 * Renderiza blocos organizados por dia:
 * - day_header: cards expandíveis com data e cidade
 * - Filhos de cada dia: voucher, tip, photo, video, etc
 * - Blocos órfãos (sem dia): no final
 */

import { useDroppable } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTripPlanEditor, BLOCK_TYPE_CONFIG, type TripPlanBlock } from '@/hooks/useTripPlanEditor'
import { cn } from '@/lib/utils'
import { DayHeaderBlock } from './blocks/DayHeaderBlock'
import { TipBlock } from './blocks/TipBlock'
import { PhotoBlock } from './blocks/PhotoBlock'
import { VideoBlock } from './blocks/VideoBlock'
import { ContactBlock } from './blocks/ContactBlock'
import { ChecklistBlock } from './blocks/ChecklistBlock'
import { VoucherBlock } from './blocks/VoucherBlock'
import { PreTripBlock } from './blocks/PreTripBlock'
import { TravelItemBlock } from './blocks/TravelItemBlock'
import {
    Plus,
    Trash2,
    GripVertical,
    Eye,
    EyeOff,
} from 'lucide-react'

interface EditorCanvasProps {
    tripPlanId: string
}

export function EditorCanvas({ tripPlanId }: EditorCanvasProps) {
    const {
        blocks,
        getDayBlocks,
        getChildrenOfDay,
        getOrphanBlocks,
        removeBlock,
        updateBlockData,
        publishBlock,
        unpublishBlock,
        selectBlock,
        selectedBlockId,
    } = useTripPlanEditor()

    const days = getDayBlocks()
    const orphans = getOrphanBlocks()

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto space-y-4">
                {/* Days — sortable */}
                <SortableContext items={days.map(d => d.id)} strategy={verticalListSortingStrategy}>
                {days.map(day => (
                    <DayContainer
                        key={day.id}
                        day={day}
                        children={getChildrenOfDay(day.id)}
                        isSelected={selectedBlockId === day.id}
                        onSelect={() => selectBlock(day.id)}
                        onRemove={() => removeBlock(day.id)}
                        onUpdate={(data) => updateBlockData(day.id, data)}
                        onRemoveChild={removeBlock}
                        onUpdateChild={updateBlockData}
                        onPublishChild={publishBlock}
                        onUnpublishChild={unpublishBlock}
                        onSelectChild={selectBlock}
                        selectedBlockId={selectedBlockId}
                        tripPlanId={tripPlanId}
                    />
                ))}
                </SortableContext>

                {/* Orphan blocks (not assigned to a day) */}
                {orphans.length > 0 && (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-4">
                        <h3 className="text-sm font-medium text-slate-500 mb-3">
                            Blocos sem dia atribuído
                        </h3>
                        <div className="space-y-2">
                            {orphans.map(block => (
                                <BlockRenderer
                                    key={block.id}
                                    block={block}
                                    isSelected={selectedBlockId === block.id}
                                    onSelect={() => selectBlock(block.id)}
                                    onRemove={() => removeBlock(block.id)}
                                    onUpdate={(data) => updateBlockData(block.id, data)}
                                    onPublish={() => publishBlock(block.id)}
                                    onUnpublish={() => unpublishBlock(block.id)}
                                    tripPlanId={tripPlanId}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {blocks.length === 0 && (
                    <div className="text-center py-16">
                        <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                            <Plus className="h-8 w-8 text-indigo-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">
                            Comece a montar o portal
                        </h3>
                        <p className="text-sm text-slate-500 max-w-md mx-auto">
                            Arraste blocos da paleta à esquerda para criar o cronograma
                            dia-a-dia da viagem do cliente.
                        </p>
                    </div>
                )}

                {/* Drop zone at the end */}
                <DropZone id="canvas-end" />
            </div>
        </div>
    )
}

// ─── Day Container ──────────────────────────────────────────────────────────

interface DayContainerProps {
    day: TripPlanBlock
    children: TripPlanBlock[]
    isSelected: boolean
    onSelect: () => void
    onRemove: () => void
    onUpdate: (data: Record<string, unknown>) => void
    onRemoveChild: (id: string) => void
    onUpdateChild: (id: string, data: Record<string, unknown>) => void
    onPublishChild: (id: string) => void
    onUnpublishChild: (id: string) => void
    onSelectChild: (id: string | null) => void
    selectedBlockId: string | null
    tripPlanId: string
}

function DayContainer({
    day,
    children,
    isSelected,
    onSelect,
    onRemove,
    onUpdate,
    onRemoveChild,
    onUpdateChild,
    onPublishChild,
    onUnpublishChild,
    onSelectChild,
    selectedBlockId,
    tripPlanId,
}: DayContainerProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: day.id })
    const style = { transform: CSS.Transform.toString(transform), transition }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'bg-white rounded-xl border shadow-sm overflow-hidden transition-all',
                isSelected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200',
                isDragging && 'opacity-50 shadow-lg'
            )}
        >
            {/* Day header */}
            <div
                onClick={onSelect}
                className="flex items-center justify-between px-4 py-3 bg-indigo-50/50 border-b border-indigo-100 cursor-pointer"
            >
                <button {...attributes} {...listeners} className="p-1 cursor-grab active:cursor-grabbing mr-1 shrink-0">
                    <GripVertical className="h-4 w-4 text-indigo-300" />
                </button>
                <DayHeaderBlock
                    data={day.data}
                    onChange={onUpdate}
                />
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    <PublishToggle
                        isPublished={day.is_published}
                        onPublish={() => onUpdate({ ...day.data })}
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove() }}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Day children — sortable */}
            <div className="p-3 space-y-2">
                <SortableContext items={children.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {children.map(block => (
                    <BlockRenderer
                        key={block.id}
                        block={block}
                        isSelected={selectedBlockId === block.id}
                        onSelect={() => onSelectChild(block.id)}
                        onRemove={() => onRemoveChild(block.id)}
                        onUpdate={(data) => onUpdateChild(block.id, data)}
                        onPublish={() => onPublishChild(block.id)}
                        onUnpublish={() => onUnpublishChild(block.id)}
                        tripPlanId={tripPlanId}
                    />
                ))}
                </SortableContext>

                {/* Drop zone inside day */}
                <DropZone id={`day-drop-${day.id}`} />

                {children.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">
                        Arraste blocos aqui para este dia
                    </p>
                )}
            </div>
        </div>
    )
}

// ─── Block Renderer ─────────────────────────────────────────────────────────

interface BlockRendererProps {
    block: TripPlanBlock
    isSelected: boolean
    onSelect: () => void
    onRemove: () => void
    onUpdate: (data: Record<string, unknown>) => void
    onPublish: () => void
    onUnpublish: () => void
    tripPlanId: string
}

function BlockRenderer({
    block,
    isSelected,
    onSelect,
    onRemove,
    onUpdate,
    onPublish,
    onUnpublish,
    tripPlanId,
}: BlockRendererProps) {
    const config = BLOCK_TYPE_CONFIG[block.block_type]
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
    const style = { transform: CSS.Transform.toString(transform), transition }

    const editorMap: Record<string, React.ReactNode> = {
        tip: <TipBlock data={block.data} onChange={onUpdate} />,
        photo: <PhotoBlock data={block.data} onChange={onUpdate} />,
        video: <VideoBlock data={block.data} onChange={onUpdate} />,
        contact: <ContactBlock data={block.data} onChange={onUpdate} />,
        checklist: <ChecklistBlock data={block.data} onChange={onUpdate} />,
        voucher: <VoucherBlock data={block.data} onChange={onUpdate} tripPlanId={tripPlanId} />,
        pre_trip_section: <PreTripBlock data={block.data} onChange={onUpdate} />,
        travel_item: <TravelItemBlock data={block.data} onChange={onUpdate} />,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={onSelect}
            className={cn(
                'rounded-lg border p-3 transition-all cursor-pointer group',
                isSelected
                    ? `${config.color.border} ${config.color.bg} ring-1 ring-offset-1`
                    : 'border-slate-200 bg-white hover:border-slate-300',
                isDragging && 'opacity-50 shadow-lg z-50'
            )}
        >
            {/* Block header bar */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-3.5 w-3.5 text-slate-300" />
                    </button>
                    <span className={cn('text-[10px] font-semibold uppercase tracking-wider', config.color.text)}>
                        {config.label}
                    </span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <PublishToggle
                        isPublished={block.is_published}
                        onPublish={block.is_published ? onUnpublish : onPublish}
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove() }}
                        className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Block editor content */}
            {editorMap[block.block_type] || (
                <p className="text-xs text-slate-400">Editor não implementado para {block.block_type}</p>
            )}
        </div>
    )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function DropZone({ id }: { id: string }) {
    const { setNodeRef, isOver } = useDroppable({ id })

    return (
        <div
            ref={setNodeRef}
            className={cn(
                'h-2 rounded-full transition-all mx-4',
                isOver ? 'bg-indigo-400 h-3' : 'bg-transparent hover:bg-slate-200'
            )}
        />
    )
}

function PublishToggle({ isPublished, onPublish }: { isPublished: boolean; onPublish: () => void }) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onPublish() }}
            className={cn(
                'p-1 rounded transition-colors',
                isPublished
                    ? 'text-emerald-500 hover:bg-emerald-50'
                    : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'
            )}
            title={isPublished ? 'Publicado (clique para despublicar)' : 'Não publicado (clique para publicar)'}
        >
            {isPublished ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
    )
}
