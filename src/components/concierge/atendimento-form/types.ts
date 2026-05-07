import type { TipoConcierge, CategoriaConcierge, CobradoDe } from '../../../hooks/concierge/types'

/**
 * State de UM bloco de atendimento dentro do NovoAtendimentoModal.
 * Cada bloco é independente — N blocos viram N atendimentos heterogêneos.
 * `cardId`/`cardTitulo` permitem que blocos diferentes apontem para viagens
 * diferentes na mesma criação em lote.
 */
export interface AtendimentoBlockState {
  cardId: string
  cardTitulo: string
  titulo: string
  tipo: TipoConcierge
  categoria: CategoriaConcierge
  descricao: string
  prazo: string
  prioridade: string
  responsavelId: string
  valor: string
  cobradoDe: CobradoDe | ''
}

export function makeEmptyBlock(initial?: { cardId?: string; cardTitulo?: string }): AtendimentoBlockState {
  return {
    cardId: initial?.cardId ?? '',
    cardTitulo: initial?.cardTitulo ?? '',
    titulo: '',
    tipo: 'operacional',
    categoria: 'outro',
    descricao: '',
    prazo: '',
    prioridade: 'media',
    responsavelId: '',
    valor: '',
    cobradoDe: '',
  }
}
