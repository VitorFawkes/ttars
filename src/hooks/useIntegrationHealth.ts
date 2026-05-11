import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────
// Tabelas ainda nao estao em database.types.ts (migration pendente deploy).
// Usamos `as any` no .from() seguindo o pattern do projeto (ex: CadenceMonitorPage).

export interface HealthRule {
    id: string
    rule_key: string
    label: string
    description: string | null
    category: 'whatsapp' | 'activecampaign' | 'outbound' | 'system'
    severity: 'info' | 'warning' | 'critical'
    threshold_hours: number
    threshold_count: number | null
    threshold_percent: number | null
    is_enabled: boolean
    created_at: string
    updated_at: string
}

export interface HealthAlert {
    id: string
    rule_id: string
    rule_key: string
    status: 'active' | 'acknowledged' | 'resolved'
    context: Record<string, unknown>
    fired_at: string
    acknowledged_at: string | null
    acknowledged_by: string | null
    resolved_at: string | null
    created_at: string
    rule?: HealthRule
}

export interface HealthPulse {
    channel: string
    label: string
    last_event_at: string | null
    event_count_24h: number
    event_count_7d: number
    last_error_at: string | null
    error_count_24h: number
    updated_at: string
}

// ── Queries ────────────────────────────────────────────────────────

export function useHealthAlerts(includeResolved = false) {
    return useQuery({
        queryKey: ['health-alerts', includeResolved],
        queryFn: async () => {
            let query = (supabase
                .from('integration_health_alerts' as any) as any)
                .select('*, rule:integration_health_rules(*)')
                .order('fired_at', { ascending: false })
                .limit(100)

            if (!includeResolved) {
                query = query.in('status', ['active', 'acknowledged'])
            }

            const { data, error } = await query
            if (error) throw error
            return (data ?? []) as HealthAlert[]
        },
        refetchInterval: 60_000,
    })
}

export function useHealthRules() {
    return useQuery({
        queryKey: ['health-rules'],
        queryFn: async () => {
            const { data, error } = await (supabase
                .from('integration_health_rules' as any) as any)
                .select('*')
                .order('category')
            if (error) throw error
            return (data ?? []) as HealthRule[]
        },
    })
}

export function useHealthPulse() {
    return useQuery({
        queryKey: ['health-pulse'],
        queryFn: async () => {
            const { data, error } = await (supabase
                .from('integration_health_pulse' as any) as any)
                .select('*')
                .order('channel')
            if (error) throw error
            return (data ?? []) as HealthPulse[]
        },
        refetchInterval: 60_000,
    })
}

// ── Mutations ──────────────────────────────────────────────────────

export function useToggleHealthRule() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ ruleId, isEnabled }: { ruleId: string; isEnabled: boolean }) => {
            const { error } = await (supabase
                .from('integration_health_rules' as any) as any)
                .update({ is_enabled: isEnabled })
                .eq('id', ruleId)
            if (error) throw error
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['health-rules'] }),
    })
}

export function useUpdateHealthRule() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ ruleId, updates }: {
            ruleId: string
            updates: Partial<Pick<HealthRule, 'threshold_hours' | 'threshold_count' | 'threshold_percent'>>
        }) => {
            const { error } = await (supabase
                .from('integration_health_rules' as any) as any)
                .update(updates)
                .eq('id', ruleId)
            if (error) throw error
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['health-rules'] }),
    })
}

// ── Channel drill-down (ultimos eventos) ──────────────────────────

export interface ChannelEvent {
    id: string
    created_at: string
    status: string
    summary: string
    detail?: string
    error?: string
    /** Full untruncated error for expandable view */
    errorFull?: string
    /** Full processing_log entries for debugging */
    processingLog?: unknown[]
    /** Raw payload/data for inspection */
    rawData?: Record<string, unknown>
    link?: string
    linkLabel?: string
}

function fmtCurrency(val: unknown): string {
    const n = Number(val)
    if (isNaN(n)) return 'R$ 0'
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const CHANNEL_QUERIES: Record<string, { table: string; select: string; filters?: Record<string, string>; mapFn: (row: Record<string, unknown>) => ChannelEvent }> = {
    whatsapp_inbound: {
        table: 'whatsapp_messages',
        select: 'id,created_at,status,body,sender_name,sender_phone,message_type,has_error,error_message,card_id',
        filters: { direction: 'inbound' },
        mapFn: (r) => ({
            id: String(r.id),
            created_at: String(r.created_at),
            status: String(r.status ?? ''),
            summary: `${r.sender_name || 'Desconhecido'}${r.sender_phone ? ` (${String(r.sender_phone).slice(-4)})` : ''}`,
            detail: r.message_type !== 'text'
                ? `[${String(r.message_type ?? 'midia').toUpperCase()}] ${String(r.body ?? '').slice(0, 60)}`
                : String(r.body ?? '').slice(0, 100),
            error: r.has_error ? String(r.error_message ?? 'Erro no recebimento').slice(0, 120) : undefined,
            errorFull: r.has_error ? String(r.error_message ?? 'Erro no recebimento') : undefined,
            rawData: r.has_error ? { sender_phone: r.sender_phone, message_type: r.message_type, error_message: r.error_message } : undefined,
            link: r.card_id ? `/cards/${r.card_id}` : undefined,
            linkLabel: r.card_id ? 'Ver card' : undefined,
        }),
    },
    whatsapp_outbound: {
        table: 'whatsapp_messages',
        select: 'id,created_at,status,body,message_type,sent_by_user_name,has_error,error_message,ack_status,card_id',
        filters: { direction: 'outbound' },
        mapFn: (r) => ({
            id: String(r.id),
            created_at: String(r.created_at),
            status: String(r.status ?? ''),
            summary: r.sent_by_user_name
                ? `Enviado por ${r.sent_by_user_name}`
                : 'Envio automatico',
            detail: r.message_type !== 'text'
                ? `[${String(r.message_type ?? 'midia').toUpperCase()}] ${String(r.body ?? '').slice(0, 60)}`
                : String(r.body ?? '').slice(0, 100),
            error: r.has_error ? String(r.error_message ?? 'Falha no envio').slice(0, 120) : undefined,
            errorFull: r.has_error ? String(r.error_message ?? 'Falha no envio') : undefined,
            rawData: r.has_error ? { ack_status: r.ack_status, message_type: r.message_type, error_message: r.error_message } : undefined,
            link: r.card_id ? `/cards/${r.card_id}` : undefined,
            linkLabel: r.card_id ? 'Ver card' : undefined,
        }),
    },
    active_inbound: {
        table: 'integration_events',
        select: 'id,created_at,status,event_type,entity_type,source,external_id,payload,attempts,processing_log',
        mapFn: (r) => {
            const p = (r.payload as Record<string, unknown>) ?? {}
            const contactName = p.first_name || p.email || p.contact_email || ''
            const entityLabel = r.entity_type ? String(r.entity_type).replace(/_/g, ' ') : 'evento'
            const eventLabel = r.event_type ? String(r.event_type).replace(/_/g, ' ') : String(r.status ?? '')
            const attempts = Number(r.attempts ?? 0)
            const hasFail = r.status === 'failed' || r.status === 'blocked'
            const cardId = p.card_id || p.matched_card_id
            return {
                id: String(r.id),
                created_at: String(r.created_at),
                status: String(r.status ?? ''),
                summary: `${entityLabel} → ${eventLabel}`,
                detail: [
                    contactName ? `Contato: ${contactName}` : null,
                    r.external_id ? `ID: ${r.external_id}` : null,
                    attempts > 1 ? `${attempts} tentativas` : null,
                ].filter(Boolean).join(' · ') || undefined,
                error: hasFail ? extractError(r.processing_log) : undefined,
                errorFull: hasFail ? extractFullError(r.processing_log) : undefined,
                processingLog: hasFail ? parseProcessingLog(r.processing_log) : undefined,
                rawData: hasFail ? { event_type: r.event_type, entity_type: r.entity_type, source: r.source, external_id: r.external_id, attempts: r.attempts, payload: p } : undefined,
                link: cardId ? `/cards/${cardId}` : undefined,
                linkLabel: cardId ? 'Ver card' : undefined,
            }
        },
    },
    active_outbound: {
        table: 'integration_outbound_queue',
        select: 'id,created_at,status,event_type,external_id,card_id,attempts,max_attempts,processing_log',
        mapFn: (r) => {
            const attempts = Number(r.attempts ?? 0)
            const maxAttempts = Number(r.max_attempts ?? 5)
            const hasFail = r.status === 'failed'
            return {
                id: String(r.id),
                created_at: String(r.created_at),
                status: String(r.status ?? ''),
                summary: `${String(r.event_type ?? 'sync').replace(/_/g, ' ')}`,
                detail: [
                    r.external_id ? `AC #${r.external_id}` : null,
                    attempts > 0 ? `Tentativa ${attempts}/${maxAttempts}` : null,
                ].filter(Boolean).join(' · ') || undefined,
                error: hasFail ? extractError(r.processing_log) : undefined,
                errorFull: hasFail ? extractFullError(r.processing_log) : undefined,
                processingLog: hasFail ? parseProcessingLog(r.processing_log) : undefined,
                rawData: hasFail ? { event_type: r.event_type, external_id: r.external_id, attempts: r.attempts, max_attempts: r.max_attempts } : undefined,
                link: r.card_id ? `/cards/${r.card_id}` : undefined,
                linkLabel: r.card_id ? 'Ver card' : undefined,
            }
        },
    },
    cadence: {
        table: 'cadence_queue',
        select: 'id,created_at,status,execute_at,priority,attempts,last_error,instance:cadence_instances(card_id)',
        mapFn: (r) => {
            const execDate = r.execute_at ? new Date(String(r.execute_at)) : null
            const isPast = execDate && execDate.getTime() < Date.now()
            const inst = r.instance as Record<string, unknown> | null
            const cardId = inst?.card_id
            const hasError = !!r.last_error
            return {
                id: String(r.id),
                created_at: String(r.created_at),
                status: String(r.status ?? ''),
                summary: execDate
                    ? `${isPast ? 'Deveria executar' : 'Agendado'}: ${execDate.toLocaleString('pt-BR')}`
                    : 'Sem data de execucao',
                detail: [
                    r.priority && Number(r.priority) > 0 ? `Prioridade: ${r.priority}` : null,
                    Number(r.attempts ?? 0) > 0 ? `${r.attempts} tentativas` : null,
                ].filter(Boolean).join(' · ') || undefined,
                error: hasError ? String(r.last_error).slice(0, 120) : undefined,
                errorFull: hasError ? String(r.last_error) : undefined,
                rawData: hasError ? { execute_at: r.execute_at, priority: r.priority, attempts: r.attempts } : undefined,
                link: cardId ? `/cards/${cardId}` : undefined,
                linkLabel: cardId ? 'Ver card' : undefined,
            }
        },
    },
    activities: {
        table: 'activities',
        select: 'id,created_at,tipo,descricao,party_type,card_id',
        mapFn: (r) => {
            const tipoMap: Record<string, string> = {
                ligacao: 'Ligacao', email: 'E-mail', reuniao: 'Reuniao', nota: 'Nota',
                whatsapp: 'WhatsApp', tarefa: 'Tarefa', system: 'Sistema',
                proposta_enviada: 'Proposta Enviada', proposta_visualizada: 'Proposta Visualizada',
                stage_change: 'Mudanca de Etapa', solicitacao_mudanca: 'Solicitacao de Mudanca',
            }
            const tipoLabel = tipoMap[String(r.tipo ?? '')] ?? String(r.tipo ?? 'Atividade')
            return {
                id: String(r.id),
                created_at: String(r.created_at),
                status: tipoLabel,
                summary: String(r.descricao ?? '').slice(0, 150),
                detail: r.party_type ? `Origem: ${r.party_type}` : undefined,
                link: r.card_id ? `/cards/${r.card_id}` : undefined,
                linkLabel: r.card_id ? 'Ver card' : undefined,
            }
        },
    },
    cards: {
        table: 'cards',
        select: 'id,created_at,titulo,origem,status_comercial,valor_estimado,produto',
        mapFn: (r) => {
            const origemMap: Record<string, string> = {
                manual: 'Manual', active_campaign: 'ActiveCampaign', whatsapp: 'WhatsApp',
                api: 'API', import: 'Importacao',
            }
            const origemLabel = origemMap[String(r.origem ?? 'manual')] ?? String(r.origem ?? 'Manual')
            return {
                id: String(r.id),
                created_at: String(r.created_at),
                status: origemLabel,
                summary: String(r.titulo ?? 'Sem titulo'),
                detail: [
                    r.valor_estimado ? fmtCurrency(r.valor_estimado) : null,
                    r.status_comercial ? `Status: ${r.status_comercial}` : null,
                    r.produto ? String(r.produto) : null,
                ].filter(Boolean).join(' · ') || undefined,
                link: `/cards/${r.id}`,
                linkLabel: 'Abrir card',
            }
        },
    },
}

/** Extrai mensagem de erro do processing_log (array de strings ou jsonb) — versao curta */
function extractError(log: unknown): string | undefined {
    const full = extractFullError(log)
    return full ? full.slice(0, 120) : undefined
}

/** Extrai mensagem de erro COMPLETA (sem truncar) */
function extractFullError(log: unknown): string | undefined {
    if (!log) return undefined
    if (Array.isArray(log)) {
        const last = log[log.length - 1]
        if (typeof last === 'string') return last
        if (typeof last === 'object' && last !== null) {
            const msg = (last as Record<string, unknown>).error ?? (last as Record<string, unknown>).message
            if (msg) return String(msg)
        }
    }
    if (typeof log === 'string') return log
    return undefined
}

/** Converte processing_log para array legivel */
function parseProcessingLog(log: unknown): unknown[] | undefined {
    if (!log) return undefined
    if (Array.isArray(log)) return log
    if (typeof log === 'string') {
        try { const parsed = JSON.parse(log); return Array.isArray(parsed) ? parsed : [parsed] } catch { return [log] }
    }
    return undefined
}

export function useChannelEvents(channel: string | null) {
    return useQuery({
        queryKey: ['channel-events', channel],
        queryFn: async () => {
            if (!channel) return []
            const config = CHANNEL_QUERIES[channel]
            if (!config) return []

            let query = (supabase.from as any)(config.table)
                .select(config.select)
                .order('created_at', { ascending: false })
                .limit(30)

            if (config.filters) {
                for (const [key, val] of Object.entries(config.filters)) {
                    query = query.eq(key, val)
                }
            }

            const { data, error } = await query
            if (error) throw error
            return ((data ?? []) as Record<string, unknown>[]).map(config.mapFn)
        },
        enabled: !!channel,
    })
}

export function useRunHealthCheck() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async () => {
            const { data, error } = await (supabase.rpc as any)('fn_check_integration_health')
            if (error) throw error
            return data as { checked_at: string; alerts_fired: number; alerts_resolved: number }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['health-alerts'] })
            qc.invalidateQueries({ queryKey: ['health-pulse'] })
        },
    })
}
