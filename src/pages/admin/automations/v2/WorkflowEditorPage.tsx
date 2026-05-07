/**
 * WorkflowEditorPage — editor visual de automações (v2, estilo n8n).
 *
 * Fase 1: estrutura básica funcional.
 *  - Toolbox lateral esquerda (drag) | Canvas React Flow | ConfigPanel direita
 *  - Toolbar superior com Voltar / Simular / Salvar (stubs)
 *  - Drag-drop pra criar nodes; clique seleciona; conexão via handles
 *
 * Fases seguintes:
 *  - Fase 2: editores específicos por tipo no ConfigPanel
 *  - Fase 3: load/save (DAG ↔ cadence_templates+steps+event_triggers)
 *  - Fase 4: validação, simular, undo/redo
 *  - Fase 5: redirect v1 → v2
 */
import React, { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useParams } from 'react-router-dom'

import { Toolbar } from './components/Toolbar'
import { Toolbox } from './components/Toolbox'
import { Canvas } from './components/Canvas'
import { ConfigPanel } from './components/ConfigPanel'
import { useWorkflowStore } from './store/useWorkflowStore'
import { NODE_BY_TYPE } from './nodes/registry'
import type { WorkflowNodeType } from './types'

const WorkflowEditorPage: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const isNew = !id || id === 'new'

    const nodes = useWorkflowStore((s) => s.nodes)
    const reset = useWorkflowStore((s) => s.reset)

    // Limpa store ao montar (evita ressuscitar canvas anterior ao entrar de novo)
    useEffect(() => {
        reset()
        return () => reset()
    }, [reset])

    // Computar se já existe trigger no canvas (controla disable na Toolbox)
    const hasTrigger = nodes.some((n) =>
        NODE_BY_TYPE.get(n.type as WorkflowNodeType)?.isTrigger,
    )

    // Fase 3: aqui carregaria template existente quando !isNew
    void isNew

    return (
        <ReactFlowProvider>
            <div className="h-full flex flex-col bg-slate-50/50">
                <Toolbar />
                <div className="flex-1 flex min-h-0">
                    <Toolbox hasTrigger={hasTrigger} />
                    <Canvas />
                    <ConfigPanel />
                </div>
            </div>
        </ReactFlowProvider>
    )
}

export default WorkflowEditorPage
