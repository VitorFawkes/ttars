/**
 * BuilderCanvas V4 - Elite proposal canvas with full editing capabilities
 * 
 * Features:
 * - CoverEditor for hero section
 * - Drop zones between sections for positional DnD
 * - Sortable sections and items
 * - ItemEditorCard for complete item editing
 * - Add item button per section
 * - TextBlockSection for pure text sections
 * - Visual feedback for editable titles
 */

import React, { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { CoverEditor } from './CoverEditor'
import { ItemEditorCard } from './ItemEditorCard'
import { FlightImageExtractor } from './flights/FlightImageExtractor'
import type { FlightLeg } from './flights/types'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import {
    GripVertical,
    Trash2,
    ChevronDown,
    Plus,
    Building2,
    Plane,
    Car,
    Type,
    Sparkles,
    FileText,
    Pencil,
    Image as ImageIcon,
    Loader2,
    Check,
} from 'lucide-react'
import type { ProposalSectionWithItems, ProposalItemWithOptions } from '@/types/proposals'

// Section icons map
const SECTION_ICONS: Record<string, React.ElementType> = {
    hotels: Building2,
    flights: Plane,
    transfers: Car,
    experiences: Sparkles,
    custom: Type,
}

// Section colors - consistent color coding
const SECTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    flights: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-l-sky-500' },
    hotels: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-l-emerald-500' },
    experiences: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-l-orange-500' },
    transfers: { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-l-teal-500' },
    custom: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-l-violet-500' },
}

// Section type -> Item type mapping
const SECTION_TO_ITEM_TYPE: Record<string, string> = {
    flights: 'flight',
    hotels: 'hotel',
    experiences: 'experience',
    transfers: 'transfer',
    custom: 'custom',
}

// Default titles per item type
const ITEM_TYPE_DEFAULT_TITLES: Record<string, string> = {
    flight: 'Novo Voo',
    hotel: 'Novo Hotel',
    experience: 'Nova Experiência',
    transfer: 'Novo Transfer',
    custom: 'Novo Item',
}

// Clean title - remove emojis
function cleanTitle(title: string): string {
    return title
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2B50}]/gu, '')
        .trim()
}

// Check if section is a text block
function isTextBlockSection(section: ProposalSectionWithItems): boolean {
    if (section.section_type !== 'custom') return false
    if (section.items.length !== 1) return false
    const item = section.items[0]
    const richContent = (item.rich_content as Record<string, any>) || {}
    return richContent.is_text_block === true
}

// Check if section is a title block
function isTitleSection(section: ProposalSectionWithItems): boolean {
    if (section.section_type !== 'custom') return false
    if (section.items.length !== 1) return false
    const item = section.items[0]
    const richContent = (item.rich_content as Record<string, any>) || {}
    return richContent.is_title_block === true
}

// Check if section is a divider block
function isDividerSection(section: ProposalSectionWithItems): boolean {
    if (section.section_type !== 'custom') return false
    if (section.items.length !== 1) return false
    const item = section.items[0]
    const richContent = (item.rich_content as Record<string, any>) || {}
    return richContent.is_divider_block === true
}

// Check if section is an image block
function isImageSection(section: ProposalSectionWithItems): boolean {
    if (section.section_type !== 'custom') return false
    if (section.items.length !== 1) return false
    const item = section.items[0]
    const richContent = (item.rich_content as Record<string, any>) || {}
    return richContent.is_image_block === true
}

// Check if section is a video block
function isVideoSection(section: ProposalSectionWithItems): boolean {
    if (section.section_type !== 'custom') return false
    if (section.items.length !== 1) return false
    const item = section.items[0]
    const richContent = (item.rich_content as Record<string, any>) || {}
    return richContent.is_video_block === true
}

// ============================================
// Empty Section Zone (when no items)
// ============================================
interface EmptySectionZoneProps {
    sectionType: string
    onAddItem: () => void
}

function EmptySectionZone({ sectionType, onAddItem }: EmptySectionZoneProps) {
    const [isDragging, setIsDragging] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const { addItemFromLibrary, selectedSectionId } = useProposalBuilder()

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }, [])

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const files = Array.from(e.dataTransfer.files)
        const imageFile = files.find(f => f.type.startsWith('image/'))

        if (imageFile && selectedSectionId) {
            await processImage(imageFile)
        }
    }, [selectedSectionId])

    const processImage = async (file: File) => {
        setIsProcessing(true)
        try {
            // Convert to base64
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => {
                    const result = reader.result as string
                    const base64Data = result.split(',')[1]
                    resolve(base64Data)
                }
                reader.onerror = reject
                reader.readAsDataURL(file)
            })

            // Call AI extraction
            const { data, error } = await supabase.functions.invoke('ai-extract-image', {
                body: { image: base64 }
            })

            if (error) throw error

            if (data?.success && data?.items?.length > 0 && selectedSectionId) {
                data.items.forEach((item: any) => {
                    const details = item.details || {}
                    const segments = details.segments || []

                    const richContent: Record<string, unknown> = {
                        description: item.description || '',
                        location: item.location,
                        dates: item.dates,
                    }

                    if (item.category === 'flight' && segments.length > 0) {
                        richContent.segments = segments.map((seg: any, idx: number) => ({
                            id: `seg-${Date.now()}-${idx}`,
                            segment_order: seg.segment_order || idx + 1,
                            airline_code: seg.airline_code || '',
                            airline_name: seg.airline_name || '',
                            flight_number: seg.flight_number || '',
                            departure_date: seg.departure_date || '',
                            departure_time: seg.departure_time || '',
                            departure_airport: seg.departure_airport || '',
                            departure_city: seg.departure_city || '',
                            arrival_date: seg.arrival_date || '',
                            arrival_time: seg.arrival_time || '',
                            arrival_airport: seg.arrival_airport || '',
                            arrival_city: seg.arrival_city || '',
                            cabin_class: seg.cabin_class || 'Economy',
                            baggage_included: seg.baggage_included || '',
                        }))
                    }

                    addItemFromLibrary(selectedSectionId, {
                        id: crypto.randomUUID(),
                        name: item.title,
                        category: item.category || 'custom',
                        base_price: item.price || 0,
                        currency: item.currency || 'BRL',
                        content: richContent,
                    } as any)
                })

                // Show success toast
                const toast = document.createElement('div')
                toast.className = 'fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-bottom-4'
                toast.textContent = `${data.items.length} item(s) extraído(s) da imagem!`
                document.body.appendChild(toast)
                setTimeout(() => toast.remove(), 3000)
            }
        } catch (err) {
            console.error('Error processing image:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            await processImage(file)
        }
    }

    // Get section-specific styling
    const getIconAndColor = () => {
        switch (sectionType) {
            case 'flights':
                return { Icon: Plane, color: 'sky' }
            case 'hotels':
                return { Icon: Building2, color: 'emerald' }
            case 'transfers':
                return { Icon: Car, color: 'amber' }
            case 'experiences':
                return { Icon: Sparkles, color: 'purple' }
            default:
                return { Icon: Plus, color: 'slate' }
        }
    }

    const { Icon, color } = getIconAndColor()

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
                "relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200",
                isDragging
                    ? `border-${color}-500 bg-${color}-50`
                    : "border-slate-200 hover:border-slate-300",
                isProcessing && "opacity-50 pointer-events-none"
            )}
        >
            {/* Hidden file input */}
            <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="empty-section-upload"
            />

            {isProcessing ? (
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                    <p className="text-sm font-medium text-slate-600">Analisando imagem com IA...</p>
                </div>
            ) : (
                <>
                    <div className={cn(
                        "w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center",
                        isDragging ? `bg-${color}-100` : "bg-slate-100"
                    )}>
                        <Icon className={cn(
                            "h-7 w-7",
                            isDragging ? `text-${color}-600` : "text-slate-400"
                        )} />
                    </div>

                    <p className="text-sm text-slate-600 font-medium mb-1">
                        {isDragging ? 'Solte a imagem aqui' : 'Nenhum item nesta seção'}
                    </p>
                    <p className="text-xs text-slate-400 mb-4">
                        Arraste uma imagem de orçamento ou adicione manualmente
                    </p>

                    <div className="flex items-center justify-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onAddItem}
                        >
                            <Plus className="h-4 w-4 mr-1.5" />
                            Adicionar Item
                        </Button>

                        <label htmlFor="empty-section-upload">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="bg-purple-50 text-purple-700 hover:bg-purple-100 cursor-pointer"
                                asChild
                            >
                                <span>
                                    <ImageIcon className="h-4 w-4 mr-1.5" />
                                    Enviar Imagem
                                </span>
                            </Button>
                        </label>
                    </div>
                </>
            )}
        </div>
    )
}

// ============================================
// Drop Zone Component (between sections)
// ============================================

interface DropZoneProps {
    id: string
    isFirst?: boolean
}

function DropZone({ id, isFirst }: DropZoneProps) {
    const { isOver, setNodeRef } = useDroppable({ id })

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "relative h-3 transition-all duration-200",
                isFirst && "h-0"
            )}
        >
            {/* Visual indicator when dragging over */}
            <div
                className={cn(
                    "absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full transition-all duration-200",
                    isOver
                        ? "bg-blue-500 scale-y-[2]"
                        : "bg-transparent"
                )}
            />
        </div>
    )
}

// ============================================
// Text Block Section (special rendering)
// ============================================
interface TextBlockSectionProps {
    section: ProposalSectionWithItems
}

function TextBlockSection({ section }: TextBlockSectionProps) {
    const { removeSection, updateItem } = useProposalBuilder()
    const item = section.items[0]
    const richContent = (item?.rich_content as Record<string, any>) || {}
    const textContent = richContent.content || ''

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (item) {
            updateItem(item.id, {
                rich_content: { ...richContent, content: e.target.value },
            })
        }
    }, [item, richContent, updateItem])

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
                'transition-all duration-200 group',
                isDragging && 'opacity-50 shadow-lg ring-2 ring-blue-500',
            )}
        >
            {/* Header - Always visible */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/50 border-b border-slate-100">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>
                <div className="flex-1 flex items-center gap-1.5 text-slate-500">
                    <FileText className="h-4 w-4" />
                    <span className="text-xs font-medium">Bloco de Texto</span>
                </div>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); removeSection(section.id) }}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Text Editor - Larger */}
            <div className="p-4">
                <Textarea
                    value={textContent}
                    onChange={handleTextChange}
                    placeholder="Digite seu texto aqui..."
                    className="min-h-[180px] resize-y border border-slate-200 rounded-lg shadow-none focus:ring-2 focus:ring-blue-500 focus:border-transparent p-3 text-slate-700"
                />
                <div className="flex justify-end mt-2">
                    <span className="text-xs text-slate-400">
                        {textContent.length} caracteres
                    </span>
                </div>
            </div>
        </div>
    )
}

// ============================================
// Title Block Section (for headings)
// ============================================
type TitleSize = 'h1' | 'h2' | 'h3'
type TitleAlign = 'left' | 'center' | 'right'

const TITLE_SIZES: Record<TitleSize, string> = {
    h1: 'text-3xl font-bold',
    h2: 'text-2xl font-bold',
    h3: 'text-xl font-semibold',
}

function TitleBlockSection({ section }: { section: ProposalSectionWithItems }) {
    const { removeSection, updateItem } = useProposalBuilder()
    const item = section.items[0]
    const richContent = (item?.rich_content as Record<string, any>) || {}
    const titleSize = (richContent.title_size as TitleSize) || 'h2'
    const titleAlign = (richContent.title_align as TitleAlign) || 'left'

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (item) {
            updateItem(item.id, { title: e.target.value })
        }
    }, [item, updateItem])

    const handleSizeChange = useCallback((size: TitleSize) => {
        if (item) {
            updateItem(item.id, {
                rich_content: { ...richContent, title_size: size, is_title_block: true }
            })
        }
    }, [item, richContent, updateItem])

    const handleAlignChange = useCallback((align: TitleAlign) => {
        if (item) {
            updateItem(item.id, {
                rich_content: { ...richContent, title_align: align, is_title_block: true }
            })
        }
    }, [item, richContent, updateItem])

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
                'transition-all duration-200 group',
                isDragging && 'opacity-50 shadow-lg ring-2 ring-blue-500',
            )}
        >
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/50 border-b border-slate-100">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>
                <div className="flex items-center gap-1.5 text-slate-500">
                    <Type className="h-4 w-4" />
                    <span className="text-xs font-medium">Título</span>
                </div>

                {/* Size selector */}
                <div className="flex items-center gap-1 ml-2 border-l border-slate-200 pl-2">
                    {(['h1', 'h2', 'h3'] as TitleSize[]).map((size) => (
                        <button
                            key={size}
                            onClick={(e) => { e.stopPropagation(); handleSizeChange(size) }}
                            className={cn(
                                "px-2 py-0.5 text-xs rounded transition-colors",
                                titleSize === size
                                    ? "bg-blue-100 text-blue-700 font-medium"
                                    : "text-slate-500 hover:bg-slate-100"
                            )}
                        >
                            {size.toUpperCase()}
                        </button>
                    ))}
                </div>

                {/* Alignment selector */}
                <div className="flex items-center gap-0.5 ml-2 border-l border-slate-200 pl-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleAlignChange('left') }}
                        className={cn(
                            "p-1 rounded transition-colors",
                            titleAlign === 'left' ? "bg-blue-100 text-blue-700" : "text-slate-400 hover:bg-slate-100"
                        )}
                        title="Alinhar à esquerda"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h14" />
                        </svg>
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleAlignChange('center') }}
                        className={cn(
                            "p-1 rounded transition-colors",
                            titleAlign === 'center' ? "bg-blue-100 text-blue-700" : "text-slate-400 hover:bg-slate-100"
                        )}
                        title="Centralizar"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M5 18h14" />
                        </svg>
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleAlignChange('right') }}
                        className={cn(
                            "p-1 rounded transition-colors",
                            titleAlign === 'right' ? "bg-blue-100 text-blue-700" : "text-slate-400 hover:bg-slate-100"
                        )}
                        title="Alinhar à direita"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M6 18h14" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1" />

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); removeSection(section.id) }}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <div className="p-4">
                <input
                    type="text"
                    value={item?.title || ''}
                    onChange={handleTitleChange}
                    placeholder="Digite o título..."
                    className={cn(
                        "w-full text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0",
                        TITLE_SIZES[titleSize],
                        titleAlign === 'center' && 'text-center',
                        titleAlign === 'right' && 'text-right'
                    )}
                />
            </div>
        </div>
    )
}

// ============================================
// Divider Block Section (visual separator)
// ============================================
function DividerBlockSection({ section }: { section: ProposalSectionWithItems }) {
    const { removeSection } = useProposalBuilder()

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'group relative py-4',
                'transition-all duration-200',
                isDragging && 'opacity-50',
            )}
        >
            <div className="absolute inset-y-0 left-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity -translate-x-8">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity translate-x-8">
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); removeSection(section.id) }}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <hr className="border-slate-200" />
        </div>
    )
}

// ============================================
// Image Block Section with Upload
// ============================================
function ImageBlockSection({ section }: { section: ProposalSectionWithItems }) {
    const { removeSection, updateItem } = useProposalBuilder()
    const item = section.items[0]
    const richContent = (item?.rich_content as Record<string, any>) || {}
    const imageUrl = richContent.image_url || ''

    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [isUploading, setIsUploading] = React.useState(false)
    const [uploadError, setUploadError] = React.useState<string | null>(null)

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !item) return

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setUploadError('Por favor, selecione uma imagem')
            return
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setUploadError('Imagem muito grande (máx 5MB)')
            return
        }

        setIsUploading(true)
        setUploadError(null)

        try {
            const fileName = `proposals/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

            const { error } = await supabase.storage
                .from('proposals')
                .upload(fileName, file)

            if (error) throw error

            const { data: { publicUrl } } = supabase.storage
                .from('proposals')
                .getPublicUrl(fileName)

            updateItem(item.id, {
                rich_content: { ...richContent, image_url: publicUrl, is_image_block: true }
            })
        } catch (err) {
            console.error('Upload failed:', err)
            setUploadError('Falha no upload. Tente novamente.')
        } finally {
            setIsUploading(false)
            // Reset input to allow re-uploading same file
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleRemoveImage = () => {
        if (!item) return
        updateItem(item.id, {
            rich_content: { ...richContent, image_url: null, is_image_block: true }
        })
    }

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
                'transition-all duration-200 group',
                isDragging && 'opacity-50 shadow-lg ring-2 ring-blue-500',
            )}
        >
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
            />

            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/50 border-b border-slate-100">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>
                <div className="flex-1 flex items-center gap-1.5 text-slate-500">
                    <ImageIcon className="h-4 w-4" />
                    <span className="text-xs font-medium">Imagem</span>
                </div>
                {imageUrl && (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700"
                    >
                        Trocar
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); removeSection(section.id) }}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            <div className="p-4">
                {isUploading ? (
                    <div className="flex flex-col items-center justify-center h-32 bg-slate-100 rounded-lg border-2 border-dashed border-blue-300 text-blue-500">
                        <Loader2 className="h-6 w-6 animate-spin mb-2" />
                        <span className="text-sm">Enviando imagem...</span>
                    </div>
                ) : imageUrl ? (
                    <div className="relative group/image">
                        <img src={imageUrl} alt="Imagem" className="w-full h-auto rounded-lg" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/image:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => fileInputRef.current?.click()}
                                className="text-white bg-white/20 hover:bg-white/30"
                            >
                                Trocar
                            </Button>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={handleRemoveImage}
                                className="text-red-400 bg-white/20 hover:bg-red-500/30"
                            >
                                Remover
                            </Button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex flex-col items-center justify-center h-32 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-colors cursor-pointer"
                    >
                        <ImageIcon className="h-8 w-8 mb-2" />
                        <span className="text-sm font-medium">Clique para adicionar imagem</span>
                        <span className="text-xs mt-1">PNG, JPG até 5MB</span>
                    </button>
                )}
                {uploadError && (
                    <p className="text-red-500 text-xs mt-2 text-center">{uploadError}</p>
                )}
            </div>
        </div>
    )
}

// ============================================
// Video Block Content (URL input + preview)
// ============================================
interface VideoBlockContentProps {
    richContent: Record<string, any>
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
}

function VideoBlockContent({ richContent, onUpdate }: VideoBlockContentProps) {
    const videoUrl = richContent.video_url || ''

    // Parse YouTube/Vimeo URL to get embed URL
    const getEmbedUrl = (url: string): string | null => {
        if (!url) return null

        // YouTube
        const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
        if (ytMatch) {
            return `https://www.youtube.com/embed/${ytMatch[1]}`
        }

        // Vimeo
        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
        if (vimeoMatch) {
            return `https://player.vimeo.com/video/${vimeoMatch[1]}`
        }

        return null
    }

    // Get thumbnail URL for YouTube
    const getThumbnailUrl = (url: string): string | null => {
        const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
        if (ytMatch) {
            return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`
        }
        return null
    }

    const embedUrl = getEmbedUrl(videoUrl)
    const thumbnailUrl = getThumbnailUrl(videoUrl)

    return (
        <div className="p-4 space-y-3">
            {/* URL Input */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                    URL do vídeo (YouTube ou Vimeo)
                </label>
                <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => onUpdate({
                        rich_content: { ...richContent, video_url: e.target.value, is_video_block: true }
                    })}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
            </div>

            {/* Preview */}
            {embedUrl ? (
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    <iframe
                        src={embedUrl}
                        className="w-full h-full"
                        allowFullScreen
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    />
                </div>
            ) : thumbnailUrl ? (
                <div className="aspect-video bg-slate-100 rounded-lg overflow-hidden relative">
                    <img src={thumbnailUrl} alt="Video thumbnail" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                            <div className="w-0 h-0 border-l-[20px] border-l-slate-800 border-y-[12px] border-y-transparent ml-1" />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="aspect-video bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400">
                    <svg className="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm">Cole a URL de um vídeo acima</span>
                </div>
            )}
        </div>
    )
}

// ============================================
// Video Block Section
// ============================================
function VideoBlockSection({ section }: { section: ProposalSectionWithItems }) {
    const { removeSection, updateItem } = useProposalBuilder()
    const item = section.items[0]
    const richContent = (item?.rich_content as Record<string, any>) || {}

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
                'transition-all duration-200 group',
                isDragging && 'opacity-50 shadow-lg ring-2 ring-blue-500',
            )}
        >
            {/* Header - Always visible */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/50 border-b border-slate-100">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200 transition-colors"
                >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>
                <div className="flex-1 flex items-center gap-1.5 text-slate-500">
                    <span className="text-xs font-medium">Video</span>
                </div>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); removeSection(section.id) }}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <VideoBlockContent
                richContent={richContent}
                onUpdate={(updates) => {
                    if (item) {
                        updateItem(item.id, updates)
                    }
                }}
            />
        </div>
    )
}

// ============================================
// Sortable Section Component (regular)
// ============================================
interface SortableSectionProps {
    section: ProposalSectionWithItems
}

function SortableSection({ section }: SortableSectionProps) {
    const [isExpanded, setIsExpanded] = useState(true)
    const [isTitleFocused, setIsTitleFocused] = useState(false)
    const [isProcessingAI, setIsProcessingAI] = useState(false)
    const [showFlightAIExtractor, setShowFlightAIExtractor] = useState(false)
    const aiFileInputRef = React.useRef<HTMLInputElement>(null)
    const {
        removeSection,
        updateSection,
        updateItem,
        removeItem,
        duplicateItem,
        addOption,
        updateOption,
        removeOption,
        addItem,
        addItemFromLibrary,
    } = useProposalBuilder()

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const Icon = SECTION_ICONS[section.section_type] || Type
    const cleanedTitle = cleanTitle(section.title)
    const sectionColor = SECTION_COLORS[section.section_type] || SECTION_COLORS.custom

    // Item handlers
    const handleUpdateItem = useCallback((itemId: string, updates: Partial<ProposalItemWithOptions>) => {
        updateItem(itemId, updates)
    }, [updateItem])

    const handleAddItem = useCallback(() => {
        const itemType = SECTION_TO_ITEM_TYPE[section.section_type] || 'custom'
        const defaultTitle = ITEM_TYPE_DEFAULT_TITLES[itemType] || 'Novo Item'
        addItem(section.id, itemType as any, defaultTitle)
    }, [section.id, section.section_type, addItem])

    // AI Image Processing
    const processAIImage = useCallback(async (file: File) => {
        setIsProcessingAI(true)
        try {
            // Convert to base64
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => {
                    const result = reader.result as string
                    const base64Data = result.split(',')[1]
                    resolve(base64Data)
                }
                reader.onerror = reject
                reader.readAsDataURL(file)
            })

            // Call AI extraction
            const { data, error } = await supabase.functions.invoke('ai-extract-image', {
                body: { image: base64 }
            })

            if (error) throw error

            if (data?.success && data?.items?.length > 0) {
                data.items.forEach((item: any) => {
                    const details = item.details || {}
                    const segments = details.segments || []

                    const richContent: Record<string, unknown> = {
                        description: item.description || '',
                        location: item.location,
                        dates: item.dates,
                    }

                    if (item.category === 'flight' && segments.length > 0) {
                        richContent.segments = segments.map((seg: any, idx: number) => ({
                            id: `seg-${Date.now()}-${idx}`,
                            segment_order: seg.segment_order || idx + 1,
                            airline_code: seg.airline_code || '',
                            airline_name: seg.airline_name || '',
                            flight_number: seg.flight_number || '',
                            departure_date: seg.departure_date || '',
                            departure_time: seg.departure_time || '',
                            departure_airport: seg.departure_airport || '',
                            departure_city: seg.departure_city || '',
                            arrival_date: seg.arrival_date || '',
                            arrival_time: seg.arrival_time || '',
                            arrival_airport: seg.arrival_airport || '',
                            arrival_city: seg.arrival_city || '',
                            cabin_class: seg.cabin_class || 'Economy',
                            baggage_included: seg.baggage_included || '',
                        }))
                    }

                    addItemFromLibrary(section.id, {
                        id: crypto.randomUUID(),
                        name: item.title,
                        category: item.category || 'custom',
                        base_price: item.price || 0,
                        currency: item.currency || 'BRL',
                        content: richContent,
                    } as any)
                })

                // Show success toast
                const toast = document.createElement('div')
                toast.className = 'fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-bottom-4'
                toast.textContent = `${data.items.length} item(s) extraído(s) da imagem!`
                document.body.appendChild(toast)
                setTimeout(() => toast.remove(), 3000)
            }
        } catch (err) {
            console.error('Error processing AI image:', err)
            // Show error toast
            const toast = document.createElement('div')
            toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-bottom-4'
            toast.textContent = 'Erro ao processar imagem. Tente novamente.'
            document.body.appendChild(toast)
            setTimeout(() => toast.remove(), 3000)
        } finally {
            setIsProcessingAI(false)
            if (aiFileInputRef.current) aiFileInputRef.current.value = ''
        }
    }, [section.id, addItemFromLibrary])

    const handleAIFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            processAIImage(file)
        }
    }, [processAIImage])

    // Handle extracted flight legs from FlightImageExtractor
    const handleExtractedFlightLegs = useCallback((extractedLegs: FlightLeg[]) => {
        if (extractedLegs.length === 0) return

        // Create a new flight item with the extracted legs
        const richContent = {
            flights: {
                legs: extractedLegs,
                show_prices: true,
                allow_mix_airlines: true,
                default_selections: {}
            }
        }

        addItemFromLibrary(section.id, {
            id: crypto.randomUUID(),
            name: 'Voos Extraídos',
            category: 'flight',
            base_price: 0,
            currency: 'BRL',
            content: richContent,
        } as any)

        setShowFlightAIExtractor(false)

        // Show success toast
        const toast = document.createElement('div')
        toast.className = 'fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-bottom-4'
        toast.textContent = `${extractedLegs.length} trecho(s) de voo extraído(s)!`
        document.body.appendChild(toast)
        setTimeout(() => toast.remove(), 3000)
    }, [section.id, addItemFromLibrary])

    // Handle AI button click - show extractor for flights, upload for others
    const handleAIButtonClick = useCallback(() => {
        if (section.section_type === 'flights') {
            setShowFlightAIExtractor(true)
        } else {
            aiFileInputRef.current?.click()
        }
    }, [section.section_type])

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
                'transition-all duration-200 border-l-4',
                sectionColor.border,
                isDragging && 'opacity-50 shadow-lg ring-2 ring-blue-500',
            )}
        >
            {/* Section Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                {/* Drag Handle */}
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-slate-200 transition-colors"
                >
                    <GripVertical className="h-5 w-5 text-slate-400" />
                </button>

                {/* Icon - color coded */}
                <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    sectionColor.bg,
                    sectionColor.text
                )}>
                    <Icon className="h-4 w-4" />
                </div>

                {/* Title Input - With visual feedback */}
                <div className="relative flex-1 group">
                    <input
                        type="text"
                        value={cleanedTitle}
                        onChange={(e) => updateSection(section.id, { title: cleanTitle(e.target.value) })}
                        onFocus={() => setIsTitleFocused(true)}
                        onBlur={() => setIsTitleFocused(false)}
                        className={cn(
                            "w-full text-sm font-semibold text-slate-900 bg-transparent rounded-md px-2 py-1 -ml-2",
                            "outline-none transition-all duration-200",
                            isTitleFocused
                                ? "border border-blue-500 ring-2 ring-blue-500/20"
                                : "border border-dashed border-transparent hover:border-slate-300"
                        )}
                        placeholder="Clique para editar título"
                    />
                    {/* Pencil icon on hover */}
                    {!isTitleFocused && (
                        <Pencil className={cn(
                            "absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400",
                            "opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                        )} />
                    )}
                </div>

                {/* Multiple Selection Toggle */}
                {section.items.length > 1 && (
                    <button
                        onClick={() => {
                            const currentConfig = (section.config as Record<string, any>) || {}
                            const newMode = currentConfig.selection_mode === 'multiple' ? 'exclusive' : 'multiple'
                            updateSection(section.id, {
                                config: { ...currentConfig, selection_mode: newMode }
                            })
                        }}
                        className={cn(
                            "flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border transition-all",
                            ((section.config as Record<string, any>)?.selection_mode === 'multiple')
                                ? "bg-purple-100 text-purple-700 border-purple-300"
                                : "bg-slate-100 text-slate-500 border-slate-200 hover:border-slate-300"
                        )}
                        title={((section.config as Record<string, any>)?.selection_mode === 'multiple')
                            ? "Múltipla escolha ativada"
                            : "Clique para permitir múltipla escolha"
                        }
                    >
                        <div className={cn(
                            "w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors",
                            ((section.config as Record<string, any>)?.selection_mode === 'multiple')
                                ? "bg-purple-600 border-purple-600"
                                : "border-slate-400"
                        )}>
                            {((section.config as Record<string, any>)?.selection_mode === 'multiple') && (
                                <Check className="h-2.5 w-2.5 text-white" />
                            )}
                        </div>
                        <span>
                            {((section.config as Record<string, any>)?.selection_mode === 'multiple')
                                ? "Múltipla"
                                : "Única"
                            }
                        </span>
                    </button>
                )}

                {/* Expand/Collapse */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-1 rounded hover:bg-slate-200 transition-colors"
                >
                    <ChevronDown className={cn(
                        'h-4 w-4 text-slate-400 transition-transform',
                        !isExpanded && '-rotate-90'
                    )} />
                </button>

                {/* Delete */}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); removeSection(section.id) }}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Section Content */}
            {isExpanded && (
                <div className="p-4 space-y-3">
                    {/* Sortable Items */}
                    <SortableContext
                        items={section.items.map(i => i.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {section.items.length === 0 ? (
                            <EmptySectionZone
                                sectionType={section.section_type}
                                onAddItem={handleAddItem}
                            />

                        ) : (
                            <>
                                {section.items.map((item) => (
                                    <ItemEditorCard
                                        key={item.id}
                                        item={item}
                                        onUpdate={(updates) => handleUpdateItem(item.id, updates)}
                                        onRemove={() => removeItem(item.id)}
                                        onDuplicate={() => duplicateItem(item.id)}
                                        onAddOption={(label) => addOption(item.id, label)}
                                        onUpdateOption={(optionId, updates) => updateOption(optionId, updates)}
                                        onRemoveOption={(optionId) => removeOption(optionId)}
                                    />
                                ))}

                                {/* Add Item Button */}
                                <div className="flex gap-2">
                                    {/* Hidden file input for AI */}
                                    <input
                                        ref={aiFileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleAIFileSelect}
                                        className="hidden"
                                    />
                                    <Button
                                        variant="ghost"
                                        className="flex-1 border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                                        onClick={handleAddItem}
                                        disabled={isProcessingAI}
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Adicionar Item
                                    </Button>
                                    <button
                                        onClick={handleAIButtonClick}
                                        disabled={isProcessingAI || showFlightAIExtractor}
                                        className="px-4 py-2 border-2 border-dashed border-sky-200 rounded-lg text-sky-500 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Extrair dados de uma imagem com IA"
                                    >
                                        {isProcessingAI ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Sparkles className="h-4 w-4" />
                                        )}
                                        <span className="hidden sm:inline">IA</span>
                                    </button>
                                </div>

                                {/* Flight AI Extractor */}
                                {showFlightAIExtractor && section.section_type === 'flights' && (
                                    <FlightImageExtractor
                                        onExtractLegs={handleExtractedFlightLegs}
                                        onCancel={() => setShowFlightAIExtractor(false)}
                                    />
                                )}
                            </>
                        )}
                    </SortableContext>
                </div>
            )}
        </div>
    )
}

// ============================================
// Canvas Drop Zone (end zone)
// ============================================
function CanvasDropZone() {
    const { isOver, setNodeRef } = useDroppable({ id: 'canvas-drop-zone' })

    return (
        <div
            ref={setNodeRef}
            className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200',
                isOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 bg-white/50 hover:border-slate-300'
            )}
        >
            <div className={cn(
                'w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center',
                isOver ? 'bg-blue-100' : 'bg-slate-100'
            )}>
                <Plus className={cn(
                    'h-6 w-6',
                    isOver ? 'text-blue-600' : 'text-slate-400'
                )} />
            </div>
            <p className={cn(
                'text-sm font-medium',
                isOver ? 'text-blue-600' : 'text-slate-500'
            )}>
                {isOver ? 'Solte o bloco aqui' : 'Arraste um bloco da paleta'}
            </p>
        </div>
    )
}

// ============================================
// Main Component
// ============================================
interface BuilderCanvasProps {
    sections: ProposalSectionWithItems[]
}

export function BuilderCanvas({ sections }: BuilderCanvasProps) {
    return (
        <div className="h-full overflow-y-auto bg-slate-100/50">
            <div className="max-w-3xl mx-auto py-8 px-6 space-y-4">
                {/* Cover Section */}
                <CoverEditor />

                {/* Drop Zone before first section */}
                <DropZone id="drop-zone-0" isFirst />

                {/* Sections with drop zones between */}
                {sections.map((section, index) => {
                    // Determine which component to render based on section type
                    const renderSection = () => {
                        if (isTextBlockSection(section)) {
                            return <TextBlockSection section={section} />
                        }
                        if (isTitleSection(section)) {
                            return <TitleBlockSection section={section} />
                        }
                        if (isDividerSection(section)) {
                            return <DividerBlockSection section={section} />
                        }
                        if (isImageSection(section)) {
                            return <ImageBlockSection section={section} />
                        }
                        if (isVideoSection(section)) {
                            return <VideoBlockSection section={section} />
                        }
                        // Default: regular sortable section
                        return <SortableSection section={section} />
                    }

                    return (
                        <div key={section.id}>
                            {renderSection()}
                            <DropZone id={`drop-zone-${index + 1}`} />
                        </div>
                    )
                })}

                {/* Drop Zone at end */}
                <CanvasDropZone />
            </div>
        </div>
    )
}

export default BuilderCanvas
