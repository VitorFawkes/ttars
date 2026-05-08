/**
 * ConfigPanel — sidebar lateral direita.
 *
 * Renderiza a configuração do node selecionado. Na Fase 1 mostra um placeholder
 * com as infos do tipo + um campo de label editável. Na Fase 2 cada tipo
 * carregará seu editor específico (reusando MessageStepEditor, MediaStepEditor,
 * EchoActionStepEditor já existentes em src/pages/admin/cadence/components/).
 */
import React from 'react'
import { Trash2, X as XIcon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useWorkflowStore } from '../store/useWorkflowStore'
import { NODE_BY_TYPE } from '../nodes/registry'
import type { WorkflowNodeType } from '../types'
import { EditorRouter } from '../editors/EditorRouter'

export const ConfigPanel: React.FC = () => {
    const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
    const node = useWorkflowStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId))
    const updateNodeData = useWorkflowStore((s) => s.updateNodeData)
    const deleteNode = useWorkflowStore((s) => s.deleteNode)
    const selectNode = useWorkflowStore((s) => s.selectNode)

    if (!selectedNodeId || !node) {
        // Sem seleção, esconde a sidebar inteira pra dar mais canvas.
        return null
    }

    const meta = NODE_BY_TYPE.get(node.type as WorkflowNodeType)

    return (
        <aside className="w-80 bg-white border-l border-slate-200 flex flex-col h-full">
            <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide font-medium text-slate-500">
                        {meta?.isTrigger ? 'Gatilho' : 'Ação'}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 truncate">{meta?.label}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => selectNode(null)} className="-mr-2">
                    <XIcon className="w-4 h-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs">Nome do passo</Label>
                    <Input
                        value={node.data.label}
                        onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
                        placeholder={meta?.label}
                    />
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-600">{meta?.description}</p>
                </div>

                <EditorRouter
                    type={node.type as WorkflowNodeType}
                    config={(node.data.config as Record<string, unknown>) || {}}
                    onChange={(nextConfig) => updateNodeData(node.id, { config: nextConfig })}
                />
            </div>

            <div className="p-3 border-t border-slate-200">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteNode(node.id)}
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Remover passo
                </Button>
            </div>
        </aside>
    )
}

export default ConfigPanel
