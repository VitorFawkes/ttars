/**
 * Regras de quais campos do card uma automação pode atualizar e ONDE o valor
 * é gravado. Fonte única de verdade no frontend (o cadence-engine replica a
 * mesma lógica em Deno — manter os dois em sincronia ao alterar).
 *
 * Três destinos possíveis para um campo:
 *   - 'native_writable': coluna nativa de `cards` segura para automação escrever
 *     (comerciais, datas de viagem). Escrita direta na coluna, com coerção de tipo.
 *   - 'native_blocked':  coluna nativa de `cards` de sistema/ownership/FK — NUNCA
 *     escrevível por automação (id, org_id, donos, datas de sistema, etc).
 *   - 'produto_data':    qualquer outro campo do catálogo system_fields. Gravado
 *     em `cards.produto_data[key]` (jsonb). É a maioria dos campos de negócio
 *     (viagem, presentes, alertas, marketing, etc).
 */

/** Colunas nativas de `cards` que a automação PODE escrever (com tipo esperado). */
export const NATIVE_WRITABLE_FIELDS: Record<string, 'string' | 'number' | 'boolean' | 'date'> = {
    status_comercial: 'string',
    prioridade: 'string',
    valor_estimado: 'number',
    valor_final: 'number',
    pronto_para_contrato: 'boolean',
    pronto_para_erp: 'boolean',
    cliente_recorrente: 'boolean',
    condicoes_pagamento: 'string',
    forma_pagamento: 'string',
    estado_operacional: 'string',
    codigo_cliente_erp: 'string',
    codigo_projeto_erp: 'string',
    taxa_status: 'string',
    moeda: 'string',
    data_viagem_inicio: 'date',
    data_viagem_fim: 'date',
}

/**
 * Todas as colunas nativas de `cards` (snapshot do schema de produção 2026-06-02).
 * Usada para detectar quando um system_field é uma coluna nativa — se for nativa
 * e NÃO estiver em NATIVE_WRITABLE_FIELDS, é bloqueada (evita gravar chave-fantasma
 * em produto_data que o read ignoraria, e protege colunas de sistema/FK).
 */
export const CARD_NATIVE_COLUMNS: ReadonlySet<string> = new Set([
    'ai_contexto', 'ai_pause_config', 'ai_responsavel', 'ai_resumo', 'archived_at', 'archived_by',
    'briefing_inicial', 'campaign_id', 'card_type', 'cliente_recorrente', 'codigo_cliente_erp',
    'codigo_projeto_erp', 'concierge_owner_id', 'condicoes_pagamento', 'created_at', 'created_by',
    'data_fechamento', 'data_pronto_erp', 'data_viagem_fim', 'data_viagem_inicio', 'deleted_at',
    'deleted_by', 'dono_atual_id', 'duracao_dias_max', 'duracao_dias_min', 'epoca_ano',
    'epoca_mes_fim', 'epoca_mes_inicio', 'epoca_tipo', 'estado_operacional', 'external_id',
    'external_source', 'first_response_at', 'forma_pagamento', 'ganho_planner', 'ganho_planner_at',
    'ganho_pos', 'ganho_pos_at', 'ganho_sdr', 'ganho_sdr_at', 'group_capacity', 'group_total_pax',
    'group_total_revenue', 'id', 'indicado_por_id', 'is_critical', 'is_group_parent',
    'lead_entry_path', 'locked_fields', 'marketing_data', 'merge_config', 'merge_metadata',
    'merged_at', 'merged_by', 'mkt_buscando_para_viagem', 'moeda', 'motivo_perda_comentario',
    'motivo_perda_id', 'org_id', 'origem', 'origem_lead', 'parent_card_id', 'pessoa_principal_id',
    'pipeline_id', 'pipeline_stage_id', 'pos_owner_id', 'prioridade', 'produto', 'produto_data',
    'pronto_para_contrato', 'pronto_para_erp', 'quality_score_pct', 'receita', 'receita_source',
    'sdr_owner_id', 'sdr_qualification_score_latest', 'skip_pos_venda', 'stage_changed_at',
    'stage_entered_at', 'status_comercial', 'sub_card_agregado_em', 'sub_card_category',
    'sub_card_mode', 'sub_card_status', 'taxa_alterado_por', 'taxa_ativa', 'taxa_codigo_transacao',
    'taxa_data_status', 'taxa_meio_pagamento', 'taxa_status', 'taxa_valor', 'test_agent_id',
    'titulo', 'titulo_locked_at', 'updated_at', 'updated_by', 'utm_campaign', 'utm_content',
    'utm_medium', 'utm_source', 'utm_term', 'valor_estimado', 'valor_final', 'valor_proprio',
    'vendas_owner_id',
])

export type FieldStorage = 'native_writable' | 'native_blocked' | 'produto_data'

/** Decide onde/se um campo é escrevível por automação. */
export function fieldStorageFor(key: string): FieldStorage {
    if (key in NATIVE_WRITABLE_FIELDS) return 'native_writable'
    if (CARD_NATIVE_COLUMNS.has(key)) return 'native_blocked'
    return 'produto_data'
}

/** true se a automação pode atualizar este campo (nativa segura OU produto_data). */
export function isFieldUpdatable(key: string): boolean {
    return fieldStorageFor(key) !== 'native_blocked'
}
