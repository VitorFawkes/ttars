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

export interface EngajamentoConversation {
  contact_id: string
  contact_name: string | null
  contact_phone: string | null
  phone_line_id: string
  phone_line_label: string
  first_outbound_at: string | null
  last_outbound_at: string | null
  first_inbound_at: string | null
  last_inbound_at: string | null
  inbound_count: number
  outbound_count: number
  frt_hours: number | null
  hours_since_inbound: number | null
  state: ConversationState
  card_id: string | null
  attribution_modes: AttributionMode[] | null
}

export interface EngajamentoLineOption {
  id: string
  label: string
  is_test: boolean
}

export interface EngajamentoResponse {
  kpis: EngajamentoKpis
  funnel: EngajamentoFunnelStep[]
  conversations: EngajamentoConversation[]
  pagination: { page: number; limit: number; total: number }
  lines: EngajamentoLineOption[]
  filters_applied: Record<string, unknown>
}

export interface EngajamentoFilters {
  dateFrom: string
  dateTo: string
  linhaIds: string[]
  attributionModes: AttributionMode[]
  stateFilter: ConversationState[]
  includeTestLines: boolean
  coldThresholdHours: number
}
