import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { getFieldRegistry } from '../../lib/fieldRegistry'
import type { Database } from '../../database.types'

type Card = Database['public']['Views']['view_cards_acoes']['Row']
type Fase = 'SDR' | 'Planner' | 'Pós-venda' | 'Outro'

interface DynamicFieldRendererProps {
    card: Card
}

interface FieldSettings {
    campos_visiveis: string[]
    ordem_campos: string[]
}

export default function DynamicFieldRenderer({ card }: DynamicFieldRendererProps) {
    const [editingField, setEditingField] = useState<string | null>(null)
    const [editedData, setEditedData] = useState(card.produto_data || {})
    const queryClient = useQueryClient()

    const fase = (card.fase || 'Outro') as Fase

    // Fetch field settings for this phase (via phase_id FK, fallback to fase string)
    const { data: fieldSettings } = useQuery({
        queryKey: ['pipeline_card_settings', card.pipeline_stage_id, fase],
        queryFn: async () => {
            // Primary: resolve phase_id from stage, then query by phase_id
            if (card.pipeline_stage_id) {
                const { data: stage } = await supabase
                    .from('pipeline_stages')
                    .select('phase_id')
                    .eq('id', card.pipeline_stage_id)
                    .single()

                if (stage?.phase_id) {
                    const { data: settingsByPhaseId } = await supabase
                        .from('pipeline_card_settings')
                        .select('campos_visiveis, ordem_campos')
                        .eq('phase_id', stage.phase_id)
                        .is('usuario_id', null)
                        .single()

                    if (settingsByPhaseId) return settingsByPhaseId as unknown as FieldSettings
                }
            }

            // Fallback: query by fase string
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('pipeline_card_settings') as any)
                .select('campos_visiveis, ordem_campos')
                .eq('fase', fase)
                .is('usuario_id', null)
                .single()

            if (error) throw error
            return data as FieldSettings
        },
        enabled: fase !== 'Outro'
    })

    // Mutation to save updated produto_data
    const updateCardMutation = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: async (newProdutoData: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('cards') as any)
                .update({ produto_data: newProdutoData })
                .eq('id', card.id!)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
        }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleFieldChange = (fieldName: string, value: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setEditedData((prev: any) => ({
            ...prev,
            [fieldName]: value
        }))
    }

    const handleFieldSave = () => {
        // Save the current edited data
        updateCardMutation.mutate(editedData)
        setEditingField(null)
    }

    const handleFieldEdit = (fieldName: string) => {
        setEditingField(fieldName)
    }

    // If no field settings yet or fase is "Outro", show placeholder
    if (!fieldSettings || fase === 'Outro') {
        return (
            <div className="rounded-lg border bg-white p-4 shadow-sm">
                <h3 className="mb-4 text-lg font-medium text-gray-900">Dados do Produto ({card.produto})</h3>
                <p className="text-sm text-gray-500">
                    Configuração de campos não disponível para esta fase.
                </p>
            </div>
        )
    }

    const fieldRegistry = getFieldRegistry(card.produto as 'TRIPS' | 'WEDDING' | 'CORP')
    const visibleFields = fieldSettings.campos_visiveis || []
    const orderedFields = fieldSettings.ordem_campos || visibleFields

    return (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-4">
                <h3 className="text-lg font-medium text-gray-900">Dados do Produto ({card.produto})</h3>
                <p className="text-xs text-gray-500 mt-1">Clique em um campo para editar</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orderedFields.map((fieldName) => {
                    // Only show if in visible fields
                    if (!visibleFields.includes(fieldName)) return null

                    const fieldConfig = fieldRegistry[fieldName]
                    if (!fieldConfig) return null

                    const FieldComponent = fieldConfig.component
                    const isCurrentlyEditing = editingField === fieldName
                    const currentValue = isCurrentlyEditing
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ? (editedData as any)?.[fieldName]
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        : (card.produto_data as any)?.[fieldName]

                    return (
                        <div
                            key={fieldName}
                            className="col-span-1"
                            onClick={() => !isCurrentlyEditing && handleFieldEdit(fieldName)}
                        >
                            <FieldComponent
                                label={fieldConfig.label}
                                value={currentValue}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                onChange={isCurrentlyEditing ? (val: any) => handleFieldChange(fieldName, val) : undefined}
                                onSave={() => handleFieldSave()}
                                readOnly={!isCurrentlyEditing}
                                cardId={card.id}
                            />
                        </div>
                    )
                })}
            </div>

            {orderedFields.length === 0 && (
                <p className="text-sm text-gray-500 italic">
                    Nenhum campo configurado para esta fase.
                </p>
            )}
        </div>
    )
}
