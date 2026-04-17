import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useFieldConfig } from '../useFieldConfig'
import type { Database } from '../../database.types'

type ViewCard = Database['public']['Views']['view_cards_acoes']['Row']

// ── Types ──────────────────────────────────────────────────────────────

export interface SelectableField {
    key: string
    label: string
    type: string
    section: string
}

export interface SelectableSection {
    key: string
    label: string
    fields: SelectableField[]
}

export interface CardCompleteness {
    card: ViewCard
    filled: Record<string, boolean>
    /** Raw values for date fields (ISO string or null) — used for display & sort */
    values: Record<string, string | null>
}

const DATE_TYPES = new Set(['date', 'date_range', 'flexible_date'])

// ── Extra columns (not system_fields) ──────────────────────────────────

export const EXTRA_COLUMNS = [
    { key: '_pos_venda', label: 'Dono Pós-Venda', section: '_extras' },
    { key: '_planner', label: 'Dono Planejamento', section: '_extras' },
    { key: '_sdr', label: 'Dono SDR', section: '_extras' },
    { key: '_produtos', label: 'Produtos', section: '_extras' },
] as const

export type ExtraColumnKey = typeof EXTRA_COLUMNS[number]['key']

// ── Field value check (same logic as useQualityGate) ───────────────────

function isFieldFilled(card: ViewCard, fieldKey: string): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = card as any

    // 1. Direct card column
    let value = c[fieldKey]

    // 2. Fallback: produto_data JSONB
    if (value === null || value === undefined) {
        const pd = c.produto_data as Record<string, unknown> | null
        if (pd) value = pd[fieldKey]
    }

    // 3. Fallback: briefing_inicial JSONB
    if (value === null || value === undefined) {
        const bi = c.briefing_inicial as Record<string, unknown> | null
        if (bi) value = bi[fieldKey]
    }

    if (value === null || value === undefined) return false
    if (value === '') return false
    if (value === '[]') return false
    if (Array.isArray(value) && value.length === 0) return false
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0) return false

    return true
}

function getFieldRawValue(card: ViewCard, fieldKey: string): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = card as any
    let value = c[fieldKey]
    if (value === null || value === undefined) {
        const pd = c.produto_data as Record<string, unknown> | null
        if (pd) value = pd[fieldKey]
    }
    if (value === null || value === undefined) {
        const bi = c.briefing_inicial as Record<string, unknown> | null
        if (bi) value = bi[fieldKey]
    }
    return value ?? null
}

/** Extract a sortable date string from various date field formats */
function extractDateString(raw: unknown): string | null {
    if (!raw) return null
    if (typeof raw === 'string') {
        // ISO date or date-time
        if (raw.length >= 10) return raw.slice(0, 10)
        return raw
    }
    if (typeof raw === 'object' && raw !== null) {
        // date_range: { from: "2026-01-01", to: "2026-01-15" } or { inicio: ..., fim: ... }
        const obj = raw as Record<string, unknown>
        const start = obj.from ?? obj.inicio ?? obj.start ?? obj.data_inicio
        if (typeof start === 'string' && start.length >= 10) return start.slice(0, 10)
        // Fallback: take any string value that looks like a date
        for (const v of Object.values(obj)) {
            if (typeof v === 'string' && /^\d{4}-\d{2}/.test(v)) return v.slice(0, 10)
        }
    }
    return null
}

function isExtraFilled(card: ViewCard, extraKey: ExtraColumnKey): boolean {
    switch (extraKey) {
        case '_pos_venda': return !!card.pos_owner_id
        case '_planner': return !!card.vendas_owner_id
        case '_sdr': return !!card.sdr_owner_id
        case '_produtos': return (card.prods_total ?? 0) > 0
        default: return false
    }
}

// ── Hook ───────────────────────────────────────────────────────────────

interface UseFieldCompletenessParams {
    stageIds: string[]
    selectedFieldKeys: string[]
    selectedExtraKeys: ExtraColumnKey[]
    productFilter: string
    pipelineId?: string
}

export function useFieldCompleteness({
    stageIds,
    selectedFieldKeys,
    selectedExtraKeys,
    productFilter,
    pipelineId,
}: UseFieldCompletenessParams) {
    const { systemFields, stageConfigs, sectionFieldConfigs, isLoading: configLoading } = useFieldConfig(pipelineId)

    // Fetch sections for grouping labels
    const { data: sections } = useQuery({
        queryKey: ['sections-for-completeness'],
        queryFn: async () => {
            const { data } = await supabase
                .from('sections')
                .select('key, label')
                .eq('active', true)
                .order('order_index')
            return data ?? []
        },
        staleTime: 1000 * 60 * 10,
    })

    // Build list of selectable fields (visible in at least 1 stage)
    const selectableFields = useMemo<SelectableSection[]>(() => {
        if (!systemFields || !stageConfigs) return []

        const sectionMap = new Map(sections?.map(s => [s.key, s.label]) ?? [])

        // Find fields visible in at least 1 stage
        const visibleFieldKeys = new Set<string>()
        for (const sc of stageConfigs) {
            if (sc.is_visible && sc.field_key) {
                visibleFieldKeys.add(sc.field_key)
            }
        }
        // Also include fields with section-level visibility defaults
        // BUT only when no pipeline filter — section defaults are global and would leak cross-pipeline fields
        if (!pipelineId && sectionFieldConfigs) {
            for (const sfc of sectionFieldConfigs) {
                if (sfc.is_visible) {
                    visibleFieldKeys.add(sfc.field_key)
                }
            }
        }

        const fieldsBySec = new Map<string, SelectableField[]>()

        for (const sf of systemFields) {
            if (!visibleFieldKeys.has(sf.key)) continue
            const sec = sf.section || 'details'
            const arr = fieldsBySec.get(sec) || []
            arr.push({
                key: sf.key,
                label: sf.label,
                type: sf.type,
                section: sec,
            })
            fieldsBySec.set(sec, arr)
        }

        const result: SelectableSection[] = []
        for (const [key, fields] of fieldsBySec) {
            result.push({
                key,
                label: sectionMap.get(key) || key,
                fields,
            })
        }

        // Add extras section
        result.push({
            key: '_extras',
            label: 'Donos & Produtos',
            fields: EXTRA_COLUMNS.map(ec => ({
                key: ec.key,
                label: ec.label,
                type: 'extra',
                section: '_extras',
            })),
        })

        return result
    }, [systemFields, stageConfigs, sectionFieldConfigs, sections])

    // Fetch cards for selected stages
    const { data: cards, isLoading: cardsLoading } = useQuery({
        queryKey: ['completeness-cards', stageIds, productFilter],
        enabled: stageIds.length > 0,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const query = (supabase.from('view_cards_acoes') as any)
                .select('*')
                .eq('produto', productFilter)
                .in('pipeline_stage_id', stageIds)
                .is('archived_at', null)
                .in('status_comercial', ['aberto', 'ganho'])
                .order('titulo')
                .limit(2000)

            const { data, error } = await query
            if (error) throw error
            return data as ViewCard[]
        },
        staleTime: 1000 * 60 * 2,
    })

    // Build field type map for rendering decisions
    const fieldTypeMap = useMemo(() => {
        const map = new Map<string, string>()
        if (!systemFields) return map
        for (const sf of systemFields) {
            map.set(sf.key, sf.type)
        }
        return map
    }, [systemFields])

    // Compute completeness per card
    const rows = useMemo<CardCompleteness[]>(() => {
        if (!cards) return []

        return cards.map(card => {
            const filled: Record<string, boolean> = {}
            const values: Record<string, string | null> = {}

            for (const fk of selectedFieldKeys) {
                filled[fk] = isFieldFilled(card, fk)
                // Extract display value for date fields
                const fieldType = fieldTypeMap.get(fk)
                if (fieldType && DATE_TYPES.has(fieldType)) {
                    const raw = getFieldRawValue(card, fk)
                    values[fk] = extractDateString(raw)
                }
            }

            for (const ek of selectedExtraKeys) {
                filled[ek] = isExtraFilled(card, ek)
            }

            return { card, filled, values }
        })
    }, [cards, selectedFieldKeys, selectedExtraKeys, fieldTypeMap])

    return {
        selectableFields,
        rows,
        fieldTypeMap,
        totalCards: cards?.length ?? 0,
        isLoading: configLoading || cardsLoading,
    }
}
