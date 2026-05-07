/**
 * Toolbar — header da página: nome, status (ativo/inativo), botões de
 * Voltar / Simular / Salvar.
 *
 * Salvar persiste via lib/persistence.ts (template + steps + trigger).
 * Simular fica stub até Fase 4.
 */
import React, { useState } from 'react'
import { ArrowLeft, Play, Save, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/switch'
import { useWorkflowStore } from '../store/useWorkflowStore'
import { saveWorkflow } from '../lib/persistence'

export const Toolbar: React.FC = () => {
    const navigate = useNavigate()
    const [saving, setSaving] = useState(false)

    const name = useWorkflowStore((s) => s.name)
    const setName = useWorkflowStore((s) => s.setName)
    const isActive = useWorkflowStore((s) => s.isActive)
    const setIsActive = useWorkflowStore((s) => s.setIsActive)
    const nodeCount = useWorkflowStore((s) => s.nodes.length)

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
        // Se era novo, redireciona pra rota com :id pra próximas edições serem update
        if (!state.templateId && result.templateId) {
            navigate(`/settings/automations/v2/${result.templateId}`, { replace: true })
        }
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
                onClick={() => toast.info('Simulação entra na Fase 4')}
            >
                <Play className="w-4 h-4 mr-1" />
                Simular
            </Button>
            <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700"
            >
                {saving ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                    <Save className="w-4 h-4 mr-1" />
                )}
                {saving ? 'Salvando...' : 'Salvar'}
            </Button>
        </header>
    )
}

export default Toolbar
