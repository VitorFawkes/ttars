/**
 * Codec para traduzir entre o modelo "natural" (due_offset) exibido no novo
 * Automation Builder e os campos legados (day_offset + wait_config) usados
 * pela cadence-engine atual.
 *
 * due_offset é a fonte de verdade no UI. Ao salvar um step, traduzimos para
 * day_offset/wait_config legados para manter retrocompat com a engine sem
 * precisar refatorá-la no mesmo PR.
 */

export type DueUnit = 'hours' | 'business_days' | 'calendar_days';

export type DueAnchor =
    | 'cadence_start'
    | 'previous_block_completed'
    | 'card_field';

export interface DueOffset {
    unit: DueUnit;
    value: number;
    anchor: DueAnchor;
    /** Preenchido apenas quando anchor === 'card_field' */
    card_field?: string;
}

export interface LegacyOffset {
    day_offset: number | null;
    wait_config: {
        duration_minutes?: number;
        duration_type?: 'business' | 'calendar';
    } | null;
    requires_previous_completed: boolean;
}

/**
 * Converte due_offset → campos legados (day_offset, wait_config,
 * requires_previous_completed). Usado no save do builder.
 *
 * Regras:
 * - anchor='previous_block_completed' força requires_previous_completed=true
 * - unit='hours' usa wait_config.duration_minutes (não day_offset)
 * - unit='business_days'|'calendar_days' usa day_offset
 * - anchor='card_field' ainda não é suportado pela engine → fallback para
 *   cadence_start + warning via console (V2 resolverá)
 */
export function encodeNaturalDue(due: DueOffset): LegacyOffset {
    const requiresPrev = due.anchor === 'previous_block_completed';

    if (due.unit === 'hours') {
        return {
            day_offset: null,
            wait_config: {
                duration_minutes: Math.max(0, due.value) * 60,
                duration_type: 'business',
            },
            requires_previous_completed: requiresPrev,
        };
    }

    if (due.anchor === 'card_field') {
        console.warn('[dueOffsetCodec] anchor=card_field não suportado pela engine atual. Usando cadence_start como fallback.');
    }

    return {
        day_offset: Math.max(0, due.value),
        wait_config: null,
        requires_previous_completed: requiresPrev,
    };
}

/**
 * Converte campos legados → due_offset para inicializar o UI novo ao abrir
 * uma automação existente. Heurística:
 * - Se tem wait_config.duration_minutes → unit=hours
 * - Se tem day_offset → unit=business_days (default conservador)
 * - Se requires_previous_completed → anchor=previous_block_completed
 * - Caso contrário → anchor=cadence_start
 *
 * Retorna um default seguro quando não há nada (step novo).
 */
export function decodeNaturalDue(legacy: Partial<LegacyOffset>): DueOffset {
    const anchor: DueAnchor = legacy.requires_previous_completed
        ? 'previous_block_completed'
        : 'cadence_start';

    if (legacy.wait_config?.duration_minutes != null) {
        return {
            unit: 'hours',
            value: Math.round(legacy.wait_config.duration_minutes / 60),
            anchor,
        };
    }

    if (legacy.day_offset != null) {
        return {
            unit: 'business_days',
            value: legacy.day_offset,
            anchor,
        };
    }

    return { unit: 'business_days', value: 1, anchor };
}

/**
 * Descrição curta em português usada em badges/timelines.
 * Ex: "Em 2 dias úteis após início", "Em 3h após bloco anterior"
 */
export function formatDueOffset(due: DueOffset): string {
    const unitLabel: Record<DueUnit, string> = {
        hours: due.value === 1 ? 'hora' : 'horas',
        business_days: due.value === 1 ? 'dia útil' : 'dias úteis',
        calendar_days: due.value === 1 ? 'dia' : 'dias corridos',
    };

    const anchorLabel: Record<DueAnchor, string> = {
        cadence_start: 'após início',
        previous_block_completed: 'após bloco anterior',
        card_field: 'relativo ao card',
    };

    return `Em ${due.value} ${unitLabel[due.unit]} ${anchorLabel[due.anchor]}`;
}
