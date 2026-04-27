import { useMemo, useState } from 'react'
import { Loader2, Plus, BookOpen, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAgentMoments, type PlaybookMoment, type MomentKind } from '@/hooks/playbook/useAgentMoments'
import { MomentCard } from '../moments/MomentCard'
import { MomentLibraryModal } from '../moments/MomentLibraryModal'
import { toast } from 'sonner'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

/**
 * Seção "Momentos da conversa" do Playbook v2.
 *
 * Separa visualmente DOIS conceitos que antes estavam misturados:
 *
 *   FASES DO FUNIL (kind=flow)         — Abertura, Sondagem, Desfecho. Ordem
 *                                        importa. Drag-drop ativo. Lead progride.
 *
 *   JOGADAS SITUACIONAIS (kind=play)   — Objeção de preço, Lua de mel. Ordem
 *                                        irrelevante (disparam por gatilho).
 *                                        Sem drag-handle.
 */
export function MomentsSection({ agentId, agentName, companyName }: Props) {
  const { moments, isLoading, upsert, reorder } = useAgentMoments(agentId)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const flows = useMemo(() => moments.filter(m => m.kind === 'flow'), [moments])
  const plays = useMemo(() => moments.filter(m => m.kind === 'play'), [moments])

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  const nextOrder = (moments[moments.length - 1]?.display_order ?? 0) + 1
  const existingKeys = moments.map(m => m.moment_key)

  const createBlank = async (kind: MomentKind) => {
    const order = (moments[moments.length - 1]?.display_order ?? 0) + 1
    const slug = `${kind === 'flow' ? 'fase' : 'jogada'}_${Date.now().toString(36).slice(-4)}`
    try {
      await upsert.mutateAsync({
        moment_key: slug,
        moment_label: kind === 'flow' ? 'Nova fase' : 'Nova jogada',
        display_order: order,
        kind,
        trigger_type: kind === 'flow' ? 'lead_respondeu' : 'keyword',
        trigger_config: kind === 'play' ? { keywords: [] } : {},
        message_mode: 'free',
        anchor_text: null,
        red_lines: [],
        collects_fields: [],
        discovery_config: null,
        enabled: true,
      })
      toast.success(`${kind === 'flow' ? 'Fase' : 'Jogada'} criada — expande pra configurar`)
    } catch (err) { console.error(err); toast.error('Não consegui criar.') }
  }

  return (
    <div className="space-y-6">
      {/* ── FASES DO FUNIL ────────────────────────────────────────────── */}
      <FlowGroup
        flows={flows}
        agentId={agentId}
        agentName={agentName}
        companyName={companyName}
        reorder={reorder}
        onCreate={() => createBlank('flow')}
        onLibrary={() => setLibraryOpen(true)}
        creating={upsert.isPending}
      />

      {/* ── JOGADAS SITUACIONAIS ───────────────────────────────────────── */}
      <PlayGroup
        plays={plays}
        agentId={agentId}
        agentName={agentName}
        companyName={companyName}
        onCreate={() => createBlank('play')}
        onLibrary={() => setLibraryOpen(true)}
        creating={upsert.isPending}
      />

      {libraryOpen && (
        <MomentLibraryModal agentId={agentId} existingKeys={existingKeys} nextDisplayOrder={nextOrder} onClose={() => setLibraryOpen(false)} />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Grupo de Fases (drag-drop ativo)
// ───────────────────────────────────────────────────────────────────────

function FlowGroup({
  flows, agentId, agentName, companyName, reorder, onCreate, onLibrary, creating,
}: {
  flows: PlaybookMoment[]
  agentId: string
  agentName: string
  companyName: string
  reorder: ReturnType<typeof useAgentMoments>['reorder']
  onCreate: () => void
  onLibrary: () => void
  creating: boolean
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = flows.findIndex(m => m.id === active.id)
    const newIdx = flows.findIndex(m => m.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(flows, oldIdx, newIdx).map((m, i) => ({ id: m.id, display_order: i + 1 }))
    try { await reorder.mutateAsync(reordered) }
    catch (err) { console.error(err); toast.error('Não consegui reordenar.') }
  }

  return (
    <section>
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          <span className="text-indigo-600">🎯</span> Fases do funil
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          A agente passa por essas fases <strong>em ordem</strong>. Cada uma tem um gatilho que diz quando começa.
        </p>
      </header>

      {flows.length === 0 ? (
        <EmptyState
          message="Nenhuma fase configurada."
          hint="Toda conversa tem ao menos uma abertura."
          onCreate={onCreate}
          onLibrary={onLibrary}
          createLabel="Criar primeira fase"
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={flows.map(m => m.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {flows.map((m, i) => (
                <SortableFlowItem key={m.id} index={i + 1} moment={m} agentId={agentId} agentName={agentName} companyName={companyName} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {flows.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button onClick={onCreate} variant="outline" size="sm" className="gap-1.5" disabled={creating}>
              <Plus className="w-3.5 h-3.5" /> Adicionar fase
            </Button>
            <Button onClick={onLibrary} variant="outline" size="sm" className="gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Da biblioteca
            </Button>
          </div>
          <p className="text-[11px] text-slate-400">
            💡 Arraste pra mudar a ordem do funil
          </p>
        </div>
      )}
    </section>
  )
}

function SortableFlowItem({
  index, moment, agentId, agentName, companyName,
}: {
  index: number
  moment: PlaybookMoment
  agentId: string
  agentName: string
  companyName: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: moment.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-2.5">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <MomentCard agentId={agentId} agentName={agentName} companyName={companyName} moment={moment} dragHandleProps={{ attributes, listeners }} />
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Grupo de Jogadas (sem drag-drop, podem disparar a qualquer momento)
// ───────────────────────────────────────────────────────────────────────

function PlayGroup({
  plays, agentId, agentName, companyName, onCreate, onLibrary, creating,
}: {
  plays: PlaybookMoment[]
  agentId: string
  agentName: string
  companyName: string
  onCreate: () => void
  onLibrary: () => void
  creating: boolean
}) {
  return (
    <section>
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-rose-500" /> Jogadas situacionais
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Podem disparar em <strong>qualquer fase</strong> quando o cliente diz algo específico.
          A agente responde e volta pra fase onde estava.
        </p>
      </header>

      {plays.length === 0 ? (
        <EmptyState
          message="Nenhuma jogada situacional configurada."
          hint="Ex: objeção de preço, pedido de humano, lua de mel."
          onCreate={onCreate}
          onLibrary={onLibrary}
          createLabel="Criar primeira jogada"
          tone="rose"
        />
      ) : (
        <div className="space-y-2">
          {plays.map(m => (
            <MomentCard key={m.id} agentId={agentId} agentName={agentName} companyName={companyName} moment={m} />
          ))}
        </div>
      )}

      {plays.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button onClick={onCreate} variant="outline" size="sm" className="gap-1.5" disabled={creating}>
              <Plus className="w-3.5 h-3.5" /> Adicionar jogada
            </Button>
            <Button onClick={onLibrary} variant="outline" size="sm" className="gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Da biblioteca
            </Button>
          </div>
          <p className="text-[11px] text-slate-400">
            💡 Ordem aqui não importa — disparam por gatilho
          </p>
        </div>
      )}
    </section>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Empty state compartilhado
// ───────────────────────────────────────────────────────────────────────

function EmptyState({
  message, hint, onCreate, onLibrary, createLabel, tone = 'indigo',
}: {
  message: string
  hint: string
  onCreate: () => void
  onLibrary: () => void
  createLabel: string
  tone?: 'indigo' | 'rose'
}) {
  return (
    <div className={`text-center py-6 border-2 border-dashed rounded-lg ${tone === 'rose' ? 'border-rose-100 bg-rose-50/30' : 'border-slate-200'}`}>
      <p className="text-sm text-slate-600">{message}</p>
      <p className="text-xs text-slate-400 mt-1 mb-4">{hint}</p>
      <div className="flex gap-2 justify-center">
        <Button onClick={onLibrary} size="sm" className="gap-1.5">
          <BookOpen className="w-3.5 h-3.5" /> Abrir biblioteca
        </Button>
        <Button variant="outline" onClick={onCreate} size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> {createLabel}
        </Button>
      </div>
    </div>
  )
}
