import { useEffect, useCallback } from 'react'
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatFileSize } from '../../../lib/fileUtils'
import type { Arquivo } from '../../../hooks/useCardAttachments'

interface AttachmentLightboxProps {
  arquivo: Arquivo
  images: Arquivo[] // all image attachments for navigation
  onClose: () => void
  onNavigate: (arquivo: Arquivo) => void
}

export default function AttachmentLightbox({
  arquivo,
  images,
  onClose,
  onNavigate,
}: AttachmentLightboxProps) {
  const currentIndex = images.findIndex((img) => img.id === arquivo.id)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < images.length - 1

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(images[currentIndex - 1])
  }, [hasPrev, images, currentIndex, onNavigate])

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(images[currentIndex + 1])
  }, [hasNext, images, currentIndex, onNavigate])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, goPrev, goNext])

  // Prevent body scroll while lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Header bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white">
          <p className="text-sm font-medium truncate max-w-[60vw]">
            {arquivo.nome_original}
          </p>
          <div className="flex items-center gap-3 text-xs text-white/60">
            <span>{formatFileSize(arquivo.tamanho_bytes)}</span>
            {images.length > 1 && (
              <span>
                {currentIndex + 1} / {images.length}
              </span>
            )}
          </div>
          {arquivo.descricao && (
            <p className="text-xs text-white/80 mt-1 italic">
              {arquivo.descricao}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {arquivo.signedUrl && (
            <a
              href={arquivo.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title="Download"
            >
              <Download className="h-5 w-5" />
            </a>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <img
        src={arquivo.signedUrl}
        alt={arquivo.nome_original}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            goPrev()
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            goNext()
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}
