/**
 * WorkflowEditorPage — editor visual de automações (v2, estilo n8n).
 *
 * Fase 1: estrutura básica funcional.
 *  - Toolbox lateral esquerda (drag) | Canvas React Flow | ConfigPanel direita
 *  - Toolbar superior com Voltar / Simular / Salvar
 *  - Drag-drop pra criar nodes; clique seleciona; conexão via handles
 *
 * Fase 2: editores de config por tipo (delegados via EditorRouter).
 *
 * Fase 3 (atual): load/save (DAG ↔ cadence_templates+steps+event_triggers).
 *  - Quando :id existe, hidrata canvas com nodes/edges do banco
 *  - Toolbar.Salvar persiste via lib/persistence.ts
 *
 * Próximas:
 *  - Fase 4: validação, simular, undo/redo, ELK auto-layout
 *  - Fase 5: redirect v1 → v2
 */
import React, { useEffect, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Toolbar } from './components/Toolbar'
import { Toolbox } from './components/Toolbox'
import { Canvas } from './components/Canvas'
import { ConfigPanel } from './components/ConfigPanel'
import { ExecutionsPanel } from './components/ExecutionsPanel'
import { useWorkflowStore } from './store/useWorkflowStore'
import { NODE_BY_TYPE } from './nodes/registry'
import type { WorkflowNodeType } from './types'
import { loadWorkflow } from './lib/persistence'
import { applyAutoLayout } from './lib/autoLayout'
import { NodeRefLabelsProvider } from './store/NodeRefLabels'
import { useOrg } from '@/contexts/OrgContext'
import { useInstanceTrail } from './hooks/useInstanceTrail'

const WorkflowEditorPage: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { org } = useOrg()
    const isNew = !id || id === 'new'
    const [loading, setLoading] = useState(!isNew)

    const nodes = useWorkflowStore((s) => s.nodes)
    const reset = useWorkflowStore((s) => s.reset)
    const hydrate = useWorkflowStore((s) => s.hydrate)

    // Fecha o editor e volta pra lista quando o usuário troca de org.
    // Sem isso, o user veria o canvas de uma automação que não pertence
    // mais ao workspace atual.
    const initialOrgIdRef = useRef<string | null | undefined>(undefined)
    useEffect(() => {
        // Primeira renderização: registra a org inicial.
        if (initialOrgIdRef.current === undefined) {
            if (org?.id) initialOrgIdRef.current = org.id
            return
        }
        // Org carregou diferente da inicial: redireciona pra lista.
        if (org?.id && org.id !== initialOrgIdRef.current) {
            navigate('/settings/automations', { replace: true })
        }
    }, [org?.id, navigate])

    useEffect(() => {
        reset()
        if (!isNew && id) {
            setLoading(true)
            loadWorkflow(id)
                .then(async (result) => {
                    if (!result.success) {
                        toast.error(`Erro ao carregar: ${result.error}`)
                        return
                    }
                    // Roda ELK pra reorganizar nodes (substitui o layout vertical fixo)
                    const laidOutNodes = await applyAutoLayout(result.nodes || [], result.edges || [])
                    hydrate({
                        templateId: result.templateId!,
                        name: result.name || '',
                        description: result.description || '',
                        isActive: !!result.isActive,
                        autoCancelOnStageChange: !!result.autoCancelOnStageChange,
                        respectBusinessHours: !!result.respectBusinessHours,
                        nodes: laidOutNodes,
                        edges: result.edges || [],
                    })
                })
                .catch((err) => toast.error(`Erro: ${err.message}`))
                .finally(() => setLoading(false))
        } else {
            setLoading(false)
        }
        return () => reset()
    }, [id, isNew, reset, hydrate])

    const hasTrigger = nodes.some((n) =>
        NODE_BY_TYPE.get(n.type as WorkflowNodeType)?.isTrigger,
    )

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50/50">
                <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando workflow...
                </div>
            </div>
        )
    }

    return (
        <NodeRefLabelsProvider>
            <ReactFlowProvider>
                <WorkflowEditorLayout hasTrigger={hasTrigger} />
            </ReactFlowProvider>
        </NodeRefLabelsProvider>
    )
}

// Componente interno que consome a store pra mostrar o painel de execuções
const WorkflowEditorLayout: React.FC<{ hasTrigger: boolean }> = ({ hasTrigger }) => {
    const executionsPanelOpen = useWorkflowStore((s) => s.executionsPanelOpen)
    const setExecutionsPanelOpen = useWorkflowStore((s) => s.setExecutionsPanelOpen)
    const templateId = useWorkflowStore((s) => s.templateId)
    const highlightedInstanceId = useWorkflowStore((s) => s.highlightedInstanceId)
    // Hidrata o trail no store quando o user clica em uma instance.
    // No-op quando highlightedInstanceId é null.
    useInstanceTrail(highlightedInstanceId)

    return (
        <div className="h-full flex flex-col bg-slate-50/50">
            <Toolbar />
            <div className="flex-1 flex min-h-0">
                <Toolbox hasTrigger={hasTrigger} />
                <Canvas />
                <ConfigPanel />
                {executionsPanelOpen && (
                    <ExecutionsPanel
                        templateId={templateId}
                        onClose={() => setExecutionsPanelOpen(false)}
                    />
                )}
            </div>
        </div>
    )
}

export default WorkflowEditorPage
