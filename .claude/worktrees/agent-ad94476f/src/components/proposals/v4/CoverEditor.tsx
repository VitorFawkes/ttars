/**
 * CoverEditor - Premium cover section editor for proposal builder
 * 
 * Features:
 * - Image upload with drag-drop
 * - Editable title and subtitle
 * - Travel dates and travelers count
 * - Live preview with overlay
 */

import { useState, useCallback, useRef } from 'react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
    ImagePlus,
    Calendar,
    Users,
    X,
    Pencil,
    Upload,
    Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface CoverEditorProps {
    className?: string
}

export function CoverEditor({ className }: CoverEditorProps) {
    const {
        version,
        updateTitle,
        updateSubtitle,
        updateCoverImage
    } = useProposalBuilder()

    const [isEditing, setIsEditing] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Get values from version metadata
    const metadata = (version?.metadata as Record<string, any>) || {}
    const coverImageUrl = metadata.cover_image_url
    const subtitle = metadata.subtitle || ''
    const title = version?.title || 'Proposta de Viagem'
    const travelDates = metadata.travel_dates as { start?: string; end?: string } | undefined
    const travelers = metadata.travelers as number | undefined

    // Handle image upload
    const handleImageUpload = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Arquivo inválido', {
                description: 'Por favor, selecione uma imagem (PNG, JPG, WEBP)',
            })
            return
        }

        setIsUploading(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `proposal-covers/${version?.id || 'temp'}-${Date.now()}.${fileExt}`

            console.log('[CoverEditor] Uploading to bucket: proposals, file:', fileName)

            const { error: uploadError, data: uploadData } = await supabase.storage
                .from('proposals')
                .upload(fileName, file, { upsert: true })

            if (uploadError) {
                console.error('[CoverEditor] Upload error:', uploadError)
                throw uploadError
            }

            console.log('[CoverEditor] Upload success:', uploadData)

            const { data: { publicUrl } } = supabase.storage
                .from('proposals')
                .getPublicUrl(fileName)

            console.log('[CoverEditor] Public URL:', publicUrl)

            updateCoverImage(publicUrl)
            toast.success('Imagem da capa atualizada!', {
                description: 'A imagem será salva quando você salvar a proposta.',
            })
        } catch (error: any) {
            console.error('[CoverEditor] Error uploading image:', error)
            toast.error('Erro ao enviar imagem', {
                description: error.message || 'Verifique se você tem permissão de upload.',
            })
        } finally {
            setIsUploading(false)
        }
    }, [version?.id, updateCoverImage])

    // Drag and drop handlers
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const file = e.dataTransfer.files[0]
        if (file) {
            handleImageUpload(file)
        }
    }, [handleImageUpload])

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            handleImageUpload(file)
        }
    }, [handleImageUpload])

    // Format date for display
    const formatDate = (dateStr?: string) => {
        if (!dateStr) return ''
        try {
            return new Date(dateStr).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            })
        } catch {
            return dateStr
        }
    }

    const dateDisplay = travelDates?.start && travelDates?.end
        ? `${formatDate(travelDates.start)} - ${formatDate(travelDates.end)}`
        : travelDates?.start
            ? formatDate(travelDates.start)
            : null

    return (
        <div
            className={cn(
                "relative rounded-xl overflow-hidden group",
                "aspect-[16/9] max-h-[400px]",
                className
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Background Image or Gradient Placeholder */}
            {coverImageUrl ? (
                <img
                    src={coverImageUrl}
                    alt="Capa da proposta"
                    className="absolute inset-0 w-full h-full object-cover"
                />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600" />
            )}

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

            {/* Drag overlay */}
            {isDragging && (
                <div className="absolute inset-0 bg-blue-600/80 flex items-center justify-center z-20">
                    <div className="text-center text-white">
                        <Upload className="h-12 w-12 mx-auto mb-2" />
                        <p className="font-semibold">Solte a imagem aqui</p>
                    </div>
                </div>
            )}

            {/* Upload indicator */}
            {isUploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-30">
                    <div className="text-center text-white">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                        <p className="text-sm">Enviando imagem...</p>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 z-10">
                {isEditing ? (
                    /* Edit Mode */
                    <div className="w-full max-w-md space-y-4 bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-slate-900">Editar Capa</h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsEditing(false)}
                                className="h-8 w-8"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-slate-500 block mb-1.5">
                                Título
                            </label>
                            <Input
                                value={title}
                                onChange={(e) => updateTitle(e.target.value)}
                                placeholder="Ex: Itália Romântica"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-medium text-slate-500 block mb-1.5">
                                Subtítulo
                            </label>
                            <Input
                                value={subtitle}
                                onChange={(e) => updateSubtitle(e.target.value)}
                                placeholder="Ex: 15 dias de sonho"
                            />
                        </div>

                        <div className="pt-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                            >
                                <ImagePlus className="h-4 w-4 mr-2" />
                                {coverImageUrl ? 'Trocar Imagem' : 'Adicionar Imagem'}
                            </Button>
                        </div>

                        {coverImageUrl && (
                            <Button
                                variant="ghost"
                                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => updateCoverImage(null)}
                            >
                                <X className="h-4 w-4 mr-2" />
                                Remover Imagem
                            </Button>
                        )}
                    </div>
                ) : (
                    /* Display Mode */
                    <>
                        {/* Title & Subtitle */}
                        <div className="text-center text-white">
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight drop-shadow-lg mb-2">
                                {title}
                            </h1>
                            {subtitle && (
                                <p className="text-lg text-white/90 drop-shadow">
                                    {subtitle}
                                </p>
                            )}
                        </div>

                        {/* Meta badges */}
                        <div className="flex items-center gap-4 mt-6">
                            {dateDisplay && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm">
                                    <Calendar className="h-4 w-4" />
                                    {dateDisplay}
                                </div>
                            )}
                            {travelers && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm">
                                    <Users className="h-4 w-4" />
                                    {travelers} {travelers === 1 ? 'viajante' : 'viajantes'}
                                </div>
                            )}
                        </div>

                        {/* Edit button - visible on hover */}
                        <button
                            onClick={() => setIsEditing(true)}
                            className={cn(
                                "absolute bottom-4 right-4",
                                "flex items-center gap-2 px-4 py-2",
                                "bg-white/90 hover:bg-white text-slate-900",
                                "rounded-lg shadow-lg",
                                "opacity-0 group-hover:opacity-100",
                                "transition-all duration-200",
                                "text-sm font-medium"
                            )}
                        >
                            <Pencil className="h-4 w-4" />
                            Editar Capa
                        </button>
                    </>
                )}
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />
        </div>
    )
}

export default CoverEditor
