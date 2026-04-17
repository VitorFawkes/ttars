/**
 * WeddingInformation - Widget for wedding_info section
 *
 * Displays key wedding details (date, destination, type, budget, guests, partner name)
 * with inline editing. Follows DynamicSectionWidget patterns but with a custom header.
 * Data stored in cards.produto_data (JSONB, flat keys like ww_data_casamento).
 */

import { useState, useCallback, useMemo } from 'react'
import { Heart, Check, Loader2 } from 'lucide-react'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useFieldConfig } from '../../hooks/useFieldConfig'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { useStageRequirements } from '../../hooks/useStageRequirements'
import UniversalFieldRenderer from '../fields/UniversalFieldRenderer'
import { cn } from '../../lib/utils'
import type { Json } from '../../database.types'

interface WeddingInformationProps {
    cardId: string
    card: {
        id: string
        pipeline_stage_id?: string | null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        produto_data?: any
        [key: string]: unknown
    }
    /** Collapse support — passed by CollapsibleWidgetSection */
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

export default function WeddingInformation({ card, isExpanded: _isExpanded, onToggleCollapse }: WeddingInformationProps) {
    const queryClient = useQueryClient()

    const productData = useMemo(() => {
        if (typeof card.produto_data === 'string') {
            try { return JSON.parse(card.produto_data) }
            catch { return {} }
        }
        return (card.produto_data as Record<string, Json>) || {}
    }, [card.produto_data])

    const [editedData, setEditedData] = useState<Record<string, Json>>({})
    const [lastSavedData, setLastSavedData] = useState<Record<string, Json>>({})
    const [isDirty, setIsDirty] = useState(false)

    const { pipelineId } = useCurrentProductMeta()
    const { getVisibleFields, isLoading: loadingFields } = useFieldConfig(pipelineId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { missingBlocking } = useStageRequirements(card as any)

    const isFieldBlocking = useCallback((fieldKey: string) => {
        return missingBlocking.some(req =>
            req.requirement_type === 'field' && 'field_key' in req && req.field_key === fieldKey
        )
    }, [missingBlocking])

    const fields = useMemo(() => {
        if (!card.pipeline_stage_id) return []
        return getVisibleFields(card.pipeline_stage_id, 'wedding_info')
    }, [card.pipeline_stage_id, getVisibleFields])

    const sectionData = useMemo(() => {
        const data: Record<string, Json> = {}
        fields.forEach(field => {
            data[field.key] = productData[field.key] ?? null
        })
        return data
    }, [productData, fields])

    // Sync local state when sectionData changes
    const [prevDataStr, setPrevDataStr] = useState('')
    const dataStr = JSON.stringify(sectionData)
    if (prevDataStr !== dataStr) {
        setPrevDataStr(dataStr)
        setEditedData(sectionData)
        setLastSavedData(sectionData)
        setIsDirty(false)
    }

    const updateCard = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: async (newData: Record<string, any>) => {
            const { error } = await supabase
                .from('cards')
                .update({
                    produto_data: { ...productData, ...newData }
                })
                .eq('id', card.id!)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card', card.id] })
            queryClient.invalidateQueries({ queryKey: ['card-detail', card.id] })
            setLastSavedData(editedData)
            setIsDirty(false)
        }
    })

    const handleSave = async () => {
        if (!isDirty) return
        try { await updateCard.mutateAsync(editedData) }
        catch (error) { console.error('Failed to save wedding info:', error) }
    }

    const handleChange = useCallback((key: string, value: Json) => {
        setEditedData(prev => {
            const next = { ...prev, [key]: value }
            setIsDirty(JSON.stringify(next) !== JSON.stringify(lastSavedData))
            return next
        })
    }, [lastSavedData])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
            handleSave()
        }
    }

    if (loadingFields) {
        return (
            <div className="rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-gray-200 bg-gray-50/50 px-4 py-3">
                    <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse" />
                </div>
                <div className="p-4 space-y-4">
                    <div className="h-10 bg-gray-100 rounded animate-pulse" />
                    <div className="h-10 bg-gray-100 rounded animate-pulse" />
                </div>
            </div>
        )
    }

    if (fields.length === 0) return null

    return (
        <div className="rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden">
            {/* Header — clickable to collapse/expand */}
            <div
                className={cn("border-b border-gray-200 bg-gray-50/50 px-4 py-3", onToggleCollapse && "cursor-pointer hover:bg-gray-100/50 transition-colors")}
                onClick={onToggleCollapse}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-rose-100">
                            <Heart className="h-4 w-4 text-rose-700" />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900">
                            Informações do Casamento
                        </h3>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        {updateCard.isPending ? (
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Salvando...
                            </div>
                        ) : isDirty ? (
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
                            >
                                <Check className="h-3 w-3" />
                                Salvar Alterações
                            </button>
                        ) : updateCard.isSuccess ? (
                            <div className="flex items-center gap-1.5 text-xs text-green-600">
                                <Check className="h-3 w-3" />
                                Salvo
                            </div>
                        ) : null}
                        {onToggleCollapse && (
                            <SectionCollapseToggle isExpanded={_isExpanded ?? true} onToggle={onToggleCollapse} />
                        )}
                    </div>
                </div>
            </div>

            {/* Fields */}
            <div className="p-4" onKeyDown={handleKeyDown}>
                <div className="space-y-4">
                    {fields.map(field => {
                        const blocking = isFieldBlocking(field.key)
                        return (
                            <div key={field.key}>
                                <label className={cn(
                                    "flex items-center gap-1.5 text-xs font-medium mb-2",
                                    blocking ? "text-red-700" : "text-gray-700"
                                )}>
                                    <div className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        blocking ? "bg-red-500" : "bg-gray-400"
                                    )} />
                                    {field.label}
                                    {blocking && (
                                        <span className="text-[10px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded-full">
                                            Obrigatório
                                        </span>
                                    )}
                                </label>
                                <UniversalFieldRenderer
                                    field={{
                                        key: field.key,
                                        label: field.label,
                                        type: field.type,
                                        options: field.options
                                    }}
                                    value={editedData[field.key]}
                                    mode="edit"
                                    onChange={(val) => handleChange(field.key, val)}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
