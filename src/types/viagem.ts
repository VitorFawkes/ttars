// ============================================
// Travel Planner — Tipos do Marco 2 (Página do Cliente)
// Baseado no retorno das RPCs SECURITY DEFINER
// ============================================

export const VIAGEM_ESTADOS = [
  'desenho',
  'em_recomendacao',
  'em_aprovacao',
  'confirmada',
  'em_montagem',
  'aguardando_embarque',
  'em_andamento',
  'pos_viagem',
  'concluida',
] as const

export type ViagemEstado = (typeof VIAGEM_ESTADOS)[number]

export const TRIP_ITEM_TIPOS = [
  'dia', 'hotel', 'voo', 'transfer', 'passeio', 'refeicao',
  'seguro', 'dica', 'voucher', 'contato', 'texto', 'checklist',
] as const

export type TripItemTipo = (typeof TRIP_ITEM_TIPOS)[number]

export const TRIP_ITEM_STATUS = [
  'rascunho', 'proposto', 'aprovado', 'recusado',
  'operacional', 'vivido', 'arquivado',
] as const

export type TripItemStatus = (typeof TRIP_ITEM_STATUS)[number]

export type TripItemAutor = 'client' | 'tp' | 'pv'

// Retorno de get_viagem_by_token

export interface ViagemOwner {
  id: string
  nome: string
  avatar_url: string | null
}

export interface TripItemAlternativa {
  id: string
  titulo: string
  preco?: number
  comercial?: Record<string, unknown>
  escolhido_em?: string | null
}

export interface TripItem {
  id: string
  parent_id: string | null
  tipo: TripItemTipo
  status: TripItemStatus
  ordem: number
  comercial: Record<string, unknown>
  operacional: Record<string, unknown>
  alternativas: TripItemAlternativa[]
  aprovado_em: string | null
  aprovado_por: TripItemAutor | null
}

export interface TripComment {
  id: string
  item_id: string | null
  autor: TripItemAutor
  /** UUID do passageiro (trip_participants.id) quando autor='client' */
  autor_id?: string | null
  /** Nome do passageiro (se identificado); só para autor='client' */
  autor_nome?: string | null
  /** Relação do passageiro (marido, esposa, etc) */
  autor_relacao?: string | null
  texto: string
  created_at: string
}

export interface TripEvent {
  id: string
  tipo: string
  payload: Record<string, unknown>
  created_at: string
}

export interface Viagem {
  id: string
  estado: ViagemEstado
  titulo: string | null
  subtitulo: string | null
  capa_url: string | null
  total_estimado: number
  total_aprovado: number
  enviada_em: string | null
  confirmada_em: string | null
  tp: ViagemOwner | null
  pv: ViagemOwner | null
  items: TripItem[]
  comments: TripComment[]
  events: TripEvent[]
}

// Agrupamento de items por dia (frontend)
export interface DayGroupData {
  day: TripItem // item com tipo='dia'
  children: TripItem[] // filhos ordenados por ordem
}

// Items sem pai (orphans — tipo != dia e parent_id == null)
export type OrphanItem = TripItem
