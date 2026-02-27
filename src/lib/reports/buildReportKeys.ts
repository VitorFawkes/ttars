import type { ReportIQR } from './reportTypes'
import { getFieldByKey, getComputedMeasuresForSource } from './fieldRegistry'

const AGG_LABELS: Record<string, string> = {
    count: 'Qtd',
    count_distinct: 'Distintos',
    sum: 'Soma',
    avg: 'Média',
    min: 'Mín',
    max: 'Máx',
}

/**
 * Builds the data keys, display labels, and drill-down field mapping
 * that match the RPC output aliases (dim_0, mea_0, breakdown, etc.)
 */
export function buildReportKeys(config: ReportIQR) {
    const dimensionKeys = config.dimensions.map((d, i) => d.alias ?? `dim_${i}`)
    const measureKeys = [
        ...config.measures.map((m, i) => m.alias ?? `mea_${i}`),
        ...(config.computedMeasures ?? []).map(cm => cm.alias ?? cm.key),
    ]

    // Labels: data key → human-readable label
    const labels: Record<string, string> = {}

    config.dimensions.forEach((d, i) => {
        const key = d.alias ?? `dim_${i}`
        const fieldDef = getFieldByKey(config.source, d.field)
        labels[key] = fieldDef?.label ?? d.field
    })

    config.measures.forEach((m, i) => {
        const key = m.alias ?? `mea_${i}`
        const fieldDef = getFieldByKey(config.source, m.field)
        if (m.aggregation === 'count' || m.aggregation === 'count_distinct') {
            labels[key] = fieldDef?.label ?? m.field
        } else {
            const aggLabel = AGG_LABELS[m.aggregation] ?? m.aggregation.toUpperCase()
            labels[key] = fieldDef ? `${aggLabel} ${fieldDef.label}` : `${aggLabel} ${m.field}`
        }
    })

    const computedDefs = getComputedMeasuresForSource(config.source)
    ;(config.computedMeasures ?? []).forEach(cm => {
        const key = cm.alias ?? cm.key
        const def = computedDefs.find(d => d.key === cm.key)
        labels[key] = def?.label ?? cm.key
    })

    if (config.breakdownBy) {
        const bKey = config.breakdownBy.alias ?? 'breakdown'
        const bDef = getFieldByKey(config.source, config.breakdownBy.field)
        labels[bKey] = bDef?.label ?? config.breakdownBy.field
    }

    // Drill-down field map: dim_0 → actual field name (for RPC drill-down)
    const drillFieldMap: Record<string, string> = {}
    config.dimensions.forEach((d, i) => {
        drillFieldMap[d.alias ?? `dim_${i}`] = d.field
    })
    if (config.breakdownBy) {
        drillFieldMap[config.breakdownBy.alias ?? 'breakdown'] = config.breakdownBy.field
    }

    // Per-key format overrides (for KPI/composed where measures have mixed formats)
    const keyFormats: Record<string, 'number' | 'currency' | 'percent'> = {}

    config.measures.forEach((m, i) => {
        const key = m.alias ?? `mea_${i}`
        const fieldDef = getFieldByKey(config.source, m.field)
        if (fieldDef) {
            const isCurrency = fieldDef.category === 'Financeiro' || fieldDef.category === 'Histórico'
            if (isCurrency && ['sum', 'avg', 'min', 'max'].includes(m.aggregation)) {
                keyFormats[key] = 'currency'
            } else {
                keyFormats[key] = 'number'
            }
        }
    })

    ;(config.computedMeasures ?? []).forEach(cm => {
        const key = cm.alias ?? cm.key
        const def = computedDefs.find(d => d.key === cm.key)
        if (def?.format) {
            keyFormats[key] = def.format
        }
    })

    // Extract dateGrouping from the first date dimension (for formatDateAxis)
    const dateDim = config.dimensions.find(d => d.dateGrouping)
    const dateGrouping = dateDim?.dateGrouping

    // Breakdown key (if breakdownBy is set)
    const breakdownKey = config.breakdownBy
        ? (config.breakdownBy.alias ?? 'breakdown')
        : null

    return { dimensionKeys, measureKeys, labels, drillFieldMap, keyFormats, dateGrouping, breakdownKey }
}

/**
 * Maps drill-down filters from data keys (dim_0) to actual field names (ps.nome)
 * for the report_drill_down RPC.
 */
export function mapDrillFilters(
    filters: Record<string, unknown>,
    drillFieldMap: Record<string, string>,
): Record<string, unknown> {
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(filters)) {
        const actualField = drillFieldMap[key]
        if (actualField) {
            mapped[actualField] = value
        } else {
            mapped[key] = value
        }
    }
    return mapped
}
