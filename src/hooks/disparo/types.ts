export type DisparoStatus =
  | 'rascunho'
  | 'agendado'
  | 'disparando'
  | 'pausado'
  | 'concluido'
  | 'cancelado'

export interface DisparoCampanha {
  id: string
  org_id: string
  titulo: string
  corpo_mensagem: string
  phone_number_id: string
  status: DisparoStatus
  total: number
  enviados: number
  falhados: number
  opt_outs: number
  cap_diario: number
  usar_ramp: boolean
  janela_inicio: string
  janela_fim: string
  variaveis_mapeadas: string[]
  estimado_termino_at: string | null
  estimado_dias: number | null
  started_at: string | null
  paused_at: string | null
  finished_at: string | null
  created_at: string
}

export type DisparoFilaStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'opt_out'
  | 'cancelado'

export interface DisparoFilaItem {
  id: string
  campaign_id: string
  contact_id: string
  telefone_normalizado: string
  status: DisparoFilaStatus
  execute_at: string
  priority: number
  attempts: number
  corpo_renderizado: string | null
  erro_motivo: string | null
  enviado_at: string | null
}

/** 1 destinatário da lista colada/importada. */
export interface IngestRow {
  telefone: string
  nome?: string
  variaveis?: Record<string, string>
}

/** Resultado por destinatário de disparo_ingest_recipients. */
export interface IngestResult {
  out_contact_id: string | null
  out_telefone: string
  out_nome: string | null
  out_criado_novo: boolean
  out_resultado: 'aceito' | 'rejeitado'
  out_motivo: string | null
}
