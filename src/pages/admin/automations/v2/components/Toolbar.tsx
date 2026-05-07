/**
 * Toolbar — header da página: nome, status (ativo/inativo), botões de
 * Voltar / Simular / Salvar.
 *
 * Save/Simular ficam stubs na Fase 1 (toast informativo). Fase 3 conecta
 * com a RPC replace_cadence_steps + simulate_automation.
 */
import React from 'react'
import { ArrowLeft, Play, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/switch'
import { useWorkflowStore } from '../store/useWorkflowStore'

export const Toolbar: React.FC = () => {
    const navigate = useNavigate()
    const name = useWorkflowStore((s) => s.name)
    const setName = useWorkflowStore((s) => s.setName)
    const isActive = useWorkflowStore((s) => s.isActive)
    const setIsActive = useWorkflowStore((s) => s.setIsActive)
    const nodeCount = useWorkflowStore((s) => s.nodes.length)

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
                onClick={() => toast.info('Save entra na Fase 3 (DAG → cadence_templates/steps)')}
                className="bg-indigo-600 hover:bg-indigo-700"
            >
                <Save className="w-4 h-4 mr-1" />
                Salvar
            </Button>
        </header>
    )
}

export default Toolbar
