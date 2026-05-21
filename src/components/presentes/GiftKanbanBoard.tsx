import { useMemo, useState } from 'react'
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import type { GiftAssignmentFull } from '@/hooks/useAllGiftAssignments'
import { useUpdateGiftStatus, type GiftKanbanStatus } from '@/hooks/useGiftStatusKanban'
import GiftKanbanColumn from './GiftKanbanColumn'
import GiftKanbanCard from './GiftKanbanCard'
import GiftDetailSheet from './GiftDetailSheet'

const COLUMN_ORDER: GiftKanbanStatus[] = ['pendente', 'preparando', 'a_enviar', 'enviado', 'entregue']

const COLUMN_TONE: Record<GiftKanbanStatus, { label: string; accent: string; chip: string }> = {
    pendente:   { label: 'Solicitado',  accent: 'bg-slate-400',    chip: 'bg-slate-100 text-slate-700 border-slate-200' },
    preparando: { label: 'Preparando',  accent: 'bg-amber-400',    chip: 'bg-amber-50 text-amber-700 border-amber-200' },
    a_enviar:   { label: 'A enviar',    accent: 'bg-indigo-500',   chip: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    enviado:    { label: 'Enviado',     accent: 'bg-blue-500',     chip: 'bg-blue-50 text-blue-700 border-blue-200' },
    entregue:   { label: 'Entregue',    accent: 'bg-emerald-500',  chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

function isKanbanStatus(value: unknown): value is GiftKanbanStatus {
    return value === 'pendente' || value === 'preparando' || value === 'a_enviar' || value === 'enviado' || value === 'entregue'
}

interface Props {
    assignments: GiftAssignmentFull[]
}

export default function GiftKanbanBoard({ assignments }: Props) {
    const updateStatus = useUpdateGiftStatus()
    const [activeAssignment, setActiveAssignment] = useState<GiftAssignmentFull | null>(null)
    const [openAssignment, setOpenAssignment] = useState<GiftAssignmentFull | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    )

    const grouped = useMemo(() => {
        const map: Record<GiftKanbanStatus, GiftAssignmentFull[]> = {
            pendente: [],
            preparando: [],
            a_enviar: [],
            enviado: [],
            entregue: [],
        }
        for (const a of assignments) {
            if (a.status === 'cancelado') continue
            if (map[a.status as GiftKanbanStatus]) {
                map[a.status as GiftKanbanStatus].push(a)
            }
        }
        return map
    }, [assignments])

    // Mantém o assignment aberto sincronizado com a lista (status muda externamente)
    const syncedOpenAssignment = openAssignment
        ? assignments.find(a => a.id === openAssignment.id) ?? null
        : null

    const handleDragStart = (e: DragStartEvent) => {
        const item = e.active.data.current?.assignment as GiftAssignmentFull | undefined
        if (item) setActiveAssignment(item)
    }

    const handleDragEnd = (e: DragEndEvent) => {
        setActiveAssignment(null)
        const item = e.active.data.current?.assignment as GiftAssignmentFull | undefined
        const destino = e.over?.id
        if (!item || !destino || !isKanbanStatus(destino)) return
        if (item.status === destino) return
        updateStatus.mutate({ assignmentId: item.id, newStatus: destino })
    }

    return (
        <>
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="flex gap-3 items-stretch min-h-[420px] h-[calc(100vh-360px)] w-full overflow-x-auto">
                    {COLUMN_ORDER.map(status => (
                        <GiftKanbanColumn
                            key={status}
                            status={status}
                            tone={COLUMN_TONE[status]}
                            assignments={grouped[status]}
                            onOpenAssignment={setOpenAssignment}
                        />
                    ))}
                </div>

                <DragOverlay>
                    {activeAssignment && (
                        <div className="opacity-95 w-[260px]">
                            <GiftKanbanCard assignment={activeAssignment} onOpen={() => undefined} isOverlay />
                        </div>
                    )}
                </DragOverlay>
            </DndContext>

            {syncedOpenAssignment && (
                <GiftDetailSheet
                    key={syncedOpenAssignment.id}
                    assignment={syncedOpenAssignment}
                    onClose={() => setOpenAssignment(null)}
                />
            )}
        </>
    )
}
