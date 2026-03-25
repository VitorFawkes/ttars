import { useState, useRef, useCallback } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { MAX_FILE_SIZE, ACCEPTED_MIME_TYPES } from '../../../lib/fileUtils'

interface AttachmentUploadZoneProps {
  onUpload: (files: File[]) => Promise<void>
  isUploading: boolean
  uploadProgress: { current: number; total: number } | null
}

export default function AttachmentUploadZone({
  onUpload,
  isUploading,
  uploadProgress,
}: AttachmentUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter((f) => f.size <= MAX_FILE_SIZE)
      if (files.length > 0) {
        await onUpload(files)
      }
    },
    [onUpload]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  if (isUploading) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-3 border border-dashed border-indigo-300 rounded-lg bg-indigo-50 text-sm text-indigo-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        {uploadProgress
          ? `Enviando ${uploadProgress.current}/${uploadProgress.total}...`
          : 'Enviando...'}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-all text-sm',
        isDragOver
          ? 'border-indigo-400 bg-indigo-50 text-indigo-600 scale-[1.01]'
          : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-500'
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <Upload className="h-4 w-4" />
      <span>Arraste arquivos, cole ou clique</span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES}
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}
