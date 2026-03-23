import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileCheck, Plus, ClipboardList, ChevronDown, ChevronRight, UserPlus, Trash2 } from 'lucide-react'
import { SectionCollapseToggle } from '../DynamicSectionWidget'
import { supabase } from '../../../lib/supabase'
import { useDocumentCollection } from '../../../hooks/useDocumentCollection'
import { cn } from '../../../lib/utils'
import type { Database } from '../../../database.types'
import DocumentRequirementRow from './DocumentRequirementRow'
import DocumentSetupModal from './DocumentSetupModal'

type Card = Database['public']['Tables']['cards']['Row']

interface DocumentCollectionWidgetProps {
  cardId: string
  card: Card
  /** Collapse support — passed by CollapsibleWidgetSection */
  isExpanded?: boolean
  onToggleCollapse?: () => void
}

export default function DocumentCollectionWidget({ cardId, card, isExpanded: _isExpanded, onToggleCollapse }: DocumentCollectionWidgetProps) {
  const [isSetupOpen, setIsSetupOpen] = useState(false)
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set(['__all__']))
  const [showTaskCreator, setShowTaskCreator] = useState(false)
  const [taskResponsibleId, setTaskResponsibleId] = useState('')
  const [confirmDeleteContact, setConfirmDeleteContact] = useState<string | null>(null)

  // Check phase visibility: only Planner + Pós-venda
  const { data: stageInfo } = useQuery({
    queryKey: ['card-stage-phase', card.pipeline_stage_id],
    queryFn: async () => {
      if (!card.pipeline_stage_id) return null
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('fase, phase_id, pipeline_phases (slug)')
        .eq('id', card.pipeline_stage_id)
        .single()
      if (error) return null
      return data
    },
    enabled: !!card.pipeline_stage_id,
    staleTime: 1000 * 60 * 5,
  })

  // Resolve phase slug
  const phaseSlug = (stageInfo as unknown as { pipeline_phases?: { slug?: string } } | null)?.pipeline_phases?.slug || null
  const faseStr = stageInfo?.fase || ''

  // Only show in Planner and Pós-venda
  const isVisiblePhase = phaseSlug === 'planner' || phaseSlug === 'pos_venda'
    || faseStr === 'Planner' || faseStr === 'Pós-venda'

  const {
    requirements,
    progress,
    byContact,
    isLoading,
    addRequirements,
    markReceived,
    undoReceived,
    removeRequirement,
    removeByContact,
    updateNotes,
    updateDataValue,
    updateModo,
    uploadDocument,
    isUploading,
    createCollectionTask,
  } = useDocumentCollection(cardId)

  // Fetch profiles for task assignment
  const { data: profiles } = useQuery({
    queryKey: ['active-profiles-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, email')
        .eq('active', true)
        .order('nome')
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5,
    enabled: showTaskCreator,
  })

  const toggleContact = (id: string) => {
    setExpandedContacts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Map: typeId → Set of contatoIds that already have this type
  const existingAssignments = new Map<string, Set<string>>()
  for (const r of requirements) {
    if (!existingAssignments.has(r.document_type_id)) {
      existingAssignments.set(r.document_type_id, new Set())
    }
    existingAssignments.get(r.document_type_id)!.add(r.contato_id)
  }

  const handleCreateTask = async () => {
    if (!taskResponsibleId) return
    try {
      await createCollectionTask(taskResponsibleId)
      setShowTaskCreator(false)
      setTaskResponsibleId('')
    } catch (err) {
      console.error('Error creating collection task:', err)
    }
  }

  const handleRemoveContactDocs = async (contatoId: string) => {
    try {
      await removeByContact(contatoId)
      setConfirmDeleteContact(null)
    } catch (err) {
      console.error('Error removing contact documents:', err)
    }
  }

  // Progress bar color
  const progressColor = progress.total === 0
    ? 'bg-gray-200'
    : progress.percentage === 100
      ? 'bg-green-500'
      : progress.percentage > 0
        ? 'bg-amber-500'
        : 'bg-gray-300'

  return (
    <div className="rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden">
      {/* Header — clickable to collapse/expand */}
      <div
        className={cn("border-b border-gray-200 bg-gray-50/50 px-3 py-2", onToggleCollapse && "cursor-pointer hover:bg-gray-100/50 transition-colors")}
        onClick={onToggleCollapse}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-teal-100">
              <FileCheck className="h-4 w-4 text-teal-700" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              Documentos
            </h3>
            {progress.total > 0 && (
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                progress.percentage === 100
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              )}>
                {progress.completed}/{progress.total}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setIsSetupOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 rounded-lg border border-teal-200 hover:bg-teal-100 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </button>
            {onToggleCollapse && (
              <SectionCollapseToggle isExpanded={_isExpanded ?? true} onToggle={onToggleCollapse} />
            )}
          </div>
        </div>

        {/* Progress bar */}
        {progress.total > 0 && (
          <div className="mt-2.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-300", progressColor)}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {!isVisiblePhase ? (
          <div className="py-4 text-center text-xs text-gray-400">
            Disponível nas fases Planner e Pós-venda
          </div>
        ) : isLoading ? (
          <div className="py-6 text-center text-sm text-gray-500">Carregando...</div>
        ) : requirements.length === 0 ? (
          <button
            onClick={() => setIsSetupOpen(true)}
            className="w-full py-6 flex flex-col items-center gap-2 text-gray-400 hover:text-teal-600 transition-colors cursor-pointer"
          >
            <ClipboardList className="h-8 w-8" />
            <span className="text-sm font-medium">Definir documentos necessários</span>
            <span className="text-xs">Selecione os tipos de documentos para cada viajante</span>
          </button>
        ) : (
          <div className="space-y-3">
            {byContact.map(({ contato, requirements: contactReqs, completed, total }) => {
              const isExpanded = expandedContacts.has(contato.id) || expandedContacts.has('__all__')
              const fullName = [contato.nome, contato.sobrenome].filter(Boolean).join(' ')
              const isConfirmingDelete = confirmDeleteContact === contato.id

              return (
                <div key={contato.id} className="group">
                  {/* Contact header */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleContact(contato.id)}
                      className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                      }
                      <span className="text-xs font-semibold text-gray-700 flex-1 text-left">
                        {fullName}
                      </span>
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        completed === total
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      )}>
                        {completed}/{total}
                      </span>
                    </button>

                    {/* Delete all for this contact */}
                    {isExpanded && (
                      <button
                        onClick={() => setConfirmDeleteContact(isConfirmingDelete ? null : contato.id)}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all shrink-0"
                        title="Remover todos os documentos deste viajante"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Confirm delete banner */}
                  {isConfirmingDelete && (
                    <div className="ml-2 mt-1 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                      <span className="text-xs text-red-700 flex-1">
                        Remover {total} documento{total > 1 ? 's' : ''} de {fullName}?
                      </span>
                      <button
                        onClick={() => handleRemoveContactDocs(contato.id)}
                        className="px-2 py-1 text-[11px] font-medium bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Remover
                      </button>
                      <button
                        onClick={() => setConfirmDeleteContact(null)}
                        className="px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {/* Requirements list */}
                  {isExpanded && !isConfirmingDelete && (
                    <div className="ml-2 mt-1 space-y-1.5">
                      {contactReqs.map(req => (
                        <DocumentRequirementRow
                          key={req.id}
                          requirement={req}
                          onMarkReceived={markReceived}
                          onUndo={undoReceived}
                          onRemove={removeRequirement}
                          onUpload={uploadDocument}
                          onUpdateNotes={updateNotes}
                          onUpdateDataValue={updateDataValue}
                          onUpdateModo={updateModo}
                          isUploading={isUploading}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Create task section */}
            {progress.completed < progress.total && (
              <div className="border-t border-gray-100 pt-2 mt-2">
                {showTaskCreator ? (
                  <div className="flex items-center gap-2 p-2 bg-teal-50 rounded-lg border border-teal-200">
                    <select
                      value={taskResponsibleId}
                      onChange={e => setTaskResponsibleId(e.target.value)}
                      className="flex-1 h-8 px-2 text-xs border border-teal-200 rounded-md bg-white"
                    >
                      <option value="">Selecionar responsável...</option>
                      {profiles?.map(p => (
                        <option key={p.id} value={p.id}>{p.nome || p.email}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleCreateTask}
                      disabled={!taskResponsibleId}
                      className="px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Criar
                    </button>
                    <button
                      onClick={() => setShowTaskCreator(false)}
                      className="px-2 py-1.5 text-xs text-gray-600 hover:text-gray-800"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTaskCreator(true)}
                    className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium px-1"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Criar tarefa de coleta
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Setup Modal */}
      <DocumentSetupModal
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
        cardId={cardId}
        existingAssignments={existingAssignments}
        onConfirm={(assignments) => addRequirements({ assignments })}
      />
    </div>
  )
}
