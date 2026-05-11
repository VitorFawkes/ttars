import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { Upload, Loader2 } from 'lucide-react'

interface PhotoBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
}

export function PhotoBlock({ data, onChange }: PhotoBlockProps) {
    const [isUploading, setIsUploading] = useState(false)
    const imageUrl = String(data.image_url || '')
    const caption = String(data.caption || '')

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        try {
            const ext = file.name.split('.').pop() || 'jpg'
            const path = `photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

            const { error: uploadError } = await supabase.storage
                .from('trip-plan-assets')
                .upload(path, file, { cacheControl: '3600', upsert: true })

            if (uploadError) throw uploadError

            const { data: urlData } = supabase.storage
                .from('trip-plan-assets')
                .getPublicUrl(path)

            onChange({ ...data, image_url: urlData.publicUrl })
        } catch (err) {
            console.error('Upload error:', err)
        } finally {
            setIsUploading(false)
        }
    }, [data, onChange])

    return (
        <div className="space-y-2">
            {imageUrl ? (
                <div className="relative group">
                    <img
                        src={imageUrl}
                        alt={caption || 'Foto'}
                        className="w-full h-32 object-cover rounded-lg"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer rounded-lg">
                        <span className="text-white text-xs font-medium">Trocar foto</span>
                        <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                </div>
            ) : (
                <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
                    {isUploading ? (
                        <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
                    ) : (
                        <>
                            <Upload className="h-5 w-5 text-slate-400 mb-1" />
                            <span className="text-xs text-slate-500">Clique para fazer upload</span>
                        </>
                    )}
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
            )}
            <Input
                value={caption}
                onChange={(e) => onChange({ ...data, caption: e.target.value })}
                placeholder="Legenda da foto (opcional)"
                className="h-7 text-xs"
            />
        </div>
    )
}
