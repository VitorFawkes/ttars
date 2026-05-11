import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { Loader2, Eye, EyeOff, CheckSquare, Square, LayoutTemplate } from 'lucide-react'
import { useCurrentProductMeta } from '../../../hooks/useCurrentProductMeta'
import { useProductContext } from '../../../hooks/useProductContext'
import { useSections } from '../../../hooks/useSections'
import type { Database } from '../../../database.types'

type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']
type SystemField = Database['public']['Tables']['system_fields']['Row']
type StageFieldConfig = Database['public']['Tables']['stage_field_config']['Row']

export default function StudioLayout() {
    const queryClient = useQueryClient()
    const { pipelineId } = useCurrentProductMeta()
    const { currentProduct } = useProductContext()
    const { data: productSections = [] } = useSections(currentProduct)

    // Fetch Data — filtrado pelo pipeline do produto atual
    const { data: stages, isLoading: loadingStages } = useQuery({
        queryKey: ['pipeline-stages-layout', pipelineId],
        queryFn: async () => {
            let q = supabase.from('pipeline_stages').select('*, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)').order('ordem')
            if (pipelineId) q = q.eq('pipeline_id', pipelineId)
            const { data } = await q
            // Sort by phase order_index then stage ordem
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sorted = (data || []).sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            })
            return sorted as PipelineStage[]
        }
    })

    const { data: allFields, isLoading: loadingFields } = useQuery({
        queryKey: ['system-fields-layout'],
        queryFn: async () => {
            const { data } = await supabase.from('system_fields').select('*').eq('active', true).order('section').order('label')
            return data as SystemField[]
        }
    })

    // Filtrar campos pelas seções do produto atual
    const fields = useMemo(() => {
        if (!allFields) return undefined
        const sectionKeys = new Set(productSections.map(s => s.key))
        return allFields.filter(f => !f.section || sectionKeys.has(f.section))
    }, [allFields, productSections])

    const { data: configs, isLoading: loadingConfigs } = useQuery({
        queryKey: ['stage-field-configs'],
        queryFn: async () => {
            const { data } = await supabase.from('stage_field_config').select('*')
            return data as StageFieldConfig[]
        }
    })

    // Mutation
    const upsertConfigMutation = useMutation({
        mutationFn: async (newConfig: Partial<StageFieldConfig>) => {
            const { error } = await supabase
                .from('stage_field_config')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Partial config typing
                .upsert(newConfig as Record<string, unknown>, { onConflict: 'stage_id, field_key' } as any)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stage-field-configs'] })
        }
    })

    // Helper to get current config
    const getConfig = (stageId: string, fieldKey: string) => {
        return configs?.find(c => c.stage_id === stageId && c.field_key === fieldKey)
    }

    const handleToggle = async (stageId: string, fieldKey: string, type: 'visible' | 'required' | 'header') => {
        const current = getConfig(stageId, fieldKey)
        const updates: Record<string, unknown> = {
            stage_id: stageId,
            field_key: fieldKey,
            // Default values if record doesn't exist
            is_visible: current?.is_visible ?? true,
            is_required: current?.is_required ?? false,
            show_in_header: current?.show_in_header ?? false
        }

        if (type === 'visible') updates.is_visible = !updates.is_visible
        if (type === 'required') updates.is_required = !updates.is_required
        if (type === 'header') updates.show_in_header = !updates.show_in_header

        // Optimistic update logic could go here, but for now we rely on react-query invalidation
        await upsertConfigMutation.mutateAsync(updates)
    }

    // Group fields by section
    const fieldsBySection = useMemo(() => {
        if (!fields) return {}
        return fields.reduce((acc, field) => {
            const section = field.section || 'outros'
            if (!acc[section]) acc[section] = []
            acc[section].push(field)
            return acc
        }, {} as Record<string, SystemField[]>)
    }, [fields])

    if (loadingStages || loadingFields || loadingConfigs) return <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" /></div>

    return (
        <div className="p-6 overflow-x-auto">
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Matriz de Configuração</h2>
                <p className="text-sm text-gray-500">Defina a visibilidade e obrigatoriedade de cada campo por etapa.</p>
            </div>

            <div className="inline-block min-w-full align-middle">
                <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 w-64 border-r">
                                    Campo / Etapa
                                </th>
                                {stages?.map(stage => (
                                    <th key={stage.id} className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="font-bold text-gray-900">{stage.nome}</span>
                                            <span className="text-[10px] bg-gray-200 px-1.5 rounded text-gray-600">{stage.fase}</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {Object.entries(fieldsBySection).map(([section, sectionFields]) => (
                                <>
                                    <tr key={`section-${section}`} className="bg-gray-100">
                                        <td colSpan={(stages?.length || 0) + 1} className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider sticky left-0 bg-gray-100 z-10">
                                            {section === 'header' ? 'Cabeçalho (Resumo)' :
                                                section === 'trip_info' ? 'Detalhes da Viagem' :
                                                    section === 'people' ? 'Pessoas' :
                                                        section === 'system' ? 'Sistema' : section}
                                        </td>
                                    </tr>
                                    {sectionFields.map(field => (
                                        <tr key={field.key} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-900 font-medium sticky left-0 bg-white z-10 border-r flex flex-col">
                                                <span>{field.label}</span>
                                                <span className="text-xs text-gray-400 font-normal">{field.key}</span>
                                            </td>
                                            {stages?.map(stage => {
                                                const config = getConfig(stage.id, field.key)
                                                const isVisible = config?.is_visible ?? true // Default true
                                                const isRequired = config?.is_required ?? false
                                                const isHeader = config?.show_in_header ?? false

                                                return (
                                                    <td key={`${stage.id}-${field.key}`} className="px-2 py-3 text-center border-l border-dashed border-gray-100">
                                                        <div className="flex justify-center gap-2">
                                                            {/* Visibility Toggle */}
                                                            <button
                                                                onClick={() => handleToggle(stage.id, field.key, 'visible')}
                                                                className={`p-1 rounded hover:bg-gray-100 transition-colors ${isVisible ? 'text-blue-600' : 'text-gray-300'}`}
                                                                title={isVisible ? "Visível" : "Oculto"}
                                                            >
                                                                {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                            </button>

                                                            {/* Required Toggle */}
                                                            <button
                                                                onClick={() => handleToggle(stage.id, field.key, 'required')}
                                                                className={`p-1 rounded hover:bg-gray-100 transition-colors ${isRequired ? 'text-red-600' : 'text-gray-300'}`}
                                                                title={isRequired ? "Obrigatório" : "Opcional"}
                                                            >
                                                                {isRequired ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                                            </button>

                                                            {/* Header Toggle */}
                                                            <button
                                                                onClick={() => handleToggle(stage.id, field.key, 'header')}
                                                                className={`p-1 rounded hover:bg-gray-100 transition-colors ${isHeader ? 'text-purple-600' : 'text-gray-300'}`}
                                                                title={isHeader ? "No Cabeçalho" : "Fora do Cabeçalho"}
                                                            >
                                                                <LayoutTemplate className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
