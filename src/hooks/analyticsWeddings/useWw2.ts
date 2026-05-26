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

export type Ww2Journey = {
  date_start: string
  date_end: string
  pipeline_id: string
  org_id: string
  funil_real: Ww2FunilPasso[]
  tempos: Ww2Tempos
  orcamento_real: Ww2OrcamentoReal[]
  destino_mudou: Ww2DestinoMudou[]
  ranking_lentos: Ww2LeadPreso[]
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

export function useWw2FilterOptions() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['ww2', 'options', orgId],
    queryFn: () => callRpc<Ww2FilterOptions>('ww2_filter_options', { p_org_id: orgId }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
}
