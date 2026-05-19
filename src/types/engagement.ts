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
}

export interface EngajamentoStateBucket {
  state: ConversationState
  count: number
}

export interface EngajamentoDepthBucket {
  bucket: string
  count: number
  order: number
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
  state: ConversationState
  card_id: string | null
  attribution_modes: AttributionMode[] | null
}

export interface EngajamentoLineOption {
  label: string
  is_test: boolean
}

export interface EngajamentoResponse {
  kpis: EngajamentoKpis
  funnel: EngajamentoFunnelStep[]
  by_line: EngajamentoLineBreakdown[]
  state_distribution: EngajamentoStateBucket[]
  depth_histogram: EngajamentoDepthBucket[]
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
}

// Thread (drawer)
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
