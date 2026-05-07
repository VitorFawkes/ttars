/**
 * summarizeConfig — gera um resumo curto do que está configurado em um node,
 * pra renderizar dentro do próprio card do canvas (sem abrir painel).
 *
 * Recebe só o `config` do node (texto plano + IDs). IDs (de etapa, tag, user)
 * são exibidos com um indicador genérico (•) — resolver pra nome humano
 * exigiria hooks com queries; quando isso virar prioridade, dá pra criar um
 * provider global de catálogos e enriquecer aqui.
 */
import type { WorkflowNodeType } from '../types'

const BULLET = '•'

const truncate = (s: string, max = 40) =>
    s.length > max ? `${s.slice(0, max)}…` : s

const formatWait = (config: Record<string, unknown>): string => {
    const amount = config.duration_amount as number | undefined
    const unit = config.duration_unit as string | undefined
    if (amount && unit) {
        const map: Record<string, string> = {
            seconds: amount === 1 ? 'segundo' : 'segundos',
            minutes: 'min',
            hours: amount === 1 ? 'hora' : 'horas',
            days: amount === 1 ? 'dia' : 'dias',
        }
        const businessHours = (config.duration_type as string) === 'business'
        return `${amount} ${map[unit] || unit}${businessHours ? ' (comercial)' : ''}`
    }
    // Fallback: legado salvo só com duration_minutes
    const m = (config.duration_minutes as number) ?? 0
    if (m < 1) return `${Math.round(m * 60)} segundos`
    if (m < 60) return `${m} min`
    if (m < 1440) return `${Math.round(m / 60)} horas`
    return `${Math.round(m / 1440)} dias`
}

export function summarizeConfig(
    type: WorkflowNodeType,
    config: Record<string, unknown>,
): string | null {
    switch (type) {
        // ─── Triggers ────────────────────────────────────────────────────────
        case 'trigger.card_created':
            return config.initial_stage_id ? `${BULLET} Etapa inicial específica` : 'Qualquer card novo'
        case 'trigger.stage_enter': {
            const ids = (config.applicable_stage_ids as string[]) || []
            if (ids.length === 0) return null
            return `${ids.length} etapa${ids.length === 1 ? '' : 's'} selecionada${ids.length === 1 ? '' : 's'}`
        }
        case 'trigger.macro_stage_enter':
            return config.phase_id ? `${BULLET} Fase definida` : null
        case 'trigger.field_changed': {
            const f = config.field_key as string | undefined
            const to = config.to_value as string | undefined
            if (!f) return null
            return to ? `${f} → ${truncate(to, 20)}` : f
        }
        case 'trigger.tag_added':
        case 'trigger.tag_removed':
            return config.tag_id ? `${BULLET} Tag escolhida` : null
        case 'trigger.inbound_message_pattern': {
            const patterns = (config.patterns as string) || ''
            const lines = patterns.split('\n').map((s) => s.trim()).filter(Boolean)
            if (lines.length === 0) return null
            const first = truncate(lines[0], 28)
            return lines.length === 1 ? `"${first}"` : `"${first}" +${lines.length - 1}`
        }
        case 'trigger.time_offset_from_date': {
            const src = config.source as string | undefined
            const offset = (config.days_offset as number) ?? 0
            if (!src) return null
            const sign = offset === 0 ? 'No dia' : offset > 0 ? `${offset}d depois` : `${Math.abs(offset)}d antes`
            return `${sign} de ${src.replace(/^.*\./, '')}`
        }
        case 'trigger.time_in_stage':
            if (!config.stage_id) return null
            return `${(config.days as number) ?? 1}d parado em etapa`

        // ─── Card actions ────────────────────────────────────────────────────
        case 'action.create_task': {
            const titulo = config.titulo as string | undefined
            const tipo = config.tipo as string | undefined
            if (!titulo) return tipo ? `Tarefa: ${tipo}` : null
            return `${tipo ? tipo + ' — ' : ''}${truncate(titulo, 28)}`
        }
        case 'action.change_stage':
            return config.target_stage_id ? `→ ${BULLET} Etapa definida` : null
        case 'action.add_tag':
        case 'action.remove_tag':
            return config.tag_id ? `${BULLET} Tag escolhida` : null
        case 'action.update_field': {
            const f = config.field_key as string | undefined
            const v = config.value
            if (!f) return null
            const vs = v === null || v === undefined || v === '' ? '(vazio)' : truncate(String(v), 16)
            return `${f} = ${vs}`
        }
        case 'action.notify_internal': {
            const mode = (config.recipient_mode as string) || 'card_owner'
            const title = config.title as string | undefined
            const who = mode === 'card_owner' ? 'dono do card' : 'pessoa específica'
            return title ? `${who}: ${truncate(title, 22)}` : `Pra ${who}`
        }
        case 'action.trigger_n8n_webhook': {
            const url = config.url as string | undefined
            if (!url) return null
            try {
                return new URL(url).host
            } catch {
                return truncate(url, 32)
            }
        }
        case 'action.start_cadence':
            return config.target_template_id ? `${BULLET} Cadência definida` : null

        // ─── Echo: envio ─────────────────────────────────────────────────────
        case 'action.send_message': {
            const mode = (config.send_mode as string)
                || (config.hsm_template_name ? 'hsm' : 'text')
            if (mode === 'hsm') {
                const name = config.hsm_template_name as string | undefined
                return name ? `HSM: ${truncate(name, 26)}` : 'HSM (template não escolhido)'
            }
            const corpo = (config.corpo as string) || ''
            return corpo ? `"${truncate(corpo, 36)}"` : 'Texto livre (vazio)'
        }
        case 'action.send_media': {
            const filename = config.filename as string | undefined
            const mime = config.mime_type as string | undefined
            if (filename) return mime ? `${filename} (${mime.split('/')[1] || mime})` : filename
            return mime ? mime.split('/')[1] || mime : null
        }

        // ─── Echo: gestão de conversa ────────────────────────────────────────
        case 'action.echo_assign': {
            const to = config.assign_to as string | undefined
            return to === 'card_owner' ? 'Pro dono do card' : config.user_id ? `${BULLET} Pessoa definida` : null
        }
        case 'action.echo_release':
            return 'Devolve ao pool'
        case 'action.echo_close': {
            const reason = (config.reason as string) || ''
            if (reason) return `Motivo: ${truncate(reason, 22)}`
            return config.close_reason_id ? `${BULLET} Motivo do catálogo` : 'Sem motivo'
        }
        case 'action.echo_set_status': {
            const labels: Record<string, string> = {
                active: 'Ativa', waiting: 'Aguardando', closed: 'Fechada',
            }
            const s = config.status as string | undefined
            return s ? `→ ${labels[s] || s}` : null
        }
        case 'action.echo_add_tag':
        case 'action.echo_remove_tag':
            return config.tag_id ? `${BULLET} Tag definida` : null
        case 'action.echo_add_co_owner':
        case 'action.echo_remove_co_owner':
            return config.user_id ? `${BULLET} Pessoa definida` : null

        // ─── Flow ────────────────────────────────────────────────────────────
        case 'action.wait':
            return formatWait(config)
        case 'action.branch': {
            const t = config.condition_type as string | undefined
            const labels: Record<string, string> = {
                task_outcome: 'Resultado da tarefa',
                card_in_stage: 'Card na etapa X',
                successful_contacts_gte: 'Contatos com sucesso ≥ N',
            }
            return t ? labels[t] || t : null
        }
        case 'action.end': {
            const r = config.result as string | undefined
            const labels: Record<string, string> = {
                success: 'Sucesso', failure: 'Falha', ghosting: 'Ghosting',
            }
            const base = r ? labels[r] || r : 'Sucesso'
            return config.move_to_stage_id ? `${base} • move card` : base
        }
    }
    return null
}
