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
import { validateNode } from '../lib/validation'

/**
 * Trajeto derivado de uma cadence_instance — usado pra destacar no canvas
 * onde o card está agora e por onde ele já passou. Hidratado pelo hook
 * useInstanceTrail quando o user clica numa execução no ExecutionsPanel.
 */
export interface InstanceTrail {
    instanceId: string
    currentNodeId: string | null
    completedNodeIds: string[]
    cardTitulo: string | null
    status: string
    startedAt: string
    /** Quando o card entrou no current_step. Fallback: startedAt. */
    currentStepEnteredAt: string | null
}

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

    /** Substitui a lista inteira de nodes (usado pelo auto-layout) */
    setNodes: (nodes: WorkflowNode[]) => void

    /** Painel "Execuções" lateral aberto/fechado */
    executionsPanelOpen: boolean
    toggleExecutionsPanel: () => void
    setExecutionsPanelOpen: (open: boolean) => void

    /**
     * Instance destacada pelo user no ExecutionsPanel. Quando preenchido,
     * o hook useInstanceTrail consulta o banco e popula `highlightedTrail`.
     */
    highlightedInstanceId: string | null
    highlightedTrail: InstanceTrail | null
    setHighlightedInstance: (id: string | null) => void
    setHighlightedTrail: (trail: InstanceTrail | null) => void

    /** Duplica nodes selecionados (com novos IDs, offset de posição, edges internas) */
    duplicateSelected: () => void
    /** Copia seleção pra clipboard interno */
    copySelected: () => void
    /** Cola do clipboard interno (com offset) */
    pasteFromClipboard: () => void
    /** Apaga todos os nodes/edges selecionados */
    deleteSelected: () => void

    /** Undo / Redo (snapshot history das ações discretas — não inclui drag) */
    undo: () => void
    redo: () => void

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

// Clipboard interno (não persiste em refresh; sobrevive entre nav v2/v2)
interface Clipboard {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
}
let clipboard: Clipboard | null = null

// Histórico de undo/redo — fica fora do state pra não inflar set() repintar
interface HistorySnapshot {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
}
const past: HistorySnapshot[] = []
const future: HistorySnapshot[] = []
const HISTORY_LIMIT = 50

function snapshot(state: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }): HistorySnapshot {
    return {
        nodes: state.nodes.map((n) => ({ ...n, data: { ...n.data } })),
        edges: state.edges.map((e) => ({ ...e })),
    }
}

function pushHistory(state: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }) {
    past.push(snapshot(state))
    if (past.length > HISTORY_LIMIT) past.shift()
    future.length = 0
}

/**
 * Cria cópias dos nodes recebidos com novos IDs + offset, e duplica as
 * edges que ligam nodes do conjunto entre si (descarta as edges que
 * tocam nodes fora do conjunto). Usado por duplicate e paste.
 */
function cloneNodesWithIds(
    sourceNodes: WorkflowNode[],
    sourceEdges: WorkflowEdge[],
    offset: { x: number; y: number },
    isTriggerInScene: (id: string) => boolean,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    const idMap = new Map<string, string>()
    const cloned: WorkflowNode[] = []
    sourceNodes.forEach((n) => {
        // Não duplica trigger se já tem um na cena
        const meta = NODE_BY_TYPE.get(n.type as WorkflowNodeType)
        if (meta?.isTrigger && isTriggerInScene(n.id)) return

        const newId = genNodeId(n.type as WorkflowNodeType)
        idMap.set(n.id, newId)
        cloned.push({
            ...n,
            id: newId,
            position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
            selected: true,
            data: { ...n.data },
        })
    })

    const clonedEdges: WorkflowEdge[] = sourceEdges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => ({
            ...e,
            id: `e_${idMap.get(e.source)}_${idMap.get(e.target)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            source: idMap.get(e.source)!,
            target: idMap.get(e.target)!,
            selected: false,
        }))

    return { nodes: cloned, edges: clonedEdges }
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

    onNodesChange: (changes) => {
        // Snapshot só em mudanças "discretas" (remove). Posição/seleção são
        // contínuas e inflariam o histórico se entrassem.
        if (changes.some((c) => c.type === 'remove')) {
            pushHistory(get())
        }
        set({ nodes: applyNodeChanges(changes, get().nodes) })
    },
    onEdgesChange: (changes) => {
        if (changes.some((c) => c.type === 'remove')) {
            pushHistory(get())
        }
        set({ edges: applyEdgeChanges(changes, get().edges) })
    },
    onConnect: (connection) => {
        pushHistory(get())
        set({ edges: addEdge({ ...connection, type: 'smoothstep' }, get().edges) })
    },

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
        const initialValidation = validateNode(type, {})
        const newNode: WorkflowNode = {
            id,
            type,
            position,
            data: {
                label: meta.label,
                config: {},
                valid: initialValidation.valid,
                error: initialValidation.error,
            },
        }
        pushHistory(get())
        set({
            nodes: [...get().nodes, newNode],
            selectedNodeId: id,
        })
    },

    selectNode: (id) => set({ selectedNodeId: id }),

    updateNodeData: (id, patch) => set({
        nodes: get().nodes.map((n) => {
            if (n.id !== id) return n
            const nextData = { ...n.data, ...patch }
            // Recalcula validação se mudou config
            if ('config' in patch) {
                const { valid, error } = validateNode(
                    n.type as WorkflowNodeType,
                    (nextData.config as Record<string, unknown>) || {},
                )
                nextData.valid = valid
                nextData.error = error
            }
            return { ...n, data: nextData }
        }),
    }),

    deleteNode: (id) => {
        pushHistory(get())
        set({
            nodes: get().nodes.filter((n) => n.id !== id),
            edges: get().edges.filter((e) => e.source !== id && e.target !== id),
            selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
        })
    },

    deleteEdge: (id) => {
        pushHistory(get())
        set({ edges: get().edges.filter((e) => e.id !== id) })
    },

    setNodes: (nodes) => set({ nodes }),

    executionsPanelOpen: false,
    toggleExecutionsPanel: () => set({ executionsPanelOpen: !get().executionsPanelOpen }),
    setExecutionsPanelOpen: (open) => set({ executionsPanelOpen: open }),

    highlightedInstanceId: null,
    highlightedTrail: null,
    setHighlightedInstance: (id) => {
        // Trocar de instance limpa o trail antigo; useInstanceTrail re-hidrata.
        if (id === null) set({ highlightedInstanceId: null, highlightedTrail: null })
        else set({ highlightedInstanceId: id, highlightedTrail: null })
    },
    setHighlightedTrail: (trail) => set({ highlightedTrail: trail }),

    duplicateSelected: () => {
        const state = get()
        const selectedNodes = state.nodes.filter((n) => n.selected)
        if (selectedNodes.length === 0) return
        const hasTrigger = state.nodes.some((n) =>
            NODE_BY_TYPE.get(n.type as WorkflowNodeType)?.isTrigger
                && !selectedNodes.find((s) => s.id === n.id),
        )
        const { nodes: clonedNodes, edges: clonedEdges } = cloneNodesWithIds(
            selectedNodes, state.edges, { x: 40, y: 40 },
            () => hasTrigger,
        )
        if (clonedNodes.length === 0) return
        pushHistory(state)
        // Deseleciona os existentes; seleciona só os novos
        const deselected: WorkflowNode[] = state.nodes.map((n) => ({ ...n, selected: false }))
        set({
            nodes: [...deselected, ...clonedNodes],
            edges: [...state.edges, ...clonedEdges],
            selectedNodeId: clonedNodes[0]?.id || null,
        })
    },

    copySelected: () => {
        const state = get()
        const selectedNodes = state.nodes.filter((n) => n.selected)
        if (selectedNodes.length === 0) return
        const selectedIds = new Set(selectedNodes.map((n) => n.id))
        const internalEdges = state.edges.filter(
            (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
        )
        clipboard = {
            nodes: selectedNodes.map((n) => ({ ...n, data: { ...n.data } })),
            edges: internalEdges.map((e) => ({ ...e })),
        }
    },

    pasteFromClipboard: () => {
        if (!clipboard || clipboard.nodes.length === 0) return
        const state = get()
        const hasTrigger = state.nodes.some((n) =>
            NODE_BY_TYPE.get(n.type as WorkflowNodeType)?.isTrigger,
        )
        const { nodes: clonedNodes, edges: clonedEdges } = cloneNodesWithIds(
            clipboard.nodes, clipboard.edges, { x: 60, y: 60 },
            () => hasTrigger,
        )
        if (clonedNodes.length === 0) return
        pushHistory(state)
        const deselected: WorkflowNode[] = state.nodes.map((n) => ({ ...n, selected: false }))
        set({
            nodes: [...deselected, ...clonedNodes],
            edges: [...state.edges, ...clonedEdges],
            selectedNodeId: clonedNodes[0]?.id || null,
        })
    },

    deleteSelected: () => {
        const state = get()
        const hasSelection = state.nodes.some((n) => n.selected) || state.edges.some((e) => e.selected)
        if (!hasSelection) return
        pushHistory(state)
        const keptNodes = state.nodes.filter((n) => !n.selected)
        const keptIds = new Set(keptNodes.map((n) => n.id))
        const keptEdges = state.edges.filter(
            (e) => !e.selected && keptIds.has(e.source) && keptIds.has(e.target),
        )
        set({
            nodes: keptNodes,
            edges: keptEdges,
            selectedNodeId: null,
        })
    },

    undo: () => {
        const prev = past.pop()
        if (!prev) return
        const current = get()
        future.push(snapshot({ nodes: current.nodes, edges: current.edges }))
        set({ nodes: prev.nodes, edges: prev.edges, selectedNodeId: null })
    },

    redo: () => {
        const next = future.pop()
        if (!next) return
        const current = get()
        past.push(snapshot({ nodes: current.nodes, edges: current.edges }))
        set({ nodes: next.nodes, edges: next.edges, selectedNodeId: null })
    },

    reset: () => {
        past.length = 0
        future.length = 0
        set({
            templateId: null,
            name: '',
            description: '',
            isActive: false,
            autoCancelOnStageChange: true,
            respectBusinessHours: true,
            nodes: [],
            edges: [],
            selectedNodeId: null,
            highlightedInstanceId: null,
            highlightedTrail: null,
        })
    },

    hydrate: (snapshot) => {
        past.length = 0
        future.length = 0
        return set({
        templateId: snapshot.templateId,
        name: snapshot.name,
        description: snapshot.description,
        isActive: snapshot.isActive,
        autoCancelOnStageChange: snapshot.autoCancelOnStageChange,
        respectBusinessHours: snapshot.respectBusinessHours,
        nodes: snapshot.nodes.map((n) => {
            const { valid, error } = validateNode(
                n.type as WorkflowNodeType,
                (n.data.config as Record<string, unknown>) || {},
            )
            return { ...n, data: { ...n.data, valid, error } }
        }),
        edges: snapshot.edges,
        selectedNodeId: null,
        })
    },
}))
