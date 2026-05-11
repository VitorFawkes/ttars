import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { Check, Loader2, AlertCircle, DollarSign, Calendar, CheckSquare, Type, Search, ArrowDownAZ } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { Database } from '../../../database.types'
import { toast } from 'sonner'

type SystemField = Database['public']['Tables']['system_fields']['Row']
type PipelinePhase = Database['public']['Tables']['pipeline_phases']['Row']
// Extend type locally until database types are regenerated
type CardSettings = Database['public']['Tables']['pipeline_card_settings']['Row'] & {
    phase_id?: string | null
}

interface KanbanGridProps {
    phases: PipelinePhase[]
    systemFields: SystemField[]
    settings: CardSettings[]
    isLoading: boolean
}

export function KanbanGrid({ phases, systemFields, settings, isLoading }: KanbanGridProps) {
    const queryClient = useQueryClient()

    // Local state for optimistic updates
    // Map<phaseId, Set<fieldKey>>
    const [visibilityMap, setVisibilityMap] = useState<Record<string, Set<string>>>({})
    const [isDirty, setIsDirty] = useState(false)

    // Initialize state from props
    useEffect(() => {
        if (settings && phases) {
            const initialMap: Record<string, Set<string>> = {}

            phases.forEach(phase => {
                const phaseSettings = settings.find(s => s.phase_id === phase.id)
                if (phaseSettings?.campos_kanban && Array.isArray(phaseSettings.campos_kanban)) {
                    initialMap[phase.id] = new Set(phaseSettings.campos_kanban as string[])
                } else {
                    initialMap[phase.id] = new Set()
                }
            })

            setVisibilityMap(initialMap)
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsDirty(false)
        }
    }, [settings, phases])

    const [showSuccess, setShowSuccess] = useState(false)

    // Mutation for saving changes
    const saveMutation = useMutation({
        mutationFn: async (newMap: Record<string, Set<string>>) => {
            const updates = phases.map(phase => {
                const currentSettings = settings.find(s => s.phase_id === phase.id)
                const visibleFields = Array.from(newMap[phase.id] || [])

                // Preserve existing order if possible, append new fields at the end
                let newOrder = currentSettings?.ordem_kanban as string[] || []

                // Remove fields that are no longer visible from order
                newOrder = newOrder.filter(f => visibleFields.includes(f))

                // Add newly visible fields to the end of order
                visibleFields.forEach(f => {
                    if (!newOrder.includes(f)) {
                        newOrder.push(f)
                    }
                })

                return {
                    phase_id: phase.id,
                    fase: phase.name,
                    campos_kanban: visibleFields,
                    ordem_kanban: newOrder,
                    usuario_id: null
                }
            })

            const { error } = await supabase
                .from('pipeline_card_settings')
                .upsert(updates, { onConflict: 'phase_id,usuario_id' })

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-card-settings-admin'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-settings'] })
            toast.success('Configurações salvas com sucesso!')
            setIsDirty(false)
            setShowSuccess(true)
            setTimeout(() => setShowSuccess(false), 3000)
        },
        onError: (err) => {
            toast.error('Erro ao salvar: ' + err.message)
        }
    })

    const toggleField = (phaseId: string, fieldKey: string) => {
        const newMap = { ...visibilityMap }
        const phaseSet = new Set(newMap[phaseId])

        if (phaseSet.has(fieldKey)) {
            phaseSet.delete(fieldKey)
        } else {
            phaseSet.add(fieldKey)
        }

        newMap[phaseId] = phaseSet
        setVisibilityMap(newMap)
        setIsDirty(true)
    }

    const toggleRow = (fieldKey: string) => {
        const newMap = { ...visibilityMap }
        const allVisible = phases.every(p => newMap[p.id]?.has(fieldKey))

        phases.forEach(p => {
            const phaseSet = new Set(newMap[p.id])
            if (allVisible) {
                phaseSet.delete(fieldKey)
            } else {
                phaseSet.add(fieldKey)
            }
            newMap[p.id] = phaseSet
        })

        setVisibilityMap(newMap)
        setIsDirty(true)
    }

    const toggleColumn = (phaseId: string) => {
        const newMap = { ...visibilityMap }
        const phaseSet = new Set(newMap[phaseId])
        const allVisible = systemFields.every(f => phaseSet.has(f.key))

        if (allVisible) {
            phaseSet.clear()
        } else {
            systemFields.forEach(f => phaseSet.add(f.key))
        }

        newMap[phaseId] = phaseSet
        setVisibilityMap(newMap)
        setIsDirty(true)
    }

    // Local state for search and sort
    const [searchTerm, setSearchTerm] = useState('')
    const [sortOrder, setSortOrder] = useState<'default' | 'az'>('default')

    // Filter and sort fields
    const filteredFields = systemFields
        .filter(field =>
            field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            field.key.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => {
            if (sortOrder === 'az') {
                return a.label.localeCompare(b.label)
            }
            return 0 // Keep original order (which usually comes from DB or is arbitrary)
        })

    if (isLoading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <AlertCircle className="w-4 h-4" />
                    <span>Clique nas células para ativar/desativar campos.</span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* Search Input */}
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar campos..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                    </div>

                    {/* Sort Toggle */}
                    <button
                        onClick={() => setSortOrder(prev => prev === 'default' ? 'az' : 'default')}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 h-9 text-sm border rounded-lg transition-all",
                            sortOrder === 'az'
                                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                        )}
                        title="Alternar ordem A-Z"
                    >
                        <ArrowDownAZ className="w-4 h-4" />
                        <span className="hidden sm:inline">{sortOrder === 'az' ? 'A-Z' : 'Padrão'}</span>
                    </button>

                    <button
                        onClick={() => saveMutation.mutate(visibilityMap)}
                        disabled={saveMutation.isPending || (!isDirty && !showSuccess)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 h-9 rounded-lg transition-all shadow-sm text-sm font-medium",
                            showSuccess
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : isDirty
                                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                    : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                        )}
                    >
                        {saveMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : showSuccess ? (
                            <Check className="w-4 h-4" />
                        ) : (
                            <Check className="w-4 h-4" />
                        )}
                        {showSuccess ? 'Salvo!' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[60vh] min-h-[400px] rounded-xl border border-gray-200 shadow-sm bg-white">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-4 py-3 font-medium text-gray-900 sticky top-0 left-0 bg-gray-50 z-20 w-64 shadow-sm">
                                Campo / Fase
                            </th>
                            {phases.map(phase => (
                                <th key={phase.id} className="px-4 py-3 font-medium text-center min-w-[100px] sticky top-0 bg-gray-50 z-10 shadow-sm">
                                    <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={() => toggleColumn(phase.id)}>
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: phase.color }}
                                            />
                                            <span>{phase.label}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 group-hover:text-indigo-600 font-normal lowercase">
                                            (alternar todos)
                                        </span>
                                    </div>
                                </th>
                            ))}
                            <th className="px-4 py-3 font-medium text-center w-24 bg-gray-50 sticky top-0 z-10 shadow-sm">
                                Ações
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredFields.map(field => {
                            const isRowActive = phases.every(p => visibilityMap[p.id]?.has(field.key))

                            return (
                                <tr key={field.key} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white group-hover:bg-gray-50/50 z-10 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400">
                                            {field.type === 'currency' ? <DollarSign className="w-4 h-4 text-emerald-600" /> :
                                                field.type === 'date' ? <Calendar className="w-4 h-4 text-blue-600" /> :
                                                    field.type === 'multiselect' ? <CheckSquare className="w-4 h-4 text-purple-600" /> :
                                                        field.type === 'number' ? <span className="font-bold text-[10px]">#</span> :
                                                            field.key === 'task_status' ? <AlertCircle className="w-4 h-4 text-amber-600" /> :
                                                                <Type className="w-4 h-4" />}
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm text-gray-700">{field.label}</div>
                                            <div className="text-[10px] text-gray-400 font-mono">{field.key}</div>
                                        </div>
                                    </td>
                                    {phases.map(phase => {
                                        const isVisible = visibilityMap[phase.id]?.has(field.key)
                                        return (
                                            <td key={`${phase.id}-${field.key}`} className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => toggleField(phase.id, field.key)}
                                                    className={cn(
                                                        "w-6 h-6 rounded border flex items-center justify-center transition-all mx-auto",
                                                        isVisible
                                                            ? "bg-indigo-600 border-indigo-600 text-white"
                                                            : "bg-white border-gray-300 text-transparent hover:border-indigo-400"
                                                    )}
                                                >
                                                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                                </button>
                                            </td>
                                        )
                                    })}
                                    <td className="px-4 py-3 text-center bg-gray-50/30">
                                        <button
                                            onClick={() => toggleRow(field.key)}
                                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                                            title="Ativar/Desativar em todas as fases"
                                        >
                                            {isRowActive ? 'Desativar Todos' : 'Ativar Todos'}
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                        {filteredFields.length === 0 && (
                            <tr>
                                <td colSpan={phases.length + 2} className="px-4 py-8 text-center text-gray-500">
                                    Nenhum campo encontrado para "{searchTerm}"
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
