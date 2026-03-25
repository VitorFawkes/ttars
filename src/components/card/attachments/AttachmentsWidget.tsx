import { useState, useCallback, useMemo } from 'react'
import { Paperclip } from 'lucide-react'
import { SectionCollapseToggle } from '../DynamicSectionWidget'
import { useCardAttachments } from '../../../hooks/useCardAttachments'
import { isImageMime } from '../../../lib/fileUtils'
import { cn } from '../../../lib/utils'
import type { Database } from '../../../database.types'
import type { Arquivo } from '../../../hooks/useCardAttachments'
import AttachmentUploadZone from './AttachmentUploadZone'
import AttachmentItem from './AttachmentItem'
import AttachmentLightbox from './AttachmentLightbox'

type Card = Database['public']['Tables']['cards']['Row']

interface AttachmentsWidgetProps {
  cardId: string
  card: Card
  isExpanded?: boolean
  onToggleCollapse?: () => void
}

export default function AttachmentsWidget({
  cardId,
  card: _card,
  isExpanded: _isExpanded,
  onToggleCollapse,
}: AttachmentsWidgetProps) {
  const {
    arquivos,
    isLoading,
    uploadFiles,
    deleteFile,
    updateDescricao,
    isUploading,
    uploadProgress,
  } = useCardAttachments(cardId)

  const [lightboxFile, setLightboxFile] = useState<Arquivo | null>(null)

  // All images for lightbox navigation
  const imageFiles = useMemo(
    () => arquivos.filter((a) => isImageMime(a.mime_type)),
    [arquivos]
  )

  // Handle clipboard paste
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files)
      if (files.length > 0) {
        e.preventDefault()
        uploadFiles(files)
      }
    },
    [uploadFiles]
  )

  const handleUpload = useCallback(
    async (files: File[]) => {
      await uploadFiles(files)
    },
    [uploadFiles]
  )

  const handleDelete = useCallback(
    async (id: string, path: string) => {
      await deleteFile({ id, path })
    },
    [deleteFile]
  )

  const handleUpdateDescricao = useCallback(
    async (id: string, descricao: string) => {
      await updateDescricao({ id, descricao })
    },
    [updateDescricao]
  )

  const handleClickImage = useCallback((arquivo: Arquivo) => {
    setLightboxFile(arquivo)
  }, [])

  return (
    <div
      className="rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden"
      onPaste={handlePaste}
      tabIndex={-1}
    >
      {/* Header */}
      <div
        className={cn(
          'border-b border-gray-200 bg-gray-50/50 px-3 py-2',
          onToggleCollapse && 'cursor-pointer hover:bg-gray-100/50 transition-colors'
        )}
        onClick={onToggleCollapse}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100">
              <Paperclip className="h-4 w-4 text-indigo-700" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Anexos</h3>
            {arquivos.length > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {arquivos.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {onToggleCollapse && (
              <SectionCollapseToggle
                isExpanded={_isExpanded ?? true}
                onToggle={onToggleCollapse}
              />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Upload zone */}
        <AttachmentUploadZone
          onUpload={handleUpload}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
        />

        {/* Files grid */}
        {isLoading ? (
          <div className="py-4 text-center text-sm text-gray-500">Carregando...</div>
        ) : arquivos.length === 0 ? (
          <div className="py-4 flex flex-col items-center gap-1.5 text-slate-400">
            <Paperclip className="h-6 w-6" />
            <span className="text-xs">Nenhum anexo ainda</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {arquivos.map((arquivo) => (
              <AttachmentItem
                key={arquivo.id}
                arquivo={arquivo}
                onDelete={handleDelete}
                onUpdateDescricao={handleUpdateDescricao}
                onClickImage={handleClickImage}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxFile && (
        <AttachmentLightbox
          arquivo={lightboxFile}
          images={imageFiles}
          onClose={() => setLightboxFile(null)}
          onNavigate={setLightboxFile}
        />
      )}
    </div>
  )
}
