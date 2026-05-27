// Tipos compartilhados pela feature "Lista de Convidados" (Casais + Planilha)

export type FaixaKey = 'adulto' | 'idoso' | 'crianca' | 'bebe'
export type LadoKey = 'ambos' | 'noiva' | 'noivo'
export type TipoKey = 'amigo' | 'familia' | 'padrinho'

export const FAIXAS: Array<{ key: FaixaKey; label: string; needsPhone: boolean }> = [
  { key: 'adulto', label: 'Adulto', needsPhone: true },
  { key: 'idoso', label: 'Idoso', needsPhone: true },
  { key: 'crianca', label: 'Criança', needsPhone: false },
  { key: 'bebe', label: 'Bebê', needsPhone: false },
]

export const LADOS: Array<{ key: LadoKey; label: string }> = [
  { key: 'ambos', label: 'Ambos' },
  { key: 'noiva', label: 'Noiva' },
  { key: 'noivo', label: 'Noivo' },
]

export const TIPOS: Array<{ key: TipoKey; label: string }> = [
  { key: 'amigo', label: 'Amigo(a)' },
  { key: 'familia', label: 'Família' },
  { key: 'padrinho', label: 'Madrinha/Padrinho' },
]

export const LADO_TAGS: Record<LadoKey, { hue: string; ink: string; dot: string; label: string }> = {
  noivo: { hue: 'rgba(117, 119, 123, 0.10)', ink: '#5c5f63', dot: '#75777B', label: 'Noivo' },
  noiva: { hue: 'rgba(234, 167, 148, 0.20)', ink: '#a8584a', dot: '#E9CDD0', label: 'Noiva' },
  ambos: { hue: 'rgba(189, 150, 92, 0.14)', ink: '#8a6a3a', dot: '#BD965C', label: 'Ambos' },
}

export const TIPO_TAGS: Record<TipoKey, { hue: string; ink: string; label: string }> = {
  amigo: { hue: 'rgba(189, 150, 92, 0.10)', ink: '#a37f47', label: 'Amigo(a)' },
  familia: { hue: 'rgba(135, 75, 82, 0.10)', ink: '#874B52', label: 'Família' },
  padrinho: { hue: 'rgba(143, 126, 53, 0.14)', ink: '#6e6028', label: 'Madrinha/Padrinho' },
}

export interface Pessoa {
  id: string
  nome_raw: string
  telefone_raw: string
  email_raw: string
  faixa: FaixaKey
  lado: LadoKey | ''
  tipo: TipoKey | ''
  observacoes: string
  posicao: number
  status_rsvp?: string
}

export interface Convite {
  id: string
  nome: string
  posicao: number
  pessoas: Pessoa[]
}

export interface CasalPublic {
  id: string
  codigo: string
  nome_casal: string
  whatsapp_digits: string
  card_id: string | null
  criado_em: string
  ultima_edicao_casal_em: string | null
}

export interface ListaCasalResponse {
  casal: CasalPublic
  convites: Convite[]
}

export interface CasalAdminRow {
  id: string
  codigo: string
  nome_casal: string
  whatsapp_digits: string
  card_id: string | null
  card_titulo: string | null
  criado_em: string
  ultima_edicao_casal_em: string | null
  encerrado_em: string | null
  total_convites: number
  total_pessoas: number
  pessoas_sem_telefone: number
}
