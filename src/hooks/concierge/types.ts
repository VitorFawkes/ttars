export type TipoConcierge = 'oferta' | 'reserva' | 'suporte' | 'operacional'
export type SourceConcierge = 'cadencia' | 'manual' | 'cliente' | 'planner_request'
export type OutcomeConcierge = 'aceito' | 'recusado' | 'feito' | 'cancelado'
export type CobradoDe = 'cliente' | 'cortesia' | 'incluido_pacote'
export type StatusApresentacao = 'concluido' | 'fechado' | 'vencido' | 'hoje' | 'esta_semana' | 'futuro'

/**
 * Cada categoria declara em quais produtos ela faz sentido.
 * 'universal' = aparece em qualquer produto.
 *
 * Quando um produto novo (Courses, etc.) for ativado, basta:
 * 1. Adicionar slug do produto ao array `produtos` das categorias relevantes
 * 2. Adicionar categorias específicas do produto novo aqui
 * 3. Criar migration de seed de cadências para o produto (opcional)
 */
export const CATEGORIAS_CONCIERGE = {
  // Universais (qualquer produto)
  vip_treatment: { label: 'Tratamento VIP', tipo: 'operacional' as TipoConcierge, produtos: ['universal'] as const },
  hotel_contato: { label: 'Contato com fornecedor', tipo: 'operacional' as TipoConcierge, produtos: ['universal'] as const },
  formulario: { label: 'Formulário/Autorização', tipo: 'operacional' as TipoConcierge, produtos: ['universal'] as const },
  outro: { label: 'Outro', tipo: 'operacional' as TipoConcierge, produtos: ['universal'] as const },
  ingresso: { label: 'Ingresso', tipo: 'oferta' as TipoConcierge, produtos: ['universal'] as const },
  passeio: { label: 'Passeio', tipo: 'oferta' as TipoConcierge, produtos: ['universal'] as const },
  seguro: { label: 'Seguro', tipo: 'oferta' as TipoConcierge, produtos: ['universal'] as const },
  transfer: { label: 'Transfer', tipo: 'oferta' as TipoConcierge, produtos: ['universal'] as const },
  restaurante: { label: 'Reserva restaurante', tipo: 'reserva' as TipoConcierge, produtos: ['universal'] as const },

  // Welcome Trips
  passaporte: { label: 'Passaporte', tipo: 'operacional' as TipoConcierge, produtos: ['TRIPS'] as const },
  check_in: { label: 'Check-in', tipo: 'operacional' as TipoConcierge, produtos: ['TRIPS'] as const },
  check_in_oferta: { label: 'Oferta de check-in', tipo: 'operacional' as TipoConcierge, produtos: ['TRIPS'] as const },
  check_in_executar: { label: 'Executar check-in', tipo: 'operacional' as TipoConcierge, produtos: ['TRIPS'] as const },
  publicar_app: { label: 'Publicar app', tipo: 'operacional' as TipoConcierge, produtos: ['TRIPS'] as const },
  welcome_letter: { label: 'Welcome letter', tipo: 'operacional' as TipoConcierge, produtos: ['TRIPS'] as const },
  pesquisa_pos: { label: 'Pesquisa pós-viagem', tipo: 'operacional' as TipoConcierge, produtos: ['TRIPS'] as const },
  roteiro_auxilio: { label: 'Auxílio roteiro', tipo: 'operacional' as TipoConcierge, produtos: ['TRIPS'] as const },
  assento: { label: 'Assento aéreo', tipo: 'oferta' as TipoConcierge, produtos: ['TRIPS'] as const },
  bagagem: { label: 'Franquia bagagem', tipo: 'oferta' as TipoConcierge, produtos: ['TRIPS'] as const },
  locacao: { label: 'Locação de carro', tipo: 'oferta' as TipoConcierge, produtos: ['TRIPS'] as const },

  // Welcome Weddings
  degustacao: { label: 'Degustação', tipo: 'reserva' as TipoConcierge, produtos: ['WEDDING'] as const },
  prova_vestido: { label: 'Prova de vestido', tipo: 'operacional' as TipoConcierge, produtos: ['WEDDING'] as const },
  prova_bolo: { label: 'Prova de bolo', tipo: 'operacional' as TipoConcierge, produtos: ['WEDDING'] as const },
  ensaio_foto: { label: 'Ensaio fotográfico', tipo: 'reserva' as TipoConcierge, produtos: ['WEDDING'] as const },
  ensaio_video: { label: 'Ensaio vídeo', tipo: 'reserva' as TipoConcierge, produtos: ['WEDDING'] as const },
  transporte_cerimonia: { label: 'Transporte cerimônia', tipo: 'operacional' as TipoConcierge, produtos: ['WEDDING'] as const },
  lua_de_mel: { label: 'Lua de mel', tipo: 'oferta' as TipoConcierge, produtos: ['WEDDING'] as const },
  decoracao_extras: { label: 'Decoração extras', tipo: 'oferta' as TipoConcierge, produtos: ['WEDDING'] as const },
  celebrante: { label: 'Celebrante', tipo: 'operacional' as TipoConcierge, produtos: ['WEDDING'] as const },
  buffet_ajustes: { label: 'Ajustes buffet', tipo: 'operacional' as TipoConcierge, produtos: ['WEDDING'] as const },
} as const

export type CategoriaConcierge = keyof typeof CATEGORIAS_CONCIERGE

/**
 * Filtra categorias visíveis para um produto.
 * Retorna universais + as do produto especificado.
 * Use sempre com `useCurrentProductMeta().slug` em UI dentro de workspace.
 */
export function categoriasParaProduto(produto: string | null | undefined): Array<{ key: CategoriaConcierge; config: { label: string; tipo: TipoConcierge; produtos: readonly string[] } }> {
  const slug = (produto || '').toUpperCase()
  return Object.entries(CATEGORIAS_CONCIERGE)
    .filter(([, cfg]) => {
      const produtos = cfg.produtos as readonly string[]
      return produtos.includes('universal') || produtos.includes(slug)
    })
    .map(([key, config]) => ({ key: key as CategoriaConcierge, config: { label: config.label, tipo: config.tipo, produtos: config.produtos as readonly string[] } }))
}

export const TIPO_LABEL: Record<TipoConcierge, { label: string; tone: string; color: string; bgColor: string; borderColor: string; dotColor: string }> = {
  oferta:     { label: 'Oferta',     tone: 'purple',  color: 'text-purple-700',  bgColor: 'bg-purple-50',  borderColor: 'border-purple-200',  dotColor: 'bg-purple-500'  },
  reserva:    { label: 'Reserva',    tone: 'cyan',    color: 'text-cyan-700',    bgColor: 'bg-cyan-50',    borderColor: 'border-cyan-200',    dotColor: 'bg-cyan-500'    },
  suporte:    { label: 'Suporte',    tone: 'red',     color: 'text-red-700',     bgColor: 'bg-red-50',     borderColor: 'border-red-200',     dotColor: 'bg-red-500'     },
  operacional:{ label: 'Operacional',tone: 'emerald', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', dotColor: 'bg-emerald-500' },
}

export const SOURCE_LABEL: Record<SourceConcierge, { label: string }> = {
  cadencia:        { label: 'Cadência'      },
  manual:          { label: 'Manual'        },
  cliente:         { label: 'Cliente'       },
  planner_request: { label: 'Planner pediu' },
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

  card_titulo: string
  produto: string
  data_viagem_inicio: string | null
  data_viagem_fim: string | null
  pipeline_stage_id: string
  pessoa_principal_id: string | null
  card_valor_estimado: number | null
  card_valor_final: number | null

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

