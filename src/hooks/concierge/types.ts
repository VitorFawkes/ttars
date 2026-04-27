export type TipoConcierge = 'oferta' | 'reserva' | 'suporte' | 'operacional'
export type SourceConcierge = 'cadencia' | 'manual' | 'cliente' | 'planner_request'
export type OutcomeConcierge = 'aceito' | 'recusado' | 'feito' | 'cancelado'
export type CobradoDe = 'cliente' | 'cortesia' | 'incluido_pacote'
export type StatusApresentacao = 'concluido' | 'fechado' | 'vencido' | 'hoje' | 'esta_semana' | 'futuro'

export const CATEGORIAS_CONCIERGE = {
  passaporte: { label: 'Passaporte', tipo: 'operacional' as TipoConcierge },
  check_in: { label: 'Check-in', tipo: 'operacional' as TipoConcierge },
  check_in_oferta: { label: 'Oferta de check-in', tipo: 'operacional' as TipoConcierge },
  check_in_executar: { label: 'Executar check-in', tipo: 'operacional' as TipoConcierge },
  publicar_app: { label: 'Publicar app', tipo: 'operacional' as TipoConcierge },
  welcome_letter: { label: 'Welcome letter', tipo: 'operacional' as TipoConcierge },
  pesquisa_pos: { label: 'Pesquisa pós-viagem', tipo: 'operacional' as TipoConcierge },
  vip_treatment: { label: 'Tratamento VIP', tipo: 'operacional' as TipoConcierge },
  formulario: { label: 'Formulário/Autorização', tipo: 'operacional' as TipoConcierge },
  hotel_contato: { label: 'Contato com hotel', tipo: 'operacional' as TipoConcierge },
  roteiro_auxilio: { label: 'Auxílio roteiro', tipo: 'operacional' as TipoConcierge },
  assento: { label: 'Assento aéreo', tipo: 'oferta' as TipoConcierge },
  bagagem: { label: 'Franquia bagagem', tipo: 'oferta' as TipoConcierge },
  ingresso: { label: 'Ingresso', tipo: 'oferta' as TipoConcierge },
  passeio: { label: 'Passeio', tipo: 'oferta' as TipoConcierge },
  seguro: { label: 'Seguro', tipo: 'oferta' as TipoConcierge },
  transfer: { label: 'Transfer', tipo: 'oferta' as TipoConcierge },
  locacao: { label: 'Locação de carro', tipo: 'oferta' as TipoConcierge },
  restaurante: { label: 'Reserva restaurante', tipo: 'reserva' as TipoConcierge },
  outro: { label: 'Outro', tipo: 'operacional' as TipoConcierge },
} as const

export type CategoriaConcierge = keyof typeof CATEGORIAS_CONCIERGE

export const TIPO_LABEL: Record<TipoConcierge, { label: string; emoji: string; color: string; bgColor: string }> = {
  oferta: { label: 'Oferta', emoji: '💰', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  reserva: { label: 'Reserva', emoji: '🛎️', color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
  suporte: { label: 'Suporte', emoji: '🚨', color: 'text-red-700', bgColor: 'bg-red-100' },
  operacional: { label: 'Operacional', emoji: '📋', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
}

export const SOURCE_LABEL: Record<SourceConcierge, { label: string; emoji: string }> = {
  cadencia: { label: 'Cadência', emoji: '🤖' },
  manual: { label: 'Manual', emoji: '✋' },
  cliente: { label: 'Cliente', emoji: '💬' },
  planner_request: { label: 'Planner pediu', emoji: '👤' },
}

export interface AtendimentoConcierge {
  id: string
  tarefa_id: string
  org_id: string
  card_id: string
  tipo_concierge: TipoConcierge
  categoria: string
  source: SourceConcierge
  cadence_step_id: string | null
  origem_descricao: string | null
  valor: number | null
  moeda: string
  cobrado_de: CobradoDe | null
  outcome: OutcomeConcierge | null
  outcome_em: string | null
  outcome_por: string | null
  trip_item_id: string | null
  hospedagem_ref: string | null
  notificou_cliente_em: string | null
  payload: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MeuDiaItem {
  // Tarefa
  tarefa_id: string
  titulo: string
  descricao: string | null
  data_vencimento: string | null
  prioridade: string | null
  tarefa_status: string | null
  concluida: boolean
  concluida_em: string | null
  dono_id: string | null
  card_id: string
  tarefa_criada_por: string | null
  tarefa_criada_em: string

  // Card
  card_titulo: string
  produto: string
  data_viagem_inicio: string | null
  data_viagem_fim: string | null
  pipeline_stage_id: string
  pessoa_principal_id: string | null
  card_valor_estimado: number | null
  card_valor_final: number | null

  // Atendimento
  atendimento_id: string
  tipo_concierge: TipoConcierge
  categoria: string
  source: SourceConcierge
  cadence_step_id: string | null
  origem_descricao: string | null
  valor: number | null
  moeda: string
  cobrado_de: CobradoDe | null
  outcome: OutcomeConcierge | null
  outcome_em: string | null
  outcome_por: string | null
  trip_item_id: string | null
  hospedagem_ref: string | null
  notificou_cliente_em: string | null
  payload: Record<string, unknown>
  atendimento_criado_em: string

  // Calculados
  status_apresentacao: StatusApresentacao
  dias_pra_embarque: number | null
}

export interface CardConciergeStats {
  card_id: string
  ativos: number
  vencidos: number
  concluidos: number
  valor_vendido_extra: number
  tipo_prioritario: TipoConcierge | null
}

export interface AtendimentoLote {
  categoria: string
  tipo_concierge: TipoConcierge
  janela_embarque: 'sem_data' | 'em_andamento' | 'embarca_48h' | 'embarca_semana' | 'embarca_15d' | 'embarca_30d' | 'embarca_futuro'
  total_pendentes: number
  atendimento_ids: string[]
  tarefa_ids: string[]
  card_ids: string[]
  primeira_data_embarque: string | null
  ultima_data_embarque: string | null
}

export const JANELA_LABEL: Record<AtendimentoLote['janela_embarque'], string> = {
  sem_data: 'Sem data de embarque',
  em_andamento: 'Em viagem',
  embarca_48h: 'Embarca em 48h',
  embarca_semana: 'Embarca esta semana',
  embarca_15d: 'Embarca em 15 dias',
  embarca_30d: 'Embarca em 30 dias',
  embarca_futuro: 'Embarca em mais de 30 dias',
}
