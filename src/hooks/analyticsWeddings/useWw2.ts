import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAnalyticsVariant, rpcName } from './AnalyticsVariantContext'

export type DateMode = 'cohort' | 'throughput'

export type StatusLead = 'aberto' | 'perdido'

export type Ww2Filters = {
  dateStart: string
  dateEnd: string
  dateMode: DateMode
  origins?: string[]
  faixas?: string[]
  destinos?: string[]
  tipos?: string[]
  consultorIds?: string[]
  convidados?: string[]
  canalSdr?: string[]
  canalCloser?: string[]
  /** Status do lead (20260612a): aberto = nem ganhou nem perdeu · perdido = is_perdido */
  statusLead?: StatusLead | ''
}

// p_status_lead só vai quando usado — compat com funções antigas até a promoção
const statusParam = (f: Pick<Ww2Filters, 'statusLead'>) =>
  (f.statusLead ? { p_status_lead: f.statusLead } : {})

const baseParams = (orgId: string | undefined, f: Ww2Filters) => ({
  p_date_start: f.dateStart,
  p_date_end: f.dateEnd,
  p_date_mode: f.dateMode,
  p_org_id: orgId,
  p_origins: f.origins?.length ? f.origins : null,
  p_faixas: f.faixas?.length ? f.faixas : null,
  p_destinos: f.destinos?.length ? f.destinos : null,
  p_tipos: f.tipos?.length ? f.tipos : null,
  p_consultor_ids: f.consultorIds?.length ? f.consultorIds : null,
})

// Tipo de reunião (canal SDR/Closer) — só envia quando usado. Mantém compat com as
// funções antigas de prod até a promoção da 20260611a (ordem: banco → deploy).
const canalParams = (f: Pick<Ww2Filters, 'canalSdr' | 'canalCloser'>) => ({
  ...(f.canalSdr?.length ? { p_sdr_canal: f.canalSdr } : {}),
  ...(f.canalCloser?.length ? { p_closer_canal: f.canalCloser } : {}),
})

// ── Types retornados pelas RPCs ──────────────────────────────────────────────

export type Ww2OverviewKpis = {
  mode: DateMode
  leads: number
  leads_prev: number
  reunioes: number
  reunioes_prev: number
  propostas: number
  propostas_prev: number
  fechados: number
  fechados_prev: number
  ticket_medio?: number
  receita?: number
}

export type Ww2FunnelStage = {
  phase_label: string
  phase_order: number | null
  phase_slug: string
  stage_id: string | null
  stage_slug: string
  stage_name: string
  stage_order: number | null
  stage_active: boolean
  is_won: boolean
  is_lost: boolean
  leads_count: number
}

export type Ww2Conversao = {
  phase_label: string
  phase_order: number
  leads: number
  taxa_vs_anterior: number | null
}

export type Ww2Alerta = {
  card_id: string
  titulo: string
  stage_name: string
  phase_label: string
  dias_parado: number
  valor_estimado: number | null
  ac_deal_id: string | null
  ac_pipeline_nome: string | null
}

export type Ww2Overview = {
  date_start: string
  date_end: string
  date_mode: DateMode
  prev_start: string
  prev_end: string
  pipeline_id: string
  org_id: string
  kpis: Ww2OverviewKpis
  funnel: Ww2FunnelStage[]
  conversoes: Ww2Conversao[]
  alertas: Ww2Alerta[]
  error?: string
}

export type Ww2TeamRow = {
  user_id: string
  nome: string | null
  leads: number
  qualificados?: number
  fechados?: number
  perdidos?: number
  taxa_qualif?: number
  taxa_fechamento?: number
  ticket_medio?: number
  tempo_medio_dias?: number
  casamentos_em_andamento?: number
  concluidos?: number
}

export type Ww2TeamPerformance = {
  sdr: Ww2TeamRow[]
  closer: Ww2TeamRow[]
  planner: Ww2TeamRow[]
}

export type Ww2Dist = { label: string; qtd: number; pct: number }
export type Ww2FaixaConv = { faixa: string; leads: number; fechados: number; taxa: number }
export type Ww2DestinoConv = { destino: string; leads: number; fechados: number; taxa: number }
export type Ww2FaixaXConv = { faixa: string; convidados: string; qtd: number }
export type Ww2FaixaXLocal = { faixa: string; destino: string; qtd: number }
export type Ww2ConvXLocal = { convidados: string; destino: string; qtd: number }

export type Ww2LeadQuality = {
  distribuicoes: {
    faixa: Ww2Dist[]
    convidados: Ww2Dist[]
    destino: Ww2Dist[]
  }
  cruzamentos: {
    faixa_conv: Ww2FaixaConv[]
    destino_conv: Ww2DestinoConv[]
    faixa_x_convidados: Ww2FaixaXConv[]
    faixa_x_local: Ww2FaixaXLocal[]
    convidados_x_local: Ww2ConvXLocal[]
  }
  perfil_ideal: {
    faixa_top: string | null
    convidados_top: string | null
    destino_top: string | null
    origem_top: string | null
    total_fechados: number
  }
}

export type Ww2Origem = {
  origem: string
  leads: number
  qualificados: number
  fechados: number
  taxa_qualif: number
  taxa_fechamento: number
  ticket_medio: number
  tempo_qualif_medio_dias: number | null
}

export type Ww2Campaign = { campaign: string; leads: number; fechados: number; taxa: number }
export type Ww2Medium = { medium: string; leads: number; fechados: number }
export type Ww2FunilOrigem = { origem: string; novo: number; qualificado: number; fechado: number }

export type Ww2Marketing = {
  por_origem: Ww2Origem[]
  por_campaign: Ww2Campaign[]
  por_medium: Ww2Medium[]
  funil_origem: Ww2FunilOrigem[]
}

export type Ww2Motivo = { motivo: string; qtd: number }
export type Ww2MotivoFaixa = { motivo: string; faixa: string; qtd: number }
export type Ww2MotivoCanal = { motivo: string; canal: string; qtd: number }
export type Ww2Tendencia = { mes: string; motivo: string; qtd: number }

export type Ww2LossReasons = {
  motivos_sdr: Ww2Motivo[]
  motivos_closer: Ww2Motivo[]
  motivo_faixa: Ww2MotivoFaixa[]
  // Motivo × tipo de reunião (20260611a): só casais que FIZERAM a reunião. Opcional até a promoção.
  motivo_canal?: Ww2MotivoCanal[]
  motivo_canal_closer?: Ww2MotivoCanal[]
  tendencia: Ww2Tendencia[]
}

export type Ww2FilterOptions = {
  origens: string[]
  faixas: string[]
  destinos: string[]
  tipos: string[]
  consultores: { id: string; nome: string }[]
}

// ── Hooks ────────────────────────────────────────────────────────────────────

function useOrgId() {
  const { org } = useOrg()
  return org?.id
}

async function callRpc<T>(fnName: string, params: Record<string, unknown>): Promise<T | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fnName, params)
  if (error) throw error
  return data as T
}

export function useWw2Overview(filters: Ww2Filters) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  return useQuery({
    queryKey: ['ww2', 'overview', variant, orgId, filters],
    queryFn: () => callRpc<Ww2Overview>(rpcName('ww2_overview', variant), {
      ...baseParams(orgId, filters),
      ...canalParams(filters),
      ...statusParam(filters),
      // só envia quando usado — compat com a função antiga até a promoção
      ...(filters.convidados?.length ? { p_convidados: filters.convidados } : {}),
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

export function useWw2TeamPerformance(filters: Ww2Filters) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww2', 'team', orgId, filters],
    queryFn: () => callRpc<Ww2TeamPerformance>('ww2_team_performance', baseParams(orgId, filters)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

export function useWw2LeadQuality(filters: Ww2Filters) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww2', 'quality', orgId, filters],
    queryFn: () => callRpc<Ww2LeadQuality>('ww2_lead_quality', baseParams(orgId, filters)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

export function useWw2Marketing(filters: Ww2Filters) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  return useQuery({
    queryKey: ['ww2', 'marketing', variant, orgId, filters],
    queryFn: () => callRpc<Ww2Marketing>(rpcName('ww2_marketing', variant), {
      ...baseParams(orgId, filters),
      ...canalParams(filters),
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

export function useWw2LossReasons(filters: Ww2Filters) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  return useQuery({
    queryKey: ['ww2', 'loss', variant, orgId, filters],
    queryFn: () => callRpc<Ww2LossReasons>(rpcName('ww2_loss_reasons', variant), {
      ...baseParams(orgId, filters),
      ...canalParams(filters),
      // só envia quando usado — mantém compat com a função antiga até a promoção
      ...(filters.convidados?.length ? { p_convidados: filters.convidados } : {}),
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

export type DrillMarco = 'entrou' | 'marcou_sdr' | 'fez_sdr' | 'marcou_closer' | 'fez_closer' | 'ganho' | 'perdido' | 'aberto'

export type DrillFilters = {
  dateStart: string
  dateEnd: string
  dateMode?: DateMode
  stageId?: string
  phaseSlug?: string
  status?: 'aberto' | 'ganho' | 'perdido' | 'fechado_efetivo'
  // Marco do funil (drill v2 — ww_drill_casais): mesma régua cumulativa dos agregados.
  // Quando presente, vence o `status` (que vira só compat das telas antigas).
  marco?: DrillMarco
  faixa?: string
  destino?: string
  convidados?: string
  origem?: string
  consultorId?: string
  motivoPerda?: string
  /** Recorta o motivo ao funil: lista SDR vs lista Closer (drill v2) */
  motivoRole?: 'sdr' | 'closer'
  /** Status do lead (drill v4): mesmo recorte do filtro da aba */
  statusLead?: StatusLead | ''
  // Filtros ATIVOS da barra da aba (arrays) — auditoria 2026-06-11: o drill tem que
  // respeitar o mesmo recorte que gerou o número clicado (20260611b no banco).
  origins?: string[]
  faixas?: string[]
  destinos?: string[]
  convidadosList?: string[]
  tipos?: string[]
  consultorIds?: string[]
  canalSdr?: string[]
  canalCloser?: string[]
  // Singulares server-side no drill v2 (eram client-side no drill antigo):
  tipo?: string
  campaign?: string
  medium?: string
  limit?: number
  offset?: number
}

// ── Drill v2 — ww_drill_casais (universo ACTIVE, alinhado aos agregados) ─────
// Lista os casais por trás de QUALQUER número clicado: mesma régua de período
// (cohort/throughput), marcos cumulativos do ww_funil_conversao_v1, throughput
// por data do marco (ww_serie_temporal). Toda linha tem ac_deal_id → botão Active.

export type WwDrillCasalRow = {
  contact_id: string
  deal_title: string | null
  tipo: string | null
  lead_created_at: string | null
  faixa: string | null
  convidados: string | null
  destino: string | null
  origem: string | null
  consultor_nome: string | null
  canal_sdr: string | null
  canal_closer: string | null
  agendou_sdr_at: string | null
  fez_sdr_at: string | null
  agendou_closer_at: string | null
  fez_closer_at: string | null
  ganho_at: string | null
  ganho: boolean
  is_perdido: boolean
  ac_deal_id: string | null
  campaign: string | null
  medium: string | null
  motivo_perda: string | null
  card_id: string | null
  valor_final: number | null
  contato_nome: string | null
  contato_telefone: string | null
}

export type WwDrillCasais = {
  total: number
  limit: number
  offset: number
  rows: WwDrillCasalRow[]
}

// Compat: telas antigas passam `status`; o universo Active fala em marco.
const statusParaMarco = (f: DrillFilters): DrillMarco | null => {
  if (f.marco) return f.marco
  if (f.status === 'ganho' || f.status === 'fechado_efetivo') return 'ganho'
  if (f.status === 'perdido') return 'perdido'
  if (f.status === 'aberto') return 'aberto'
  return null
}

export function useWwDrillCasais(filters: DrillFilters | null) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  return useQuery({
    queryKey: ['ww', 'drill-casais', variant, orgId, filters],
    queryFn: () => filters
      ? callRpc<WwDrillCasais>(rpcName('ww_drill_casais', variant), {
          p_date_start: filters.dateStart,
          p_date_end: filters.dateEnd,
          p_date_mode: filters.dateMode ?? 'cohort',
          p_org_id: orgId,
          p_marco: statusParaMarco(filters),
          p_phase_slug: filters.phaseSlug ?? null,
          p_faixa: filters.faixa ?? null,
          p_destino: filters.destino ?? null,
          p_convidados: filters.convidados ?? null,
          p_origem: filters.origem ?? null,
          p_tipo: filters.tipo ?? null,
          p_campaign: filters.campaign ?? null,
          p_medium: filters.medium ?? null,
          p_motivo_perda: filters.motivoPerda ?? null,
          p_motivo_role: filters.motivoRole ?? null,
          p_consultor_id: filters.consultorId ?? null,
          p_status_lead: filters.statusLead || null,
          p_limit: filters.limit ?? 50,
          p_offset: filters.offset ?? 0,
          // arrays só quando ativos — payload enxuto
          ...(filters.origins?.length ? { p_origins: filters.origins } : {}),
          ...(filters.faixas?.length ? { p_faixas: filters.faixas } : {}),
          ...(filters.destinos?.length ? { p_destinos: filters.destinos } : {}),
          ...(filters.convidadosList?.length ? { p_convidados_list: filters.convidadosList } : {}),
          ...(filters.tipos?.length ? { p_tipos: filters.tipos } : {}),
          ...(filters.consultorIds?.length ? { p_consultor_ids: filters.consultorIds } : {}),
          ...(filters.canalSdr?.length ? { p_sdr_canal: filters.canalSdr } : {}),
          ...(filters.canalCloser?.length ? { p_closer_canal: filters.canalCloser } : {}),
        })
      : Promise.resolve(null),
    enabled: !!orgId && !!filters,
    staleTime: 30_000,
  })
}

// ── Journey ─────────────────────────────────────────────────────────────────

export type Ww2FunilPasso = {
  passo: string
  ordem: number
  cards: number
  pct_total: number
  pct_anterior: number | null
}

export type Ww2TempoMetrico = {
  amostra: number
  mediana_dias: number | null
  p75_dias: number | null
  avg_dias?: number | null
  nota?: string
}

export type Ww2Tempos = {
  lead_para_reuniao_sdr: Ww2TempoMetrico
  reuniao_sdr_para_reuniao_closer: Ww2TempoMetrico
  lead_para_closer: Ww2TempoMetrico
  lead_para_fechamento: Ww2TempoMetrico
}

export type Ww2OrcamentoReal = {
  faixa_entrada: string
  leads_total: number
  leads_fechados: number
  leads_com_valor: number
  valor_medio_real: number
  valor_mediano_real: number
  taxa_fechamento: number
}

export type Ww2DestinoMudou = {
  destino_entrada: string
  leads_total: number
  manteve: number
  mudou: number
  sem_dado_final: number
  pct_manteve: number | null
  principal_destino_final: string | null
}

export type Ww2LeadPreso = {
  card_id: string
  titulo: string
  gargalo: string
  dias: number
  origem: string
  faixa: string | null
}

export type Ww2DadosFechamento = {
  cards_com_dados_fechamento: number
  grupo_whats_sim: number
  grupo_whats_nao: number
  cards_com_valor_pacote: number
  valor_pacote_mediano: number | null
  valor_pacote_medio: number | null
  cerimonial_top: { qtd_cerimonialista: string; cards: number }[] | null
  prazo_contrato_top: { prazo: string; cards: number }[] | null
  cards_com_monde_venda: number
}

export type Ww2Journey = {
  date_start: string
  date_end: string
  pipeline_id: string
  org_id: string
  funil_real: Ww2FunilPasso[]
  funil_real_por_contato?: Ww2FunilPasso[]
  tempos: Ww2Tempos
  orcamento_real: Ww2OrcamentoReal[]
  destino_mudou: Ww2DestinoMudou[]
  ranking_lentos: Ww2LeadPreso[]
  dados_fechamento?: Ww2DadosFechamento
}

// ── Entrada × Realidade ─────────────────────────────────────────────────────

export type Ww2CelulaMatriz = { entrada: string; real: string; qtd: number }
export type Ww2SumarioOrdenavel = {
  entrada: string
  total: number
  sem_real: number
  manteve: number
  subiu: number
  desceu: number
  pct_manteve: number | null
  pct_drift_up: number | null
  pct_drift_down: number | null
}
export type Ww2SumarioDestino = {
  entrada: string
  total: number
  sem_real: number
  manteve: number
  mudou: number
  pct_manteve: number | null
  pct_mudou: number | null
  mais_comum_quando_muda: string | null
}
export type Ww2Transicao = { de: string; para: string; qtd: number }

export type Ww2ValorPorFaixa = {
  entrada: string
  amostra: number
  p25: number | null
  mediana: number | null
  p75: number | null
  media: number | null
  minimo: number | null
  maximo: number | null
}

export type Ww2DimensaoOrdenavel = {
  ordem_categorias: string[]
  matriz: Ww2CelulaMatriz[]
  sumario: Ww2SumarioOrdenavel[]
  top_transicoes: Ww2Transicao[]
  com_entrada: number
  com_refinado: number
}

export type Ww2DimensaoInvestimento = Ww2DimensaoOrdenavel & {
  valor_pacote_por_faixa: Ww2ValorPorFaixa[]
  com_valor_real: number
}

export type Ww2DimensaoDestino = {
  matriz: Ww2CelulaMatriz[]
  sumario: Ww2SumarioDestino[]
  top_transicoes: Ww2Transicao[]
  destino_livre_quando_outro: { texto: string; qtd: number }[]
  com_entrada: number
  com_refinado: number
}

export type Ww2EntradaRealidade = {
  date_start: string
  date_end: string
  pipeline_id: string
  org_id: string
  only_fechados: boolean
  total_leads: number
  total_fechados: number
  convidados: Ww2DimensaoOrdenavel
  investimento: Ww2DimensaoInvestimento
  destino: Ww2DimensaoDestino
}

export function useWw2EntradaRealidade(filters: Ww2Filters & { onlyFechados?: boolean }) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww2', 'entrada-realidade', orgId, filters],
    queryFn: () => callRpc<Ww2EntradaRealidade>('ww2_entrada_realidade', {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_org_id: orgId,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_only_fechados: filters.onlyFechados ?? false,
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

export function useWw2Journey(filters: Ww2Filters) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww2', 'journey', orgId, filters],
    queryFn: () => callRpc<Ww2Journey>('ww2_journey', baseParams(orgId, filters)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ── Visão A: Qualidade do Lead (taxa de conversão + ticket por categoria) ───
export type WwQualidadeCategoria = {
  categoria: string
  entraram: number
  fecharam: number
  taxa_pct: number | null
  ticket_medio: number | null
  ticket_p25: number | null
  ticket_p75: number | null
  ticket_amostra: number
}

export type WwQualidadeHeatmap = {
  faixa: string
  destino: string
  entraram: number
  fecharam: number
  taxa_pct: number | null
  ticket_medio: number | null
}

export type WwQualidadeOutrosBucket = {
  entraram: number | null
  fecharam: number | null
  categorias_agrupadas: string[] | null
}

export type WwQualidadeCruzamentoCelula = {
  linha: string
  coluna: string
  entraram: number
  fecharam: number
  taxa_pct: number | null
}

export type WwQualidadeEvolucaoMes = {
  mes: string
  categoria: string
  entraram: number
  fecharam: number
  taxa_pct: number | null
}

export type WwPerfilCompareItem = {
  categoria: string
  entrada_qtd: number
  entrada_pct: number | null
  fechou_qtd: number
  fechou_pct: number | null
  lift: number | null
}

export type WwPerfilCompareDimensao = {
  dimensao: 'faixa' | 'destino' | 'convidados' | 'origem' | 'tipo' | string
  dados: WwPerfilCompareItem[]
}

// Conversão por tipo de reunião (20260611a) — universo = quem FEZ a reunião por aquele canal.
export type WwQualidadeCanal = {
  categoria: string
  entraram: number
  fecharam: number
  taxa_pct: number | null
}

export type WwQualidadeLead = {
  date_start: string
  date_end: string
  date_mode: 'cohort' | 'throughput'
  min_amostra?: number
  total_entraram: number
  total_fecharam: number
  taxa_conversao_geral_pct: number | null
  cobertura: { com_faixa: number; com_destino: number; com_convidados: number }
  por_faixa: WwQualidadeCategoria[]
  por_destino: WwQualidadeCategoria[]
  por_convidados: WwQualidadeCategoria[]
  por_canal_sdr?: WwQualidadeCanal[]
  por_canal_closer?: WwQualidadeCanal[]
  outros_amostra_pequena?: {
    faixa?: WwQualidadeOutrosBucket
    destino?: WwQualidadeOutrosBucket
    convidados?: WwQualidadeOutrosBucket
  }
  heatmap_faixa_destino: WwQualidadeHeatmap[]
  cruzamentos?: {
    faixa_x_origem?: WwQualidadeCruzamentoCelula[]
    destino_x_origem?: WwQualidadeCruzamentoCelula[]
    faixa_x_tipo?: WwQualidadeCruzamentoCelula[]
    convidados_x_origem?: WwQualidadeCruzamentoCelula[]
  }
  evolucao_mensal_por_faixa?: WwQualidadeEvolucaoMes[]
  comparacao_entrada_vs_fechamento?: WwPerfilCompareDimensao[]
  error?: string
}

export function useWwQualidadeLead(filters: Ww2Filters, eventStageId?: string | null, minAmostra: number = 3) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  // Qualidade do lead é SEMPRE por safra (cohort): leads criados no período.
  // O modo throughput foi descontinuado (colapsava para 100% e ignorava a etapa);
  // eventStageId é aceito por compat de assinatura, mas não é mais usado.
  void eventStageId
  return useQuery({
    queryKey: ['ww', 'qualidade-lead', variant, orgId, filters.dateStart, filters.dateEnd, filters.origins, filters.tipos, filters.canalSdr ?? null, filters.canalCloser ?? null, filters.statusLead ?? null, minAmostra],
    queryFn: () => callRpc<WwQualidadeLead>(rpcName('ww_qualidade_lead', variant), {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_org_id: orgId,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_date_mode: 'cohort',
      p_event_stage_id: null,
      p_tipos: filters.tipos?.length ? filters.tipos : null,
      p_min_amostra: minAmostra,
      p_sdr_canal: filters.canalSdr?.length ? filters.canalSdr : null,
      // só envia quando usado — compat com a função antiga até a promoção
      ...(filters.canalCloser?.length ? { p_closer_canal: filters.canalCloser } : {}),
      ...statusParam(filters),
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ── Visão B: Drift da Venda (entrada × o que vendeu) ────────────────────────
export type WwDriftInvestimentoMatriz = { faixa_e: string; faixa_v: string; qtd: number; ticket_medio: number | null }
export type WwDriftTicketPorEntrada = {
  faixa_e: string
  amostra: number
  ticket_medio: number | null
  p25: number | null
  mediana: number | null
  p75: number | null
  minv: number | null
  maxv: number | null
}
export type WwDriftDestinoMatriz = { dest_e: string; dest_v: string; qtd: number }
export type WwDriftConvidadosMatriz = { conv_e: string; conv_r: string; qtd: number }
export type WwDriftBreakdownTipo = { tipo: string; fechados: number; convidados_medio: number | null }
export type WwDriftVendaItem = {
  card_id: string
  titulo: string | null
  data_venda: string | null
  num_convidados: number | null
  tipo_casamento: string | null
  monde_venda: string | null
  destino_vendido: string | null
  // Enriquecimentos da Onda 3 (migration 20260527v_ww_drift_venda_v2)
  origem?: string | null
  valor_final?: number | null
  consultor_nome?: string | null
  contato_nome?: string | null
  contato_external_id?: string | null
  // Enriquecimento Onda 6 (migration 20260527za)
  ac_deal_id?: string | null
}

export type WwDriftPorOrigem = {
  origem: string
  vendas: number
  manteve: number; subiu: number; desceu: number
  manteve_pct: number | null; subiu_pct: number | null; desceu_pct: number | null
  ticket_medio_vendido: number | null
}

export type WwDriftPorConsultor = {
  consultor_id: string
  consultor_nome: string | null
  vendas: number
  manteve: number; subiu: number; desceu: number
  manteve_pct: number | null; subiu_pct: number | null; desceu_pct: number | null
  ticket_medio: number | null
}

export type WwDriftPorMes = {
  mes: string
  vendas: number
  manteve_pct: number | null; subiu_pct: number | null; desceu_pct: number | null
}

export type WwDriftVenda = {
  date_start: string
  date_end: string
  date_mode: 'cohort' | 'throughput'
  total_leads: number
  total_fechados: number
  total_vendas: number  // alias legacy = total_fechados
  breakdown_tipo: WwDriftBreakdownTipo[]
  vendas_lista: WwDriftVendaItem[]
  investimento: {
    cobertura: { total_leads: number; total_fechados: number; com_entrada: number; com_realidade: number; com_ambos: number }
    drift: { manteve: number; subiu: number; desceu: number }
    matriz: { faixa_e: string; faixa_v: string; qtd: number }[]
  }
  destino: {
    cobertura: { total_leads: number; total_fechados: number; com_entrada: number; com_vendido: number; com_ambos: number }
    drift: { manteve: number; mudou: number }
    matriz: WwDriftDestinoMatriz[]
    top_migracoes: { de: string; para: string; qtd: number }[]
  }
  convidados: {
    cobertura: { total_leads: number; total_fechados: number; com_entrada: number; com_realidade: number; com_ambos: number; com_numero_exato: number }
    drift: { manteve: number; subiu: number; desceu: number }
    matriz: WwDriftConvidadosMatriz[]
  }
  drift_por_origem?: WwDriftPorOrigem[]
  drift_por_consultor?: WwDriftPorConsultor[]
  drift_por_mes?: WwDriftPorMes[]
  error?: string
}

export function useWwDriftVenda(filters: Ww2Filters) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  return useQuery({
    queryKey: ['ww', 'drift-venda-v2', variant, orgId, filters.dateStart, filters.dateEnd, filters.dateMode, filters.origins, filters.tipos, filters.canalSdr ?? null, filters.canalCloser ?? null],
    queryFn: () => callRpc<WwDriftVenda>(rpcName('ww_v2_drift_venda', variant), {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_org_id: orgId,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_date_mode: filters.dateMode,
      p_tipos: filters.tipos?.length ? filters.tipos : null,
      ...canalParams(filters),
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ── Drift Combos (Entrada × Realidade, Onda 6) ─────────────────────────────
export type WwDriftCombo3D = {
  faixa: string
  destino: string
  convidados: string
  fechou: number
  entrou: number
  taxa_pct: number | null
}

export type WwDriftMatrizCell = {
  x: string
  y: string
  entrou: number
  fechou: number
  taxa_pct: number | null
}

export type WwDriftCombos = {
  date_start: string
  date_end: string
  date_mode: 'cohort' | 'throughput'
  total_leads: number
  total_fechados: number
  top_combos_entrada: { faixa: string; destino: string; convidados: string; qtd: number; pct: number | null }[]
  top_combos_fechados: WwDriftCombo3D[]
  matriz_faixa_conv: WwDriftMatrizCell[]
  matriz_faixa_destino: WwDriftMatrizCell[]
  matriz_destino_conv: WwDriftMatrizCell[]
  error?: string
}

export function useWwDriftCombos(filters: Ww2Filters) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  return useQuery({
    queryKey: ['ww', 'drift-combos', variant, orgId, filters.dateStart, filters.dateEnd, filters.dateMode, filters.tipos, filters.origins, filters.canalSdr ?? null, filters.canalCloser ?? null],
    queryFn: () => callRpc<WwDriftCombos>(rpcName('ww_drift_combos', variant), {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_org_id: orgId,
      p_date_mode: filters.dateMode,
      p_tipos: filters.tipos?.length ? filters.tipos : null,
      // só envia quando usado — mantém compat com a função antiga até a promoção
      ...(filters.origins?.length ? { p_origins: filters.origins } : {}),
      ...canalParams(filters),
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ── Lead Ideal × Pipeline (refatorado Onda 4) ──────────────────────────────
export type WwLeadIdealItem = {
  categoria: string
  historico_qtd: number
  historico_pct: number | null
  atual_qtd: number
  atual_pct: number | null
  lift: number | null
  delta_pp: number | null
  // Variante "entradas" (leads que entravam na referência) — opcional: só vem
  // quando a RPC devolve o lado de leads históricos além de quem fechou.
  historico_leads_qtd?: number | null
  historico_leads_pct?: number | null
}

export type WwLeadIdealDim = {
  dimensao: 'faixa' | 'destino' | 'convidados' | string
  dados: WwLeadIdealItem[]
}

export type WwLeadIdealCruzamentoCell = {
  x: string
  y: string
  hist_qtd: number
  hist_pct: number | null
  atual_qtd: number
  atual_pct: number | null
  // Lente "leads antes" (entrada na janela de referência) — opcional: só vem
  // quando a RPC devolve o terceiro número (além de vendas e leads agora).
  hist_leads_qtd?: number | null
  hist_leads_pct?: number | null
}

export type WwLeadIdealPerfilTop = {
  faixa: string
  destino: string
  convidados: string
  qtd: number
  pct: number | null
}

// Top perfis UNIFICADO: combo (faixa+destino+convidados) com os 3 números na mesma
// linha — vendas (referência), leads que entravam antes, leads que entram agora.
export type WwLeadIdealPerfilUnif = {
  faixa: string
  destino: string
  convidados: string
  vendas: number
  vendas_pct: number | null
  leads_ref: number
  leads_ref_pct: number | null
  leads_agora: number
  leads_agora_pct: number | null
}

export type WwLeadIdealData = {
  atual_start: string
  atual_end: string
  historico_start: string
  historico_end: string
  total_historico: number
  total_atual: number
  comparacoes: WwLeadIdealDim[]
  // Cruzamento LIVRE: um único par de eixos escolhido pela UI (p_cruz_x/p_cruz_y).
  cruzamento?: WwLeadIdealCruzamentoCell[]
  referencia?: 'ganho' | 'perdido'
  cruz_x?: string
  cruz_y?: string
  top_perfis_historico?: WwLeadIdealPerfilTop[]
  top_perfis_atual?: WwLeadIdealPerfilTop[]
  // Top perfis unificado (vendas + leads antes + leads agora na mesma linha) —
  // opcional: só vem quando a RPC monta o ranking unificado.
  top_perfis_unificado?: WwLeadIdealPerfilUnif[]
  error?: string
}

export type WwLeadIdealParams = {
  atualStart: string
  atualEnd: string
  historicoStart?: string | null
  historicoEnd?: string | null
  historicoMeses?: number
  minAmostra?: number
  origins?: string[]
  consultorIds?: string[]
  faixas?: string[]
  destinos?: string[]
  convidados?: string[]
  tipos?: string[]
  sdrCanal?: string[]
  closerCanal?: string[]
  referencia?: 'ganho' | 'perdido'
  cruzX?: string
  cruzY?: string
}

export function useWwLeadIdeal(params: WwLeadIdealParams) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  const minAmostra = params.minAmostra ?? 2
  const usaJanelaCustom = !!(params.historicoStart && params.historicoEnd)
  const referencia = params.referencia ?? 'ganho'
  const cruzX = params.cruzX ?? 'faixa'
  const cruzY = params.cruzY ?? 'convidados'
  const arr = (v?: string[]) => (v && v.length ? v : null)
  return useQuery({
    queryKey: ['ww', 'lead-ideal-v2', variant, orgId, params.atualStart, params.atualEnd, params.historicoStart ?? null, params.historicoEnd ?? null, params.historicoMeses ?? 12, minAmostra,
      params.origins ?? null, params.consultorIds ?? null, params.faixas ?? null, params.destinos ?? null, params.convidados ?? null, params.tipos ?? null,
      params.sdrCanal ?? null, params.closerCanal ?? null, referencia, cruzX, cruzY],
    queryFn: () => callRpc<WwLeadIdealData>(rpcName('ww_v2_lead_ideal', variant), {
      p_atual_start: params.atualStart,
      p_atual_end: params.atualEnd,
      p_org_id: orgId,
      p_historico_start: usaJanelaCustom ? params.historicoStart : null,
      p_historico_end:   usaJanelaCustom ? params.historicoEnd : null,
      p_historico_meses: params.historicoMeses ?? 12,
      p_min_amostra: minAmostra,
      p_origins: arr(params.origins),
      p_consultor_ids: arr(params.consultorIds),
      p_faixas: arr(params.faixas),
      p_destinos: arr(params.destinos),
      p_convidados: arr(params.convidados),
      p_tipos: arr(params.tipos),
      p_sdr_canal: arr(params.sdrCanal),
      p_closer_canal: arr(params.closerCanal),
      p_referencia: referencia,
      p_cruz_x: cruzX,
      p_cruz_y: cruzY,
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ── Marketing qualidade (Onda 5) ───────────────────────────────────────────
export type WwMarketingOrigemRow = {
  origem: string
  leads_total: number
  qualificados: number
  fechados: number
  taxa_qualif_pct: number | null
  taxa_fechamento_pct: number | null
  lift_vs_geral: number | null
  ticket_medio: number | null
  pct_email_valido: number | null
  pct_tel_valido: number | null
}

export type WwMarketingCampanhaRow = {
  origem: string
  campaign: string
  medium: string
  leads: number
  qualif: number
  fechou: number
  taxa_qualif_pct: number | null
  taxa_fech_pct: number | null
  lift_vs_geral: number | null
  ticket_medio: number | null
}

export type WwMarketingDropOffRow = {
  origem: string
  entrada: number
  sdr: number
  closer: number
  pos_venda: number
  fechado: number
  drop_entrada_sdr: number | null
  drop_sdr_closer: number | null
  drop_closer_fechado: number | null
}

export type WwMarketingQualidade = {
  date_start: string
  date_end: string
  total_leads: number
  total_fechados: number
  taxa_geral_pct: number | null
  por_origem: WwMarketingOrigemRow[]
  por_campaign: WwMarketingCampanhaRow[]
  dropoff_por_origem: WwMarketingDropOffRow[]
  // Origem × faixa declarada no site (20260611a). Opcional até a promoção.
  origem_x_faixa?: WwDriftMatrizCell[]
  error?: string
}

export function useWwMarketingQualidade(filters: Ww2Filters, minAmostra: number = 2) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  return useQuery({
    queryKey: ['ww', 'marketing-qualidade', variant, orgId, filters.dateStart, filters.dateEnd, filters.origins, filters.tipos, filters.canalSdr ?? null, filters.canalCloser ?? null, minAmostra],
    queryFn: () => callRpc<WwMarketingQualidade>(rpcName('ww_marketing_qualidade', variant), {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_org_id: orgId,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_min_amostra: minAmostra,
      p_tipos: filters.tipos?.length ? filters.tipos : null,
      ...canalParams(filters),
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

export function useWw2FilterOptions() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww2', 'options', orgId],
    queryFn: () => callRpc<Ww2FilterOptions>('ww2_filter_options', { p_org_id: orgId }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
}

// ── Funil comparado (aba "Funil comparado") ─────────────────────────────────
// Reusa o RPC ww_funil_conversao_v1 (6 marcos de venda, filtra os campos de
// ENTRADA ww_mkt_*_form com normalizadores strict). Chamado 2x na aba (um por
// período) com o MESMO filtro de perfil. ATENÇÃO: os marcos são flags
// independentes — não são supersets estritos (marcou_closer pode ser > fez_sdr),
// então a "passagem %" pode passar de 100%. A UI não deve assumir monotonia.

export type WwFunilConversaoMarcos = {
  entrou: number
  marcou_sdr: number
  fez_sdr: number
  marcou_closer: number
  fez_closer: number
  ganho: number
}

export type WwFunilConversaoData = {
  periodo: { date_start: string; date_end: string; date_mode: DateMode }
  pipeline_id: string
  org_id: string
  filtros_aplicados: Record<string, unknown>
  ac_sync: { last_event_at: string | null; minutes_ago: number | null; status: string }
  baseline: WwFunilConversaoMarcos
  filtrado: WwFunilConversaoMarcos
  baseline_total: number
  filtrado_total: number
  elopement_ganho?: number
  distincts_disponiveis: { faixas: number; convidados: number; destinos: number }
  tem_filtro_preenchimento: boolean
  error?: string
}

export function useWwFunilConversao(filters: Ww2Filters) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  return useQuery({
    queryKey: ['ww', 'funil-conversao-v1', variant, orgId, filters.dateStart, filters.dateEnd, filters.dateMode,
      filters.faixas, filters.convidados, filters.destinos, filters.origins, filters.tipos, filters.consultorIds,
      filters.canalSdr ?? null, filters.canalCloser ?? null, filters.statusLead ?? null],
    queryFn: () => callRpc<WwFunilConversaoData>(rpcName('ww_funil_conversao_v1', variant), {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_date_mode: filters.dateMode,
      p_org_id: orgId,
      p_faixas: filters.faixas?.length ? filters.faixas : null,
      p_convidados: filters.convidados?.length ? filters.convidados : null,
      p_destinos: filters.destinos?.length ? filters.destinos : null,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_tipos: filters.tipos?.length ? filters.tipos : null,
      p_consultor_ids: filters.consultorIds?.length ? filters.consultorIds : null,
      ...canalParams(filters),
      ...statusParam(filters),
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

export type WwFunilFilterOptions = {
  faixas: string[]
  convidados: string[]
  destinos: string[]
  origens: string[]
  consultores: { id: string; nome: string }[]
  canais_sdr: string[]
  canais_closer: string[]
}

export function useWwFunilFilterOptions() {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  return useQuery({
    queryKey: ['ww', 'funil-filter-options', variant, orgId],
    queryFn: async () => {
      const data = await callRpc<WwFunilFilterOptions>(rpcName('ww_funil_filter_options', variant), { p_org_id: orgId })
      if (!data) return data
      // Guarda contra consultor repetido (mesmo id com nomes diferentes) — a 20260611a
      // conserta na fonte, mas prod antiga ainda devolve duplicado.
      const vistos = new Set<string>()
      return { ...data, consultores: (data.consultores ?? []).filter(c => !vistos.has(c.id) && vistos.add(c.id) !== undefined) }
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
}

// ── Ranking de perfis por taxa de fechamento ("quais perfis mais viram casamento")
// Suporta CRUZAMENTOS (1, 2 ou 3 dimensões). Espelha o pool/ganho do
// ww_funil_conversao_v1 — os números batem com o funil e os rótulos (strict) são
// os mesmos que o funil aceita no filtro. Lead bom = quem mais fecha. Mostra TODOS
// os combos (a UI marca "poucos casos"); a ordenação usa taxa suavizada (shrinkage)
// pra combos de pouca amostra não dominarem o topo.
export type WwFunilRankingDim = 'faixa' | 'convidados' | 'destino' | 'canal_sdr' | 'canal_closer'

export type WwFunilRankingRow = {
  faixa: string | null
  convidados: string | null
  destino: string | null
  // dimensões de canal (20260611a) — presentes só quando a dimensão é pedida
  canal_sdr?: string | null
  canal_closer?: string | null
  label: string
  entrou: number
  // contagens CUMULATIVAS (monotônicas): entrou ≥ marcou_sdr ≥ fez_sdr ≥ marcou_closer ≥ fez_closer ≥ ganho
  marcou_sdr: number
  fez_sdr: number
  marcou_closer: number
  fez_closer: number
  ganho: number
  taxa_pct: number | null
}

export type WwFunilRanking = {
  dimensoes: WwFunilRankingDim[]
  periodo: { date_start: string; date_end: string; date_mode: DateMode }
  total_no_periodo: number
  rows: WwFunilRankingRow[]
  error?: string
}

export function useWwFunilRanking(params: {
  dateStart: string
  dateEnd: string
  dateMode: DateMode
  dimensoes: WwFunilRankingDim[]
  origins?: string[]
  tipos?: string[]
  consultorIds?: string[]
  canalSdr?: string[]
  canalCloser?: string[]
  faixas?: string[]
  convidados?: string[]
  destinos?: string[]
  statusLead?: StatusLead | ''
}) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  return useQuery({
    queryKey: ['ww', 'funil-ranking-combo', variant, orgId, params.dateStart, params.dateEnd, params.dateMode, params.dimensoes, params.origins, params.tipos, params.consultorIds, params.canalSdr ?? null, params.canalCloser ?? null, params.faixas ?? null, params.convidados ?? null, params.destinos ?? null, params.statusLead ?? null],
    queryFn: () => callRpc<WwFunilRanking>(rpcName('ww_funil_ranking_combo', variant), {
      p_date_start: params.dateStart,
      p_date_end: params.dateEnd,
      p_date_mode: params.dateMode,
      p_org_id: orgId,
      p_dimensoes: params.dimensoes,
      p_origins: params.origins?.length ? params.origins : null,
      p_tipos: params.tipos?.length ? params.tipos : null,
      p_consultor_ids: params.consultorIds?.length ? params.consultorIds : null,
      ...canalParams({ canalSdr: params.canalSdr, canalCloser: params.canalCloser }),
      // Auditoria 2026-06-11: os chips de perfil cortam a MATRIZ também (20260611b) —
      // antes só a manchete respeitava e os números divergiam na mesma tela.
      ...(params.faixas?.length ? { p_faixas: params.faixas } : {}),
      ...(params.convidados?.length ? { p_convidados: params.convidados } : {}),
      ...(params.destinos?.length ? { p_destinos: params.destinos } : {}),
      ...statusParam(params),
    }),
    enabled: !!orgId && params.dimensoes.length > 0,
    staleTime: 60_000,
  })
}


// ── Perfil temporal — composição dos leads ao longo do tempo + funil por categoria ──
// Alimenta a seção "Perfil dos leads" da Visão Geral (ww_perfil_temporal).
export type WwPerfilDim = 'destino' | 'faixa' | 'convidados' | 'origem' | 'tipo'
export type WwPerfilMarco = 'entrou' | 'fez_sdr' | 'marcou_closer' | 'fez_closer' | 'ganho'

export type WwPerfilSeriePonto = { periodo: string; label: string; bucket: string; n: number }
export type WwPerfilBucketTotal = { bucket: string; total: number }
export type WwPerfilCategoria = {
  bucket: string
  entrou: number
  fez_sdr: number
  marcou_closer: number
  fez_closer: number
  ganho: number
  taxa_pct: number | null
}
export type WwPerfilGran = 'day' | 'week' | 'month'
export type WwPerfilTemporal = {
  dim: WwPerfilDim
  marco: WwPerfilMarco
  granularidade: WwPerfilGran
  date_mode: DateMode
  total_marco: number
  buckets_top: string[]
  buckets_all: WwPerfilBucketTotal[]
  series: WwPerfilSeriePonto[]
  por_categoria: WwPerfilCategoria[]
  error?: string
}

export function useWwPerfilTemporal(params: {
  dateStart: string
  dateEnd: string
  dateMode: DateMode
  dim: WwPerfilDim
  marco: WwPerfilMarco
  granularidade: WwPerfilGran
  origins?: string[]
  tipos?: string[]
  consultorIds?: string[]
  faixas?: string[]
  convidados?: string[]
  destinos?: string[]
  canalSdr?: string[]
  canalCloser?: string[]
  statusLead?: StatusLead | ''
  maxBuckets?: number
  buckets?: string[]
}) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  const arr = (v?: string[]) => (v && v.length ? v : null)
  return useQuery({
    queryKey: ['ww', 'perfil-temporal', variant, orgId, params.dateStart, params.dateEnd, params.dateMode, params.dim, params.marco, params.granularidade,
      params.origins ?? null, params.tipos ?? null, params.consultorIds ?? null, params.faixas ?? null, params.convidados ?? null, params.destinos ?? null,
      params.canalSdr ?? null, params.canalCloser ?? null, params.statusLead ?? null, params.maxBuckets ?? 8, params.buckets ?? null],
    queryFn: () => callRpc<WwPerfilTemporal>(rpcName('ww_perfil_temporal', variant), {
      p_date_start: params.dateStart,
      p_date_end: params.dateEnd,
      p_org_id: orgId,
      p_dim: params.dim,
      p_marco: params.marco,
      p_granularidade: params.granularidade,
      p_date_mode: params.dateMode,
      p_origins: arr(params.origins),
      p_tipos: arr(params.tipos),
      p_consultor_ids: arr(params.consultorIds),
      p_faixas: arr(params.faixas),
      p_convidados: arr(params.convidados),
      p_destinos: arr(params.destinos),
      p_sdr_canal: arr(params.canalSdr),
      p_closer_canal: arr(params.canalCloser),
      p_status_lead: params.statusLead || null,
      p_max_buckets: params.maxBuckets ?? 8,
      p_buckets: arr(params.buckets),
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ── Série temporal (semana/mês) — alimenta os gráficos de #3 e #7 ────────────
// 20260612c: funil completo — marcou_sdr/marcou_closer entre os marcos existentes
export type WwSeriePonto = {
  periodo: string
  label: string
  entrou: number
  marcou_sdr: number
  fez_sdr: number
  marcou_closer: number
  fez_closer: number
  ganho: number
}
export type WwSerieTemporal = {
  granularidade: 'day' | 'week' | 'month'
  date_mode: DateMode
  series: WwSeriePonto[]
  totais: { entrou: number; marcou_sdr: number; fez_sdr: number; marcou_closer: number; fez_closer: number; ganho: number }
  error?: string
}
export type WwSerieParams = {
  dateStart: string
  dateEnd: string
  granularidade: 'day' | 'week' | 'month'
  dateMode: DateMode
  incluirElopement?: boolean
  origins?: string[]
  faixas?: string[]
  destinos?: string[]
  convidados?: string[]
  consultorIds?: string[]
  tipos?: string[]
  canalSdr?: string[]
  canalCloser?: string[]
  statusLead?: StatusLead | ''
}
export function useWwSerieTemporal(params: WwSerieParams) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  const arr = (v?: string[]) => (v && v.length ? v : null)
  return useQuery({
    queryKey: ['ww', 'serie-temporal', variant, orgId, params.dateStart, params.dateEnd, params.granularidade, params.dateMode,
      params.incluirElopement ?? true, params.origins ?? null, params.faixas ?? null, params.destinos ?? null, params.convidados ?? null, params.consultorIds ?? null, params.tipos ?? null,
      params.canalSdr ?? null, params.canalCloser ?? null, params.statusLead ?? null],
    queryFn: () => callRpc<WwSerieTemporal>(rpcName('ww_serie_temporal', variant), {
      p_date_start: params.dateStart,
      p_date_end: params.dateEnd,
      p_granularidade: params.granularidade,
      p_org_id: orgId,
      p_date_mode: params.dateMode,
      p_incluir_elopement: params.incluirElopement ?? true,
      p_origins: arr(params.origins),
      p_faixas: arr(params.faixas),
      p_destinos: arr(params.destinos),
      p_convidados: arr(params.convidados),
      p_consultor_ids: arr(params.consultorIds),
      // só envia quando usado — mantém compat com a função antiga até a promoção
      ...(params.tipos?.length ? { p_tipos: params.tipos } : {}),
      ...canalParams({ canalSdr: params.canalSdr, canalCloser: params.canalCloser }),
      ...statusParam(params),
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ── Agenda de reuniões (futuro + vencidas sem registro) — 20260612a ─────────
export type WwAgendaItem = {
  quando: string
  reuniao: 'sdr' | 'closer'
  casal: string | null
  tipo: string | null
  ac_deal_id: string
  contact_id: string | null
  card_id: string | null
  consultor_nome?: string | null
  dias_atraso?: number
}

export type WwAgendaPorDia = { dia: string; sdr: number; closer: number }

export type WwAgendaDesfechoContagem = {
  marcadas: number
  feitas: number
  nao_aconteceu: number
  reagendando: number
  perdidas: number
  sem_registro: number
}

export type WwAgendaDesfechoItem = WwAgendaItem & {
  motivo: string | null
  categoria: 'feita' | 'nao_aconteceu' | 'reagendando' | 'perdida' | 'sem_registro'
}

export type WwAgendaDesfechos = {
  janela_dias: number
  sdr: WwAgendaDesfechoContagem
  closer: WwAgendaDesfechoContagem
  itens: WwAgendaDesfechoItem[]
}

export type WwAgenda = {
  proximas: WwAgendaItem[]
  pendentes: WwAgendaItem[]
  por_dia: WwAgendaPorDia[]
  desfechos: WwAgendaDesfechos
  gerado_em: string
  error?: string
}

// Agenda usa os filtros de PERFIL da aba (origem/tipo/faixa/convidados/destino/consultor).
// Canal de reunião NÃO se aplica: reunião futura ainda não tem canal registrado (intencional).
// Agenda futura (próximas/pendentes/por_dia) ignora período e canal — é o FUTURO.
// Só os DESFECHOS respeitam o período (dateStart/dateEnd) e os canais SDR/Closer do filtro.
export function useWwAgenda(
  filters: Pick<Ww2Filters, 'origins' | 'tipos' | 'faixas' | 'destinos' | 'convidados' | 'consultorIds' | 'dateStart' | 'dateEnd' | 'canalSdr' | 'canalCloser'>,
  diasFuturo = 28, diasPendentes = 14, diasDesfechos = 30,
) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  const dateStart = filters.dateStart ?? null
  const dateEnd = filters.dateEnd ?? null
  const sdrCanal = filters.canalSdr?.length ? filters.canalSdr : null
  const closerCanal = filters.canalCloser?.length ? filters.canalCloser : null
  return useQuery({
    queryKey: ['ww', 'agenda', variant, orgId, filters.origins ?? null, filters.tipos ?? null, filters.faixas ?? null, filters.destinos ?? null, filters.convidados ?? null, filters.consultorIds ?? null, dateStart, dateEnd, sdrCanal, closerCanal, diasFuturo, diasPendentes, diasDesfechos],
    queryFn: () => callRpc<WwAgenda>(rpcName('ww_agenda_reunioes', variant), {
      p_org_id: orgId,
      p_dias_futuro: diasFuturo,
      p_dias_pendentes: diasPendentes,
      p_dias_desfechos: diasDesfechos,
      p_date_start: dateStart,
      p_date_end: dateEnd,
      p_sdr_canal: sdrCanal,
      p_closer_canal: closerCanal,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_tipos: filters.tipos?.length ? filters.tipos : null,
      p_faixas: filters.faixas?.length ? filters.faixas : null,
      p_destinos: filters.destinos?.length ? filters.destinos : null,
      p_convidados: filters.convidados?.length ? filters.convidados : null,
      p_consultor_ids: filters.consultorIds?.length ? filters.consultorIds : null,
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// Reuniões MARCADAS por dia (quando o consultor agendou, não para quando a reunião é).
// Fonte: updatedTimestamp dos campos 6/18 do Active. Respeita o PERÍODO do filtro (são
// agendamentos do recorte) + tipo/origem/faixa/convidados/destino/consultor.
export type WwAgendamentoItem = {
  dia: string
  reuniao: 'sdr' | 'closer'
  casal: string | null
  ac_deal_id: string
  contact_id: string | null
  card_id: string | null
  tipo: string | null
  marcou_em: string
  reuniao_em: string
}
export type WwAgendamentos = {
  por_dia: WwAgendaPorDia[]
  itens: WwAgendamentoItem[]
  total_sdr: number
  total_closer: number
  fonte?: string
  error?: string
}

export function useWwAgendamentosPorDia(
  filters: Pick<Ww2Filters, 'origins' | 'tipos' | 'faixas' | 'destinos' | 'convidados' | 'consultorIds' | 'dateStart' | 'dateEnd'>,
) {
  const orgId = useOrgId()
  const variant = useAnalyticsVariant()
  const dateStart = filters.dateStart ?? null
  const dateEnd = filters.dateEnd ?? null
  return useQuery({
    queryKey: ['ww', 'agendamentos-dia', variant, orgId, dateStart, dateEnd, filters.origins ?? null, filters.tipos ?? null, filters.faixas ?? null, filters.destinos ?? null, filters.convidados ?? null, filters.consultorIds ?? null],
    queryFn: () => callRpc<WwAgendamentos>(rpcName('ww_agendamentos_por_dia', variant), {
      p_org_id: orgId,
      p_date_start: dateStart,
      p_date_end: dateEnd,
      p_tipos: filters.tipos?.length ? filters.tipos : null,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_faixas: filters.faixas?.length ? filters.faixas : null,
      p_destinos: filters.destinos?.length ? filters.destinos : null,
      p_convidados: filters.convidados?.length ? filters.convidados : null,
      p_consultor_ids: filters.consultorIds?.length ? filters.consultorIds : null,
    }),
    enabled: !!orgId && !!dateStart && !!dateEnd,
    staleTime: 60_000,
    // Auto-atualiza: o Active sincroniza de tempos em tempos, então uma reunião marcada
    // agora pode demorar a aparecer. Rebusca ao voltar pra aba e a cada 5 min com ela aberta.
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
  })
}

// ── Diretoria · Estado Geral da Operação ─────────────────────────────────────
// Visão executiva das 4 macro-fases (SDR → Closer → Planejamento → Produção).
// Cada `deal` vira uma minibarrinha clicável (abre /cards/:id). RPC: ww_diretoria_overview.

export type WwDiretoriaDeal = {
  card_id: string
  titulo: string
  valor: number
  /** Campos de preview (variam por fase; nulos onde não se aplica) */
  stage_name: string | null
  destino: string | null
  faixa: string | null
  convidados: string | null
  tipo: string | null
  data_casamento: string | null
  responsavel: string | null
  entrou_at: string | null
}

export type WwDiretoriaFaseKey = 'sdr' | 'closer' | 'planejamento' | 'producao'

export type WwDiretoriaFase = {
  key: WwDiretoriaFaseKey
  label: string
  sub: string
  count: number
  valor_total: number
  deals: WwDiretoriaDeal[]
  entrou_periodo: number | null
  entrou_periodo_prev: number | null
  tendencia_pct: number | null
  conversao_proxima_pct: number | null
}

export type WwDiretoria = {
  org_id: string
  pipeline_id: string
  periodo: { date_start: string; date_end: string; prev_start: string; prev_end: string }
  fases: WwDiretoriaFase[]
  error?: string
}

export function useWwDiretoria(params: { dateStart?: string; dateEnd?: string; tipo?: string | null }) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww-diretoria', orgId, params.dateStart, params.dateEnd, params.tipo ?? null],
    queryFn: () => callRpc<WwDiretoria>('ww_diretoria_overview', {
      p_org_id: orgId,
      p_date_start: params.dateStart ?? null,
      p_date_end: params.dateEnd ?? null,
      p_tipo: params.tipo ?? null,
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ── Diretoria · Tempos da operação (velocidade · dwell · aging) ──────────────
// RPC ww_diretoria_tempos.
//   SDR/Closer  → tempo de TRAVESSIA (coorte por data de entrada do lead).
//   Planejamento/Produção → tempo NA FASE HOJE (ocupação): count_aberto = nº de
//     casais na fase; amostra/com_tempo = quantos têm carimbo de entrada (20260626d).
//     Sem carimbo entram na contagem mas ficam fora da distribuição de tempo.

export type WwTempoLeg = {
  amostra: number
  mediana_dias: number | null
  p75_dias: number | null
  mediana_prev_dias?: number | null
}

export type WwDwellFase = {
  key: WwDiretoriaFaseKey
  label: string
  amostra?: number
  /** Pós-venda: total de casais abertos na fase agora (independe de ter carimbo). */
  count_aberto?: number
  p25_dias?: number | null
  mediana_dias?: number | null
  p75_dias?: number | null
  p90_dias?: number | null
  sem_dados: boolean
}

export type WwAgingTop = { card_id: string; titulo: string; dias: number; responsavel: string | null }

export type WwAgingBuckets = { ate_7: number; d8_30: number; d31_60: number; mais_60: number }

export type WwAgingFase = {
  key: WwDiretoriaFaseKey
  label: string
  amostra?: number
  /** Pós-venda: quantos dos `amostra` casais têm carimbo de entrada (entram nos buckets). */
  com_tempo?: number
  mediana_aberto_dias?: number | null
  buckets: WwAgingBuckets | null
  top_parados: WwAgingTop[]
  sem_dados?: boolean
}

export type WwDiretoriaTempos = {
  org_id: string
  pipeline_id: string
  periodo: { date_start: string; date_end: string; prev_start: string; prev_end: string }
  velocidade: {
    lead_para_sdr: WwTempoLeg
    lead_para_closer: WwTempoLeg
    lead_para_fechamento: WwTempoLeg
    closer_para_fechamento: WwTempoLeg
  }
  dwell: WwDwellFase[]
  aging: WwAgingFase[]
  error?: string
}

export function useWwDiretoriaTempos(params: { dateStart?: string; dateEnd?: string; tipo?: string | null }) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww-diretoria-tempos', orgId, params.dateStart, params.dateEnd, params.tipo ?? null],
    queryFn: () => callRpc<WwDiretoriaTempos>('ww_diretoria_tempos', {
      p_org_id: orgId,
      p_date_start: params.dateStart ?? null,
      p_date_end: params.dateEnd ?? null,
      p_tipo: params.tipo ?? null,
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ── Diretoria · Histórico de etapas de um card (dias em cada etapa) ──────────
// RPC ww_card_stage_history. Reconstrói a linha do tempo a partir das activities
// (stage_changed). Histórico começa quando o registro automático passou a existir.

export type WwStageHistEtapa = {
  etapa: string | null
  stage_id: string | null
  entrou_em: string
  saiu_em: string | null
  dias: number
  atual: boolean
}

export type WwCardStageHistory = {
  card_id: string
  titulo: string | null
  created_at: string
  etapa_atual: string | null
  etapas: WwStageHistEtapa[]
  total_dias: number
  error?: string
}

export function useWwCardStageHistory(cardId: string | null) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww-card-stage-history', cardId, orgId],
    queryFn: () => callRpc<WwCardStageHistory>('ww_card_stage_history', {
      p_card_id: cardId,
      p_org_id: orgId,
    }),
    enabled: !!cardId && !!orgId,
    staleTime: 60_000,
  })
}
