import type { VizType, VisualizationConfig } from './reportTypes'

export const CHART_COLORS = [
    '#6366f1', '#22c55e', '#f97316', '#06b6d4', '#ec4899',
    '#eab308', '#8b5cf6', '#f43f5e', '#14b8a6', '#a855f7',
]

export const WARM_COLORS = [
    '#f43f5e', '#f97316', '#eab308', '#ec4899', '#d946ef',
    '#a855f7', '#8b5cf6', '#6366f1', '#06b6d4', '#22c55e',
]

export const COOL_COLORS = [
    '#06b6d4', '#22c55e', '#6366f1', '#8b5cf6', '#a855f7',
    '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308',
]

export const MONOCHROME_COLORS = [
    '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8',
    '#475569', '#334155', '#1e293b', '#64748b', '#94a3b8',
]

export function getColorScheme(scheme: string | undefined): string[] {
    switch (scheme) {
        case 'warm': return WARM_COLORS
        case 'cool': return COOL_COLORS
        case 'monochrome': return MONOCHROME_COLORS
        default: return CHART_COLORS
    }
}

export const VIZ_LABELS: Record<VizType, string> = {
    bar_vertical: 'Barras Verticais',
    bar_horizontal: 'Barras Horizontais',
    line: 'Linha',
    area: 'Área',
    composed: 'Composto (Bar + Linha)',
    pie: 'Pizza',
    donut: 'Donut',
    table: 'Tabela',
    kpi: 'KPI (Número)',
    funnel: 'Funil',
}

export const VIZ_ICONS: Record<VizType, string> = {
    bar_vertical: '📊',
    bar_horizontal: '📊',
    line: '📈',
    area: '📉',
    composed: '📊',
    pie: '🥧',
    donut: '🍩',
    table: '📋',
    kpi: '🔢',
    funnel: '🔻',
}

/** Default visualization config per viz type */
export function getDefaultVizConfig(type: VizType): VisualizationConfig {
    const base: VisualizationConfig = {
        type,
        showLegend: true,
        showGrid: true,
        colorScheme: 'default',
        height: 360,
    }

    switch (type) {
        case 'kpi':
            return { ...base, showLegend: false, showGrid: false, height: 140 }
        case 'pie':
        case 'donut':
            return { ...base, showGrid: false, height: 340 }
        case 'table':
            return { ...base, showLegend: false, showGrid: false, height: undefined }
        case 'funnel':
            return { ...base, showGrid: false, height: 360 }
        default:
            return base
    }
}

/** Tooltip style consistent with existing analytics */
export const TOOLTIP_STYLE = {
    contentStyle: {
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        fontSize: '12px',
        padding: '8px 12px',
    },
    cursor: { fill: 'rgba(0,0,0,0.04)' },
}
