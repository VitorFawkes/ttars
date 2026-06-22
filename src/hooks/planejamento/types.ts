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

// Rótulos das 6 etapas (jornada aprovada pelo Vitor, 18/06). As CHAVES internas
// continuam as mesmas (a tabela wedding_planejamento_state usa esses slugs); só
// o rótulo mudou. A chave `aditivo` é, na prática, a "Programação Final" — o
// nome interno é legado (slug do AC), mas o rótulo é o que o usuário vê.
export const PLANEJAMENTO_LABEL: Record<EtapaPlanejamento, string> = {
  boas_vindas: 'Boas-vindas & Preparação',
  onboarding: 'Primeira Reunião & Onboarding',
  propostas: 'Ciclo de Definição',
  definicao: 'Reserva do Evento & Documentação',
  passagem: 'Bloqueio de Hospedagem & Ação Promocional',
  aditivo: 'Programação Final',
}

/** Objetivo curto de cada etapa (mostrado na tela do casamento). Alinhado ao
 *  blueprint (EstudoWeddings): Planejamento DEFINE/CONTRATA; Convidados/Produção EXECUTA. */
export const PLANEJAMENTO_OBJETIVO: Record<EtapaPlanejamento, string> = {
  boas_vindas: 'Ler contrato e formulário, montar 3 opções de destino + hotel e marcar a 1ª reunião.',
  onboarding: 'Apresentar resumo, as 3 opções e a linha do tempo. O casal começa a lista de convidados.',
  propostas: 'Reuniões de ajuste até decidir a região e o formato (resort, pousada ou espaço).',
  definicao: 'Definir o espaço/pacote do casamento, enviar a documentação e receber o contrato do casamento assinado + o sinal.',
  passagem: 'Pagar o sinal do bloqueio, contratar o hotel, definir o nº de quartos a bloquear e definir a ação promocional (tarifa + janela). O disparo das mensagens é em Convidados.',
  aditivo: 'Montar a programação dia a dia e garantir a lista de convidados preenchida. Fecha o Planejamento.',
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

/** Próxima etapa na ordem (null se já é a última). */
export function nextEtapa(etapa: EtapaPlanejamento): EtapaPlanejamento | null {
  const i = PLANEJAMENTO_ORDER.indexOf(etapa)
  return i >= 0 && i < PLANEJAMENTO_ORDER.length - 1 ? PLANEJAMENTO_ORDER[i + 1] : null
}

/** Posição (0-based) da etapa na ordem — usado pra saber se um arrasto avança ou volta. */
export function etapaIndex(etapa: EtapaPlanejamento): number {
  return PLANEJAMENTO_ORDER.indexOf(etapa)
}

// ── Campos do Planejamento (vivem em cards.produto_data, sem migração) ───────
// Chaves novas ww_planej_* + algumas reaproveitadas do funil (ww_*). A captura
// é manual (formulários bons); nenhuma IA aqui.

export const PLANEJ_FIELD = {
  reuniao1: 'ww_planej_data_reuniao1',
  reuniao1Feita: 'ww_planej_reuniao1_feita',
  convidadosEstimado: 'ww_planej_convidados_estimado',
  tema: 'ww_planej_tema',
  regiao: 'ww_planej_regiao',
  formato: 'ww_planej_formato',
  proximaReuniao: 'ww_planej_proxima_reuniao',
  // Etapa 4 — Reserva do Evento (espaço/pacote) + documentação
  espaco: 'ww_planej_espaco',
  tipoLocal: 'ww_planej_tipo_local',
  pacoteNome: 'ww_planej_pacote_nome',
  pacoteValor: 'ww_planej_pacote_valor',
  pacoteInclui: 'ww_planej_pacote_inclui',
  localRegras: 'ww_planej_local_regras',
  itens: 'ww_planej_itens',
  convidadosContrato: 'ww_planej_convidados_contrato',
  contratoAssinado: 'ww_planej_contrato_assinado',
  sinalPagoEm: 'ww_planej_sinal_pago_em',
  sinalValor: 'ww_planej_sinal_valor',
  valorTotal: 'ww_planej_valor_total',
  // Etapa 5 — Bloqueio de hospedagem + ação promocional (definição)
  quartosBloquear: 'ww_planej_quartos_bloquear',
  promoTarifa: 'ww_planej_promo_tarifa',
  promoInicio: 'ww_planej_promo_inicio',
  promoFim: 'ww_planej_promo_fim',
  // Etapa 6 — Programação + lista preenchida
  listaPreenchida: 'ww_planej_lista_preenchida',
  dataHoraCasamento: 'ww_planej_data_hora_casamento',
  notas: 'ww_planej_notas',
} as const

export const REGIAO_OPTIONS: string[] = [
  'Nordeste', 'Sudeste', 'Sul', 'Centro-Oeste', 'Norte', 'Caribe', 'Europa', 'Outro',
]

export const FORMATO_OPTIONS: string[] = ['Resort', 'Pousada', 'Espaço alugado', 'Outro']

// Tipo de local do casamento — define o modelo de "Espaço & Pacote":
// resort/hotel trabalha com PACOTE pré-montado; espaço próprio tem REGRAS próprias.
export type TipoLocal = 'resort_hotel' | 'espaco'
export const TIPO_LOCAL_LABEL: Record<TipoLocal, string> = {
  resort_hotel: 'Resort / Hotel (pacote)',
  espaco: 'Espaço próprio (regras)',
}
export const TIPO_LOCAL_LIST: TipoLocal[] = ['resort_hotel', 'espaco']

/** Como um item do casamento entra (no pacote, negociado, fora, obrigatório do local). */
export const ITEM_COMO_OPTIONS: string[] = [
  'Incluso no pacote',
  'Negociado',
  'Contratar fora',
  'Obrigatório do local',
]

/** Item do Espaço & Pacote (guardado como JSON em cards.produto_data[ww_planej_itens]). */
export interface EspacoItem {
  nome: string
  como: string
  valor: number | null
}

export type AcaoPromoStatus = 'nao' | 'agendada' | 'disparada' | 'encerrada'

export const ACAO_PROMO_LABEL: Record<AcaoPromoStatus, string> = {
  nao: 'Não iniciada',
  agendada: 'Agendada',
  disparada: 'Disparada',
  encerrada: 'Encerrada',
}

export const ACAO_PROMO_LIST: AcaoPromoStatus[] = ['nao', 'agendada', 'disparada', 'encerrada']

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
