import { useState, useRef, useEffect } from 'react'
import { Download, Trash2, X, Check } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
  getFileIcon,
  getFileIconColor,
  formatFileSize,
  isImageMime,
  getFileExtension,
} from '../../../lib/fileUtils'
import type { Arquivo } from '../../../hooks/useCardAttachments'

interface AttachmentItemProps {
  arquivo: Arquivo
  onDelete: (id: string, path: string) => Promise<void>
  onUpdateDescricao: (id: string, descricao: string) => Promise<void>
  onClickImage: (arquivo: Arquivo) => void
}

export default function AttachmentItem({
  arquivo,
  onDelete,
  onUpdateDescricao,
  onClickImage,
}: AttachmentItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteValue, setNoteValue] = useState(arquivo.descricao || '')
  const noteRef = useRef<HTMLInputElement>(null)
  const isImage = isImageMime(arquivo.mime_type)
  const Icon = getFileIcon(arquivo.mime_type)
  const iconColor = getFileIconColor(arquivo.mime_type)

  useEffect(() => {
    setNoteValue(arquivo.descricao || '')
  }, [arquivo.descricao])

  useEffect(() => {
    if (isEditingNote && noteRef.current) {
      noteRef.current.focus()
    }
  }, [isEditingNote])

  const handleSaveNote = async () => {
    setIsEditingNote(false)
    if (noteValue !== (arquivo.descricao || '')) {
      await onUpdateDescricao(arquivo.id, noteValue)
    }
  }

  const handleDelete = async () => {
    await onDelete(arquivo.id, arquivo.caminho_arquivo)
    setConfirmDelete(false)
  }

  const handleClick = () => {
    if (isImage) {
      onClickImage(arquivo)
    } else if (arquivo.signedUrl) {
      window.open(arquivo.signedUrl, '_blank')
    }
  }

  return (
    <div className="group relative flex flex-col rounded-lg border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all">
      {/* Thumbnail / Icon area */}
      <button
        type="button"
        onClick={handleClick}
        className="relative w-full aspect-square flex items-center justify-center bg-slate-50 overflow-hidden cursor-pointer"
      >
        {isImage && arquivo.signedUrl ? (
          <img
            src={arquivo.signedUrl}
            alt={arquivo.nome_original}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Icon className={cn('h-8 w-8', iconColor)} />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {getFileExtension(arquivo.nome_original)}
            </span>
          </div>
        )}

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          {arquivo.signedUrl && (
            <a
              href={arquivo.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-full bg-white/90 text-slate-700 hover:bg-white hover:text-indigo-600 transition-colors"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setConfirmDelete(true)
            }}
            className="p-1.5 rounded-full bg-white/90 text-slate-700 hover:bg-white hover:text-red-600 transition-colors"
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </button>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 z-10 bg-white/95 flex flex-col items-center justify-center gap-2 p-2">
          <span className="text-xs text-red-600 font-medium text-center">Remover anexo?</span>
          <div className="flex gap-1.5">
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-red-600 text-white rounded hover:bg-red-700"
            >
              <Check className="h-3 w-3" />
              Sim
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700"
            >
              <X className="h-3 w-3" />
              Não
            </button>
          </div>
        </div>
      )}

      {/* File info */}
      <div className="px-2 py-1.5 space-y-0.5">
        <p
          className="text-[11px] font-medium text-slate-800 truncate"
          title={arquivo.nome_original}
        >
          {arquivo.nome_original}
        </p>
        <p className="text-[10px] text-slate-400">
          {formatFileSize(arquivo.tamanho_bytes)}
        </p>

        {/* Note / description */}
        {isEditingNote ? (
          <input
            ref={noteRef}
            type="text"
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={handleSaveNote}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveNote()
              if (e.key === 'Escape') {
                setNoteValue(arquivo.descricao || '')
                setIsEditingNote(false)
              }
            }}
            placeholder="Adicionar nota..."
            className="w-full text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditingNote(true)}
            className={cn(
              'w-full text-left text-[10px] truncate rounded px-1 py-0.5 -mx-1 transition-colors',
              arquivo.descricao
                ? 'text-slate-500 hover:bg-slate-100'
                : 'text-slate-300 italic hover:bg-slate-50 hover:text-slate-400'
            )}
          >
            {arquivo.descricao || 'Adicionar nota...'}
          </button>
        )}
      </div>
    </div>
  )
}
