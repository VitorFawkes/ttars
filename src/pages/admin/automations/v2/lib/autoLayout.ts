/**
 * Auto-layout via ELK.js.
 *
 * Aplicado quando: (a) carrega cadência existente (substitui layout vertical
 * fixo) e (b) usuário clica "Tidy up". Usa algoritmo "layered" — direção
 * left-to-right, com espaçamento generoso pra workflows ficarem legíveis.
 */
import ELK from 'elkjs/lib/elk.bundled.js'
import type { Edge } from '@xyflow/react'
import type { WorkflowNode } from '../types'

const elk = new ELK()

const NODE_WIDTH = 240
const NODE_HEIGHT = 110

const LAYOUT_OPTIONS = {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.layered.spacing.nodeNodeBetweenLayers': '90',
    'elk.spacing.nodeNode': '40',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
}

export async function applyAutoLayout(
    nodes: WorkflowNode[],
    edges: Edge[],
): Promise<WorkflowNode[]> {
    if (nodes.length === 0) return nodes

    const elkGraph = {
        id: 'root',
        layoutOptions: LAYOUT_OPTIONS,
        children: nodes.map((n) => ({
            id: n.id,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
        })),
        edges: edges.map((e) => ({
            id: e.id,
            sources: [e.source],
            targets: [e.target],
        })),
    }

    try {
        const result = await elk.layout(elkGraph)
        const positionById = new Map<string, { x: number; y: number }>()
        for (const child of result.children || []) {
            positionById.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
        }
        return nodes.map((n) => {
            const pos = positionById.get(n.id)
            return pos ? { ...n, position: pos } : n
        })
    } catch (err) {
        console.warn('[v2] ELK layout failed, keeping original positions', err)
        return nodes
    }
}
