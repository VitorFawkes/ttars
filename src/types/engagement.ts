export type ConversationState = 'hot' | 'warm' | 'lost' | 'cold' | 'won'

export type AttributionMode = 'human' | 'ai_agent' | 'cadence' | 'unknown' | 'lead'

export interface EngajamentoKpis {
  total_contacts: number
  reply_rate: number | null
  depth_avg: number | null
  cold_pct: number | null
  responded_once_left_pct: number | null
  frt_median_hours: number | null
  active_count: number
  win_rate: number | null
}

export interface EngajamentoFunnelStep {
  step: string
  count: number
  order: number
}

export interface EngajamentoLineBreakdown {
  label: string
  total: number
  reply_rate: number | null
  depth_avg: number | null
  frt_median_hours: number | null
  cold_count: number
  lost_count: number
  active_count: number
  won_count: number
  meetings_scheduled?: number
  meetings_done?: number
}

export interface EngajamentoStateBucket {
  state: ConversationState
  count: number
}

export interface EngajamentoDepthBucket {
  bucket: string
  count: number
  order: number
  min: number
  max: number
}

export interface EngajamentoFRTBucket {
  bucket: string
  count: number
  order: number
}

export interface EngajamentoHeatmapCell {
  weekday: number // 0=Sunday … 6=Saturday
  hour: number    // 0-23
  count: number
}

export interface EngajamentoDailyPoint {
  day: string // YYYY-MM-DD
  outbound: number      // pessoas únicas contatadas no dia
  inbound: number       // pessoas únicas que responderam no dia
  no_reply: number      // contatadas - que já responderam
  reply_rate_pct: number | null
  frt_median_minutes: number | null
  msgs_out: number
  msgs_in: number
  new_contacts: number
  new_replies: number
  wins: number
}

export interface EngajamentoTimeMetrics {
  median_conversation_duration_days: number | null
  median_conversation_duration_days_won: number | null
  median_outbounds_no_reply: number | null
  max_outbounds_no_reply: number | null
}

export interface EngajamentoConversation {
  customer_phone: string
  contact_id: string | null
  contact_name: string | null
  phone_line_label: string
  first_outbound_at: string | null
  last_outbound_at: string | null
  first_inbound_at: string | null
  last_inbound_at: string | null
  inbound_count: number
  outbound_count: number
  frt_hours: number | null
  hours_since_inbound: number | null
  conversation_duration_days: number | null
  state: ConversationState
  card_id: string | null
  attribution_modes: AttributionMode[] | null
  stage_nome: string | null
  stage_phase_slug: string | null
  meeting_state: 'meeting_scheduled' | 'meeting_done' | null
}

export interface EngajamentoMeetingKpis {
  meetings_scheduled: number
  meetings_done: number
  proposals_sent: number
  contracts_signed: number
}

export interface EngajamentoLineOption {
  label: string
  is_test: boolean
}

export interface EngajamentoResponse {
  kpis: EngajamentoKpis
  meetings_kpis: EngajamentoMeetingKpis
  funnel: EngajamentoFunnelStep[]
  by_line: EngajamentoLineBreakdown[]
  state_distribution: EngajamentoStateBucket[]
  depth_histogram: EngajamentoDepthBucket[]
  frt_distribution: EngajamentoFRTBucket[]
  weekday_hour_heatmap: EngajamentoHeatmapCell[]
  daily_timeline: EngajamentoDailyPoint[]
  time_metrics: EngajamentoTimeMetrics
  conversations: EngajamentoConversation[]
  pagination: { page: number; limit: number; total: number }
  lines: EngajamentoLineOption[]
}

export interface EngajamentoFilters {
  dateFrom: string
  dateTo: string
  lineLabels: string[]
  attributionModes: AttributionMode[]
  stateFilter: ConversationState[]
  includeTestLines: boolean
  coldThresholdHours: number
  // Client-side filters (não passam ao RPC, filtram a tabela após chegada)
  inboundMin: number | null
  inboundMax: number | null
  // Drill-down do heatmap (passa ao RPC)
  weekdayFilter: number | null // 0=Dom..6=Sáb
  hourFilter: number | null    // 0-23
}

export interface ThreadMessage {
  message_id: string
  direction: 'inbound' | 'outbound'
  body: string | null
  sent_at: string
  attribution_mode: string
  sent_by_user_name: string | null
  source: 'whatsapp_messages' | 'ai_conversation_turns'
}

export interface ThreadResponse {
  thread: ThreadMessage[]
  stats: {
    total: number
    inbound: number
    outbound: number
    sources_used: string[]
  }
}
