import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '../../../../lib/utils'
import { GripVertical, Plus, MoreHorizontal, Trash2, Edit2, Eye, EyeOff } from 'lucide-react'
import StageCard from './StageCard'
import { Input } from '../../../ui/Input'
import { Button } from '../../../ui/Button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel
} from '../../../ui/dropdown-menu'
import type { Database } from '../../../../database.types'

type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']
type PipelinePhase = Database['public']['Tables']['pipeline_phases']['Row']

interface PhaseColumnProps {
    phase: PipelinePhase
    stages: PipelineStage[]
    allPhases?: PipelinePhase[]
    onAddStage: () => void
    onEditPhase: () => void
    onDeletePhase: () => void
    onEditStage: (stage: PipelineStage) => void
    onDeleteStage: (stage: PipelineStage) => void
    onChangeColor: (color: string) => void
    onToggleVisibility: () => void
    onEditPhaseSettings: () => void
}

const COLORS = [
    { label: 'Azul', value: 'bg-blue-500', border: 'border-t-blue-500' },
    { label: 'Roxo', value: 'bg-purple-500', border: 'border-t-purple-500' },
    { label: 'Verde', value: 'bg-green-500', border: 'border-t-green-500' },
    { label: 'Amarelo', value: 'bg-yellow-500', border: 'border-t-yellow-500' },
    { label: 'Vermelho', value: 'bg-red-500', border: 'border-t-red-500' },
    { label: 'Rosa', value: 'bg-pink-500', border: 'border-t-pink-500' },
    { label: 'Indigo', value: 'bg-indigo-500', border: 'border-t-indigo-500' },
    { label: 'Cinza', value: 'bg-gray-500', border: 'border-t-gray-500' },
]

export default function PhaseColumn({
    phase,
    stages,
    allPhases,
    onAddStage,
    onEditPhase,
    onDeletePhase,
    onEditStage,
    onDeleteStage,

    onChangeColor,
    onToggleVisibility,
    onEditPhaseSettings
}: PhaseColumnProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: phase.id,
        data: {
            type: 'Phase',
            phase
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
                className="opacity-50 bg-gray-50 border-2 border-dashed border-indigo-300 rounded-xl h-[500px] w-[300px] flex-shrink-0"
            />
        )
    }

    const isInactive = phase.active === false

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex flex-col h-full w-[300px] bg-gray-50/50 rounded-xl border border-gray-200 flex-shrink-0",
                isInactive && "opacity-60 border-dashed"
            )}
        >
            {/* Header */}
            <div
                className={cn(
                    "p-3 rounded-t-xl border-b border-gray-200 bg-white flex items-center justify-between gap-2",
                    "border-t-4",
                    COLORS.find(c => c.value === phase.color)?.border ||
                    (!phase.color.startsWith('#') && !phase.color.startsWith('rgb') ? phase.color.replace('bg-', 'border-t-') : '')
                )}
                style={phase.color.startsWith('#') || phase.color.startsWith('rgb') ? { borderTopColor: phase.color } : {}}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                    >
                        <GripVertical className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-sm text-gray-900 truncate uppercase tracking-wide flex items-center gap-1.5">
                            {phase.name}
                            {isInactive && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-200 text-slate-600 normal-case tracking-wider">
                                    inativa
                                </span>
                            )}
                        </span>
                        <span className="text-[10px] text-gray-500">
                            {stages.length} etapas
                        </span>
                    </div>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600 transition-colors">
                            <MoreHorizontal className="w-4 h-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Ações da Fase</DropdownMenuLabel>
                        <DropdownMenuItem onClick={onEditPhase}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Renomear
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={onToggleVisibility}>
                            {phase.visible_in_card !== false ? (
                                <>
                                    <Eye className="w-4 h-4 mr-2 text-green-600" />
                                    Visível no Card
                                </>
                            ) : (
                                <>
                                    <EyeOff className="w-4 h-4 mr-2 text-gray-400" />
                                    Oculto no Card
                                </>
                            )}
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={onEditPhaseSettings}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Configurar Cards
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Cor</DropdownMenuLabel>
                        <div className="grid grid-cols-4 gap-2 p-2">
                            {COLORS.map(c => (
                                <DropdownMenuItem
                                    key={c.value}
                                    onSelect={() => onChangeColor(c.value)}
                                    className="p-0 w-8 h-8 rounded-full justify-center cursor-pointer focus:scale-110 transition-transform"
                                >
                                    <div
                                        className={cn(
                                            "w-6 h-6 rounded-full",
                                            c.value,
                                            phase.color === c.value && "ring-2 ring-offset-1 ring-gray-400"
                                        )}
                                        title={c.label}
                                    />
                                </DropdownMenuItem>
                            ))}
                        </div>
                        <div className="p-2 border-t border-gray-100 mt-2">
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Cor Personalizada (Hex)</label>
                            <div className="flex gap-2">
                                <div
                                    className="w-9 h-9 rounded-md border border-gray-200 shadow-sm shrink-0"
                                    style={{ backgroundColor: phase.color }}
                                />
                                <Input
                                    placeholder="#000000"
                                    defaultValue={phase.color.startsWith('#') ? phase.color : ''}
                                    onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                                        const val = e.target.value
                                        if (val.startsWith('#') && (val.length === 4 || val.length === 7)) {
                                            onChangeColor(val)
                                        }
                                    }}
                                    className="h-9 text-xs"
                                />
                            </div>
                        </div>

                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onDeletePhase} className="text-red-600 focus:text-red-700 focus:bg-red-50">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir Fase
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Stages List */}
            <div className="flex-1 p-2 overflow-y-auto min-h-[100px]">
                <SortableContext items={stages.map(s => String(s.id))} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">
                        {stages.map(stage => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- target_phase_id pendente de regeneracao de types
                            const tpId = (stage as any).target_phase_id as string | null
                            const tpName = tpId ? allPhases?.find(p => p.id === tpId)?.name : null
                            return (
                                <StageCard
                                    key={stage.id}
                                    stage={stage}
                                    onEdit={() => onEditStage(stage)}
                                    onDelete={() => onDeleteStage(stage)}
                                    targetPhaseName={tpName}
                                />
                            )
                        })}
                    </div>
                </SortableContext>
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-gray-200 bg-gray-50/50 rounded-b-xl">
                <Button
                    variant="ghost"
                    className="w-full justify-start text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                    onClick={onAddStage}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Etapa
                </Button>
            </div>
        </div>
    )
}
