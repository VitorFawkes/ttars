import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { ImagePlus, Upload, Link2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { ProposalItemWithOptions } from '@/types/proposals'
import type { Json } from '@/database.types'

interface ImageBlockProps {
    item: ProposalItemWithOptions
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
}

export function ImageBlock({ item, onUpdate }: ImageBlockProps) {
    const rc = (item.rich_content as Record<string, unknown>) || {}
    const imageUrl = (rc.image_url as string) || ''
    const [isUploading, setIsUploading] = useState(false)
    const [showUrlInput, setShowUrlInput] = useState(false)

    const updateRc = useCallback((updates: Record<string, unknown>) => {
        onUpdate({ rich_content: { ...rc, ...updates, is_image_block: true } as unknown as Json })
    }, [rc, onUpdate])

    const handleFileUpload = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) return
        setIsUploading(true)
        try {
            const ext = file.name.split('.').pop()
            const path = `proposals/${crypto.randomUUID()}.${ext}`
            const { error } = await supabase.storage.from('attachments').upload(path, file)
            if (error) throw error
            const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)
            updateRc({ image_url: publicUrl })
        } catch {
            toast.error('Erro ao enviar imagem')
        } finally {
            setIsUploading(false)
        }
    }, [updateRc])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) handleFileUpload(file)
    }, [handleFileUpload])

    const handleUrlSubmit = useCallback((url: string) => {
        updateRc({ image_url: url.trim() })
        setShowUrlInput(false)
    }, [updateRc])

    if (imageUrl) {
        return (
            <div className="relative">
                <img
                    src={imageUrl}
                    alt=""
                    className="w-full max-h-[400px] object-cover rounded-lg"
                    onError={() => updateRc({ image_url: '' })}
                />
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateRc({ image_url: '' })}
                        className="bg-white/90 text-xs h-7"
                    >
                        Trocar imagem
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="p-8 text-center"
        >
            {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                    <p className="text-xs text-slate-500">Enviando...</p>
                </div>
            ) : (
                <>
                    <ImagePlus className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500 mb-3">Arraste uma imagem ou</p>
                    <div className="flex items-center justify-center gap-2">
                        <label>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
                            <Button variant="outline" size="sm" asChild className="gap-1.5 cursor-pointer">
                                <span><Upload className="h-3.5 w-3.5" /> Upload</span>
                            </Button>
                        </label>
                        <Button variant="ghost" size="sm" onClick={() => setShowUrlInput(!showUrlInput)} className="gap-1.5">
                            <Link2 className="h-3.5 w-3.5" /> URL
                        </Button>
                    </div>
                    {showUrlInput && (
                        <div className="mt-3 max-w-sm mx-auto">
                            <input
                                type="url"
                                placeholder="https://..."
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') handleUrlSubmit((e.target as HTMLInputElement).value) }}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
