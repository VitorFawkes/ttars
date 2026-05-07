/**
 * Toolbar — header da página: nome, status (ativo/inativo), botões de
 * Voltar / Tidy up / Simular / Salvar.
 *
 * - Tidy up: aplica ELK auto-layout aos nodes existentes
 * - Simular: dry-run da primeira ação contra um card real (via prompt)
 * - Salvar: persiste template + steps + trigger
 */
import React, { useState } from 'react'
import { ArrowLeft, Play, Save, Loader2, AlignVerticalJustifyCenter } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/switch'
import { useWorkflowStore } from '../store/useWorkflowStore'
import { saveWorkflow } from '../lib/persistence'
import { applyAutoLayout } from '../lib/autoLayout'
import { simulateWorkflow } from '../lib/simulate'
import { NODE_BY_TYPE } from '../nodes/registry'
import type { WorkflowNodeType } from '../types'

export const Toolbar: React.FC = () => {
    const navigate = useNavigate()
    const [saving, setSaving] = useState(false)
    const [simulating, setSimulating] = useState(false)
    const [layouting, setLayouting] = useState(false)

    const name = useWorkflowStore((s) => s.name)
    const setName = useWorkflowStore((s) => s.setName)
    const isActive = useWorkflowStore((s) => s.isActive)
    const setIsActive = useWorkflowStore((s) => s.setIsActive)
    const nodeCount = useWorkflowStore((s) => s.nodes.length)
    const setNodes = useWorkflowStore((s) => s.setNodes)

    const handleSave = async () => {
        const state = useWorkflowStore.getState()
        setSaving(true)
        const result = await saveWorkflow({
            templateId: state.templateId,
            name: state.name,
            description: state.description,
            isActive: state.isActive,
            autoCancelOnStageChange: state.autoCancelOnStageChange,
            respectBusinessHours: state.respectBusinessHours,
            nodes: state.nodes,
            edges: state.edges,
        })
        setSaving(false)
        if (!result.success) {
            toast.error(result.error || 'Erro ao salvar')
            return
        }
        toast.success('Workflow salvo')
        if (!state.templateId && result.templateId) {
            navigate(`/settings/automations/v2/${result.templateId}`, { replace: true })
        }
    }

    const handleTidyUp = async () => {
        const state = useWorkflowStore.getState()
        if (state.nodes.length === 0) return
        setLayouting(true)
        const next = await applyAutoLayout(state.nodes, state.edges)
        setNodes(next)
        setLayouting(false)
    }

    const handleSimulate = async () => {
        const state = useWorkflowStore.getState()
        const triggerNode = state.nodes.find((n) =>
            NODE_BY_TYPE.get(n.type as WorkflowNodeType)?.isTrigger,
        )
        if (!triggerNode) {
            toast.error('Adicione um gatilho pra simular')
            return
        }
        // Primeiro action node ligado ao trigger
        const firstEdge = state.edges.find((e) => e.source === triggerNode.id)
        const firstActionNode = firstEdge
            ? state.nodes.find((n) => n.id === firstEdge.target) || null
            : null

        const cardId = window.prompt('ID do card pra simular contra (UUID):')?.trim()
        if (!cardId) return

        setSimulating(true)
        const result = await simulateWorkflow({ cardId, triggerNode, firstActionNode })
        setSimulating(false)
        if (!result.success) {
            toast.error(`Simulação falhou: ${result.error}`)
            return
        }
        // Mostra payload via toast (e console pro debug detalhado)
        console.log('[v2] Simulation result:', result.payload)
        toast.success('Simulação OK — veja o console pra detalhes')
    }

    return (
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 shadow-sm">
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings/automations')}>
                <ArrowLeft className="w-4 h-4" />
            </Button>

            <div className="flex-1 max-w-md">
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome da automação"
                    className="border-0 bg-transparent text-sm font-semibold focus-visible:ring-1 focus-visible:ring-slate-300"
                />
            </div>

            <div className="text-xs text-slate-500">
                {nodeCount} passo{nodeCount === 1 ? '' : 's'}
            </div>

            <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Ativa</span>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <Button
                variant="outline"
                size="sm"
                onClick={handleTidyUp}
                disabled={layouting || nodeCount === 0}
                title="Auto-organizar layout (ELK)"
            >
                {layouting
                    ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    : <AlignVerticalJustifyCenter className="w-4 h-4 mr-1" />}
                Organizar
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={handleSimulate}
                disabled={simulating}
            >
                {simulating
                    ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    : <Play className="w-4 h-4 mr-1" />}
                Simular
            </Button>

            <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700"
            >
                {saving
                    ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    : <Save className="w-4 h-4 mr-1" />}
                {saving ? 'Salvando...' : 'Salvar'}
            </Button>
        </header>
    )
}

export default Toolbar
