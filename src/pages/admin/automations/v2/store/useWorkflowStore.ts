/**
 * Zustand store para o estado do workflow editor.
 *
 * Mantém nodes/edges/seleção em memória durante a edição. Persistência (load
 * de /save no banco) entra na Fase 3 — por enquanto a store só sincroniza com
 * o React Flow via useNodesState/useEdgesState helpers.
 */
import { create } from 'zustand'
import {
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    type NodeChange,
    type EdgeChange,
    type Connection,
} from '@xyflow/react'
import type { WorkflowNode, WorkflowEdge, WorkflowNodeType } from '../types'
import { NODE_BY_TYPE } from '../nodes/registry'

interface WorkflowState {
    // Metadados do template
    templateId: string | null
    name: string
    description: string
    isActive: boolean
    autoCancelOnStageChange: boolean
    respectBusinessHours: boolean

    // Canvas
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    selectedNodeId: string | null

    // Setters de meta
    setName: (v: string) => void
    setDescription: (v: string) => void
    setIsActive: (v: boolean) => void
    setAutoCancelOnStageChange: (v: boolean) => void
    setRespectBusinessHours: (v: boolean) => void

    // Operações de canvas
    onNodesChange: (changes: NodeChange<WorkflowNode>[]) => void
    onEdgesChange: (changes: EdgeChange<WorkflowEdge>[]) => void
    onConnect: (connection: Connection) => void

    // Operações de domínio
    addNodeOfType: (type: WorkflowNodeType, position: { x: number; y: number }) => void
    selectNode: (id: string | null) => void
    updateNodeData: (id: string, patch: Partial<WorkflowNode['data']>) => void
    deleteNode: (id: string) => void
    deleteEdge: (id: string) => void
    reset: () => void

    /** Hidrata a store inteira a partir do banco (usado no load) */
    hydrate: (snapshot: {
        templateId: string
        name: string
        description: string
        isActive: boolean
        autoCancelOnStageChange: boolean
        respectBusinessHours: boolean
        nodes: WorkflowNode[]
        edges: WorkflowEdge[]
    }) => void
}

let nodeIdCounter = 0
const genNodeId = (type: WorkflowNodeType) => {
    nodeIdCounter += 1
    return `${type.replace(/^.*\./, '')}_${Date.now()}_${nodeIdCounter}`
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    // Defaults
    templateId: null,
    name: '',
    description: '',
    isActive: false,
    autoCancelOnStageChange: true,
    respectBusinessHours: true,

    nodes: [],
    edges: [],
    selectedNodeId: null,

    setName: (v) => set({ name: v }),
    setDescription: (v) => set({ description: v }),
    setIsActive: (v) => set({ isActive: v }),
    setAutoCancelOnStageChange: (v) => set({ autoCancelOnStageChange: v }),
    setRespectBusinessHours: (v) => set({ respectBusinessHours: v }),

    onNodesChange: (changes) => set({
        nodes: applyNodeChanges(changes, get().nodes),
    }),
    onEdgesChange: (changes) => set({
        edges: applyEdgeChanges(changes, get().edges),
    }),
    onConnect: (connection) => set({
        edges: addEdge({ ...connection, type: 'smoothstep' }, get().edges),
    }),

    addNodeOfType: (type, position) => {
        const meta = NODE_BY_TYPE.get(type)
        if (!meta) return

        // Triggers só podem ter 1 instância por workflow
        if (meta.isTrigger) {
            const existingTrigger = get().nodes.find((n) =>
                NODE_BY_TYPE.get(n.type as WorkflowNodeType)?.isTrigger,
            )
            if (existingTrigger) {
                // Substitui o existente em vez de duplicar
                set({
                    nodes: get().nodes.map((n) =>
                        n.id === existingTrigger.id
                            ? { ...n, type, data: { label: meta.label, config: {} } }
                            : n,
                    ),
                    selectedNodeId: existingTrigger.id,
                })
                return
            }
        }

        const id = genNodeId(type)
        const newNode: WorkflowNode = {
            id,
            type,
            position,
            data: { label: meta.label, config: {} },
        }
        set({
            nodes: [...get().nodes, newNode],
            selectedNodeId: id,
        })
    },

    selectNode: (id) => set({ selectedNodeId: id }),

    updateNodeData: (id, patch) => set({
        nodes: get().nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
    }),

    deleteNode: (id) => set({
        nodes: get().nodes.filter((n) => n.id !== id),
        edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    }),

    deleteEdge: (id) => set({
        edges: get().edges.filter((e) => e.id !== id),
    }),

    reset: () => set({
        templateId: null,
        name: '',
        description: '',
        isActive: false,
        autoCancelOnStageChange: true,
        respectBusinessHours: true,
        nodes: [],
        edges: [],
        selectedNodeId: null,
    }),

    hydrate: (snapshot) => set({
        templateId: snapshot.templateId,
        name: snapshot.name,
        description: snapshot.description,
        isActive: snapshot.isActive,
        autoCancelOnStageChange: snapshot.autoCancelOnStageChange,
        respectBusinessHours: snapshot.respectBusinessHours,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        selectedNodeId: null,
    }),
}))
