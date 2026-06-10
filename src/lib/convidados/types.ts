// Tipos compartilhados pela feature "Lista de Convidados" (Casais + Planilha)

export type FaixaKey = 'adulto' | 'menor'
export type LadoKey = 'ambos' | 'noiva' | 'noivo'
export type TipoKey = 'amigo' | 'familia' | 'padrinho'

export const FAIXAS: Array<{ key: FaixaKey; label: string; needsPhone: boolean }> = [
  { key: 'adulto', label: 'Maior de 18', needsPhone: true },
  { key: 'menor', label: 'Menor de 18', needsPhone: false },
]

// Dados legados podem chegar com faixas antigas (idoso/crianca/bebe) enquanto
// houver cache ou snapshot antigo — normaliza pro modelo atual.
export function normalizeFaixa(raw: string | null | undefined): FaixaKey {
  if (raw === 'crianca' || raw === 'bebe' || raw === 'menor') return 'menor'
  return 'adulto'
}

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
  enviado_em?: string | null
  tem_alteracoes_pendentes?: boolean
  lado_label_a?: string | null
  lado_label_b?: string | null
}

// Labels exibidos nos botões de Lado — chaves internas continuam noiva/noivo.
export interface LadoLabels {
  noiva: string
  noivo: string
}

// Deriva os labels do Lado: customizados pelo casal > primeiros nomes do
// nome_casal ("Ana & Júlia", "Pedro e João") > fallback Noiva/Noivo.
export function getLadoLabels(casal: Pick<CasalPublic, 'nome_casal' | 'lado_label_a' | 'lado_label_b'>): LadoLabels {
  const firstName = (s: string) => s.trim().split(/\s+/)[0] || ''
  let derivedA = ''
  let derivedB = ''
  const parts = (casal.nome_casal || '').split(/\s*&\s*|\s*\+\s*|\s+e\s+/i).map(firstName).filter(Boolean)
  if (parts.length === 2) {
    derivedA = parts[0]
    derivedB = parts[1]
  }
  return {
    noiva: casal.lado_label_a?.trim() || derivedA || 'Noiva',
    noivo: casal.lado_label_b?.trim() || derivedB || 'Noivo',
  }
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
  org_id: string
  workspace_name: string | null
  card_titulo: string | null
  criado_em: string
  ultima_edicao_casal_em: string | null
  enviado_em: string | null
  visto_em: string | null
  encerrado_em: string | null
  total_convites: number
  total_pessoas: number
  pessoas_sem_telefone: number
  total_envios: number
  alterado_depois_do_envio: boolean
}
