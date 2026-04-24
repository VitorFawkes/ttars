import { useState } from 'react'
import { Loader2, Plus, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAgentMoments, type PlaybookMoment } from '@/hooks/playbook/useAgentMoments'
import { MomentCard } from '../moments/MomentCard'
import { MomentLibraryModal } from '../moments/MomentLibraryModal'
import { toast } from 'sonner'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

export function MomentsSection({ agentId, agentName, companyName }: Props) {
  const { moments, isLoading, upsert, reorder } = useAgentMoments(agentId)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = moments.findIndex(m => m.id === active.id)
    const newIdx = moments.findIndex(m => m.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(moments, oldIdx, newIdx).map((m, i) => ({ id: m.id, display_order: i + 1 }))
    try { await reorder.mutateAsync(reordered) }
    catch (err) { console.error(err); toast.error('Não consegui reordenar.') }
  }

  const handleCreateBlank = async () => {
    const nextOrder = (moments[moments.length - 1]?.display_order ?? 0) + 1
    const slug = `momento_${Date.now().toString(36).slice(-4)}`
    try {
      await upsert.mutateAsync({
        moment_key: slug,
        moment_label: 'Novo momento',
        display_order: nextOrder,
        trigger_type: 'always',
        trigger_config: {},
        message_mode: 'free',
        anchor_text: null,
        red_lines: [],
        collects_fields: [],
        enabled: true,
      })
      toast.success('Momento criado — expande pra configurar')
    } catch (err) { console.error(err); toast.error('Não consegui criar.') }
  }

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  const nextOrder = (moments[moments.length - 1]?.display_order ?? 0) + 1
  const existingKeys = moments.map(m => m.moment_key)

  return (
    <div className="space-y-4">
      {moments.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-sm text-slate-500">Este agente ainda não tem momentos configurados.</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Comece com um template pronto ou crie do zero.</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => setLibraryOpen(true)} size="sm" className="gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Abrir biblioteca
            </Button>
            <Button variant="outline" onClick={handleCreateBlank} size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Criar em branco
            </Button>
          </div>
        </div>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={moments.map(m => m.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {moments.map(m => (
                  <SortableMomentItem key={m.id} moment={m} agentId={agentId} agentName={agentName} companyName={companyName} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="flex gap-2">
            <Button onClick={() => setLibraryOpen(true)} variant="outline" size="sm" className="gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Da biblioteca
            </Button>
            <Button onClick={handleCreateBlank} variant="outline" size="sm" className="gap-1.5" disabled={upsert.isPending}>
              <Plus className="w-3.5 h-3.5" /> Em branco
            </Button>
          </div>
        </>
      )}

      {libraryOpen && (
        <MomentLibraryModal agentId={agentId} existingKeys={existingKeys} nextDisplayOrder={nextOrder} onClose={() => setLibraryOpen(false)} />
      )}
    </div>
  )
}

function SortableMomentItem({ moment, agentId, agentName, companyName }: { moment: PlaybookMoment; agentId: string; agentName: string; companyName: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: moment.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <MomentCard agentId={agentId} agentName={agentName} companyName={companyName} moment={moment} dragHandleProps={{ attributes, listeners }} />
    </div>
  )
}
