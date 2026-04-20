import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Requirement types for validation
type RequirementType = 'field' | 'proposal' | 'task' | 'rule' | 'document' | 'team_member'

type TeamRole = 'sdr' | 'planner' | 'pos_venda' | 'concierge'

const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
    sdr: 'SDR',
    planner: 'Planner',
    pos_venda: 'Pós-Venda',
    concierge: 'Concierge',
}

const TEAM_ROLE_TO_OWNER_COLUMN: Record<TeamRole, string> = {
    sdr: 'sdr_owner_id',
    planner: 'vendas_owner_id',
    pos_venda: 'pos_owner_id',
    concierge: 'concierge_owner_id',
}

interface RequirementRule {
    stage_id: string
    requirement_type: RequirementType
    field_key: string | null
    label: string
    is_blocking: boolean
    proposal_min_status: string | null
    task_tipo: string | null
    task_require_completed: boolean
    required_team_role: TeamRole | null
}

// --- Unified missing requirement (single source of truth for the modal) ---
export interface MissingRequirement {
    type: RequirementType | string  // string allows future types without code changes
    label: string
    detail?: string  // e.g. "(concluída)", "Enviada", "2/3 recebidos"
    required_team_role?: TeamRole  // set when type === 'team_member', lets the modal render inline picker
}

interface ValidationResult {
    valid: boolean
    missingRequirements: MissingRequirement[]
}

// Proposal status hierarchy
const PROPOSAL_STATUS_ORDER = ['draft', 'sent', 'viewed', 'in_progress', 'accepted']

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
    'sent': 'Enviada',
    'viewed': 'Visualizada',
    'in_progress': 'Em Análise',
    'accepted': 'Aceita'
}

/**
 * Hook de validação de requisitos para movimentação de cards.
 * @param pipelineId — quando informado, filtra regras para stages desse pipeline apenas (defesa em profundidade).
 *   Obter via `useCurrentProductMeta().pipelineId`.
 */
export function useQualityGate(pipelineId?: string) {
    // Quando pipelineId informado, buscar stage IDs válidos
    const { data: validStageIds } = useQuery({
        queryKey: ['pipeline-stage-ids-for-filter', pipelineId],
        queryFn: async () => {
            if (!pipelineId) return null
            const { data } = await supabase
                .from('pipeline_stages')
                .select('id')
                .eq('pipeline_id', pipelineId)
            return data?.map(s => s.id) || []
        },
        enabled: !!pipelineId,
        staleTime: 1000 * 60 * 5
    })

    // Fetch all required configurations
    // NOTE: não usar embed `system_fields(label)` — não existe FK entre
    // stage_field_config.field_key e system_fields.key, então o PostgREST
    // retorna PGRST200 e silencia toda a validação. Carregar rótulos via
    // fetch separado e mesclar em memória.
    const { data: allRules } = useQuery({
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

            return data.map((item): RequirementRule => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- coluna nova, types não regenerados
                const role = (item as any).required_team_role as TeamRole | null | undefined
                const teamLabel = role ? `Responsável ${TEAM_ROLE_LABELS[role]}` : null
                return {
                    stage_id: item.stage_id as string,
                    requirement_type: (item.requirement_type || 'field') as RequirementType,
                    field_key: item.field_key,
                    label: (item.field_key ? labelByKey.get(item.field_key) : undefined) || item.requirement_label || teamLabel || item.field_key || 'Requisito',
                    is_blocking: item.is_blocking ?? true,
                    proposal_min_status: item.proposal_min_status,
                    task_tipo: item.task_tipo,
                    task_require_completed: item.task_require_completed ?? false,
                    required_team_role: role ?? null,
                }
            })
        },
        staleTime: 1000 * 60 * 5 // 5 minutes
    })

    // Filtrar regras pelo pipeline quando pipelineId informado
    const rules = useMemo(() => {
        if (!allRules) return undefined
        if (!pipelineId || !validStageIds) return allRules
        const stageSet = new Set(validStageIds)
        return allRules.filter(r => stageSet.has(r.stage_id))
    }, [allRules, pipelineId, validStageIds])

    const validateMove = async (cardInput: Record<string, unknown>, targetStageId: string): Promise<ValidationResult> => {
        if (!rules) return { valid: true, missingRequirements: [] }

        // Buscar card fresco do banco para evitar validação com dados stale do cache
        let card = cardInput
        if (cardInput.id) {
            const { data: freshCard } = await supabase
                .from('cards')
                .select('*')
                .eq('id', cardInput.id as string)
                .single()
            if (freshCard) {
                card = freshCard as unknown as Record<string, unknown>
            }
        }

        const stageRules = rules.filter(r => r.stage_id === targetStageId && r.is_blocking)
        const missing: MissingRequirement[] = []

        // --- Validate Field Requirements ---
        const fieldRules = stageRules.filter(r => r.requirement_type === 'field')
        for (const rule of fieldRules) {
            if (!rule.field_key) continue

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
                missing.push({ type: 'field', label: rule.label })
            }
        }

        // --- Validate Proposal Requirements ---
        const proposalRules = stageRules.filter(r => r.requirement_type === 'proposal')
        if (proposalRules.length > 0) {
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
                    missing.push({
                        type: 'proposal',
                        label: rule.label,
                        detail: PROPOSAL_STATUS_LABELS[rule.proposal_min_status] || rule.proposal_min_status
                    })
                }
            }
        }

        // --- Validate Task Requirements ---
        const taskRules = stageRules.filter(r => r.requirement_type === 'task')
        if (taskRules.length > 0) {
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
                    missing.push({
                        type: 'task',
                        label: rule.label,
                        detail: rule.task_require_completed ? 'concluída' : 'criada'
                    })
                }
            }
        }

        // --- Validate Special Rules ---
        const specialRules = stageRules.filter(r => r.requirement_type === 'rule')

        const needsContatoFetch = specialRules.some(r =>
            r.field_key === 'contato_principal_completo'
            || r.field_key === 'contato_principal_basico'
        )
        let contatoPrincipal: Record<string, unknown> | null = null
        if (needsContatoFetch && card.pessoa_principal_id) {
            const { data } = await supabase
                .from('contatos')
                .select('nome, sobrenome, telefone, cpf')
                .eq('id', card.pessoa_principal_id as string)
                .single()
            contatoPrincipal = data
        }

        for (const rule of specialRules) {
            if (!rule.field_key) continue

            let isValid = true

            if (rule.field_key === 'lost_reason_required') {
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
                        contatoPrincipal.cpf
                    )
                }
            } else if (rule.field_key === 'contato_principal_basico') {
                if (!card.pessoa_principal_id) {
                    isValid = false
                } else if (!contatoPrincipal) {
                    isValid = false
                } else {
                    isValid = !!(
                        contatoPrincipal.nome &&
                        contatoPrincipal.sobrenome
                    )
                }
            }

            if (!isValid) {
                let detail: string | undefined
                if (rule.field_key === 'contato_principal_completo') {
                    if (!card.pessoa_principal_id) {
                        detail = 'faltam: nome, sobrenome, telefone, CPF'
                    } else {
                        const faltando: string[] = []
                        if (!contatoPrincipal?.nome) faltando.push('nome')
                        if (!contatoPrincipal?.sobrenome) faltando.push('sobrenome')
                        if (!contatoPrincipal?.telefone) faltando.push('telefone')
                        if (!contatoPrincipal?.cpf) faltando.push('CPF')
                        detail = faltando.length > 0 ? `faltam: ${faltando.join(', ')}` : undefined
                    }
                } else if (rule.field_key === 'contato_principal_basico') {
                    if (!card.pessoa_principal_id) {
                        detail = 'faltam: nome, sobrenome'
                    } else {
                        const faltando: string[] = []
                        if (!contatoPrincipal?.nome) faltando.push('nome')
                        if (!contatoPrincipal?.sobrenome) faltando.push('sobrenome')
                        detail = faltando.length > 0 ? `faltam: ${faltando.join(', ')}` : undefined
                    }
                }
                missing.push({ type: 'rule', label: rule.label, detail })
            }
        }

        // --- Validate Team Member Requirements (owner OR team member with role) ---
        const teamRules = stageRules.filter(r => r.requirement_type === 'team_member' && r.required_team_role)
        if (teamRules.length > 0) {
            const missingRoles = teamRules.filter(rule => {
                const ownerCol = TEAM_ROLE_TO_OWNER_COLUMN[rule.required_team_role as TeamRole]
                const ownerId = card[ownerCol]
                return !ownerId
            })

            if (missingRoles.length > 0) {
                const { data: teamMembers } = await supabase
                    .from('card_team_members')
                    .select('role')
                    .eq('card_id', card.id as string)

                const rolesPresent = new Set((teamMembers || []).map(m => m.role))

                for (const rule of missingRoles) {
                    if (!rolesPresent.has(rule.required_team_role!)) {
                        missing.push({
                            type: 'team_member',
                            label: rule.label,
                            detail: TEAM_ROLE_LABELS[rule.required_team_role as TeamRole],
                            required_team_role: rule.required_team_role as TeamRole,
                        })
                    }
                }
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
                    missing.push({ type: 'document', label: rule.label, detail: `0/${total} recebidos` })
                }
            }
        }

        // --- Any future requirement_type added in the DB will be caught here ---
        const handledTypes = new Set(['field', 'proposal', 'task', 'rule', 'document', 'team_member'])
        const unknownRules = stageRules.filter(r => !handledTypes.has(r.requirement_type))
        for (const rule of unknownRules) {
            // Unknown types are always treated as missing (fail-closed) until validation logic is added
            missing.push({ type: rule.requirement_type, label: rule.label })
        }

        return {
            valid: missing.length === 0,
            missingRequirements: missing
        }
    }

    // Synchronous version (fields + sync rules only — async types use validateMove)
    const validateMoveSync = (card: Record<string, unknown>, targetStageId: string): ValidationResult & { hasLostReasonRule: boolean } => {
        if (!rules) return { valid: true, missingRequirements: [], hasLostReasonRule: false }

        const stageRules = rules.filter(r =>
            r.stage_id === targetStageId &&
            r.is_blocking
        )
        const missing: MissingRequirement[] = []
        let hasLostReasonRule = false

        for (const rule of stageRules) {
            if (rule.requirement_type === 'field') {
                if (!rule.field_key) continue

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
                    missing.push({ type: 'field', label: rule.label })
                }
            } else if (rule.requirement_type === 'rule') {
                if (!rule.field_key) continue

                if (rule.field_key === 'lost_reason_required') {
                    hasLostReasonRule = true
                    const hasId = !!card.motivo_perda_id
                    const hasComment = !!card.motivo_perda_comentario && (card.motivo_perda_comentario as string).trim().length > 0
                    if (!hasId && !hasComment) {
                        missing.push({ type: 'rule', label: rule.label })
                    }
                } else if (rule.field_key === 'contato_principal_required') {
                    if (!card.pessoa_principal_id) {
                        missing.push({ type: 'rule', label: rule.label })
                    }
                }
                // contato_principal_completo e contato_principal_basico NÃO são
                // verificados aqui (requerem fetch async — usar validateMove)
            } else if (rule.requirement_type === 'team_member' && rule.required_team_role) {
                // Sync pass: só valida se tem owner direto. Se não tiver, marca como pendente.
                // validateMove (async) reverifica via card_team_members.
                const ownerCol = TEAM_ROLE_TO_OWNER_COLUMN[rule.required_team_role as TeamRole]
                const ownerId = card[ownerCol]
                if (!ownerId) {
                    missing.push({
                        type: 'team_member',
                        label: rule.label,
                        detail: TEAM_ROLE_LABELS[rule.required_team_role as TeamRole],
                        required_team_role: rule.required_team_role as TeamRole,
                    })
                }
            }
        }

        return {
            valid: missing.length === 0,
            missingRequirements: missing,
            hasLostReasonRule
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
                r.requirement_type === 'team_member' ||
                (r.requirement_type === 'rule' && (r.field_key === 'contato_principal_completo' || r.field_key === 'contato_principal_basico'))
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
