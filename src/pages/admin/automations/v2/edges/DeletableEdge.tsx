/**
 * DeletableEdge — edge custom do React Flow com botão de lixeira no meio.
 *
 * Quando o usuário passa o mouse em cima da linha (ou em qualquer lugar
 * próximo), aparece um botão circular vermelho no centro do trecho.
 * Clicar remove a edge da store. Sem hover, o botão fica invisível pra
 * não poluir o canvas.
 */
import React, { useState } from 'react'
import {
    BaseEdge,
    EdgeLabelRenderer,
    getSmoothStepPath,
    type EdgeProps,
} from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import { useWorkflowStore } from '../store/useWorkflowStore'

export const DeletableEdge: React.FC<EdgeProps> = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
}) => {
    const [hover, setHover] = useState(false)
    const deleteEdge = useWorkflowStore((s) => s.deleteEdge)

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX, sourceY,
        sourcePosition,
        targetX, targetY,
        targetPosition,
        borderRadius: 12,
    })

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                style={{ strokeWidth: hover ? 2.5 : 1.5, ...style }}
            />
            {/* Path largo invisível pra ampliar a área de hover (linhas finas
                são difíceis de mirar com o mouse) */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                style={{ cursor: 'pointer' }}
            />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    onMouseEnter={() => setHover(true)}
                    onMouseLeave={() => setHover(false)}
                >
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            deleteEdge(id)
                        }}
                        title="Remover ligação"
                        className={`flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 border-rose-400 text-rose-600 shadow-md hover:bg-rose-50 transition-opacity ${
                            hover ? 'opacity-100' : 'opacity-0'
                        }`}
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </EdgeLabelRenderer>
        </>
    )
}

export default DeletableEdge

export const EDGE_TYPES = {
    smoothstep: DeletableEdge,
    deletable: DeletableEdge,
}
