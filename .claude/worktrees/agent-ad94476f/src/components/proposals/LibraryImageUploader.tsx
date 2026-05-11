/**
 * LibraryImageUploader - Upload de múltiplas imagens para biblioteca
 *
 * Features:
 * - Upload de múltiplas imagens (até 5)
 * - Drag-drop
 * - Reordenação (primeira = thumbnail)
 * - Remoção individual
 * - Supabase Storage
 */

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  Image as ImageIcon,
  Upload,
  X,
  Loader2,
  GripVertical,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'

interface LibraryImageUploaderProps {
  images: string[]
  onImagesChange: (urls: string[]) => void
  maxImages?: number
  className?: string
}

export function LibraryImageUploader({
  images = [],
  onImagesChange,
  maxImages = 5,
  className,
}: LibraryImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file upload
  const handleFileUpload = async (files: FileList) => {
    const validFiles: File[] = []

    // Validate files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name}: Apenas imagens são permitidas`)
        continue
      }

      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        toast.error(`${file.name}: Imagem muito grande (máx 5MB)`)
        continue
      }

      if (images.length + validFiles.length >= maxImages) {
        toast.error(`Máximo de ${maxImages} imagens`)
        break
      }

      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    setIsUploading(true)

    try {
      const uploadedUrls: string[] = []

      for (const file of validFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `library/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

        const { data, error } = await supabase.storage
          .from('proposals')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true,
          })

        if (error) {
          console.error('Upload error:', error)
          toast.error(`Erro ao enviar ${file.name}`)
          continue
        }

        const { data: { publicUrl } } = supabase.storage
          .from('proposals')
          .getPublicUrl(data.path)

        uploadedUrls.push(publicUrl)
      }

      if (uploadedUrls.length > 0) {
        onImagesChange([...images, ...uploadedUrls])
        toast.success(`${uploadedUrls.length} ${uploadedUrls.length === 1 ? 'imagem enviada' : 'imagens enviadas'}!`)
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Erro ao enviar imagens')
    } finally {
      setIsUploading(false)
    }
  }

  // Handle drag events (for upload)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedIndex) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedIndex) setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (draggedIndex !== null) {
      // Reordering
      return
    }

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileUpload(files)
    }
  }

  // Handle remove image
  const handleRemove = (index: number) => {
    const newImages = images.filter((_, i) => i !== index)
    onImagesChange(newImages)
  }

  // Handle reorder (drag & drop between images)
  const handleImageDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleImageDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const newImages = [...images]
    const draggedItem = newImages[draggedIndex]
    newImages.splice(draggedIndex, 1)
    newImages.splice(index, 0, draggedItem)

    onImagesChange(newImages)
    setDraggedIndex(index)
  }

  const handleImageDragEnd = () => {
    setDraggedIndex(null)
  }

  // Set as primary (move to first position)
  const setAsPrimary = (index: number) => {
    if (index === 0) return
    const newImages = [...images]
    const [item] = newImages.splice(index, 1)
    newImages.unshift(item)
    onImagesChange(newImages)
    toast.success('Imagem definida como principal')
  }

  return (
    <div className={cn('space-y-3', className)}>
      <label className="text-sm font-medium text-slate-700 flex items-center justify-between">
        <span>Imagens</span>
        <span className="text-xs text-slate-400 font-normal">
          {images.length}/{maxImages}
        </span>
      </label>

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((url, index) => (
            <div
              key={url}
              draggable
              onDragStart={(e) => handleImageDragStart(e, index)}
              onDragOver={(e) => handleImageDragOver(e, index)}
              onDragEnd={handleImageDragEnd}
              className={cn(
                "relative group aspect-video rounded-lg overflow-hidden bg-slate-100 cursor-move",
                draggedIndex === index && "opacity-50"
              )}
            >
              <img
                src={url}
                alt={`Imagem ${index + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f1f5f9" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="10">Erro</text></svg>'
                }}
              />

              {/* Primary badge */}
              {index === 0 && (
                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded flex items-center gap-0.5">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  Principal
                </div>
              )}

              {/* Drag handle */}
              <div className="absolute top-1 right-1 p-1 bg-white/80 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="h-3 w-3 text-slate-400" />
              </div>

              {/* Actions overlay */}
              <div className={cn(
                'absolute inset-0 bg-black/50 flex items-center justify-center gap-1',
                'opacity-0 group-hover:opacity-100 transition-opacity duration-200'
              )}>
                {index !== 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAsPrimary(index)}
                    className="h-7 px-2 bg-white/90 hover:bg-white text-xs"
                  >
                    <Star className="h-3 w-3 mr-1" />
                    Principal
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRemove(index)}
                  className="h-7 px-2 bg-white/90 hover:bg-red-50 text-red-600 hover:text-red-700"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {images.length < maxImages && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer',
            'transition-all duration-200',
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
          )}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-600">Enviando...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center',
                isDragging ? 'bg-blue-100' : 'bg-slate-200'
              )}>
                {isDragging ? (
                  <Upload className="h-5 w-5 text-blue-600" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-slate-400" />
                )}
              </div>
              <div>
                <p className={cn(
                  'text-sm font-medium',
                  isDragging ? 'text-blue-600' : 'text-slate-600'
                )}>
                  {isDragging ? 'Solte aqui' : 'Clique ou arraste imagens'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  PNG, JPG até 5MB • Máximo {maxImages} imagens
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) {
            handleFileUpload(files)
          }
          // Reset input
          e.target.value = ''
        }}
      />

      {/* Help text */}
      {images.length === 0 && (
        <p className="text-xs text-slate-400">
          A primeira imagem será usada como thumbnail na busca
        </p>
      )}
    </div>
  )
}
