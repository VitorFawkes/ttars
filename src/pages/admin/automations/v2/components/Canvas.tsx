/**
 * Canvas — wrapper React Flow.
 *
 * Recebe nodes/edges/handlers da store. Faz o handling de drop pra criar
 * um node novo quando o user solta um item da Toolbox aqui dentro.
 */
import React, { useCallback, useEffect, useRef } from 'react'
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useWorkflowStore } from '../store/useWorkflowStore'
import { NODE_TYPES } from '../nodes/BaseNode'
import { EDGE_TYPES } from '../edges/DeletableEdge'
import type { WorkflowNode, WorkflowNodeType } from '../types'

export const Canvas: React.FC = () => {
    const reactFlowWrapper = useRef<HTMLDivElement>(null)
    const reactFlowInstance = useRef<ReactFlowInstance<WorkflowNode> | null>(null)

    const nodes = useWorkflowStore((s) => s.nodes)
    const edges = useWorkflowStore((s) => s.edges)
    const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
    const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)
    const onConnect = useWorkflowStore((s) => s.onConnect)
    const addNodeOfType = useWorkflowStore((s) => s.addNodeOfType)
    const selectNode = useWorkflowStore((s) => s.selectNode)
    const duplicateSelected = useWorkflowStore((s) => s.duplicateSelected)
    const copySelected = useWorkflowStore((s) => s.copySelected)
    const pasteFromClipboard = useWorkflowStore((s) => s.pasteFromClipboard)
    const undo = useWorkflowStore((s) => s.undo)
    const redo = useWorkflowStore((s) => s.redo)

    // Atalhos: Ctrl+D duplicar, Ctrl+C copiar, Ctrl+V colar, Ctrl+Z undo,
    // Ctrl+Shift+Z (ou Ctrl+Y) redo. Delete/Backspace fica com o React Flow.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null
            if (target) {
                const tag = target.tagName
                if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
            }
            const meta = e.metaKey || e.ctrlKey
            if (!meta) return
            const key = e.key.toLowerCase()
            if (key === 'd') {
                e.preventDefault()
                duplicateSelected()
            } else if (key === 'c') {
                copySelected()
            } else if (key === 'v') {
                e.preventDefault()
                pasteFromClipboard()
            } else if (key === 'z' && !e.shiftKey) {
                e.preventDefault()
                undo()
            } else if ((key === 'z' && e.shiftKey) || key === 'y') {
                e.preventDefault()
                redo()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [duplicateSelected, copySelected, pasteFromClipboard, undo, redo])

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
    }, [])

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault()
        const type = event.dataTransfer.getData('application/reactflow-type') as WorkflowNodeType | ''
        if (!type) return

        const bounds = reactFlowWrapper.current?.getBoundingClientRect()
        if (!bounds || !reactFlowInstance.current) return

        const position = reactFlowInstance.current.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        })
        addNodeOfType(type, position)
    }, [addNodeOfType])

    return (
        <div ref={reactFlowWrapper} className="flex-1 h-full bg-slate-100">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={(instance) => { reactFlowInstance.current = instance }}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={(_, node) => selectNode(node.id)}
                onPaneClick={() => selectNode(null)}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                fitView
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
                deleteKeyCode={['Delete', 'Backspace']}
                multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
                selectionOnDrag
                panOnDrag={[1, 2]}
            >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                <Controls />
                <MiniMap
                    nodeColor={(n) => {
                        if (String(n.type).startsWith('trigger.')) return '#fcd34d'
                        if (String(n.type).startsWith('action.echo_')) return '#a78bfa'
                        if (String(n.type) === 'action.send_message' || String(n.type) === 'action.send_media') return '#34d399'
                        return '#cbd5e1'
                    }}
                    pannable
                    zoomable
                />
            </ReactFlow>
        </div>
    )
}

export default Canvas
