import { useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown, ChevronRight, GripVertical, Plus, Trash2, X, AlertTriangle,
  HelpCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { QualificationStage } from '@/hooks/useAgentWizard'

interface QualificationTimelineProps {
  stages: QualificationStage[]
  onChange: (stages: QualificationStage[]) => void
  readOnly?: boolean
}

const EMPTY_STAGE: QualificationStage = {
  stage_name: '',
  stage_key: '',
  question: '',
  subquestions: [],
  disqualification_triggers: [],
  advance_to_stage_id: '',
  advance_condition: '',
  response_options: [],
}

interface SortableStageProps {
  id: string
  stage: QualificationStage
  index: number
  expanded: boolean
  onToggle: () => void
  onUpdate: (updates: Partial<QualificationStage>) => void
  onDelete: () => void
  readOnly: boolean
}

function SortableStage({ id, stage, index, expanded, onToggle, onUpdate, onDelete, readOnly }: SortableStageProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const addSubquestion = () => onUpdate({ subquestions: [...(stage.subquestions || []), ''] })
  const updateSubquestion = (idx: number, value: string) => {
    const next = [...(stage.subquestions || [])]
    next[idx] = value
    onUpdate({ subquestions: next })
  }
  const removeSubquestion = (idx: number) => {
    onUpdate({ subquestions: (stage.subquestions || []).filter((_, i) => i !== idx) })
  }

  const addTrigger = () => onUpdate({
    disqualification_triggers: [...(stage.disqualification_triggers || []), { trigger: '', message: '' }],
  })
  const updateTrigger = (idx: number, field: 'trigger' | 'message', value: string) => {
    const next = [...(stage.disqualification_triggers || [])]
    next[idx] = { ...next[idx], [field]: value }
    onUpdate({ disqualification_triggers: next })
  }
  const removeTrigger = (idx: number) => {
    onUpdate({
      disqualification_triggers: (stage.disqualification_triggers || []).filter((_, i) => i !== idx),
    })
  }

  const subCount = stage.subquestions?.length || 0
  const trigCount = stage.disqualification_triggers?.length || 0

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Connector line to next stage */}
      <div className="absolute left-[23px] top-12 bottom-0 w-0.5 bg-slate-200 -z-10" aria-hidden />

      <div className={cn(
        'bg-white border rounded-xl transition-shadow',
        expanded ? 'border-indigo-300 shadow-sm' : 'border-slate-200 hover:border-slate-300'
      )}>
        {/* Header */}
        <div className="flex items-stretch">
          {/* Drag handle + index */}
          <div className="flex flex-col items-center px-2 py-3 border-r border-slate-100">
            {!readOnly && (
              <button
                {...attributes}
                {...listeners}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                aria-label="Arrastar para reordenar"
              >
                <GripVertical className="w-4 h-4" />
              </button>
            )}
            <div className={cn(
              'mt-1 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold',
              expanded ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
            )}>
              {index + 1}
            </div>
          </div>

          {/* Collapsed content */}
          <button
            onClick={onToggle}
            className="flex-1 flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 min-w-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-900 truncate">
                  {stage.stage_name || <span className="text-slate-400 italic">Sem nome</span>}
                </p>
                {!stage.question && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    Falta pergunta
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {stage.question || <span className="italic">Sem pergunta definida</span>}
              </p>
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                {subCount > 0 && <span>{subCount} sub-perguntas</span>}
                {trigCount > 0 && <span>{trigCount} desqualificações</span>}
              </div>
            </div>
            {expanded
              ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
              : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
            }
          </button>

          {!readOnly && (
            <div className="flex items-center px-2">
              <button
                onClick={onDelete}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                aria-label="Excluir etapa"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Expanded body */}
        {expanded && !readOnly && (
          <div className="border-t border-slate-100 p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome da etapa</Label>
                <Input
                  placeholder="Ex: Descoberta do destino"
                  value={stage.stage_name || ''}
                  onChange={(e) => onUpdate({ stage_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  Chave interna
                  <span className="text-slate-400">(opcional)</span>
                </Label>
                <Input
                  placeholder="Ex: destination"
                  value={stage.stage_key || ''}
                  onChange={(e) => onUpdate({ stage_key: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-slate-400" />
                Pergunta principal
              </Label>
              <Textarea
                placeholder="Ex: Pra onde vocês querem viajar?"
                value={stage.question || ''}
                onChange={(e) => onUpdate({ question: e.target.value })}
                className="min-h-[60px]"
              />
              <p className="text-[11px] text-slate-400">O agente vai adaptar essa pergunta ao tom escolhido</p>
            </div>

            {/* Subquestions as chips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Sub-perguntas (opcional)</Label>
                <button
                  onClick={addSubquestion}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              </div>
              {subCount === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhuma sub-pergunta ainda</p>
              ) : (
                <div className="space-y-1.5">
                  {stage.subquestions?.map((sq, sidx) => (
                    <div key={sidx} className="flex gap-1.5 items-center">
                      <Input
                        placeholder="Ex: Em que mês?"
                        value={sq}
                        onChange={(e) => updateSubquestion(sidx, e.target.value)}
                        className="text-sm"
                      />
                      <button
                        onClick={() => removeSubquestion(sidx)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Disqualification triggers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  Desqualificações (opcional)
                </Label>
                <button
                  onClick={addTrigger}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              </div>
              {trigCount === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhuma regra — o agente não rejeita leads nessa etapa</p>
              ) : (
                <div className="space-y-2">
                  {stage.disqualification_triggers?.map((trig, tidx) => (
                    <div key={tidx} className="bg-amber-50/50 border border-amber-200 rounded-lg p-3 space-y-2">
                      <div className="flex gap-1.5 items-start">
                        <div className="flex-1 space-y-1.5">
                          <div>
                            <Label className="text-[11px] text-amber-900">Quando o cliente disser:</Label>
                            <Input
                              placeholder="Ex: só quero roteiro grátis"
                              value={trig.trigger}
                              onChange={(e) => updateTrigger(tidx, 'trigger', e.target.value)}
                              className="mt-1 text-sm bg-white"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-amber-900">Agente responde:</Label>
                            <Textarea
                              placeholder="Ex: Entendi! A gente trabalha com planejamento completo..."
                              value={trig.message}
                              onChange={(e) => updateTrigger(tidx, 'message', e.target.value)}
                              className="mt-1 min-h-[48px] text-sm bg-white"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => removeTrigger(tidx)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function QualificationTimeline({ stages, onChange, readOnly = false }: QualificationTimelineProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(
    stages.length > 0 && !stages[0].stage_name ? 0 : null
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = Number(active.id)
    const newIdx = Number(over.id)
    onChange(arrayMove(stages, oldIdx, newIdx))
    if (expandedIdx === oldIdx) setExpandedIdx(newIdx)
  }

  const ids = stages.map((_, i) => String(i))

  const updateStage = (idx: number, updates: Partial<QualificationStage>) => {
    const next = [...stages]
    next[idx] = { ...next[idx], ...updates }
    onChange(next)
  }

  const deleteStage = (idx: number) => {
    onChange(stages.filter((_, i) => i !== idx))
    if (expandedIdx === idx) setExpandedIdx(null)
  }

  const addStage = () => {
    const next = [...stages, { ...EMPTY_STAGE }]
    onChange(next)
    setExpandedIdx(next.length - 1)
  }

  if (stages.length === 0) {
    return (
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-10 text-center">
        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-sm">
          <HelpCircle className="w-6 h-6 text-indigo-600" />
        </div>
        <h3 className="font-semibold text-slate-900 tracking-tight">Sem etapas ainda</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
          Adicione etapas do funil de qualificação. O agente vai perguntar uma coisa de cada vez até ter o que precisa.
        </p>
        {!readOnly && (
          <Button onClick={addStage} className="mt-4 gap-2">
            <Plus className="w-4 h-4" />
            Criar primeira etapa
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {stages.map((stage, idx) => (
            <SortableStage
              key={idx}
              id={String(idx)}
              stage={stage}
              index={idx}
              expanded={expandedIdx === idx}
              onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              onUpdate={(u) => updateStage(idx, u)}
              onDelete={() => deleteStage(idx)}
              readOnly={readOnly}
            />
          ))}
        </SortableContext>
      </DndContext>

      {!readOnly && (
        <button
          onClick={addStage}
          className="w-full bg-white border-2 border-dashed border-slate-200 rounded-xl py-4 flex items-center justify-center gap-2 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/30 hover:text-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar etapa
        </button>
      )}
    </div>
  )
}
