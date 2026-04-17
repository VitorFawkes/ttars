import { useState, useRef, useEffect, createElement } from 'react'
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

function FileTypeIcon({ mimeType, className }: { mimeType: string | null; className?: string }) {
  return createElement(getFileIcon(mimeType), { className })
}

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
  const iconColor = getFileIconColor(arquivo.mime_type)

  const descricao = arquivo.descricao || ''
  if (descricao !== noteValue && !isEditingNote) {
    setNoteValue(descricao)
  }

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

  // Delete confirmation overlay
  if (confirmDelete) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-red-50 border border-red-200">
        <span className="text-xs text-red-600 font-medium flex-1">Remover?</span>
        <button
          onClick={handleDelete}
          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium bg-red-600 text-white rounded hover:bg-red-700"
        >
          <Check className="h-3 w-3" />
          Sim
        </button>
        <button
          onClick={() => setConfirmDelete(false)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-700"
        >
          <X className="h-3 w-3" />
          Não
        </button>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
      {/* Icon or mini thumbnail */}
      <button
        type="button"
        onClick={handleClick}
        className="flex-shrink-0 h-8 w-8 rounded-md overflow-hidden flex items-center justify-center bg-slate-100 cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all"
      >
        {isImage && arquivo.signedUrl ? (
          <img
            src={arquivo.signedUrl}
            alt={arquivo.nome_original}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <FileTypeIcon mimeType={arquivo.mime_type} className={cn('h-4 w-4', iconColor)} />
        )}
      </button>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleClick}
            className="text-[12px] font-medium text-slate-800 truncate hover:text-indigo-600 transition-colors cursor-pointer"
            title={arquivo.nome_original}
          >
            {arquivo.nome_original}
          </button>
          <span className="flex-shrink-0 text-[10px] text-slate-400 uppercase font-medium">
            {getFileExtension(arquivo.nome_original)}
          </span>
          <span className="flex-shrink-0 text-[10px] text-slate-400">
            {formatFileSize(arquivo.tamanho_bytes)}
          </span>
        </div>

        {/* Note / description - inline */}
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
            className="w-full text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        ) : arquivo.descricao ? (
          <button
            type="button"
            onClick={() => setIsEditingNote(true)}
            className="text-[10px] text-slate-400 truncate hover:text-slate-600 transition-colors block max-w-full text-left"
          >
            {arquivo.descricao}
          </button>
        ) : null}
      </div>

      {/* Actions - visible on hover */}
      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!arquivo.descricao && (
          <button
            type="button"
            onClick={() => setIsEditingNote(true)}
            className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors text-[10px]"
            title="Adicionar nota"
          >
            Nota
          </button>
        )}
        {arquivo.signedUrl && (
          <a
            href={arquivo.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        )}
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
