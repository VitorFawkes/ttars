/**
 * ImageGallery - Componente para galeria de multiplas imagens
 *
 * Features:
 * - Upload de multiplas imagens
 * - Drag-and-drop para reordenar
 * - Preview e remocao
 * - Imagem principal (primeira)
 */

import { useState, useCallback } from 'react'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    useSortable,
    horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, X, GripVertical, ImageIcon, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface ImageGalleryProps {
    images: string[]
    mainImage?: string | null
    onImagesChange: (images: string[]) => void
    onMainImageChange?: (url: string | null) => void
    itemId: string
    maxImages?: number
    className?: string
}

interface SortableImageProps {
    url: string
    index: number
    isMain: boolean
    onRemove: () => void
    onSetMain: () => void
}

function SortableImage({ url, index, isMain, onRemove, onSetMain }: SortableImageProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: url })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "relative group w-24 h-24 rounded-lg overflow-hidden border-2",
                isDragging && "shadow-lg z-50",
                isMain ? "border-emerald-500" : "border-slate-200"
            )}
        >
            <img
                src={url}
                alt={`Imagem ${index + 1}`}
                className="w-full h-full object-cover"
            />

            {/* Overlay com acoes */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                {/* Drag handle */}
                <button
                    {...attributes}
                    {...listeners}
                    className="p-1 bg-white/90 rounded text-slate-600 hover:bg-white cursor-grab active:cursor-grabbing"
                >
                    <GripVertical className="h-4 w-4" />
                </button>

                {/* Set as main */}
                <button
                    onClick={onSetMain}
                    className={cn(
                        "p-1 rounded transition-colors",
                        isMain
                            ? "bg-emerald-500 text-white"
                            : "bg-white/90 text-slate-600 hover:bg-emerald-100"
                    )}
                    title={isMain ? "Imagem principal" : "Definir como principal"}
                >
                    <Star className={cn("h-4 w-4", isMain && "fill-current")} />
                </button>

                {/* Remove */}
                <button
                    onClick={onRemove}
                    className="p-1 bg-white/90 rounded text-red-500 hover:bg-red-100"
                    title="Remover imagem"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Main badge */}
            {isMain && (
                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-medium rounded">
                    Principal
                </div>
            )}
        </div>
    )
}

export function ImageGallery({
    images,
    mainImage,
    onImagesChange,
    onMainImageChange,
    itemId,
    maxImages = 6,
    className,
}: ImageGalleryProps) {
    const [isUploading, setIsUploading] = useState(false)

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor)
    )

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const oldIndex = images.findIndex(img => img === active.id)
            const newIndex = images.findIndex(img => img === over.id)

            if (oldIndex !== -1 && newIndex !== -1) {
                const newImages = [...images]
                const [removed] = newImages.splice(oldIndex, 1)
                newImages.splice(newIndex, 0, removed)
                onImagesChange(newImages)

                // Se a imagem principal foi movida para primeira posicao, manter
                // Se outra foi movida para primeira, tornar principal
                if (newIndex === 0 && onMainImageChange) {
                    onMainImageChange(newImages[0])
                }
            }
        }
    }, [images, onImagesChange, onMainImageChange])

    const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        const remainingSlots = maxImages - images.length
        if (remainingSlots <= 0) return

        setIsUploading(true)
        const newUrls: string[] = []

        try {
            for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
                const file = files[i]
                const fileExt = file.name.split('.').pop()
                const fileName = `${itemId}/${Date.now()}-${i}.${fileExt}`
                const filePath = `proposal-items/${fileName}`

                const { error } = await supabase.storage
                    .from('images')
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false
                    })

                if (error) {
                    console.error('Upload error:', error)
                    continue
                }

                const { data: publicUrl } = supabase.storage
                    .from('images')
                    .getPublicUrl(filePath)

                if (publicUrl?.publicUrl) {
                    newUrls.push(publicUrl.publicUrl)
                }
            }

            if (newUrls.length > 0) {
                const updatedImages = [...images, ...newUrls]
                onImagesChange(updatedImages)

                // Se nao tinha imagem principal, definir a primeira
                if (!mainImage && onMainImageChange) {
                    onMainImageChange(updatedImages[0])
                }
            }
        } catch (err) {
            console.error('Upload failed:', err)
        } finally {
            setIsUploading(false)
            // Reset input
            e.target.value = ''
        }
    }, [images, itemId, mainImage, maxImages, onImagesChange, onMainImageChange])

    const handleRemove = useCallback((url: string) => {
        const newImages = images.filter(img => img !== url)
        onImagesChange(newImages)

        // Se removeu a imagem principal, definir a proxima
        if (url === mainImage && onMainImageChange) {
            onMainImageChange(newImages[0] || null)
        }
    }, [images, mainImage, onImagesChange, onMainImageChange])

    const handleSetMain = useCallback((url: string) => {
        if (onMainImageChange) {
            onMainImageChange(url)
        }
    }, [onMainImageChange])

    const canAddMore = images.length < maxImages

    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <ImageIcon className="h-3.5 w-3.5" />
                <span>Galeria de Imagens ({images.length}/{maxImages})</span>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={images} strategy={horizontalListSortingStrategy}>
                    <div className="flex flex-wrap gap-2">
                        {images.map((url, index) => (
                            <SortableImage
                                key={url}
                                url={url}
                                index={index}
                                isMain={url === mainImage || (index === 0 && !mainImage)}
                                onRemove={() => handleRemove(url)}
                                onSetMain={() => handleSetMain(url)}
                            />
                        ))}

                        {/* Add button */}
                        {canAddMore && (
                            <label className={cn(
                                "w-24 h-24 flex flex-col items-center justify-center gap-1",
                                "border-2 border-dashed border-slate-300 rounded-lg",
                                "cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/50",
                                "transition-colors",
                                isUploading && "opacity-50 cursor-not-allowed"
                            )}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleUpload}
                                    disabled={isUploading}
                                    className="hidden"
                                />
                                {isUploading ? (
                                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Plus className="h-5 w-5 text-slate-400" />
                                        <span className="text-[10px] text-slate-400">Adicionar</span>
                                    </>
                                )}
                            </label>
                        )}
                    </div>
                </SortableContext>
            </DndContext>

            {images.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">
                    Nenhuma imagem adicionada. Clique em + para adicionar.
                </p>
            )}
        </div>
    )
}

export default ImageGallery
