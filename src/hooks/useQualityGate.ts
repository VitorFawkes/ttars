import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Requirement types for validation
type RequirementType = 'field' | 'proposal' | 'task' | 'rule' | 'document'

interface RequirementRule {
    stage_id: string
    requirement_type: RequirementType
    field_key: string | null
    label: string
    is_blocking: boolean
    proposal_min_status: string | null
    task_tipo: string | null
    task_require_completed: boolean
}

interface MissingField {
    key: string
    label: string
    type: RequirementType
}

interface MissingProposal {
    label: string
    min_status: string
}

interface MissingTask {
    label: string
    task_tipo: string
    task_require_completed: boolean
}

interface MissingRule {
    key: string
    label: string
}

interface MissingDocument {
    label: string
    total: number
    completed: number
}

interface ValidationResult {
    valid: boolean
    missingFields: MissingField[]
    missingProposals: MissingProposal[]
    missingTasks: MissingTask[]
    missingRules: MissingRule[]
    missingDocuments: MissingDocument[]
}

// Proposal status hierarchy
const PROPOSAL_STATUS_ORDER = ['draft', 'sent', 'viewed', 'in_progress', 'accepted']

export function useQualityGate() {
    // Fetch all required configurations
    // NOTE: não usar embed `system_fields(label)` — não existe FK entre
    // stage_field_config.field_key e system_fields.key, então o PostgREST
    // retorna PGRST200 e silencia toda a validação. Carregar rótulos via
    // fetch separado e mesclar em memória.
    const { data: rules } = useQuery({
        queryKey: ['stage-field-config-all'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('stage_field_config')
                .select('*')
                .eq('is_required', true)

            if (error) throw error
            if (!data) return []

            const fieldKeys = Array.from(new Set(
                data.map(d => d.field_key).filter((k): k is string => !!k)
            ))

            let labelByKey = new Map<string, string>()
            if (fieldKeys.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- system_fields não está nos types gerados
                const { data: fields } = await (supabase.from('system_fields') as any)
                    .select('key, label')
                    .in('key', fieldKeys)
                if (fields) {
                    labelByKey = new Map(
                        (fields as { key: string; label: string }[]).map(f => [f.key, f.label])
                    )
                }
            }

            return data.map((item): RequirementRule => ({
                stage_id: item.stage_id as string,
                requirement_type: (item.requirement_type || 'field') as RequirementType,
                field_key: item.field_key,
                label: (item.field_key ? labelByKey.get(item.field_key) : undefined) || item.requirement_label || item.field_key || 'Requisito',
                is_blocking: item.is_blocking ?? true,
                proposal_min_status: item.proposal_min_status,
                task_tipo: item.task_tipo,
                task_require_completed: item.task_require_completed ?? false
            }))
        },
        staleTime: 1000 * 60 * 5 // 5 minutes
    })

    const validateMove = async (card: Record<string, unknown>, targetStageId: string): Promise<ValidationResult> => {
        if (!rules) return { valid: true, missingFields: [], missingProposals: [], missingTasks: [], missingRules: [], missingDocuments: [] }

        const stageRules = rules.filter(r => r.stage_id === targetStageId && r.is_blocking)

        const missingFields: MissingField[] = []
        const missingProposals: MissingProposal[] = []
        const missingTasks: MissingTask[] = []
        const missingRules: MissingRule[] = []
        const missingDocuments: MissingDocument[] = []

        // --- Validate Field Requirements ---
        const fieldRules = stageRules.filter(r => r.requirement_type === 'field')
        for (const rule of fieldRules) {
            if (!rule.field_key) continue

            // Check multiple data sources (waterfall resolution)
            let value = card[rule.field_key]

            if (value === undefined || value === null || value === '') {
                const produtoData = typeof card.produto_data === 'string'
                    ? JSON.parse(card.produto_data || '{}')
                    : (card.produto_data || {})
                value = produtoData[rule.field_key]

                if (typeof value === 'object' && value !== null) {
                    if ('total' in value) value = value.total
                    else if (Object.keys(value).length === 0) value = undefined
                }
            }

            if (value === undefined || value === null || value === '') {
                const briefingData = typeof card.briefing_inicial === 'string'
                    ? JSON.parse(card.briefing_inicial || '{}')
                    : (card.briefing_inicial || {})
                value = briefingData[rule.field_key]

                if (typeof value === 'object' && value !== null) {
                    if ('total' in value) value = value.total
                    else if (Object.keys(value).length === 0) value = undefined
                }
            }

            let isValid = true

            if (value === null || value === undefined || value === '') {
                isValid = false
            } else if (Array.isArray(value) && value.length === 0) {
                isValid = false
            } else if (typeof value === 'object' && Object.keys(value).length === 0) {
                isValid = false
            }

            if (!isValid) {
                missingFields.push({
                    key: rule.field_key,
                    label: rule.label,
                    type: 'field'
                })
            }
        }

        // --- Validate Proposal Requirements ---
        const proposalRules = stageRules.filter(r => r.requirement_type === 'proposal')
        if (proposalRules.length > 0) {
            // Fetch proposals for this card
            const { data: proposals } = await supabase
                .from('proposals')
                .select('id, status')
                .eq('card_id', card.id as string)

            for (const rule of proposalRules) {
                if (!rule.proposal_min_status) continue

                const minIndex = PROPOSAL_STATUS_ORDER.indexOf(rule.proposal_min_status)
                const hasValidProposal = proposals?.some(p => {
                    const proposalIndex = PROPOSAL_STATUS_ORDER.indexOf(p.status)
                    return proposalIndex >= minIndex
                })

                if (!hasValidProposal) {
                    missingProposals.push({
                        label: rule.label,
                        min_status: rule.proposal_min_status
                    })
                }
            }
        }

        // --- Validate Task Requirements ---
        const taskRules = stageRules.filter(r => r.requirement_type === 'task')
        if (taskRules.length > 0) {
            // Fetch tasks for this card
            const { data: tasks } = await supabase
                .from('tarefas')
                .select('id, tipo, concluida')
                .eq('card_id', card.id as string)

            for (const rule of taskRules) {
                if (!rule.task_tipo) continue

                const hasValidTask = tasks?.some(t => {
                    if (t.tipo !== rule.task_tipo) return false
                    if (rule.task_require_completed && !t.concluida) return false
                    return true
                })

                if (!hasValidTask) {
                    missingTasks.push({
                        label: rule.label,
                        task_tipo: rule.task_tipo,
                        task_require_completed: rule.task_require_completed
                    })
                }
            }
        }

        // --- Validate Special Rules ---
        const specialRules = stageRules.filter(r => r.requirement_type === 'rule')

        // Fetch contato principal once if needed for completeness check
        const needsContatoFetch = specialRules.some(r => r.field_key === 'contato_principal_completo')
        let contatoPrincipal: Record<string, unknown> | null = null
        if (needsContatoFetch && card.pessoa_principal_id) {
            const { data } = await supabase
                .from('contatos')
                .select('nome, sobrenome, telefone, email, cpf')
                .eq('id', card.pessoa_principal_id as string)
                .single()
            contatoPrincipal = data
        }

        for (const rule of specialRules) {
            if (!rule.field_key) continue // We store rule key in field_key

            let isValid = true

            if (rule.field_key === 'lost_reason_required') {
                // Check if lost reason is present
                const hasId = !!card.motivo_perda_id
                const hasComment = !!card.motivo_perda_comentario && (card.motivo_perda_comentario as string).trim().length > 0
                isValid = hasId || hasComment
            } else if (rule.field_key === 'contato_principal_required') {
                isValid = !!card.pessoa_principal_id
            } else if (rule.field_key === 'contato_principal_completo') {
                if (!card.pessoa_principal_id) {
                    isValid = false
                } else if (!contatoPrincipal) {
                    isValid = false
                } else {
                    isValid = !!(
                        contatoPrincipal.nome &&
                        contatoPrincipal.sobrenome &&
                        contatoPrincipal.telefone &&
                        contatoPrincipal.email &&
                        contatoPrincipal.cpf
                    )
                }
            }

            if (!isValid) {
                missingRules.push({
                    key: rule.field_key,
                    label: rule.label
                })
            }
        }

        // --- Validate Anexos (attachments) Requirements ---
        const documentRules = stageRules.filter(r => r.requirement_type === 'document')
        if (documentRules.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela arquivos não está nos types gerados
            const { count } = await (supabase.from('arquivos') as any)
                .select('*', { count: 'exact', head: true })
                .eq('card_id', card.id as string)

            const total = count || 0

            if (total === 0) {
                for (const rule of documentRules) {
                    missingDocuments.push({
                        label: rule.label,
                        total: 0,
                        completed: 0
                    })
                }
            }
        }

        return {
            valid: missingFields.length === 0 && missingProposals.length === 0 && missingTasks.length === 0 && missingRules.length === 0 && missingDocuments.length === 0,
            missingFields,
            missingProposals,
            missingTasks,
            missingRules,
            missingDocuments
        }
    }

    // Synchronous version for backward compatibility (fields only + rules sync check)
    const validateMoveSync = (card: Record<string, unknown>, targetStageId: string): { valid: boolean, missingFields: { key: string, label: string }[], missingRules: { key: string, label: string }[] } => {
        if (!rules) return { valid: true, missingFields: [], missingRules: [] }

        const stageRules = rules.filter(r =>
            r.stage_id === targetStageId &&
            r.is_blocking
        )
        const missingFields: { key: string, label: string }[] = []
        const missingRules: { key: string, label: string }[] = []

        for (const rule of stageRules) {
            if (rule.requirement_type === 'field') {
                if (!rule.field_key) continue

                // Check multiple data sources (waterfall resolution)
                // Priority: card column → produto_data → briefing_inicial → marketing_data
                let value = card[rule.field_key]

                if (value === undefined || value === null || value === '') {
                    // Check produto_data JSON
                    const produtoData = typeof card.produto_data === 'string'
                        ? JSON.parse(card.produto_data || '{}')
                        : (card.produto_data || {})
                    value = produtoData[rule.field_key]

                    // For nested objects like orcamento, check if it has content
                    if (typeof value === 'object' && value !== null) {
                        if ('total' in value) value = value.total
                        else if (Object.keys(value).length === 0) value = undefined
                    }
                }

                if (value === undefined || value === null || value === '') {
                    // Check briefing_inicial JSON
                    const briefingData = typeof card.briefing_inicial === 'string'
                        ? JSON.parse(card.briefing_inicial || '{}')
                        : (card.briefing_inicial || {})
                    value = briefingData[rule.field_key]

                    if (typeof value === 'object' && value !== null) {
                        if ('total' in value) value = value.total
                        else if (Object.keys(value).length === 0) value = undefined
                    }
                }

                let isValid = true

                if (value === null || value === undefined || value === '') {
                    isValid = false
                } else if (Array.isArray(value) && value.length === 0) {
                    isValid = false
                } else if (typeof value === 'object' && Object.keys(value).length === 0) {
                    isValid = false
                }

                if (!isValid) {
                    missingFields.push({ key: rule.field_key, label: rule.label })
                }
            } else if (rule.requirement_type === 'rule') {
                if (!rule.field_key) continue

                let isValid = true

                if (rule.field_key === 'lost_reason_required') {
                    const hasId = !!card.motivo_perda_id
                    const hasComment = !!card.motivo_perda_comentario && (card.motivo_perda_comentario as string).trim().length > 0
                    isValid = hasId || hasComment
                } else if (rule.field_key === 'contato_principal_required') {
                    isValid = !!card.pessoa_principal_id
                }
                // contato_principal_completo NÃO é verificado aqui (requer fetch async)

                if (!isValid) {
                    missingRules.push({ key: rule.field_key, label: rule.label })
                }
            }
        }

        return {
            valid: missingFields.length === 0 && missingRules.length === 0,
            missingFields,
            missingRules
        }
    }

    const hasAsyncRules = (targetStageId: string): boolean => {
        if (!rules) return false
        return rules.some(r =>
            r.stage_id === targetStageId &&
            r.is_blocking &&
            (
                r.requirement_type === 'proposal' ||
                r.requirement_type === 'task' ||
                r.requirement_type === 'document' ||
                (r.requirement_type === 'rule' && r.field_key === 'contato_principal_completo')
            )
        )
    }

    return {
        validateMove,
        validateMoveSync,
        hasAsyncRules,
        // Keep backward compat alias
        validateMoveFields: validateMoveSync
    }
}
