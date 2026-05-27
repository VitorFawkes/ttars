/**
 * summarizeConfig — gera um resumo curto do que está configurado em um node,
 * pra renderizar dentro do próprio card do canvas (sem abrir painel).
 *
 * Recebe o `config` do node + um pacote opcional de catálogos (etapas, tags,
 * users, etc) carregados pelo NodeRefLabelsProvider. Quando os catálogos
 * estão disponíveis, resolve IDs em nomes humanos; quando ainda estão
 * carregando ou o ID não foi encontrado, cai num fallback genérico.
 */
import type { WorkflowNodeType } from '../types'
import type { NodeRefLabels } from '../store/NodeRefLabels'

const truncate = (s: string, max = 40) =>
    s.length > max ? `${s.slice(0, max)}…` : s

const resolveOr = (
    labels: NodeRefLabels | undefined,
    map: keyof NodeRefLabels,
    id: string | undefined | null,
    fallback: string,
): string => {
    if (!id) return fallback
    const name = labels?.[map].get(id)
    return name ? truncate(name, 24) : fallback
}

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
    labels?: NodeRefLabels,
): string | null {
    switch (type) {
        // ─── Triggers ────────────────────────────────────────────────────────
        case 'trigger.card_created': {
            const ids = Array.isArray(config.applicable_stage_ids) ? config.applicable_stage_ids as string[] : []
            const id = ids[0] || (config.initial_stage_id as string | undefined)
            if (!id) return 'Qualquer card novo'
            return `Etapa: ${resolveOr(labels, 'stageById', id, '(carregando)')}`
        }
        case 'trigger.stage_enter': {
            const ids = (config.applicable_stage_ids as string[]) || []
            if (ids.length === 0) return null
            if (ids.length === 1) {
                return `Etapa: ${resolveOr(labels, 'stageById', ids[0], '(carregando)')}`
            }
            // 2+ etapas — mostra primeiro nome + contador
            const first = resolveOr(labels, 'stageById', ids[0], '(carregando)')
            return `${first} +${ids.length - 1}`
        }
        case 'trigger.macro_stage_enter':
            if (!config.phase_id) return null
            return `Fase: ${resolveOr(labels, 'phaseById', config.phase_id as string, '(carregando)')}`
        case 'trigger.field_changed': {
            const f = config.field_key as string | undefined
            const to = config.to_value as string | undefined
            if (!f) return null
            return to ? `${f} → ${truncate(to, 20)}` : f
        }
        case 'trigger.tag_added':
        case 'trigger.tag_removed':
            if (!config.tag_id) return null
            return `Tag: ${resolveOr(labels, 'cardTagById', config.tag_id as string, '(carregando)')}`
        case 'trigger.inbound_message_pattern': {
            const patterns = (config.patterns as string) || ''
            const lines = patterns.split('\n').map((s) => s.trim()).filter(Boolean)
            if (lines.length === 0) return null
            const first = truncate(lines[0], 28)
            return lines.length === 1 ? `"${first}"` : `"${first}" +${lines.length - 1}`
        }
        case 'trigger.time_offset_from_date': {
            const src = config.source as string | undefined
            if (!src) return null
            const srcLabel = src.replace(/^.*\./, '')
            // Reunião usa minutes_offset (hora exata); outros usam days_offset
            if (src === 'card.data_reuniao') {
                const mins = (config.minutes_offset as number) ?? 0
                if (mins === 0) return `Na hora de ${srcLabel}`
                const abs = Math.abs(mins)
                const unit = abs % 60 === 0 ? `${abs / 60}h` : `${abs}min`
                return `${unit} ${mins < 0 ? 'antes' : 'depois'} de ${srcLabel}`
            }
            const offset = (config.days_offset as number) ?? 0
            const sign = offset === 0 ? 'No dia' : offset > 0 ? `${offset}d depois` : `${Math.abs(offset)}d antes`
            return `${sign} de ${srcLabel}`
        }
        case 'trigger.time_in_stage':
            if (!config.stage_id) return null
            return `${(config.days as number) ?? 1}d em ${resolveOr(labels, 'stageById', config.stage_id as string, '(carregando)')}`

        // ─── Card actions ────────────────────────────────────────────────────
        case 'action.create_task': {
            const titulo = config.titulo as string | undefined
            const tipo = config.tipo as string | undefined
            if (!titulo) return tipo ? `Tarefa: ${tipo}` : null
            return `${tipo ? tipo + ' — ' : ''}${truncate(titulo, 28)}`
        }
        case 'action.complete_task': {
            const targetId = config.target_node_id as string | undefined
            const outcome = config.outcome as string | undefined
            if (!targetId) return 'Concluir tarefa: (referência pendente)'
            return outcome ? `Conclui — ${outcome}` : 'Conclui tarefa anterior'
        }
        case 'action.change_stage':
            if (!config.target_stage_id) return null
            return `→ ${resolveOr(labels, 'stageById', config.target_stage_id as string, '(carregando)')}`
        case 'action.add_tag':
        case 'action.remove_tag':
            if (!config.tag_id) return null
            return `Tag: ${resolveOr(labels, 'cardTagById', config.tag_id as string, '(carregando)')}`
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
            const userId = config.user_id as string | undefined
            const who = mode === 'card_owner'
                ? 'dono do card'
                : resolveOr(labels, 'userById', userId, 'pessoa específica')
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
            if (!config.target_template_id) return null
            return `Inicia: ${resolveOr(labels, 'cadenceTemplateById', config.target_template_id as string, '(carregando)')}`

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
            if (to === 'card_owner') return 'Pro dono do card'
            const userId = config.user_id as string | undefined
            if (!userId) return null
            return `→ ${resolveOr(labels, 'echoUserByProfileId', userId, '(carregando)')}`
        }
        case 'action.echo_release':
            return 'Devolve ao pool'
        case 'action.echo_close': {
            const reason = (config.reason as string) || ''
            if (reason) return `Motivo: ${truncate(reason, 22)}`
            const reasonId = config.close_reason_id as string | undefined
            if (reasonId) return `Motivo: ${resolveOr(labels, 'closeReasonById', reasonId, '(carregando)')}`
            return 'Sem motivo'
        }
        case 'action.echo_set_status': {
            const statusLabels: Record<string, string> = {
                active: 'Ativa', waiting: 'Aguardando', closed: 'Fechada',
            }
            const s = config.status as string | undefined
            return s ? `→ ${statusLabels[s] || s}` : null
        }
        case 'action.echo_add_tag':
        case 'action.echo_remove_tag':
            if (!config.tag_id) return null
            return `Tag: ${resolveOr(labels, 'echoTagById', config.tag_id as string, '(carregando)')}`
        case 'action.echo_add_co_owner':
        case 'action.echo_remove_co_owner':
            if (!config.user_id) return null
            return `→ ${resolveOr(labels, 'echoUserByProfileId', config.user_id as string, '(carregando)')}`

        // ─── Flow ────────────────────────────────────────────────────────────
        case 'action.wait':
            return formatWait(config)
        case 'action.branch': {
            const t = config.condition_type as string | undefined
            if (!t) return null
            if (t === 'card_in_stage') {
                const sid = config.stage_id as string | undefined
                if (!sid) return 'Card na etapa…'
                return `Card na etapa: ${resolveOr(labels, 'stageById', sid, '(carregando)')}`
            }
            if (t === 'successful_contacts_gte') {
                const min = (config.min_contacts as number) ?? 1
                return `Contatos com sucesso ≥ ${min}`
            }
            const branchLabels: Record<string, string> = {
                task_outcome: 'Resultado da tarefa',
            }
            return branchLabels[t] || t
        }
        case 'action.end': {
            const r = config.result as string | undefined
            const resultLabels: Record<string, string> = {
                success: 'Sucesso', failure: 'Falha', ghosting: 'Ghosting',
            }
            const base = r ? resultLabels[r] || r : 'Sucesso'
            return config.move_to_stage_id ? `${base} • move card` : base
        }
    }
    return null
}
