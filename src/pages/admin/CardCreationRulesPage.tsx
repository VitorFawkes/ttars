import { useState, useMemo } from 'react'
import { useCardCreationRules } from '../../hooks/useCardCreationRules'
import { useTeams } from '../../hooks/useTeams'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Loader2, Check, X, Info } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'

interface Stage {
    id: string
    nome: string
    ordem: number
    fase: string | null
}

export default function CardCreationRulesPage() {
    const { rules, isLoading: loadingRules, toggleRule } = useCardCreationRules()
    const { teams, isLoading: loadingTeams } = useTeams()
    const { toast } = useToast()
    const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set())

    // Fetch all pipeline stages
    const { data: stages = [], isLoading: loadingStages } = useQuery({
        queryKey: ['all-pipeline-stages'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipeline_stages')
                .select('id, nome, ordem, fase, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)')
                .eq('ativo', true)
                .order('ordem')

            if (error) throw error
            // Sort by phase order_index then stage ordem
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (data || []).sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            }) as Stage[]
        }
    })

    // Group stages by phase
    const stagesByPhase = useMemo(() => {
        const groups: Record<string, Stage[]> = {}
        stages.forEach(stage => {
            const phase = stage.fase || 'Outros'
            if (!groups[phase]) groups[phase] = []
            groups[phase].push(stage)
        })
        return groups
    }, [stages])

    // Create a set of allowed team+stage combinations
    const allowedRulesSet = useMemo(() => {
        const set = new Set<string>()
        rules.forEach(rule => {
            set.add(`${rule.team_id}:${rule.stage_id}`)
        })
        return set
    }, [rules])

    const isAllowed = (teamId: string, stageId: string) => {
        return allowedRulesSet.has(`${teamId}:${stageId}`)
    }

    const handleToggle = async (teamId: string, stageId: string) => {
        const key = `${teamId}:${stageId}`
        setPendingToggles(prev => new Set(prev).add(key))

        try {
            await toggleRule.mutateAsync({
                teamId,
                stageId,
                isAllowed: !isAllowed(teamId, stageId)
            })
            toast({
                title: 'Sucesso',
                description: isAllowed(teamId, stageId) ? 'Permissão removida' : 'Permissão adicionada',
                type: 'success'
            })
        } catch (error) {
            console.error('Error toggling rule:', error)
            toast({
                title: 'Erro',
                description: 'Falha ao atualizar permissão',
                type: 'error'
            })
        } finally {
            setPendingToggles(prev => {
                const next = new Set(prev)
                next.delete(key)
                return next
            })
        }
    }

    const isLoading = loadingRules || loadingTeams || loadingStages

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        )
    }

    // Filter to only operational teams (with phase_id)
    const operationalTeams = teams.filter(t => t.is_active)

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-foreground">Regras de Criação de Cards</h2>
                <p className="text-muted-foreground">Configure em quais etapas cada time pode criar novos cards.</p>
            </div>

            {/* Info box */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                    <p className="font-medium">Como funciona:</p>
                    <ul className="mt-1 list-disc list-inside text-blue-700">
                        <li>Usuários SEM time ou com role admin/gestor podem criar cards em qualquer etapa</li>
                        <li>Usuários COM time só podem criar cards nas etapas marcadas abaixo</li>
                        <li>Clique para alternar permissões</li>
                    </ul>
                </div>
            </div>

            {/* Matrix table */}
            <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="text-left font-semibold text-slate-700 p-4 sticky left-0 bg-slate-50 z-10 min-w-[150px]">
                                    Time
                                </th>
                                {Object.entries(stagesByPhase).map(([phase, phaseStages]) => (
                                    <th
                                        key={phase}
                                        colSpan={phaseStages.length}
                                        className="text-center font-semibold text-slate-700 p-2 border-l border-slate-200"
                                    >
                                        {phase}
                                    </th>
                                ))}
                            </tr>
                            <tr className="bg-white border-b border-slate-200">
                                <th className="sticky left-0 bg-white z-10"></th>
                                {Object.values(stagesByPhase).flat().map(stage => (
                                    <th
                                        key={stage.id}
                                        className="text-center text-xs font-medium text-slate-500 p-2 border-l border-slate-100 min-w-[100px]"
                                    >
                                        <div className="truncate max-w-[100px]" title={stage.nome}>
                                            {stage.nome}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {operationalTeams.map(team => (
                                <tr key={team.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="font-medium text-slate-900 p-4 sticky left-0 bg-white z-10">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={`w-3 h-3 rounded-full ${team.color || 'bg-slate-300'}`}
                                            />
                                            {team.name}
                                        </div>
                                    </td>
                                    {Object.values(stagesByPhase).flat().map(stage => {
                                        const allowed = isAllowed(team.id, stage.id)
                                        const pending = pendingToggles.has(`${team.id}:${stage.id}`)

                                        return (
                                            <td key={stage.id} className="text-center p-2 border-l border-slate-100">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleToggle(team.id, stage.id)}
                                                    disabled={pending}
                                                    className={`w-8 h-8 rounded-full transition-all ${allowed
                                                        ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                                                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                                        }`}
                                                >
                                                    {pending ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : allowed ? (
                                                        <Check className="w-4 h-4" />
                                                    ) : (
                                                        <X className="w-3 h-3" />
                                                    )}
                                                </Button>
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span>Pode criar cards</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                        <X className="w-3 h-3 text-slate-400" />
                    </div>
                    <span>Não pode criar cards</span>
                </div>
            </div>
        </div>
    )
}
