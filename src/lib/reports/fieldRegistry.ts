import type { DataSource, FieldDefinition, ComputedMeasureDefinition } from './reportTypes'

// ============================================
// Field Registry — Fonte da verdade client-side
// Espelhado no backend (report_query_engine valida contra este)
// ============================================

const DATE_GROUPINGS = ['day', 'week', 'month', 'quarter', 'year'] as const
const TEXT_OPERATORS = ['eq', 'neq', 'in', 'not_in', 'like', 'is_null', 'is_not_null'] as const
const NUMBER_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'] as const
const DATE_OPERATORS = ['gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'] as const
const BOOL_OPERATORS = ['eq', 'is_null'] as const

// === SOURCE: CARDS ===
const CARDS_FIELDS: FieldDefinition[] = [
    // Dimensões — Pipeline
    { key: 'ps.nome', label: 'Etapa', category: 'Pipeline', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'pp.label', label: 'Fase', category: 'Pipeline', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'c.produto', label: 'Produto', category: 'Pipeline', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['TRIPS', 'WEDDING', 'CORP'] },
    { key: 'c.status_comercial', label: 'Status Comercial', category: 'Pipeline', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['ganho', 'perdido', 'aberto'] },
    { key: 'c.prioridade', label: 'Prioridade', category: 'Pipeline', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['alta', 'media', 'baixa'] },
    { key: 'mp.nome', label: 'Motivo de Perda', category: 'Pipeline', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },

    // Dimensões — Lead
    { key: 'c.origem', label: 'Origem', category: 'Lead', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'c.origem_lead', label: 'Origem Lead', category: 'Lead', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },

    // Dimensões — Equipe
    { key: 'pr_dono.nome', label: 'Responsável Atual', category: 'Equipe', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'pr_sdr.nome', label: 'SDR', category: 'Equipe', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'pr_vendas.nome', label: 'Planner', category: 'Equipe', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'pr_pos.nome', label: 'Pós-Venda', category: 'Equipe', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },

    // Dimensões — Financeiro
    { key: 'c.moeda', label: 'Moeda', category: 'Financeiro', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS] },
    { key: 'c.forma_pagamento', label: 'Forma Pagamento', category: 'Financeiro', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },

    // Dimensões — Tipo
    { key: 'c.is_group_parent', label: 'É Grupo?', category: 'Tipo', role: 'dimension', dataType: 'boolean', filterOperators: [...BOOL_OPERATORS] },
    { key: 'c.cliente_recorrente', label: 'Cliente Recorrente', category: 'Cliente', role: 'dimension', dataType: 'boolean', filterOperators: [...BOOL_OPERATORS] },

    // Dimensões — Marketing
    { key: 'c.utm_source', label: 'UTM Source', category: 'Marketing', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS] },
    { key: 'c.utm_medium', label: 'UTM Medium', category: 'Marketing', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS] },
    { key: 'c.utm_campaign', label: 'UTM Campaign', category: 'Marketing', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS] },

    // Dimensões — Tempo
    { key: 'c.created_at', label: 'Data Criação', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 'c.data_fechamento', label: 'Data Fechamento', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS], sqlExpression: 'c.data_fechamento::timestamptz' },
    { key: 'c.data_viagem_inicio', label: 'Data Viagem', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS], sqlExpression: 'c.data_viagem_inicio::timestamptz' },
    { key: 'c.stage_entered_at', label: 'Entrada na Etapa', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },

    // Medidas
    { key: 'c.id', label: 'Quantidade de Cards', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count', 'count_distinct'] },
    { key: 'c.valor_estimado', label: 'Valor Estimado', category: 'Financeiro', role: 'measure', dataType: 'number', aggregations: ['sum', 'avg', 'min', 'max'], filterOperators: [...NUMBER_OPERATORS] },
    { key: 'c.valor_final', label: 'Faturamento', category: 'Financeiro', role: 'measure', dataType: 'number', aggregations: ['sum', 'avg', 'min', 'max'], filterOperators: [...NUMBER_OPERATORS] },
    { key: 'c.receita', label: 'Receita (Margem)', category: 'Financeiro', role: 'measure', dataType: 'number', aggregations: ['sum', 'avg', 'min', 'max'], requiresPermission: 'receita', filterOperators: [...NUMBER_OPERATORS] },
    { key: 'c.taxa_valor', label: 'Valor Taxa', category: 'Financeiro', role: 'measure', dataType: 'number', aggregations: ['sum', 'avg'], filterOperators: [...NUMBER_OPERATORS] },
    { key: 'valor_display', label: 'Valor Display', category: 'Financeiro', role: 'measure', dataType: 'number', aggregations: ['sum', 'avg'], sqlExpression: 'COALESCE(c.valor_final, c.valor_estimado)' },
    { key: 'dias_etapa', label: 'Dias na Etapa', category: 'Velocidade', role: 'measure', dataType: 'number', aggregations: ['avg', 'min', 'max'], sqlExpression: 'EXTRACT(DAY FROM NOW() - COALESCE(c.stage_entered_at, c.created_at))' },
    { key: 'ciclo_dias', label: 'Ciclo de Venda (dias)', category: 'Velocidade', role: 'measure', dataType: 'number', aggregations: ['avg', 'min', 'max'], sqlExpression: 'EXTRACT(DAY FROM c.data_fechamento::timestamptz - c.created_at)' },
]

// === SOURCE: CONTATOS ===
const CONTATOS_FIELDS: FieldDefinition[] = [
    { key: 'c.tipo_cliente', label: 'Tipo (PF/PJ)', category: 'Perfil', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['PF', 'PJ'] },
    { key: 'c.sexo', label: 'Sexo', category: 'Perfil', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['M', 'F'] },
    { key: 'c.origem', label: 'Origem', category: 'Lead', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'c.created_at', label: 'Data Cadastro', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 'c.primeira_venda_data', label: 'Primeira Venda', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 'c.ultima_venda_data', label: 'Última Venda', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 'c.id', label: 'Quantidade', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'] },
    { key: 'cs.total_trips', label: 'Total Viagens', category: 'Histórico', role: 'measure', dataType: 'number', aggregations: ['sum', 'avg', 'min', 'max'] },
    { key: 'cs.total_spend', label: 'Gasto Total', category: 'Histórico', role: 'measure', dataType: 'number', aggregations: ['sum', 'avg'] },
]

// === SOURCE: PROPOSTAS ===
const PROPOSTAS_FIELDS: FieldDefinition[] = [
    { key: 'p.status', label: 'Status', category: 'Proposta', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['draft', 'sent', 'viewed', 'in_progress', 'accepted', 'rejected', 'expired'] },
    { key: 'c.produto', label: 'Produto', category: 'Pipeline', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['TRIPS', 'WEDDING', 'CORP'] },
    { key: 'pr.nome', label: 'Consultor', category: 'Equipe', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'p.created_at', label: 'Data Criação', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 'p.id', label: 'Quantidade', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'] },
    { key: 'p.accepted_total', label: 'Valor Aceito', category: 'Financeiro', role: 'measure', dataType: 'number', aggregations: ['sum', 'avg'] },
]

// === SOURCE: TAREFAS ===
const TAREFAS_FIELDS: FieldDefinition[] = [
    { key: 't.tipo', label: 'Tipo', category: 'Tarefa', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 't.status', label: 'Status', category: 'Tarefa', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 't.prioridade', label: 'Prioridade', category: 'Tarefa', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['alta', 'media', 'baixa'] },
    { key: 't.outcome', label: 'Resultado', category: 'Tarefa', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'pr.nome', label: 'Responsável', category: 'Equipe', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 't.created_at', label: 'Data Criação', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 't.data_vencimento', label: 'Data Vencimento', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 't.id', label: 'Quantidade', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'] },
    { key: 'concluidas', label: 'Concluídas', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'], sqlExpression: 'CASE WHEN t.concluida = true THEN 1 END' },
    { key: 'atrasadas', label: 'Atrasadas', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'], sqlExpression: 'CASE WHEN t.concluida = false AND t.data_vencimento < NOW() THEN 1 END' },
]

// === SOURCE: REUNIOES ===
const REUNIOES_FIELDS: FieldDefinition[] = [
    { key: 'r.status', label: 'Status', category: 'Reunião', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'r.resultado', label: 'Resultado', category: 'Reunião', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'pr.nome', label: 'Responsável', category: 'Equipe', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'r.data_inicio', label: 'Data', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 'r.id', label: 'Quantidade', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'] },
]

// === SOURCE: MENSAGENS ===
const MENSAGENS_FIELDS: FieldDefinition[] = [
    { key: 'm.canal', label: 'Canal', category: 'Mensagem', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['whatsapp', 'email', 'phone'] },
    { key: 'm.lado', label: 'Lado', category: 'Mensagem', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['cliente', 'consultor'] },
    { key: 'm.data_hora', label: 'Data', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 'm.id', label: 'Quantidade', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'] },
]

// === SOURCE: WHATSAPP ===
const WHATSAPP_FIELDS: FieldDefinition[] = [
    { key: 'wm.message_type', label: 'Tipo Mensagem', category: 'WhatsApp', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['text', 'image', 'audio', 'video', 'document', 'sticker', 'location'] },
    { key: 'wm.direction', label: 'Direção', category: 'WhatsApp', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['inbound', 'outbound'] },
    { key: 'wm.fase_label', label: 'Fase', category: 'WhatsApp', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'wm.produto', label: 'Produto', category: 'WhatsApp', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['TRIPS', 'WEDDING', 'CORP'] },
    { key: 'wm.created_at', label: 'Data', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 'wm.id', label: 'Quantidade', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'] },
    { key: 'wm.conversation_id', label: 'Conversas Únicas', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count_distinct'] },
]

// === SOURCE: DOCUMENTOS ===
const DOCUMENTOS_FIELDS: FieldDefinition[] = [
    { key: 'dt.nome', label: 'Tipo Documento', category: 'Documento', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'cdr.status', label: 'Status', category: 'Documento', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['pending', 'received', 'rejected'] },
    { key: 'cdr.modo', label: 'Modo', category: 'Documento', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['file', 'data', 'both'] },
    { key: 'cdr.id', label: 'Quantidade', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'] },
]

// === SOURCE: CADENCIA ===
const CADENCIA_FIELDS: FieldDefinition[] = [
    { key: 'cdt.name', label: 'Template', category: 'Cadência', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'ci.status', label: 'Status', category: 'Cadência', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: ['active', 'completed', 'paused', 'cancelled'] },
    { key: 'ci.started_at', label: 'Data Início', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 'ci.id', label: 'Quantidade', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'] },
    { key: 'ci.successful_contacts', label: 'Contatos Com Sucesso', category: 'Resultado', role: 'measure', dataType: 'number', aggregations: ['sum', 'avg'] },
]

// === SOURCE: HISTORICO ===
const HISTORICO_FIELDS: FieldDefinition[] = [
    { key: 'ps.nome', label: 'Etapa Destino', category: 'Pipeline', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'hf.data_mudanca', label: 'Data Mudança', category: 'Tempo', role: 'dimension', dataType: 'date', dateGroupings: [...DATE_GROUPINGS], filterOperators: [...DATE_OPERATORS] },
    { key: 'pr.nome', label: 'Movido Por', category: 'Equipe', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'hf.id', label: 'Quantidade', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'] },
    { key: 'hf.tempo_na_etapa_anterior', label: 'Tempo na Etapa Anterior (s)', category: 'Velocidade', role: 'measure', dataType: 'number', aggregations: ['avg', 'min', 'max'] },
]

// === SOURCE: EQUIPE ===
const EQUIPE_FIELDS: FieldDefinition[] = [
    { key: 'p.nome', label: 'Nome', category: 'Perfil', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS] },
    { key: 't.name', label: 'Time', category: 'Organização', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'pp.label', label: 'Fase', category: 'Organização', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'p.role', label: 'Role', category: 'Organização', role: 'dimension', dataType: 'text', filterOperators: [...TEXT_OPERATORS], filterOptions: 'dynamic' },
    { key: 'p.id', label: 'Quantidade', category: 'Contagem', role: 'measure', dataType: 'number', aggregations: ['count'] },
]

// === REGISTRY MAP ===
export const FIELD_REGISTRY: Record<DataSource, FieldDefinition[]> = {
    cards: CARDS_FIELDS,
    contatos: CONTATOS_FIELDS,
    propostas: PROPOSTAS_FIELDS,
    tarefas: TAREFAS_FIELDS,
    reunioes: REUNIOES_FIELDS,
    mensagens: MENSAGENS_FIELDS,
    whatsapp: WHATSAPP_FIELDS,
    documentos: DOCUMENTOS_FIELDS,
    cadencia: CADENCIA_FIELDS,
    historico: HISTORICO_FIELDS,
    equipe: EQUIPE_FIELDS,
}

// === COMPUTED MEASURES (pre-defined formulas per source) ===
export const COMPUTED_MEASURES: Record<DataSource, ComputedMeasureDefinition[]> = {
    cards: [
        {
            key: 'taxa_conversao',
            label: 'Taxa de Conversão',
            category: 'Calculado',
            description: 'Percentual de cards ganhos sobre o total',
            sqlExpression: "ROUND(COUNT(CASE WHEN c.status_comercial='ganho' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)",
            format: 'percent',
        },
        {
            key: 'ticket_medio',
            label: 'Ticket Médio',
            category: 'Calculado',
            description: 'Valor médio dos cards ganhos',
            sqlExpression: "ROUND(SUM(CASE WHEN c.status_comercial='ganho' THEN c.valor_final ELSE 0 END) / NULLIF(COUNT(CASE WHEN c.status_comercial='ganho' THEN 1 END), 0), 0)",
            format: 'currency',
        },
        {
            key: 'margem_pct',
            label: 'Margem %',
            category: 'Calculado',
            description: 'Receita como percentual do faturamento',
            sqlExpression: "ROUND(SUM(CASE WHEN c.status_comercial='ganho' THEN c.receita ELSE 0 END) / NULLIF(SUM(CASE WHEN c.status_comercial='ganho' THEN c.valor_final ELSE 0 END), 0) * 100, 1)",
            format: 'percent',
            requiresPermission: 'receita',
        },
        {
            key: 'taxa_perda',
            label: 'Taxa de Perda',
            category: 'Calculado',
            description: 'Percentual de cards perdidos sobre o total',
            sqlExpression: "ROUND(COUNT(CASE WHEN c.status_comercial='perdido' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)",
            format: 'percent',
        },
    ],
    contatos: [],
    propostas: [],
    tarefas: [],
    reunioes: [],
    mensagens: [],
    whatsapp: [],
    documentos: [],
    cadencia: [],
    historico: [],
    equipe: [],
}

// === HELPERS ===
export function getFieldsForSource(source: DataSource): FieldDefinition[] {
    return FIELD_REGISTRY[source] ?? []
}

export function getDimensionsForSource(source: DataSource): FieldDefinition[] {
    return getFieldsForSource(source).filter(f => f.role === 'dimension' || f.role === 'both')
}

export function getMeasuresForSource(source: DataSource): FieldDefinition[] {
    return getFieldsForSource(source).filter(f => f.role === 'measure' || f.role === 'both')
}

export function getComputedMeasuresForSource(source: DataSource): ComputedMeasureDefinition[] {
    return COMPUTED_MEASURES[source] ?? []
}

export function getFieldByKey(source: DataSource, key: string): FieldDefinition | undefined {
    return getFieldsForSource(source).find(f => f.key === key)
}

export function getCategoriesForSource(source: DataSource, role?: 'dimension' | 'measure'): string[] {
    const fields = role
        ? getFieldsForSource(source).filter(f => f.role === role || f.role === 'both')
        : getFieldsForSource(source)
    return [...new Set(fields.map(f => f.category))]
}
