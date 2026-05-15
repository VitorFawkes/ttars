export type StatusRSVP = 'nao_vai' | 'sem_reacao' | 'intencao' | 'confirmado'

export const STATUS_RSVP_LABEL: Record<StatusRSVP, string> = {
  nao_vai: 'Não vai',
  sem_reacao: 'Sem reação',
  intencao: 'Intenção de ir',
  confirmado: 'Confirmado',
}

/** Ordem oficial de apresentação: do pior pro melhor estado de RSVP. */
export const STATUS_RSVP_LIST: StatusRSVP[] = ['nao_vai', 'sem_reacao', 'intencao', 'confirmado']

export const STATUS_RSVP_DEFAULT: StatusRSVP = 'sem_reacao'

export type EtapaConvidados =
  | 'promo'
  | 'padrao'
  | 'encerrado'
  | 'cancelado'

export const ETAPA_LABEL: Record<EtapaConvidados, string> = {
  promo: 'Promo',
  padrao: 'Padrão',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
}

export const ETAPA_ORDER: EtapaConvidados[] = [
  'promo',
  'padrao',
  'encerrado',
  'cancelado',
]

export const ETAPA_DEFAULT: EtapaConvidados = 'padrao'

/** Convidado já achatado (nome/email/telefone vêm via JOIN com contatos). */
export interface Guest {
  id: string
  card_id: string
  contato_id: string
  org_id: string
  nome: string
  sobrenome: string | null
  telefone: string | null
  email: string | null
  status_rsvp: StatusRSVP
  observacoes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface GuestWithWedding extends Guest {
  card_titulo: string
}

/** Input para criar um convidado novo. nome+sobrenome+email+telefone são
 *  usados para dedup contra contatos existentes na account. Status nasce
 *  sempre como `sem_reacao` (default do banco) — não pode ser escolhido na
 *  criação; muda apenas via ações na tabela. */
export interface GuestInput {
  card_id: string
  nome: string
  sobrenome?: string | null
  telefone?: string | null
  email?: string | null
  observacoes?: string | null
}

/** Update aceita alterar campos do contato (nome/sobrenome/email/telefone)
 *  e do vínculo (status/obs) — o hook decide qual tabela atualizar. */
export interface GuestUpdate {
  nome?: string
  sobrenome?: string | null
  telefone?: string | null
  email?: string | null
  status_rsvp?: StatusRSVP
  observacoes?: string | null
}

export interface Wedding {
  id: string
  titulo: string
  pipeline_stage_id: string | null
  created_at: string
  wedding_date: string | null
  /** Local do casamento extraído de cards.produto_data. */
  local: string | null
  /** URL do site do casamento extraído de cards.produto_data. */
  site_url: string | null
  etapa: EtapaConvidados
}

export interface RsvpCounts {
  nao_vai: number
  sem_reacao: number
  intencao: number
  confirmado: number
  total: number
}

export interface WeddingWithGuests extends Wedding {
  guests: Guest[]
  counts: RsvpCounts
}
