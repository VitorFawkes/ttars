// ============================================
// IQR — Intermediate Query Representation
// O frontend NUNCA monta SQL. Produz este JSON.
// ============================================

// === Data Sources ===
export type DataSource =
    | 'cards'
    | 'contatos'
    | 'propostas'
    | 'tarefas'
    | 'reunioes'
    | 'mensagens'
    | 'whatsapp'
    | 'documentos'
    | 'cadencia'
    | 'historico'
    | 'equipe'

// === Aggregations ===
export type Aggregation = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max'

// === Date groupings ===
export type DateGrouping = 'day' | 'week' | 'month' | 'quarter' | 'year'

// === Filter operators ===
export type FilterOperator =
    | 'eq' | 'neq'
    | 'gt' | 'gte' | 'lt' | 'lte'
    | 'in' | 'not_in'
    | 'like'
    | 'is_null' | 'is_not_null'
    | 'between'

// === Dimension spec (eixo X / group by) ===
export interface DimensionSpec {
    field: string
    dateGrouping?: DateGrouping
    alias?: string
}

// === Measure spec (eixo Y / agregação) ===
export interface MeasureSpec {
    field: string
    aggregation: Aggregation
    alias?: string
}

// === Computed measure (taxa conversão, ticket médio, etc.) ===
export interface ComputedMeasureSpec {
    type: 'computed'
    key: string           // 'taxa_conversao', 'ticket_medio', etc.
    alias?: string
}

// === Filter spec ===
export interface FilterSpec {
    field: string
    operator: FilterOperator
    value: unknown
}

// === Order spec ===
export interface OrderSpec {
    field: string
    direction: 'asc' | 'desc'
}

// === Comparison spec ===
export interface ComparisonSpec {
    type: 'previous_period' | 'prior_year' | 'custom'
    customRange?: { start: string; end: string }
}

// === IQR: o que o builder produz e salva no banco ===
export interface ReportIQR {
    source: DataSource
    dimensions: DimensionSpec[]
    measures: MeasureSpec[]
    computedMeasures?: ComputedMeasureSpec[]
    breakdownBy?: DimensionSpec
    filters: FilterSpec[]
    orderBy?: OrderSpec
    limit: number
    comparison?: ComparisonSpec
}

// === Visualization ===
export type VizType =
    | 'bar_vertical'
    | 'bar_horizontal'
    | 'line'
    | 'area'
    | 'composed'
    | 'pie'
    | 'donut'
    | 'table'
    | 'kpi'
    | 'funnel'

export interface VisualizationConfig {
    type: VizType
    showLegend?: boolean
    showGrid?: boolean
    colorScheme?: 'default' | 'warm' | 'cool' | 'monochrome'
    labelFormat?: 'number' | 'currency' | 'percent'
    height?: number
}

// === Saved report (row from custom_reports) ===
export interface SavedReport {
    id: string
    title: string
    description: string | null
    config: ReportIQR
    visualization: VisualizationConfig
    created_by: string
    visibility: 'private' | 'team' | 'everyone'
    is_template: boolean
    category: string | null
    pinned: boolean
    last_run_at: string | null
    created_at: string
    updated_at: string
}

// === Saved dashboard ===
export interface SavedDashboard {
    id: string
    title: string
    description: string | null
    global_filters: DashboardGlobalFilters
    created_by: string
    visibility: 'private' | 'team' | 'everyone'
    pinned: boolean
    created_at: string
    updated_at: string
}

export interface DashboardGlobalFilters {
    datePreset?: string
    dateRange?: { start: string; end: string }
    product?: string
    ownerId?: string | null
}

// === Dashboard widget ===
export interface DashboardWidget {
    id: string
    dashboard_id: string
    report_id: string
    grid_x: number
    grid_y: number
    grid_w: number
    grid_h: number
    title_override: string | null
    created_at: string
    // Joined
    report?: SavedReport
}

// === Query engine response ===
export interface ReportQueryResult {
    data: Record<string, unknown>[]
    metadata: {
        rowCount: number
        executionMs?: number
    }
}

// === Drill-down ===
export interface DrillDownFilters {
    [dimensionKey: string]: unknown
}

// === Field registry types ===
export type FieldRole = 'dimension' | 'measure' | 'both'
export type FieldDataType = 'text' | 'number' | 'date' | 'boolean'

export interface FieldDefinition {
    key: string
    label: string
    category: string
    role: FieldRole
    dataType: FieldDataType
    aggregations?: Aggregation[]
    sqlExpression?: string
    dateGroupings?: DateGrouping[]
    requiresPermission?: string
    filterOperators?: FilterOperator[]
    filterOptions?: string[] | 'dynamic'
}

// === Computed measure definition ===
export interface ComputedMeasureDefinition {
    key: string
    label: string
    category: string
    description: string
    sqlExpression: string
    format: 'number' | 'currency' | 'percent'
    requiresPermission?: string
}
