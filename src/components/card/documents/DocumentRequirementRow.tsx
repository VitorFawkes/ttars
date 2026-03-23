import { useState, useRef, useEffect, useMemo } from 'react'
import { Circle, CheckCircle2, MoreHorizontal, Undo2, Trash2, StickyNote, Check, Pencil, AlertCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { DocumentRequirement, DocumentModo } from '../../../hooks/useDocumentCollection'
import { CAMPO_CONTATO_MAP } from '../../../hooks/useDocumentCollection'
import DocumentUploadZone from './DocumentUploadZone'

interface DocumentRequirementRowProps {
  requirement: DocumentRequirement
  onMarkReceived: (params: { requirementId: string; dataValue?: string }) => Promise<void>
  onUndo: (requirementId: string) => Promise<void>
  onRemove: (requirementId: string) => Promise<void>
  onUpload: (params: { requirementId: string; file: File; contatoId: string; documentTypeSlug: string; dataValue?: string }) => Promise<void>
  onUpdateNotes: (params: { requirementId: string; notas: string | null }) => Promise<void>
  onUpdateDataValue: (params: { requirementId: string; dataValue: string | null }) => Promise<void>
  onUpdateModo: (params: { requirementId: string; modo: DocumentModo }) => Promise<void>
  isUploading: boolean
}

const MODO_LABELS: Record<DocumentModo, string> = {
  dados: 'Dados',
  arquivo: 'Arquivo',
  ambos: 'Ambos',
}

export default function DocumentRequirementRow({
  requirement,
  onMarkReceived,
  onUndo,
  onRemove,
  onUpload,
  onUpdateNotes,
  onUpdateDataValue,
  onUpdateModo,
  isUploading,
}: DocumentRequirementRowProps) {
  const [dataValue, setDataValue] = useState(requirement.data_value || '')
  const [showMenu, setShowMenu] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState(requirement.notas || '')
  const [editingData, setEditingData] = useState(false)
  const [isMarking, setIsMarking] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  const isReceived = requirement.status === 'recebido'
  const docType = requirement.document_type
  const modo = requirement.modo || 'ambos'

  // What to show based on modo
  const showData = modo === 'dados' || modo === 'ambos'
  const showFile = modo === 'arquivo' || modo === 'ambos'

  // Data field label — use the type's label if available, generic otherwise
  const dataLabel = docType.data_field_label || 'Nº / dados do documento'

  // Auto-fill: resolve contact field value from campo_contato mapping
  const contactFieldValue = useMemo(() => {
    const campo = docType.campo_contato
    if (!campo || !requirement.contato) return null
    const mappedCol = CAMPO_CONTATO_MAP[campo]
    if (!mappedCol) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (requirement.contato as any)[mappedCol]
    return typeof val === 'string' && val.length > 0 ? val : null
  }, [docType.campo_contato, requirement.contato])

  // Sync when requirement data changes externally (auto-fill from contact if no stored value)
  useEffect(() => {
    setDataValue(requirement.data_value || contactFieldValue || '')
    setNotes(requirement.notas || '')
  }, [requirement.data_value, requirement.notas, contactFieldValue])

  // Flags for incomplete received documents
  const hasData = !!requirement.data_value
  const hasFile = !!requirement.arquivo_id
  const isIncomplete = isReceived && ((showData && !hasData) || (showFile && !hasFile))

  const handleMarkReceived = async () => {
    setIsMarking(true)
    try {
      await onMarkReceived({
        requirementId: requirement.id,
        dataValue: showData ? (dataValue || undefined) : undefined,
      })
    } finally {
      setIsMarking(false)
    }
  }

  const handleUpload = async (file: File) => {
    await onUpload({
      requirementId: requirement.id,
      file,
      contatoId: requirement.contato_id,
      documentTypeSlug: docType.slug,
      dataValue: showData ? (dataValue || undefined) : undefined,
    })
  }

  const handleSaveNotes = async () => {
    const trimmed = notes.trim()
    await onUpdateNotes({
      requirementId: requirement.id,
      notas: trimmed || null,
    })
    setShowNotes(false)
  }

  const handleSaveDataValue = async () => {
    await onUpdateDataValue({
      requirementId: requirement.id,
      dataValue: dataValue.trim() || null,
    })
    setEditingData(false)
  }

  const handleDataKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (isReceived) {
        handleSaveDataValue()
      }
    }
    if (e.key === 'Escape') {
      setDataValue(requirement.data_value || '')
      setEditingData(false)
    }
  }

  const handleChangeModo = async (newModo: DocumentModo) => {
    await onUpdateModo({ requirementId: requirement.id, modo: newModo })
    setShowMenu(false)
  }

  return (
    <div className={cn(
      "group relative flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border transition-colors",
      isReceived
        ? isIncomplete ? "bg-amber-50/50 border-amber-200" : "bg-green-50/50 border-green-200"
        : "bg-white border-gray-200 hover:border-teal-200"
    )}>
      {/* Main row */}
      <div className="flex items-center gap-2">
        {/* Status toggle — always clickable */}
        <button
          onClick={isReceived ? () => onUndo(requirement.id) : handleMarkReceived}
          disabled={isMarking}
          className={cn(
            "shrink-0 transition-colors cursor-pointer",
            isReceived
              ? isIncomplete ? "text-amber-500 hover:text-amber-400" : "text-green-600 hover:text-green-400"
              : "text-gray-300 hover:text-teal-500"
          )}
          title={isReceived ? 'Desfazer recebimento' : 'Marcar como recebido'}
        >
          {isReceived ? (
            isIncomplete
              ? <AlertCircle className="h-4.5 w-4.5" />
              : <CheckCircle2 className="h-4.5 w-4.5" />
          ) : (
            <Circle className="h-4.5 w-4.5" />
          )}
        </button>

        {/* Document name */}
        <span className={cn(
          "text-sm font-medium flex-1 min-w-0 truncate",
          isReceived
            ? isIncomplete ? "text-amber-800" : "text-green-800"
            : "text-gray-900"
        )}>
          {docType.nome}
        </span>

        {/* Status badges — clear text labels */}
        <div className="flex items-center gap-1 shrink-0">
          {isReceived && hasData && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-600">
              Dados ✓
            </span>
          )}
          {isReceived && hasFile && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-600">
              Arquivo ✓
            </span>
          )}
          {isReceived && showData && !hasData && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-600">
              Sem dados
            </span>
          )}
          {isReceived && showFile && !hasFile && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-600">
              Sem arquivo
            </span>
          )}
          {!isReceived && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500">
              {MODO_LABELS[modo]}
            </span>
          )}
          {requirement.notas && !showNotes && (
            <StickyNote className="h-3 w-3 text-amber-400" />
          )}
        </div>

        {/* Actions menu — always visible */}
        <div className="relative shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
            className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {isReceived && (
                  <button
                    onClick={() => { onUndo(requirement.id); setShowMenu(false) }}
                    className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Desfazer recebimento
                  </button>
                )}
                {isReceived && showData && (
                  <button
                    onClick={() => { setEditingData(true); setShowMenu(false) }}
                    className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {hasData ? 'Editar dados' : 'Adicionar dados'}
                  </button>
                )}
                <button
                  onClick={() => { setShowNotes(!showNotes); setShowMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <StickyNote className="h-3.5 w-3.5" />
                  {requirement.notas ? 'Editar observação' : 'Adicionar observação'}
                </button>

                {/* Mode selector */}
                <div className="border-t border-gray-100 my-1" />
                <div className="px-3 py-1.5">
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Modo de coleta</span>
                  <div className="flex items-center gap-1 mt-1">
                    {(['dados', 'arquivo', 'ambos'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => handleChangeModo(m)}
                        className={cn(
                          "flex-1 px-1.5 py-1 text-[10px] font-medium rounded transition-colors",
                          modo === m
                            ? "bg-teal-600 text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        )}
                      >
                        {MODO_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => { onRemove(requirement.id); setShowMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover documento
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Data field — shown when pending and modo includes 'dados', or when editing received */}
      {showData && (!isReceived || editingData) && (
        <div className="flex flex-col gap-1 pl-6">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={dataValue}
              onChange={(e) => setDataValue(e.target.value)}
              onKeyDown={handleDataKeyDown}
              onBlur={() => { if (isReceived && editingData) handleSaveDataValue() }}
              placeholder={dataLabel}
              autoFocus={editingData}
              className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md bg-white focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none"
            />
            {editingData && (
              <button
                onClick={handleSaveDataValue}
                className="p-1 rounded bg-teal-600 text-white hover:bg-teal-700"
              >
                <Check className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Auto-fill indicator */}
          {!requirement.data_value && contactFieldValue && dataValue === contactFieldValue && (
            <span className="text-[10px] text-teal-500 italic">Preenchido do cadastro do contato</span>
          )}
        </div>
      )}

      {/* Show data value when received (read-only) — click to edit */}
      {showData && isReceived && !editingData && hasData && (
        <button
          onClick={() => setEditingData(true)}
          className="text-xs text-green-700 pl-6 text-left hover:underline cursor-pointer"
        >
          {dataLabel}: {requirement.data_value}
        </button>
      )}

      {/* Received but no data — prompt to add */}
      {showData && isReceived && !editingData && !hasData && (
        <button
          onClick={() => setEditingData(true)}
          className="text-xs text-amber-600 pl-6 text-left hover:underline cursor-pointer flex items-center gap-1"
        >
          <Pencil className="h-3 w-3" />
          Adicionar {dataLabel.toLowerCase()}
        </button>
      )}

      {/* Upload zone — shown when pending and modo includes 'arquivo' */}
      {showFile && !isReceived && (
        <div className="pl-6">
          <DocumentUploadZone
            onUpload={handleUpload}
            isUploading={isUploading}
          />
        </div>
      )}

      {/* Uploaded file indicator when received */}
      {showFile && isReceived && hasFile && (
        <div className="pl-6">
          <DocumentUploadZone
            onUpload={handleUpload}
            isUploading={false}
            currentFileName="Arquivo enviado"
          />
        </div>
      )}

      {/* Received but no file — prompt to upload */}
      {showFile && isReceived && !hasFile && (
        <div className="pl-6">
          <DocumentUploadZone
            onUpload={handleUpload}
            isUploading={isUploading}
          />
        </div>
      )}

      {/* Mark as received button — shown when pending */}
      {!isReceived && (
        <div className="pl-6">
          <button
            onClick={handleMarkReceived}
            disabled={isMarking}
            className="text-xs text-teal-600 hover:text-teal-700 font-medium hover:underline disabled:opacity-50"
          >
            {isMarking ? 'Marcando...' : 'Marcar como recebido'}
          </button>
        </div>
      )}

      {/* Notes section */}
      {showNotes && (
        <div className="pl-6 mt-1">
          <textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observação sobre este documento..."
            rows={2}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
            autoFocus
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={handleSaveNotes}
              className="px-2 py-1 text-[11px] font-medium bg-teal-600 text-white rounded hover:bg-teal-700"
            >
              Salvar
            </button>
            <button
              onClick={() => { setNotes(requirement.notas || ''); setShowNotes(false) }}
              className="px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Existing notes display (when not editing) */}
      {!showNotes && requirement.notas && (
        <button
          onClick={() => setShowNotes(true)}
          className="pl-6 text-left text-[11px] text-gray-400 italic hover:text-gray-600 truncate"
        >
          {requirement.notas}
        </button>
      )}
    </div>
  )
}
