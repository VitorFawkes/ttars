export const SECTIONS = [
    { value: 'trip_info', label: 'Informações da Viagem', color: 'bg-blue-50 text-blue-700 border-blue-100' },
    { value: 'observacoes_criticas', label: 'Informações Importantes', color: 'bg-red-50 text-red-700 border-red-100' },
    { value: 'people', label: 'Pessoas / Viajantes', color: 'bg-purple-50 text-purple-700 border-purple-100' },
    { value: 'payment', label: 'Pagamento', color: 'bg-green-50 text-green-700 border-green-100' },
    { value: 'system', label: 'Sistema / Interno', color: 'bg-gray-50 text-gray-700 border-gray-100' }
] as const

/**
 * Seções que devem aparecer na Matriz de Governança.
 * Apenas estes campos terão regras de visibilidade/obrigatoriedade por etapa.
 * - trip_info: Campos de informações da viagem (Destinos, Época, Orçamento, etc)
 * - observacoes_criticas: Informações importantes que precisam de regras por fase
 */
export const GOVERNABLE_SECTIONS = ['trip_info', 'observacoes_criticas'] as const

export const FIELD_TYPES = [
    // Básicos
    { value: 'text', label: 'Texto Simples' },
    { value: 'textarea', label: 'Texto Longo (Área)' },
    { value: 'number', label: 'Número' },
    { value: 'boolean', label: 'Sim/Não' },

    // Datas
    { value: 'date', label: 'Data' },
    { value: 'datetime', label: 'Data e Hora' },
    { value: 'date_range', label: 'Período de Data (Início e Fim)' },

    // Valores
    { value: 'currency', label: 'Moeda' },
    { value: 'currency_range', label: 'Faixa de Valor (Range de Moeda)' },

    // Seleção
    { value: 'select', label: 'Seleção Única' },
    { value: 'multiselect', label: 'Múltipla Seleção' },
    { value: 'checklist', label: 'Checklist (Lista de Marcação)' },

    // Flexíveis (Viagem)
    { value: 'flexible_date', label: '📅 Época Flexível (mês, range, ou data exata)' },
    { value: 'flexible_duration', label: '⏱️ Duração Flexível (dias fixos ou range)' },
    { value: 'smart_budget', label: '💰 Orçamento Inteligente (total, por pessoa, ou range)' },

    // Avançados
    { value: 'json', label: 'JSON (Avançado)' },
    { value: 'loss_reason_selector', label: 'Motivo de Perda (Sistema)' }
] as const


export const COLORS = [
    { value: 'gray', bg: 'bg-gray-100', text: 'text-gray-800' },
    { value: 'blue', bg: 'bg-blue-100', text: 'text-blue-800' },
    { value: 'green', bg: 'bg-green-100', text: 'text-green-800' },
    { value: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-800' },
    { value: 'red', bg: 'bg-red-100', text: 'text-red-800' },
    { value: 'purple', bg: 'bg-purple-100', text: 'text-purple-800' },
    { value: 'pink', bg: 'bg-pink-100', text: 'text-pink-800' },
] as const

/**
 * @deprecated Roles are now managed in the database `roles` table.
 * Use `useRoles()` hook to fetch roles dynamically.
 * This constant is kept for legacy compatibility and seeding reference only.
 */
export const DEFAULT_ROLES = [
    { value: 'admin', label: 'Administrador', color: 'bg-red-100 text-red-800' },
    { value: 'manager', label: 'Gerente', color: 'bg-purple-100 text-purple-800' },
    { value: 'member', label: 'Membro', color: 'bg-blue-100 text-blue-800' },
    { value: 'viewer', label: 'Visualizador', color: 'bg-gray-100 text-gray-800' },
] as const

/**
 * @deprecated Use DEFAULT_ROLES instead. ROLES is an alias for backward compatibility.
 */
export const ROLES = DEFAULT_ROLES

