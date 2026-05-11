import { useState, useRef, useCallback } from 'react'
import { Camera, Image, X, Loader2 } from 'lucide-react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Proposal } from '@/types/proposals'

interface ProposalCoverHeroProps {
    proposal: Proposal
    isPreview?: boolean
}

/**
 * Cover Hero Component - Traviata-inspired
 * 
 * Features:
 * - Large cover image with upload/change
 * - Inline editable title
 * - Inline editable subtitle
 * - Drag & drop image support
 */
export function ProposalCoverHero({ proposal, isPreview = false }: ProposalCoverHeroProps) {
    const { version, updateTitle, updateCoverImage, updateSubtitle } = useProposalBuilder()
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Read from metadata (cover_image_url, subtitle are stored in metadata JSONB)
    const metadata = (version?.metadata as Record<string, unknown>) || {}
    const coverImage = metadata.cover_image_url as string | undefined
    const title = version?.title || ''
    const subtitle = (metadata.subtitle as string) || ''

    // Handle file upload
    const handleFileUpload = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Por favor, selecione uma imagem')
            return
        }

        if (file.size > 5 * 1024 * 1024) {
            toast.error('Imagem muito grande. Máximo 5MB')
            return
        }

        setIsUploading(true)

        try {
            const fileName = `proposals/${proposal.id}/${Date.now()}-${file.name}`

            const { data, error } = await supabase.storage
                .from('proposal-assets')
                .upload(fileName, file, { upsert: true })

            if (error) throw error

            const { data: urlData } = supabase.storage
                .from('proposal-assets')
                .getPublicUrl(data.path)

            updateCoverImage(urlData.publicUrl)
            toast.success('Imagem de capa atualizada!')
        } catch (error) {
            console.error('Upload error:', error)
            toast.error('Erro ao fazer upload da imagem')
        } finally {
            setIsUploading(false)
        }
    }, [proposal.id, updateCoverImage])

    // Drag & drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = () => {
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const file = e.dataTransfer.files[0]
        if (file) handleFileUpload(file)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handleFileUpload(file)
    }

    return (
        <div className="space-y-6">
            {/* Cover Image Area */}
            <div
                className={cn(
                    'relative w-full aspect-[16/9] rounded-2xl overflow-hidden bg-slate-100 border-2 border-dashed transition-all duration-200',
                    isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200',
                    !isPreview && 'cursor-pointer hover:border-slate-300 group'
                )}
                onDragOver={!isPreview ? handleDragOver : undefined}
                onDragLeave={!isPreview ? handleDragLeave : undefined}
                onDrop={!isPreview ? handleDrop : undefined}
                onClick={() => !isPreview && !coverImage && fileInputRef.current?.click()}
            >
                {coverImage ? (
                    <>
                        {/* Cover Image */}
                        <img
                            src={coverImage}
                            alt="Capa da proposta"
                            className="absolute inset-0 w-full h-full object-cover"
                        />

                        {/* Overlay on hover (edit mode only) */}
                        {!isPreview && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        fileInputRef.current?.click()
                                    }}
                                    className="px-4 py-2 bg-white/90 hover:bg-white rounded-lg text-sm font-medium text-slate-900 flex items-center gap-2 transition-colors"
                                >
                                    <Camera className="h-4 w-4" />
                                    Trocar Imagem
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        updateCoverImage(null)
                                    }}
                                    className="p-2 bg-white/90 hover:bg-white rounded-lg text-red-600 transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    /* Empty state */
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {isUploading ? (
                            <>
                                <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-2" />
                                <p className="text-sm text-slate-500">Enviando imagem...</p>
                            </>
                        ) : (
                            <>
                                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4">
                                    <Image className="h-8 w-8 text-slate-400" />
                                </div>
                                <p className="text-sm font-medium text-slate-700 mb-1">
                                    {isDragging ? 'Solte a imagem aqui' : 'Arraste uma imagem ou clique'}
                                </p>
                                <p className="text-xs text-slate-400">
                                    PNG, JPG ou WEBP até 5MB
                                </p>
                            </>
                        )}
                    </div>
                )}

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                />
            </div>

            {/* Title & Subtitle */}
            <div className="space-y-3">
                {/* Title - Large editable */}
                {isPreview ? (
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                        {title || 'Sem título'}
                    </h1>
                ) : (
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => updateTitle(e.target.value)}
                        placeholder="Título da Viagem"
                        className="w-full text-3xl font-bold text-slate-900 tracking-tight bg-transparent border-none outline-none focus:ring-0 placeholder:text-slate-300"
                    />
                )}

                {/* Subtitle */}
                {isPreview ? (
                    <p className="text-lg text-slate-500">
                        {subtitle || 'Uma jornada inesquecível'}
                    </p>
                ) : (
                    <input
                        type="text"
                        value={subtitle}
                        onChange={(e) => updateSubtitle(e.target.value)}
                        placeholder="Uma jornada inesquecível pela..."
                        className="w-full text-lg text-slate-500 bg-transparent border-none outline-none focus:ring-0 placeholder:text-slate-300"
                    />
                )}
            </div>
        </div>
    )
}
