// Etapas do board "Planejamento" — espelho do board "Planejamento Weddings"
// do ActiveCampaign (pipeline AC 4). Cada slug é uma coluna do kanban.
//   boas_vindas → AC 20 | onboarding → AC 21 | propostas → AC 22
//   definicao   → AC 23 | passagem   → AC 25 | aditivo   → AC 146
// "Casamentos Cancelados" (AC 147) não vira coluna: ao cancelar, o card sai de
// pos_venda (vai pra Resolução) e some da consulta.

export type EtapaPlanejamento =
  | 'boas_vindas'
  | 'onboarding'
  | 'propostas'
  | 'definicao'
  | 'passagem'
  | 'aditivo'

export const PLANEJAMENTO_LABEL: Record<EtapaPlanejamento, string> = {
  boas_vindas: 'Boas-vindas + Questionário',
  onboarding: 'Primeira reunião - Onboarding',
  propostas: 'Propostas pré-definição',
  definicao: 'Definir casamento e hospedagem',
  passagem: 'Passagem do Casamento',
  aditivo: 'Casais com Aditivo Contratual',
}

/** Ordem das colunas: do início ao fim do planejamento. */
export const PLANEJAMENTO_ORDER: EtapaPlanejamento[] = [
  'boas_vindas',
  'onboarding',
  'propostas',
  'definicao',
  'passagem',
  'aditivo',
]

export const PLANEJAMENTO_DEFAULT: EtapaPlanejamento = 'boas_vindas'

// ── Fornecedores ────────────────────────────────────────────────────────────
// Guardados (interim/WIP) em cards.produto_data.ww_fornecedores. Quando o
// modelo solidificar, migrar para tabela própria (wedding_fornecedores).

export type FornecedorStatus = 'a_contratar' | 'contratado' | 'pago'

export const FORNECEDOR_STATUS_LABEL: Record<FornecedorStatus, string> = {
  a_contratar: 'A contratar',
  contratado: 'Contratado',
  pago: 'Pago',
}

export const FORNECEDOR_STATUS_LIST: FornecedorStatus[] = ['a_contratar', 'contratado', 'pago']

export interface Fornecedor {
  id: string
  /** Setor — bate com o label dos setores (FORNECEDOR_SETORES). */
  setor: string
  nome: string
  contato?: string | null
  valor?: number | null
  status: FornecedorStatus
}

/** Setores (categorias) de fornecedor — fonte única usada pelo card do
 *  casamento e pelo banco de fornecedores. */
export const FORNECEDOR_SETORES: string[] = [
  'Buffet & Gastronomia',
  'Decoração & Flores',
  'Música / DJ / Banda',
  'Fotografia & Vídeo',
  'Celebrante',
  'Beleza (cabelo & maquiagem)',
  'Convites & Papelaria',
  'Transporte & Logística',
]

/** Item do cronograma & checklist de um casamento. Itens com `prazo` formam o
 *  cronograma; `feito` é o checklist. */
export interface ChecklistItem {
  id: string
  titulo: string
  prazo: string | null
  feito: boolean
  observacoes?: string | null
}

/** Entrada do banco de fornecedores (catálogo per-workspace, reutilizável
 *  entre casamentos). */
export interface FornecedorBankEntry {
  id: string
  nome: string
  setor: string
  localizacao: string
  contato?: string | null
  valor?: number | null
  observacoes?: string | null
}

export function isEtapaPlanejamento(value: unknown): value is EtapaPlanejamento {
  return (
    value === 'boas_vindas' ||
    value === 'onboarding' ||
    value === 'propostas' ||
    value === 'definicao' ||
    value === 'passagem' ||
    value === 'aditivo'
  )
}
