import { useState } from 'react'
import { Image as ImageIcon, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface Props {
  viagemId: string
  itemId: string
  fotos: string[]
  onChange: (fotos: string[]) => void
}

export function FotosUploader({ viagemId, itemId, fotos, onChange }: Props) {
  const [uploading, setUploading] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const uploadedUrls: string[] = []
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} não é imagem`)
          continue
        }
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `viagens/${viagemId}/${itemId}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage
          .from('trip-plan-assets')
          .upload(path, file, { cacheControl: '3600', upsert: false })
        if (error) {
          toast.error(`Erro ao enviar ${file.name}: ${error.message}`)
          continue
        }
        const { data } = supabase.storage.from('trip-plan-assets').getPublicUrl(path)
        uploadedUrls.push(data.publicUrl)
      }
      if (uploadedUrls.length > 0) {
        onChange([...fotos, ...uploadedUrls])
      }
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = (index: number) => {
    const next = fotos.filter((_, i) => i !== index)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {fotos.map((url, i) => (
            <div key={url} className="group relative aspect-video overflow-hidden rounded-md border border-slate-200">
              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-600"
                aria-label="Remover foto"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600">
        {uploading ? (
          <>
            <Upload className="h-4 w-4 animate-pulse" />
            Enviando...
          </>
        ) : (
          <>
            <ImageIcon className="h-4 w-4" />
            {fotos.length > 0 ? 'Adicionar mais fotos' : 'Adicionar fotos'}
          </>
        )}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
