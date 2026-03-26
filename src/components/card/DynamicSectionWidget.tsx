/**
 * DynamicSectionWidget - Production-grade section component matching ObservacoesEstruturadas patterns
 *
 * Features:
 * - Inline editing (fields are ALWAYS editable, no toggle)
 * - Dirty state tracking with "Salvar Alterações" button
 * - Data stored in cards.produto_data[section.key]
 * - Uses UniversalFieldRenderer for consistent field rendering
 * - Respects field visibility rules from stage_field_config
 * - Collapsible sections with stage-based visibility (stage_section_config)
 */

import { useState, useCallback, useMemo } from 'react'
import { Check, Loader2, Layers, ChevronDown } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useFieldConfig } from '../../hooks/useFieldConfig'
import { useSections, type Section } from '../../hooks/useSections'
import { useStageSectionConfig } from '../../hooks/useStageSectionConfig'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { useProductContext } from '../../hooks/useProductContext'
import { PRODUCT_PIPELINE_MAP } from '../../lib/constants'
import { useAuth } from '../../contexts/AuthContext'
import { useStageRequirements } from '../../hooks/useStageRequirements'
import UniversalFieldRenderer from '../fields/UniversalFieldRenderer'
import { cn } from '../../lib/utils'
import type { Database, Json } from '../../database.types'
import * as Icons from 'lucide-react'
import { ProposalsWidget } from './ProposalsWidget'
import MondeWidget from './MondeWidget'
import FinanceiroWidget from './FinanceiroWidget'
import ObservacoesEstruturadas from './ObservacoesEstruturadas'
import TripInformation from './TripInformation'
import WeddingInformation from './WeddingInformation'
import AttachmentsWidget from './attachments/AttachmentsWidget'
import FutureOpportunitySection from './FutureOpportunitySection'
import GiftsWidget from './GiftsWidget'

type Card = Database['public']['Tables']['cards']['Row']

// ═══════════════════════════════════════════════════════════
// WIDGET REGISTRY - Maps widget_component values to React components
// Widgets receive { cardId, card } — use what you need
// ═══════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WIDGET_REGISTRY: Record<string, React.ComponentType<any>> = {
    proposals: ProposalsWidget,
    monde: MondeWidget,
    financeiro: FinanceiroWidget,
    observacoes_criticas: ObservacoesEstruturadas,
    trip_info: TripInformation,
    wedding_info: WeddingInformation,
    anexos: AttachmentsWidget,
    future_opportunities: FutureOpportunitySection,
    gifts: GiftsWidget,
}

// ═══════════════════════════════════════════════════════════
// Helper: resolve lucide icon name to PascalCase
// ═══════════════════════════════════════════════════════════
function resolveIconName(iconSlug: string | undefined | null): string | null {
    if (!iconSlug) return null
    return iconSlug.charAt(0).toUpperCase() +
        iconSlug.slice(1).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

// ═══════════════════════════════════════════════════════════
// SectionCollapseToggle - chevron button to add to any widget header
// ═══════════════════════════════════════════════════════════

interface SectionCollapseToggleProps {
    isExpanded: boolean
    onToggle: () => void
}

export function SectionCollapseToggle({ isExpanded, onToggle }: SectionCollapseToggleProps) {
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title={isExpanded ? "Recolher seção" : "Expandir seção"}
        >
            <ChevronDown className="h-3.5 w-3.5" />
        </button>
    )
}

// ═══════════════════════════════════════════════════════════
// CollapsedSectionBar - compact bar shown when a widget section is collapsed
// ═══════════════════════════════════════════════════════════

interface CollapsedSectionBarProps {
    section: Section
    onExpand: () => void
}

function CollapsedSectionBar({ section, onExpand }: CollapsedSectionBarProps) {
    const iconName = resolveIconName(section.icon)
    const colorClasses = section.color || 'bg-slate-50 text-slate-700 border-slate-100'
    const [bgClass, textClass] = colorClasses.split(' ')
    const iconBgClass = bgClass.replace('-50', '-100')

    return (
        <button
            type="button"
            onClick={onExpand}
            className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-50/50 border border-gray-300 rounded-xl transition-colors hover:bg-gray-100/80"
        >
            <div className="flex items-center gap-2">
                <div className={cn("p-1 rounded-lg", iconBgClass)}>
                    {(() => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const Icon = (iconName ? (Icons as any)[iconName] : null) || Layers
                        return <Icon className={cn("h-3.5 w-3.5", textClass)} />
                    })()}
                </div>
                <span className="text-xs font-semibold text-gray-900">
                    {section.label}
                </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
    )
}

// ═══════════════════════════════════════════════════════════
// DynamicSectionWidget - field-based sections with inline editing
// ═══════════════════════════════════════════════════════════

interface DynamicSectionWidgetProps {
    card: Card
    sectionKey: string
    /** Class to apply to the wrapper */
    className?: string
}

/**
 * DynamicSectionWidget - Renders any section dynamically with inline editing
 * Matches the exact UX of ObservacoesEstruturadas
 */
export default function DynamicSectionWidget({
    card,
    sectionKey,
    className,
}: DynamicSectionWidgetProps) {
    const queryClient = useQueryClient()
    const [isExpanded, setIsExpanded] = useState(true)
    const [hasInitCollapse, setHasInitCollapse] = useState(false)

    // Data Sources - Unified data from both produto_data and marketing_data
    // Priority: produto_data (manual edits) > marketing_data (integration data)
    const productData = useMemo(() => {
        if (typeof card.produto_data === 'string') {
            try {
                return JSON.parse(card.produto_data)
            } catch (e) {
                console.error('Failed to parse produto_data', e)
                return {}
            }
        }
        return (card.produto_data as Record<string, Json>) || {}
    }, [card.produto_data])

    const marketingData = useMemo(() => {
        if (typeof card.marketing_data === 'string') {
            try {
                return JSON.parse(card.marketing_data)
            } catch (e) {
                console.error('Failed to parse marketing_data', e)
                return {}
            }
        }
        return (card.marketing_data as Record<string, Json>) || {}
    }, [card.marketing_data])

    // State
    const [editedData, setEditedData] = useState<Record<string, Json>>({})
    const [lastSavedData, setLastSavedData] = useState<Record<string, Json>>({})
    const [isDirty, setIsDirty] = useState(false)

    // Fetch section metadata
    const { data: sections = [], isLoading: loadingSections } = useSections()
    const section = useMemo(() => sections.find(s => s.key === sectionKey), [sections, sectionKey])

    // Apply default_collapsed on first load
    if (section && !hasInitCollapse) {
        setHasInitCollapse(true)
        if (section.default_collapsed) setIsExpanded(false)
    }

    // Fetch field configuration
    const { getVisibleFields, isLoading: loadingFields } = useFieldConfig()

    // Stage requirements for field blocking indicators
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { missingBlocking } = useStageRequirements(card as any)
    const isFieldBlocking = useCallback((fieldKey: string) => {
        return missingBlocking.some(req =>
            req.requirement_type === 'field' && 'field_key' in req && req.field_key === fieldKey
        )
    }, [missingBlocking])

    // Get visible fields for this section at the current stage
    const fields = useMemo(() => {
        if (!card.pipeline_stage_id) return []
        return getVisibleFields(card.pipeline_stage_id, sectionKey)
    }, [card.pipeline_stage_id, sectionKey, getVisibleFields])

    // Get current data for this section's fields from produto_data AND marketing_data
    // Priority: produto_data (user edits) > marketing_data (from integrations)
    const sectionData = useMemo(() => {
        const data: Record<string, Json> = {}
        fields.forEach(field => {
            // First check produto_data (user edits), then fall back to marketing_data
            if (productData[field.key] !== undefined && productData[field.key] !== null && productData[field.key] !== '') {
                data[field.key] = productData[field.key]
            } else if (marketingData[field.key] !== undefined && marketingData[field.key] !== null) {
                data[field.key] = marketingData[field.key]
            } else {
                data[field.key] = productData[field.key]
            }
        })
        return data
    }, [productData, marketingData, fields])

    // Sync local state when sectionData changes (render-time pattern per React docs)
    const [prevSectionDataStr, setPrevSectionDataStr] = useState('')
    const sectionDataStr = JSON.stringify(sectionData)
    if (prevSectionDataStr !== sectionDataStr) {
        setPrevSectionDataStr(sectionDataStr)
        setEditedData(sectionData)
        setLastSavedData(sectionData)
        setIsDirty(false)
    }

    // Mutation to save changes - writes to TOP level of produto_data
    const updateCard = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: async (newData: Record<string, any>) => {
            const { error } = await supabase
                .from('cards')
                .update({
                    produto_data: {
                        ...productData,
                        ...newData // Merge fields at top level
                    }
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
        try {
            await updateCard.mutateAsync(editedData)
        } catch (error) {
            console.error('Failed to save section:', error)
        }
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

    // Get dynamic icon name for lookup
    const iconName = resolveIconName(section?.icon)

    // Loading state
    if (loadingFields || loadingSections) {
        return (
            <div className="rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-gray-200 bg-gray-50/50 px-3 py-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                </div>
                <div className="p-2 space-y-1.5">
                    <div className="h-8 bg-gray-100 rounded animate-pulse"></div>
                    <div className="h-8 bg-gray-100 rounded animate-pulse"></div>
                </div>
            </div>
        )
    }

    // No fields visible for this section
    if (fields.length === 0) {
        return null
    }

    // Parse section color classes
    const colorClasses = section?.color || 'bg-slate-50 text-slate-700 border-slate-100'
    const [bgClass, textClass] = colorClasses.split(' ')
    const iconBgClass = bgClass.replace('-50', '-100')

    return (
        <div className={cn(
            "rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden",
            className
        )}>
            {/* Header — clickable to collapse/expand */}
            <button
                type="button"
                onClick={() => setIsExpanded(prev => !prev)}
                className="w-full border-b border-gray-200 bg-gray-50/50 px-3 py-1.5 cursor-pointer hover:bg-gray-100/80 transition-colors"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={cn("p-1 rounded-lg", iconBgClass)}>
                            {(() => {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const Icon = (iconName ? (Icons as any)[iconName] : null) || Layers
                                return <Icon className={cn("h-3.5 w-3.5", textClass)} />
                            })()}
                        </div>
                        <h3 className="text-xs font-semibold text-gray-900">
                            {section?.label || sectionKey}
                        </h3>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Save Button */}
                        {updateCard.isPending ? (
                            <div className="flex items-center gap-1.5 text-xs text-gray-500" onClick={e => e.stopPropagation()}>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Salvando...
                            </div>
                        ) : isDirty ? (
                            <div
                                role="button"
                                onClick={(e) => { e.stopPropagation(); handleSave() }}
                                className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
                            >
                                <Check className="h-3 w-3" />
                                Salvar
                            </div>
                        ) : updateCard.isSuccess ? (
                            <div className="flex items-center gap-1 text-xs text-green-600">
                                <Check className="h-3 w-3" />
                                Salvo
                            </div>
                        ) : null}

                        {/* Collapse chevron */}
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                </div>
            </button>

            {/* Content — only visible when expanded */}
            {isExpanded && (
                <div className="p-2" onKeyDown={handleKeyDown}>
                    <div className="space-y-1.5">
                        {fields.map((field) => {
                            const blocking = isFieldBlocking(field.key)
                            return (
                            <div key={field.key}>
                                <label className={cn(
                                    "flex items-center gap-1 text-[11px] font-medium mb-0.5",
                                    blocking ? "text-red-700" : "text-gray-700"
                                )}>
                                    <div className={cn(
                                        "w-1 h-1 rounded-full",
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
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// CollapsibleWidgetSection - Manages collapse state for widget-based sections
// When collapsed: shows CollapsedSectionBar
// When expanded: renders widget with isExpanded + onToggleCollapse props
// ═══════════════════════════════════════════════════════════

interface CollapsibleWidgetSectionProps {
    section: Section
    card: Card
    /** When set, forwarded to widget as lockedPhaseSlug (used by TripInformation) */
    lockedPhaseSlug?: string
}

function CollapsibleWidgetSection({ section, card, lockedPhaseSlug }: CollapsibleWidgetSectionProps) {
    const [isExpanded, setIsExpanded] = useState(!section.default_collapsed)
    const onToggleCollapse = useCallback(() => setIsExpanded(prev => !prev), [])

    if (!isExpanded) {
        return <CollapsedSectionBar section={section} onExpand={() => setIsExpanded(true)} />
    }

    const WidgetComponent = WIDGET_REGISTRY[section.widget_component!]
    return (
        <WidgetComponent
            cardId={card.id}
            card={card}
            isExpanded={isExpanded}
            onToggleCollapse={onToggleCollapse}
            lockedPhaseSlug={lockedPhaseSlug}
        />
    )
}

// ═══════════════════════════════════════════════════════════
// DynamicSectionsList - Renders all sections for a position
// ═══════════════════════════════════════════════════════════

interface DynamicSectionsListProps {
    card: Card
    position: 'left_column' | 'right_column'
    /** Section keys to exclude (e.g., system sections with dedicated components) */
    excludeKeys?: string[]
}

export function DynamicSectionsList({ card, position, excludeKeys = [] }: DynamicSectionsListProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const produto = (card as any).produto as string | undefined
    const productKey = produto || 'TRIPS'
    const { data: sections = [], isLoading } = useSections(productKey)

    const { profile } = useAuth()
    const isAdmin = profile?.is_admin === true

    // Stage-based section visibility
    const { isSectionVisible } = useStageSectionConfig()
    const stageId = card.pipeline_stage_id

    // Pipeline phases — used to expand trip_info into per-phase sections
    const { currentProduct } = useProductContext()
    const pipelineId = PRODUCT_PIPELINE_MAP[currentProduct]
    const { data: pipelinePhases } = usePipelinePhases(pipelineId)

    const visiblePhases = useMemo(() => {
        return (pipelinePhases || []).filter(p => p.active && p.visible_in_card !== false)
    }, [pipelinePhases])

    const positionedSections = useMemo(() => {
        return sections
            .filter(s => s.position === position)
            .filter(s => !excludeKeys.includes(s.key))
            // Render widget-based sections OR non-system custom sections
            .filter(s => s.widget_component || !s.is_system)
            // Hide sections based on card's pipeline stage (admins see all)
            .filter(s => {
                if (isAdmin) return true
                return isSectionVisible(stageId, s.key)
            })
    }, [sections, position, excludeKeys, isAdmin, stageId, isSectionVisible])

    if (isLoading) {
        return (
            <div className="animate-pulse">
                <div className="h-32 bg-gray-100 rounded-xl"></div>
            </div>
        )
    }

    if (positionedSections.length === 0) {
        return null
    }

    return (
        <>
            {positionedSections.map(section => {
                // Widget-based sections
                if (section.widget_component && WIDGET_REGISTRY[section.widget_component]) {

                    // trip_info → expand into one section per visible phase
                    if (section.widget_component === 'trip_info' && visiblePhases.length > 0) {
                        return visiblePhases.map(phase => (
                            <CollapsibleWidgetSection
                                key={`${section.key}_${phase.slug}`}
                                section={{ ...section, label: `Informações Viagem — ${phase.label || phase.name}` }}
                                card={card}
                                lockedPhaseSlug={phase.slug!}
                            />
                        ))
                    }

                    return (
                        <CollapsibleWidgetSection
                            key={section.key}
                            section={section}
                            card={card}
                        />
                    )
                }

                // Field-based sections
                return (
                    <DynamicSectionWidget
                        key={section.key}
                        card={card}
                        sectionKey={section.key}
                    />
                )
            })}
        </>
    )
}
