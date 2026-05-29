import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

export type DateMode = 'cohort' | 'throughput'

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
}

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
  stage_id: string
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
export type Ww2Tendencia = { mes: string; motivo: string; qtd: number }

export type Ww2LossReasons = {
  motivos_sdr: Ww2Motivo[]
  motivos_closer: Ww2Motivo[]
  motivo_faixa: Ww2MotivoFaixa[]
  tendencia: Ww2Tendencia[]
}

export type Ww2DrillRow = {
  id: string
  titulo: string
  created_at: string
  updated_at: string
  valor_estimado: number | null
  valor_final: number | null
  status_comercial: string | null
  stage_name: string
  phase_label: string
  dono_nome: string | null
  faixa: string | null
  destino: string | null
  origem: string
  dias_parado: number
  motivo_perda: string | null
  // Enriquecimentos da Onda 1 (migration 20260527s_ww2_drill_down_enrich)
  contato_id: string | null
  contato_nome: string | null
  contato_email: string | null
  contato_telefone: string | null
  contato_external_id: string | null
  ac_deal_id: string | null
  data_venda: string | null
  monde_venda: string | null
  tipo_casamento: string | null
  campaign: string | null
  medium: string | null
  content: string | null
}

export type Ww2DrillDown = {
  total: number
  limit: number
  offset: number
  rows: Ww2DrillRow[]
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
  return useQuery({
    queryKey: ['ww2', 'overview', orgId, filters],
    queryFn: () => callRpc<Ww2Overview>('ww2_overview', baseParams(orgId, filters)),
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
  return useQuery({
    queryKey: ['ww2', 'marketing', orgId, filters],
    queryFn: () => callRpc<Ww2Marketing>('ww2_marketing', baseParams(orgId, filters)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

export function useWw2LossReasons(filters: Ww2Filters) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww2', 'loss', orgId, filters],
    queryFn: () => callRpc<Ww2LossReasons>('ww2_loss_reasons', baseParams(orgId, filters)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

export type DrillFilters = {
  dateStart: string
  dateEnd: string
  stageId?: string
  phaseSlug?: string
  status?: 'aberto' | 'ganho' | 'perdido' | 'fechado_efetivo'
  faixa?: string
  destino?: string
  origem?: string
  consultorId?: string
  motivoPerda?: string
  // Filtros para drill em cruzamentos das próximas ondas (filtragem client-side
  // após o fetch — a RPC ww2_drill_down não conhece esses campos ainda):
  tipo?: string
  campaign?: string
  medium?: string
  limit?: number
  offset?: number
}

export function useWw2DrillDown(filters: DrillFilters | null) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww2', 'drill', orgId, filters],
    queryFn: () => filters
      ? callRpc<Ww2DrillDown>('ww2_drill_down', {
          p_date_start: filters.dateStart,
          p_date_end: filters.dateEnd,
          p_org_id: orgId,
          p_stage_id: filters.stageId ?? null,
          p_phase_slug: filters.phaseSlug ?? null,
          p_status: filters.status ?? null,
          p_faixa: filters.faixa ?? null,
          p_destino: filters.destino ?? null,
          p_origem: filters.origem ?? null,
          p_consultor_id: filters.consultorId ?? null,
          p_motivo_perda: filters.motivoPerda ?? null,
          p_limit: filters.limit ?? 50,
          p_offset: filters.offset ?? 0,
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
  // cohort: leads criados no período.
  // throughput: leads que tiveram stage_changed para eventStageId no período (obrigatório).
  const isThroughput = filters.dateMode === 'throughput'
  return useQuery({
    queryKey: ['ww', 'qualidade-lead', orgId, filters.dateStart, filters.dateEnd, filters.dateMode, eventStageId ?? null, filters.origins, filters.tipos, minAmostra],
    queryFn: () => callRpc<WwQualidadeLead>('ww_qualidade_lead', {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_org_id: orgId,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_date_mode: filters.dateMode,
      p_event_stage_id: isThroughput ? eventStageId : null,
      p_tipos: filters.tipos?.length ? filters.tipos : null,
      p_min_amostra: minAmostra,
    }),
    enabled: !!orgId && (!isThroughput || !!eventStageId),
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
  return useQuery({
    queryKey: ['ww', 'drift-venda-v2', orgId, filters.dateStart, filters.dateEnd, filters.dateMode, filters.origins, filters.tipos],
    queryFn: () => callRpc<WwDriftVenda>('ww_v2_drift_venda', {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_org_id: orgId,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_date_mode: filters.dateMode,
      p_tipos: filters.tipos?.length ? filters.tipos : null,
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
  return useQuery({
    queryKey: ['ww', 'drift-combos', orgId, filters.dateStart, filters.dateEnd, filters.dateMode],
    queryFn: () => callRpc<WwDriftCombos>('ww_drift_combos', {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_org_id: orgId,
      p_date_mode: filters.dateMode,
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
}

export type WwLeadIdealPerfilTop = {
  faixa: string
  destino: string
  convidados: string
  qtd: number
  pct: number | null
}

export type WwLeadIdealData = {
  atual_start: string
  atual_end: string
  historico_start: string
  historico_end: string
  total_historico: number
  total_atual: number
  comparacoes: WwLeadIdealDim[]
  cruzamentos?: {
    faixa_x_convidados: WwLeadIdealCruzamentoCell[]
    faixa_x_destino: WwLeadIdealCruzamentoCell[]
    convidados_x_destino: WwLeadIdealCruzamentoCell[]
  }
  top_perfis_historico?: WwLeadIdealPerfilTop[]
  top_perfis_atual?: WwLeadIdealPerfilTop[]
  error?: string
}

export type WwLeadIdealParams = {
  atualStart: string
  atualEnd: string
  historicoStart?: string | null
  historicoEnd?: string | null
  historicoMeses?: number
  minAmostra?: number
}

export function useWwLeadIdeal(params: WwLeadIdealParams) {
  const orgId = useOrgId()
  const minAmostra = params.minAmostra ?? 2
  const usaJanelaCustom = !!(params.historicoStart && params.historicoEnd)
  return useQuery({
    queryKey: ['ww', 'lead-ideal-v2', orgId, params.atualStart, params.atualEnd, params.historicoStart ?? null, params.historicoEnd ?? null, params.historicoMeses ?? 12, minAmostra],
    queryFn: () => callRpc<WwLeadIdealData>('ww_v2_lead_ideal', {
      p_atual_start: params.atualStart,
      p_atual_end: params.atualEnd,
      p_org_id: orgId,
      p_historico_start: usaJanelaCustom ? params.historicoStart : null,
      p_historico_end:   usaJanelaCustom ? params.historicoEnd : null,
      p_historico_meses: params.historicoMeses ?? 12,
      p_min_amostra: minAmostra,
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
  error?: string
}

export function useWwMarketingQualidade(filters: Ww2Filters, minAmostra: number = 2) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww', 'marketing-qualidade', orgId, filters.dateStart, filters.dateEnd, filters.origins, minAmostra],
    queryFn: () => callRpc<WwMarketingQualidade>('ww_marketing_qualidade', {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_org_id: orgId,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_min_amostra: minAmostra,
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
  distincts_disponiveis: { faixas: number; convidados: number; destinos: number }
  tem_filtro_preenchimento: boolean
  error?: string
}

export function useWwFunilConversao(filters: Ww2Filters) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww', 'funil-conversao-v1', orgId, filters.dateStart, filters.dateEnd, filters.dateMode,
      filters.faixas, filters.convidados, filters.destinos, filters.origins, filters.consultorIds],
    queryFn: () => callRpc<WwFunilConversaoData>('ww_funil_conversao_v1', {
      p_date_start: filters.dateStart,
      p_date_end: filters.dateEnd,
      p_date_mode: filters.dateMode,
      p_org_id: orgId,
      p_faixas: filters.faixas?.length ? filters.faixas : null,
      p_convidados: filters.convidados?.length ? filters.convidados : null,
      p_destinos: filters.destinos?.length ? filters.destinos : null,
      p_origins: filters.origins?.length ? filters.origins : null,
      p_consultor_ids: filters.consultorIds?.length ? filters.consultorIds : null,
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
}

export function useWwFunilFilterOptions() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww', 'funil-filter-options', orgId],
    queryFn: () => callRpc<WwFunilFilterOptions>('ww_funil_filter_options', { p_org_id: orgId }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
}

// ── Ranking de perfis por taxa de fechamento ("quais perfis mais viram casamento")
// Espelha o pool/ganho do ww_funil_conversao_v1 — os números batem com o funil e
// os rótulos (strict) são os mesmos que o funil aceita no filtro. Lead bom = quem
// mais fecha (taxa = ganho/entrou). Mostra TODOS os buckets com a amostra (entrou).
export type WwFunilRankingDim = 'faixa' | 'convidados' | 'destino'

export type WwFunilRankingRow = {
  bucket: string
  entrou: number
  ganho: number
  taxa_pct: number | null
}

export type WwFunilRankingPerfil = {
  dimensao: WwFunilRankingDim
  periodo: { date_start: string; date_end: string; date_mode: DateMode }
  total_no_periodo: number
  rows: WwFunilRankingRow[]
  error?: string
}

export function useWwFunilRankingPerfil(params: {
  dateStart: string
  dateEnd: string
  dateMode: DateMode
  dimensao: WwFunilRankingDim
  origins?: string[]
  consultorIds?: string[]
}) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww', 'funil-ranking-perfil', orgId, params.dateStart, params.dateEnd, params.dateMode, params.dimensao, params.origins, params.consultorIds],
    queryFn: () => callRpc<WwFunilRankingPerfil>('ww_funil_ranking_perfil', {
      p_date_start: params.dateStart,
      p_date_end: params.dateEnd,
      p_date_mode: params.dateMode,
      p_org_id: orgId,
      p_dimensao: params.dimensao,
      p_origins: params.origins?.length ? params.origins : null,
      p_consultor_ids: params.consultorIds?.length ? params.consultorIds : null,
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

