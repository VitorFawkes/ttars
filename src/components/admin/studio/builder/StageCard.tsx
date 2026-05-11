import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '../../../../lib/utils'
import { GripVertical, Edit2, Trash2, AlertCircle } from 'lucide-react'
import type { Database } from '../../../../database.types'

type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']

interface StageCardProps {
    stage: PipelineStage
    onEdit: () => void
    onDelete: () => void
    targetPhaseName?: string | null
}

export default function StageCard({ stage, onEdit, onDelete, targetPhaseName }: StageCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: String(stage.id),
        data: {
            type: 'Stage',
            stage
        }
    })

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    }

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="opacity-50 bg-gray-50 border-2 border-dashed border-indigo-300 rounded-lg h-[80px] w-full"
            />
        )
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group relative flex flex-col gap-2 p-3 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-default",
                !stage.ativo && "opacity-60 bg-gray-50"
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                    >
                        <GripVertical className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-sm text-gray-700 truncate">
                        {stage.nome}
                    </span>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={onEdit}
                        className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Status Indicators */}
            <div className="flex items-center gap-2 pl-6">
                {!stage.ativo && (
                    <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                        Inativo
                    </span>
                )}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- target_phase_id pendente de regeneracao de types */}
                {((stage as any).target_phase_id || stage.target_role) && (
                    <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {targetPhaseName || stage.target_role || 'Handoff'}
                    </span>
                )}
            </div>
        </div>
    )
}
