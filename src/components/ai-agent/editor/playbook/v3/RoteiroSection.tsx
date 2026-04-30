import { useMemo, useState } from 'react'
import { Loader2, Plus, BookOpen, Zap, Target } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAgentMoments, type PlaybookMoment, type MomentKind } from '@/hooks/playbook/useAgentMoments'
import { MomentLibraryModal } from '../moments/MomentLibraryModal'
import { MomentRowCard } from './MomentRowCard'
import { MomentDrawer } from './MomentDrawer'
import { detectMomentAlerts } from './detectMomentAlerts'
import { toast } from 'sonner'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

/**
 * UI v3 — Sub-aba "Roteiro" da área "Como ela conversa".
 *
 * Mesma fonte de dados do MomentsSection clássico (useAgentMoments).
 * Diferença visual: cartões resumidos clicáveis → abrem drawer lateral.
 *
 * O drawer reusa o MomentCard original com `hideToggle` e `defaultExpanded`,
 * o que garante paridade absoluta no salvamento. Não há lógica nova de
 * persistência aqui — só layout.
 */
export function RoteiroSection({ agentId, agentName, companyName }: Props) {
  const { moments, isLoading, upsert, reorder } = useAgentMoments(agentId)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [drawerMomentId, setDrawerMomentId] = useState<string | null>(null)

  const flows = useMemo(() => moments.filter(m => m.kind === 'flow'), [moments])
  const plays = useMemo(() => moments.filter(m => m.kind === 'play'), [moments])
  const drawerMoment = useMemo(
    () => moments.find(m => m.id === drawerMomentId) ?? null,
    [moments, drawerMomentId],
  )

  // Map de alertas por momento (detectados no cliente — fonte de verdade está no banco)
  const alertsByMoment = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of moments) {
      const alerts = detectMomentAlerts(m)
      if (alerts.length > 0) map.set(m.id, alerts.length)
    }
    return map
  }, [moments])

  if (isLoading) {
    return (
      <div className="py-12 text-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin inline" />
      </div>
    )
  }

  const nextOrder = (moments[moments.length - 1]?.display_order ?? 0) + 1
  const existingKeys = moments.map(m => m.moment_key)

  const createBlank = async (kind: MomentKind) => {
    const order = (moments[moments.length - 1]?.display_order ?? 0) + 1
    const slug = `${kind === 'flow' ? 'fase' : 'jogada'}_${Date.now().toString(36).slice(-4)}`
    try {
      const created = await upsert.mutateAsync({
        moment_key: slug,
        moment_label: kind === 'flow' ? 'Nova fase' : 'Nova jogada',
        display_order: order,
        kind,
        trigger_type: kind === 'flow' ? 'lead_respondeu' : 'keyword',
        trigger_config: kind === 'play' ? { keywords: [] } : {},
        message_mode: 'free',
        intent: null,
        anchor_text: null,
        red_lines: [],
        collects_fields: [],
        discovery_config: null,
        delivery_mode: 'all_at_once',
        enabled: true,
      })
      toast.success(`${kind === 'flow' ? 'Fase' : 'Jogada'} criada — abre pra configurar`)
      // Abre drawer direto pra editar a recém-criada
      setDrawerMomentId(created.id)
    } catch (err) {
      console.error(err)
      toast.error('Não consegui criar.')
    }
  }

  return (
    <div className="space-y-8">
      {/* ── FASES DO FUNIL ─────────────────────────────────────────────── */}
      <FlowGroup
        flows={flows}
        alertsByMoment={alertsByMoment}
        reorder={reorder}
        onOpen={(id) => setDrawerMomentId(id)}
        onCreate={() => createBlank('flow')}
        onLibrary={() => setLibraryOpen(true)}
        creating={upsert.isPending}
      />

      {/* ── JOGADAS SITUACIONAIS ───────────────────────────────────────── */}
      <PlayGroup
        plays={plays}
        alertsByMoment={alertsByMoment}
        onOpen={(id) => setDrawerMomentId(id)}
        onCreate={() => createBlank('play')}
        onLibrary={() => setLibraryOpen(true)}
        creating={upsert.isPending}
      />

      {libraryOpen && (
        <MomentLibraryModal
          agentId={agentId}
          existingKeys={existingKeys}
          nextDisplayOrder={nextOrder}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      <MomentDrawer
        agentId={agentId}
        agentName={agentName}
        companyName={companyName}
        moment={drawerMoment}
        open={!!drawerMomentId}
        onOpenChange={(open) => { if (!open) setDrawerMomentId(null) }}
      />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Grupo de Fases (drag-drop ativo)
// ───────────────────────────────────────────────────────────────────────

function FlowGroup({
  flows, alertsByMoment, reorder, onOpen, onCreate, onLibrary, creating,
}: {
  flows: PlaybookMoment[]
  alertsByMoment: Map<string, number>
  reorder: ReturnType<typeof useAgentMoments>['reorder']
  onOpen: (id: string) => void
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
    try {
      await reorder.mutateAsync(reordered)
    } catch (err) {
      console.error(err)
      toast.error('Não consegui reordenar.')
    }
  }

  return (
    <section>
      <header className="mb-3 flex items-center gap-2">
        <Target className="w-4 h-4 text-indigo-600" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-900">Fases do funil</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            A agente passa por essas fases <strong>em ordem</strong>. Clique em uma para editar.
          </p>
        </div>
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
                <SortableFlowRow
                  key={m.id}
                  index={i + 1}
                  moment={m}
                  alertCount={alertsByMoment.get(m.id) ?? 0}
                  onOpen={() => onOpen(m.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {flows.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onCreate} variant="outline" size="sm" className="gap-1.5" disabled={creating}>
            <Plus className="w-3.5 h-3.5" /> Adicionar fase
          </Button>
          <Button onClick={onLibrary} variant="outline" size="sm" className="gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Da biblioteca
          </Button>
        </div>
      )}
    </section>
  )
}

function SortableFlowRow({
  index, moment, alertCount, onOpen,
}: {
  index: number
  moment: PlaybookMoment
  alertCount: number
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: moment.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <MomentRowCard
        moment={moment}
        index={index}
        alertCount={alertCount}
        onOpen={onOpen}
        dragHandleProps={{ attributes, listeners }}
      />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Grupo de Jogadas (sem drag-drop)
// ───────────────────────────────────────────────────────────────────────

function PlayGroup({
  plays, alertsByMoment, onOpen, onCreate, onLibrary, creating,
}: {
  plays: PlaybookMoment[]
  alertsByMoment: Map<string, number>
  onOpen: (id: string) => void
  onCreate: () => void
  onLibrary: () => void
  creating: boolean
}) {
  return (
    <section>
      <header className="mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-rose-500" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-900">Jogadas situacionais</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Disparam em <strong>qualquer fase</strong> quando o cliente diz algo específico.
          </p>
        </div>
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
            <MomentRowCard
              key={m.id}
              moment={m}
              alertCount={alertsByMoment.get(m.id) ?? 0}
              onOpen={() => onOpen(m.id)}
            />
          ))}
        </div>
      )}

      {plays.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onCreate} variant="outline" size="sm" className="gap-1.5" disabled={creating}>
            <Plus className="w-3.5 h-3.5" /> Adicionar jogada
          </Button>
          <Button onClick={onLibrary} variant="outline" size="sm" className="gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Da biblioteca
          </Button>
        </div>
      )}
    </section>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Empty state
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
    <div className={`text-center py-8 border-2 border-dashed rounded-xl ${tone === 'rose' ? 'border-rose-100 bg-rose-50/30' : 'border-slate-200 bg-slate-50/30'}`}>
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
