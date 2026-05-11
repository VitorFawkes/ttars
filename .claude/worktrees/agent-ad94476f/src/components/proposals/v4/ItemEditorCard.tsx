/**
 * ItemEditorCard - Editor de item com layouts especificos por tipo
 *
 * VOOS: FlightEditor
 * HOTEIS: HotelEditor
 * EXPERIENCIAS: ExperienceEditor
 * TRANSFERS: TransferEditor
 * OUTROS: Layout generico com header/expand
 */

import { useState, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
    GripVertical,
    Trash2,
    Copy,
    ChevronDown,
    ChevronUp,
    Plus,
    X,
    ToggleLeft,
    ToggleRight,
    Settings2,
    Image as ImageIcon,
    Plane,
    Building2,
    Sparkles,
    Car,
    Ship,
    Shield,
    BookmarkPlus,
} from 'lucide-react'
import type { ProposalItemWithOptions, ProposalOption } from '@/types/proposals'
import type { Json } from '@/database.types'
import { FlightEditor, type FlightsData } from './flights'
import { HotelEditor, type HotelData } from './hotels'
import { ExperienceEditor, type ExperienceData } from './experiences'
import { TransferEditor, type TransferData } from './transfers'
import { CruiseEditor, type CruiseData } from './cruises'
import { InsuranceEditor, type InsuranceData } from './insurance'
import { SaveToLibraryModal } from './SaveToLibraryModal'

// Barra de custo do fornecedor - usada em todos os tipos de item
function SupplierCostBar({
    item,
    onUpdate,
}: {
    item: ProposalItemWithOptions
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
}) {
    return (
        <div className="flex items-center gap-3 px-4 py-2 border-t border-amber-100 bg-amber-50/50">
            <span className="text-xs font-medium text-amber-700">Custo Fornecedor:</span>
            <div className="flex items-center gap-1">
                <span className="text-xs text-amber-600">R$</span>
                <input
                    type="number"
                    value={item.supplier_cost || ''}
                    onChange={(e) => onUpdate({ supplier_cost: parseFloat(e.target.value) || 0 })}
                    className="w-24 text-sm font-semibold text-amber-800 bg-white border border-amber-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-amber-400 text-right"
                    placeholder="0,00"
                    step="0.01"
                />
            </div>
            {(item.supplier_cost ?? 0) > 0 && (item.base_price ?? 0) > 0 && (
                <span className="text-xs text-amber-600 ml-auto">
                    Receita: R$ {((item.base_price || 0) - (item.supplier_cost || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
            )}
        </div>
    )
}

interface ItemEditorCardProps {
    item: ProposalItemWithOptions
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
    onRemove: () => void
    onDuplicate: () => void
    onAddOption: (label: string) => void
    onUpdateOption: (optionId: string, updates: Partial<ProposalOption>) => void
    onRemoveOption: (optionId: string) => void
}

export function ItemEditorCard({
    item,
    onUpdate,
    onRemove,
    onDuplicate,
    onAddOption,
    onUpdateOption,
    onRemoveOption,
}: ItemEditorCardProps) {
    // Rich content helpers
    const richContent = (item.rich_content as Record<string, unknown>) || {}

    // ===========================================
    // LAYOUT ESPECÍFICO PARA VOOS
    // ===========================================
    if (item.item_type === 'flight') {
        return (
            <FlightItemCard
                item={item}
                richContent={richContent}
                onUpdate={onUpdate}
                onRemove={onRemove}
            />
        )
    }

    // ===========================================
    // LAYOUT ESPECÍFICO PARA HOTÉIS
    // ===========================================
    if (item.item_type === 'hotel') {
        return (
            <HotelItemCard
                item={item}
                richContent={richContent}
                onUpdate={onUpdate}
                onRemove={onRemove}
            />
        )
    }

    // ===========================================
    // LAYOUT ESPECÍFICO PARA EXPERIÊNCIAS
    // ===========================================
    if (item.item_type === 'experience') {
        return (
            <ExperienceItemCard
                item={item}
                richContent={richContent}
                onUpdate={onUpdate}
                onRemove={onRemove}
            />
        )
    }

    // ===========================================
    // LAYOUT ESPECÍFICO PARA TRANSFERS
    // ===========================================
    if (item.item_type === 'transfer') {
        return (
            <TransferItemCard
                item={item}
                richContent={richContent}
                onUpdate={onUpdate}
                onRemove={onRemove}
            />
        )
    }

    // ===========================================
    // LAYOUT ESPECÍFICO PARA CRUZEIROS
    // (detecta pelo richContent.cruise pois item_type é 'custom')
    // ===========================================
    if (richContent.cruise) {
        return (
            <CruiseItemCard
                item={item}
                richContent={richContent}
                onUpdate={onUpdate}
                onRemove={onRemove}
            />
        )
    }

    // ===========================================
    // LAYOUT ESPECÍFICO PARA SEGUROS
    // (detecta pelo item_type ou richContent.insurance)
    // ===========================================
    if (item.item_type === 'insurance' || richContent.insurance) {
        return (
            <InsuranceItemCard
                item={item}
                richContent={richContent}
                onUpdate={onUpdate}
                onRemove={onRemove}
            />
        )
    }

    // ===========================================
    // LAYOUT GENÉRICO PARA OUTROS TIPOS
    // ===========================================
    return (
        <GenericItemCard
            item={item}
            richContent={richContent}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onDuplicate={onDuplicate}
            onAddOption={onAddOption}
            onUpdateOption={onUpdateOption}
            onRemoveOption={onRemoveOption}
        />
    )
}

// ===========================================
// CARD DE VOO - LAYOUT DIRETO SEM WRAPPER
// ===========================================

interface FlightItemCardProps {
    item: ProposalItemWithOptions
    richContent: Record<string, unknown>
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
    onRemove: () => void
}

function FlightItemCard({ item, richContent, onUpdate, onRemove }: FlightItemCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "bg-white rounded-xl border border-slate-200 shadow-sm",
                "transition-all duration-200",
                isDragging && "opacity-50 shadow-lg ring-2 ring-blue-500"
            )}
        >
            {/* Header simples - so titulo e acoes */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                {/* Drag Handle */}
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-slate-100 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>

                {/* Icone */}
                <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                    <Plane className="h-4 w-4 text-sky-600" />
                </div>

                {/* Titulo editavel */}
                <input
                    type="text"
                    value={item.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                    className="flex-1 text-sm font-semibold text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder:text-slate-400"
                    placeholder="Titulo dos voos"
                />

                {/* Botao remover */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onRemove() }}
                    className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Editor de voos - DIRETAMENTE VISIVEL */}
            <div className="p-4">
                <FlightEditor
                    data={(richContent.flights as FlightsData) || null}
                    onChange={(flights: FlightsData) => onUpdate({
                        rich_content: { ...richContent, flights } as unknown as Json
                    })}
                />
            </div>

            <SupplierCostBar item={item} onUpdate={onUpdate} />
        </div>
    )
}

// ===========================================
// CARD DE HOTEL - LAYOUT DIRETO SEM WRAPPER
// ===========================================

function HotelItemCard({ item, richContent, onUpdate, onRemove }: FlightItemCardProps) {
    const [showSaveModal, setShowSaveModal] = useState(false)
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "bg-white rounded-xl border border-slate-200 shadow-sm",
                "transition-all duration-200",
                isDragging && "opacity-50 shadow-lg ring-2 ring-emerald-500"
            )}
        >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-slate-100 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>

                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-emerald-600" />
                </div>

                <input
                    type="text"
                    value={item.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                    className="flex-1 text-sm font-semibold text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder:text-slate-400"
                    placeholder="Nome do hotel"
                />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); setShowSaveModal(true) }}
                    className="h-8 w-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                    title="Salvar na Biblioteca"
                >
                    <BookmarkPlus className="h-4 w-4" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onRemove() }}
                    className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Editor de hotel - DIRETAMENTE VISIVEL */}
            <div className="p-4">
                <HotelEditor
                    data={(richContent.hotel as HotelData) || null}
                    onChange={(hotel: HotelData) => onUpdate({
                        rich_content: { ...richContent, hotel } as unknown as Json
                    })}
                    itemId={item.id}
                />
            </div>

            <SupplierCostBar item={item} onUpdate={onUpdate} />

            {/* Modal para salvar na biblioteca */}
            <SaveToLibraryModal
                isOpen={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                item={item}
                category="hotel"
            />
        </div>
    )
}

// ===========================================
// CARD DE EXPERIENCIA - LAYOUT DIRETO SEM WRAPPER
// ===========================================

function ExperienceItemCard({ item, richContent, onUpdate, onRemove }: FlightItemCardProps) {
    const [showSaveModal, setShowSaveModal] = useState(false)
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "bg-white rounded-xl border border-slate-200 shadow-sm",
                "transition-all duration-200",
                isDragging && "opacity-50 shadow-lg ring-2 ring-orange-500"
            )}
        >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-slate-100 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>

                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-orange-600" />
                </div>

                <input
                    type="text"
                    value={item.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                    className="flex-1 text-sm font-semibold text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder:text-slate-400"
                    placeholder="Nome da experiencia"
                />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); setShowSaveModal(true) }}
                    className="h-8 w-8 text-slate-400 hover:text-orange-600 hover:bg-orange-50"
                    title="Salvar na Biblioteca"
                >
                    <BookmarkPlus className="h-4 w-4" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onRemove() }}
                    className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Editor de experiencia - DIRETAMENTE VISIVEL */}
            <div className="p-4">
                <ExperienceEditor
                    data={(richContent.experience as ExperienceData) || null}
                    onChange={(experience: ExperienceData) => onUpdate({
                        rich_content: { ...richContent, experience } as unknown as Json
                    })}
                    itemId={item.id}
                />
            </div>

            <SupplierCostBar item={item} onUpdate={onUpdate} />

            {/* Modal para salvar na biblioteca */}
            <SaveToLibraryModal
                isOpen={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                item={item}
                category="experience"
            />
        </div>
    )
}

// ===========================================
// CARD DE TRANSFER - LAYOUT DIRETO SEM WRAPPER
// ===========================================

function TransferItemCard({ item, richContent, onUpdate, onRemove }: FlightItemCardProps) {
    const [showSaveModal, setShowSaveModal] = useState(false)
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "bg-white rounded-xl border border-slate-200 shadow-sm",
                "transition-all duration-200",
                isDragging && "opacity-50 shadow-lg ring-2 ring-teal-500"
            )}
        >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-slate-100 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>

                <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                    <Car className="h-4 w-4 text-teal-600" />
                </div>

                <input
                    type="text"
                    value={item.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                    className="flex-1 text-sm font-semibold text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder:text-slate-400"
                    placeholder="Transfer"
                />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); setShowSaveModal(true) }}
                    className="h-8 w-8 text-slate-400 hover:text-teal-600 hover:bg-teal-50"
                    title="Salvar na Biblioteca"
                >
                    <BookmarkPlus className="h-4 w-4" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onRemove() }}
                    className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Editor de transfer - DIRETAMENTE VISIVEL */}
            <div className="p-4">
                <TransferEditor
                    data={(richContent.transfer as TransferData) || null}
                    onChange={(transfer: TransferData) => onUpdate({
                        rich_content: { ...richContent, transfer } as unknown as Json
                    })}
                    itemId={item.id}
                />
            </div>

            <SupplierCostBar item={item} onUpdate={onUpdate} />

            {/* Modal para salvar na biblioteca */}
            <SaveToLibraryModal
                isOpen={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                item={item}
                category="transfer"
            />
        </div>
    )
}

// ===========================================
// CARD DE CRUZEIRO - LAYOUT DIRETO SEM WRAPPER
// ===========================================

function CruiseItemCard({ item, richContent, onUpdate, onRemove }: FlightItemCardProps) {
    const [showSaveModal, setShowSaveModal] = useState(false)
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "bg-white rounded-xl border border-slate-200 shadow-sm",
                "transition-all duration-200",
                isDragging && "opacity-50 shadow-lg ring-2 ring-indigo-500"
            )}
        >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-slate-100 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>

                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Ship className="h-4 w-4 text-indigo-600" />
                </div>

                <input
                    type="text"
                    value={item.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                    className="flex-1 text-sm font-semibold text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder:text-slate-400"
                    placeholder="Cruzeiro"
                />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); setShowSaveModal(true) }}
                    className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                    title="Salvar na Biblioteca"
                >
                    <BookmarkPlus className="h-4 w-4" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onRemove() }}
                    className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Editor de cruzeiro - DIRETAMENTE VISIVEL */}
            <div className="p-4">
                <CruiseEditor
                    data={(richContent.cruise as CruiseData) || null}
                    onChange={(cruise: CruiseData) => onUpdate({
                        rich_content: { ...richContent, cruise } as unknown as Json
                    })}
                    itemId={item.id}
                />
            </div>

            <SupplierCostBar item={item} onUpdate={onUpdate} />

            {/* Modal para salvar na biblioteca */}
            <SaveToLibraryModal
                isOpen={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                item={item}
                category="cruise"
            />
        </div>
    )
}

// ===========================================
// CARD DE SEGURO - LAYOUT DIRETO SEM WRAPPER
// ===========================================

function InsuranceItemCard({ item, richContent, onUpdate, onRemove }: FlightItemCardProps) {
    const [showSaveModal, setShowSaveModal] = useState(false)
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "bg-white rounded-xl border border-slate-200 shadow-sm",
                "transition-all duration-200",
                isDragging && "opacity-50 shadow-lg ring-2 ring-amber-500"
            )}
        >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-slate-100 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>

                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Shield className="h-4 w-4 text-amber-600" />
                </div>

                <input
                    type="text"
                    value={item.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                    className="flex-1 text-sm font-semibold text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder:text-slate-400"
                    placeholder="Seguro Viagem"
                />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); setShowSaveModal(true) }}
                    className="h-8 w-8 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                    title="Salvar na Biblioteca"
                >
                    <BookmarkPlus className="h-4 w-4" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onRemove() }}
                    className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Editor de seguro - DIRETAMENTE VISIVEL */}
            <div className="p-4">
                <InsuranceEditor
                    data={(richContent.insurance as InsuranceData) || null}
                    onChange={(insurance: InsuranceData) => onUpdate({
                        rich_content: { ...richContent, insurance } as unknown as Json
                    })}
                    itemId={item.id}
                />
            </div>

            <SupplierCostBar item={item} onUpdate={onUpdate} />

            {/* Modal para salvar na biblioteca */}
            <SaveToLibraryModal
                isOpen={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                item={item}
                category="service"
            />
        </div>
    )
}

// ===========================================
// CARD GENERICO - PARA SERVICOS, FEES, ETC
// ===========================================

interface GenericItemCardProps {
    item: ProposalItemWithOptions
    richContent: Record<string, unknown>
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
    onRemove: () => void
    onDuplicate: () => void
    onAddOption: (label: string) => void
    onUpdateOption: (optionId: string, updates: Partial<ProposalOption>) => void
    onRemoveOption: (optionId: string) => void
}

function GenericItemCard({
    item,
    richContent,
    onUpdate,
    onRemove,
    onDuplicate,
    onAddOption,
    onUpdateOption,
    onRemoveOption,
}: GenericItemCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [newOptionLabel, setNewOptionLabel] = useState('')

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const handleToggleOptional = useCallback(() => {
        onUpdate({ is_optional: !item.is_optional })
    }, [item.is_optional, onUpdate])

    const handleToggleDefaultSelected = useCallback(() => {
        onUpdate({ is_default_selected: !item.is_default_selected })
    }, [item.is_default_selected, onUpdate])

    const handleToggleQuantityAdjustable = useCallback(() => {
        onUpdate({
            rich_content: {
                ...richContent,
                quantity_adjustable: !(richContent.quantity_adjustable as boolean)
            }
        })
    }, [richContent, onUpdate])

    const handleAddOption = useCallback(() => {
        if (newOptionLabel.trim()) {
            onAddOption(newOptionLabel.trim())
            setNewOptionLabel('')
        }
    }, [newOptionLabel, onAddOption])

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "bg-white rounded-xl border border-slate-200 shadow-sm",
                "transition-all duration-200",
                isDragging && "opacity-50 shadow-lg ring-2 ring-violet-500"
            )}
        >
            {/* Header Row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                {/* Drag Handle */}
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-slate-100 transition-colors flex-shrink-0"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>

                {/* Image Thumbnail or Icon */}
                {item.image_url ? (
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                        <img
                            src={item.image_url}
                            alt={item.title}
                            className="w-full h-full object-cover"
                        />
                    </div>
                ) : (
                    <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="h-5 w-5 text-violet-600" />
                    </div>
                )}

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                    <input
                        type="text"
                        value={item.title}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                        className="w-full text-sm font-semibold text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder:text-slate-400"
                        placeholder="Título do item"
                    />

                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {item.is_optional && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                Opcional
                            </span>
                        )}
                        {(richContent.quantity_adjustable as boolean) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                                Qtd. ajustável
                            </span>
                        )}
                        {(item.options || []).length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                {(item.options || []).length} opções
                            </span>
                        )}
                    </div>
                </div>

                {/* Price - Highlighted */}
                <div className="flex-shrink-0 flex items-center gap-2">
                    <div className="flex items-center gap-1 border border-violet-200 rounded-lg px-3 py-2 bg-violet-50">
                        <select
                            value={(richContent.currency as string) || 'BRL'}
                            onChange={(e) => onUpdate({
                                rich_content: { ...richContent, currency: e.target.value }
                            })}
                            className="text-xs font-medium text-violet-700 bg-transparent border-none outline-none cursor-pointer"
                        >
                            <option value="BRL">R$</option>
                            <option value="USD">US$</option>
                            <option value="EUR">€</option>
                        </select>
                        <input
                            type="number"
                            value={item.base_price || ''}
                            onChange={(e) => onUpdate({ base_price: parseFloat(e.target.value) || 0 })}
                            className="w-20 text-base font-bold text-violet-700 text-right bg-transparent border-none outline-none focus:ring-0 p-0"
                            placeholder="0,00"
                            step="0.01"
                        />
                    </div>
                    {/* Supplier Cost */}
                    <div className="flex items-center gap-1 border border-amber-200 rounded-lg px-2 py-2 bg-amber-50" title="Custo do fornecedor">
                        <span className="text-[10px] font-medium text-amber-600">Custo</span>
                        <input
                            type="number"
                            value={item.supplier_cost || ''}
                            onChange={(e) => onUpdate({ supplier_cost: parseFloat(e.target.value) || 0 })}
                            className="w-16 text-sm font-semibold text-amber-700 text-right bg-transparent border-none outline-none focus:ring-0 p-0"
                            placeholder="0"
                            step="0.01"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="h-8 w-8"
                    >
                        {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onDuplicate}
                        className="h-8 w-8"
                    >
                        <Copy className="h-4 w-4 text-slate-400" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); onRemove() }}
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-4">
                    {/* Description */}
                    <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1">
                            Descrição
                        </label>
                        <Textarea
                            value={item.description || ''}
                            onChange={(e) => onUpdate({ description: e.target.value })}
                            placeholder="Descrição detalhada do item..."
                            className="min-h-[80px]"
                        />
                    </div>

                    {/* Toggles Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                            onClick={handleToggleOptional}
                            className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border transition-all",
                                item.is_optional
                                    ? "border-amber-200 bg-amber-50"
                                    : "border-slate-200 bg-slate-50 hover:border-slate-300"
                            )}
                        >
                            {item.is_optional ? (
                                <ToggleRight className="h-5 w-5 text-amber-600" />
                            ) : (
                                <ToggleLeft className="h-5 w-5 text-slate-400" />
                            )}
                            <div className="text-left">
                                <p className="text-xs font-medium text-slate-700">Opcional</p>
                                <p className="text-xs text-slate-500">Cliente escolhe incluir</p>
                            </div>
                        </button>

                        <button
                            onClick={handleToggleDefaultSelected}
                            className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border transition-all",
                                item.is_default_selected
                                    ? "border-emerald-200 bg-emerald-50"
                                    : "border-slate-200 bg-slate-50 hover:border-slate-300"
                            )}
                        >
                            {item.is_default_selected ? (
                                <ToggleRight className="h-5 w-5 text-emerald-600" />
                            ) : (
                                <ToggleLeft className="h-5 w-5 text-slate-400" />
                            )}
                            <div className="text-left">
                                <p className="text-xs font-medium text-slate-700">Pré-selecionado</p>
                                <p className="text-xs text-slate-500">Marcado por padrão</p>
                            </div>
                        </button>

                        <button
                            onClick={handleToggleQuantityAdjustable}
                            className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border transition-all",
                                (richContent.quantity_adjustable as boolean)
                                    ? "border-purple-200 bg-purple-50"
                                    : "border-slate-200 bg-slate-50 hover:border-slate-300"
                            )}
                        >
                            {(richContent.quantity_adjustable as boolean) ? (
                                <ToggleRight className="h-5 w-5 text-purple-600" />
                            ) : (
                                <ToggleLeft className="h-5 w-5 text-slate-400" />
                            )}
                            <div className="text-left">
                                <p className="text-xs font-medium text-slate-700">Qtd. Ajustável</p>
                                <p className="text-xs text-slate-500">Cliente pode alterar</p>
                            </div>
                        </button>
                    </div>

                    {/* Options Section */}
                    <div className="border-t border-slate-100 pt-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Settings2 className="h-4 w-4 text-slate-400" />
                                <span className="text-xs font-medium text-slate-700">Opções (Variantes de Preço)</span>
                            </div>
                        </div>

                        {(item.options || []).length > 0 && (
                            <div className="space-y-2 mb-3">
                                {(item.options || []).map((option) => (
                                    <div
                                        key={option.id}
                                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                                    >
                                        <input
                                            type="text"
                                            value={option.option_label}
                                            onChange={(e) => onUpdateOption(option.id, { option_label: e.target.value })}
                                            className="flex-1 text-sm bg-transparent border-none outline-none focus:ring-0 p-0"
                                            placeholder="Nome da opção"
                                        />
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs text-slate-400">+R$</span>
                                            <input
                                                type="number"
                                                value={option.price_delta || ''}
                                                onChange={(e) => onUpdateOption(option.id, { price_delta: parseFloat(e.target.value) || 0 })}
                                                className="w-20 text-sm text-right bg-transparent border-none outline-none focus:ring-0 p-0"
                                                placeholder="0"
                                            />
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onRemoveOption(option.id)}
                                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <Input
                                value={newOptionLabel}
                                onChange={(e) => setNewOptionLabel(e.target.value)}
                                placeholder="Nova opção (ex: Café da manhã incluso)"
                                className="flex-1 h-9 text-sm"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddOption()}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAddOption}
                                disabled={!newOptionLabel.trim()}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ItemEditorCard
