/**
 * operatorsByFieldType — mapa tipo de campo do CRM → operadores válidos
 * pra construtor visual de regras de qualificação.
 *
 * Usado em QualificationRuleBuilder. Espelha os tipos de system_fields
 * (ver CODEBASE.md §2.3 Field Types).
 */

export type Operator =
  | 'equals' | 'not_equals' | 'contains' | 'not_contains'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'between'
  | 'before' | 'after'
  | 'in' | 'not_in'
  | 'is_true' | 'is_false'
  | 'is_empty' | 'is_filled';

export const OPERATOR_LABELS: Record<Operator, string> = {
  equals: 'igual a',
  not_equals: 'diferente de',
  contains: 'contém',
  not_contains: 'não contém',
  gt: 'maior que',
  gte: 'maior ou igual',
  lt: 'menor que',
  lte: 'menor ou igual',
  between: 'entre',
  before: 'antes de',
  after: 'depois de',
  in: 'é um de',
  not_in: 'não é um de',
  is_true: 'é verdadeiro',
  is_false: 'é falso',
  is_empty: 'está vazio',
  is_filled: 'está preenchido',
};

const BY_TYPE: Record<string, Operator[]> = {
  text: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_filled'],
  textarea: ['contains', 'not_contains', 'is_empty', 'is_filled'],
  number: ['equals', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_filled'],
  currency: ['gte', 'lte', 'between', 'is_filled'],
  currency_range: ['gte', 'lte', 'between'],
  date: ['equals', 'before', 'after', 'between'],
  datetime: ['before', 'after', 'between'],
  date_range: ['before', 'after'],
  select: ['equals', 'not_equals', 'in', 'not_in', 'is_empty'],
  multiselect: ['contains', 'not_contains', 'is_empty'],
  checklist: ['contains', 'not_contains'],
  boolean: ['is_true', 'is_false'],
  json: ['is_empty', 'is_filled'],
  loss_reason_selector: ['equals', 'is_empty'],
  flexible_date: ['before', 'after', 'is_empty', 'is_filled'],
  flexible_duration: ['gte', 'lte', 'is_filled'],
  smart_budget: ['gte', 'lte', 'between'],
};

export function getOperatorsByType(fieldType?: string | null): Operator[] {
  if (!fieldType) return ['equals', 'is_filled'];
  return BY_TYPE[fieldType] ?? ['equals', 'is_filled'];
}

/**
 * Formata um operador + valor em string legível pra mostrar num chip.
 * Ex: ("gte", 80000) → "≥ R$ 80.000"
 */
export function formatRulePreview(operator: Operator, value: unknown): string {
  switch (operator) {
    case 'gte': return `≥ ${formatValue(value)}`;
    case 'lte': return `≤ ${formatValue(value)}`;
    case 'gt': return `> ${formatValue(value)}`;
    case 'lt': return `< ${formatValue(value)}`;
    case 'equals': return `= ${formatValue(value)}`;
    case 'not_equals': return `≠ ${formatValue(value)}`;
    case 'contains': return `contém "${value}"`;
    case 'not_contains': return `não contém "${value}"`;
    case 'between': {
      const v = value as { min?: unknown; max?: unknown };
      return `entre ${formatValue(v.min)} e ${formatValue(v.max)}`;
    }
    case 'in': return `em ${Array.isArray(value) ? value.join(', ') : value}`;
    case 'not_in': return `não em ${Array.isArray(value) ? value.join(', ') : value}`;
    case 'before': return `antes de ${formatValue(value)}`;
    case 'after': return `depois de ${formatValue(value)}`;
    case 'is_true': return 'é verdadeiro';
    case 'is_false': return 'é falso';
    case 'is_empty': return 'vazio';
    case 'is_filled': return 'preenchido';
    default: return String(value);
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number' && v >= 1000) {
    return v.toLocaleString('pt-BR');
  }
  return String(v);
}
