import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database } from '../database.types'

type Card = Database['public']['Tables']['cards']['Row']

// Unified requirement types
type RequirementType = 'field' | 'proposal' | 'task' | 'rule' | 'document' | 'team_member'

type TeamRoleKey = 'sdr' | 'planner' | 'pos_venda' | 'concierge'

const TEAM_ROLE_LABELS: Record<TeamRoleKey, string> = {
    sdr: 'SDR',
    planner: 'Planner',
    pos_venda: 'Pós-Venda',
    concierge: 'Concierge',
}

const TEAM_ROLE_TO_OWNER: Record<TeamRoleKey, keyof Card> = {
    sdr: 'sdr_owner_id',
    planner: 'vendas_owner_id',
    pos_venda: 'pos_owner_id',
    concierge: 'concierge_owner_id',
}

// ObservacoesEstruturadas guarda fields da mesma seção sob chaves diferentes por fase.
// Quando system_fields.section é desconhecido, varremos esses aliases conhecidos.
const SECTION_ALIASES = ['observacoes_criticas', 'observacoes_pos_venda', 'observacoes']

function isFilledValue(value: unknown): boolean {
    if (value === null || value === undefined) return false
    if (value === '') return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value as object).length > 0
    return true
}

interface BaseRequirement {
    id: string
    requirement_type: RequirementType
    label: string
    stage_id: string
    isBlocking: boolean
    isFuture: boolean
    is_blocking_config: boolean
}

export interface FieldRequirement extends BaseRequirement {
    requirement_type: 'field'
    field_key: string
    section: string | null
}

export interface ProposalRequirement extends BaseRequirement {
    requirement_type: 'proposal'
    proposal_min_status: string
}

export interface TaskRequirement extends BaseRequirement {
    requirement_type: 'task'
    task_tipo: string
    task_require_completed: boolean
}

interface RuleRequirement extends BaseRequirement {
    requirement_type: 'rule'
    field_key: string // We use field_key to store the rule key
}

export interface DocumentRequirement extends BaseRequirement {
    requirement_type: 'document'
}

export interface TeamMemberRequirement extends BaseRequirement {
    requirement_type: 'team_member'
    required_team_role: TeamRoleKey
}

export type Requirement = FieldRequirement | ProposalRequirement | TaskRequirement | RuleRequirement | DocumentRequirement | TeamMemberRequirement

// Legacy interface for backward compatibility
export interface LegacyRequirement {
    id: string
    field_key: string
    label: string
    stage_id: string
    isBlocking: boolean
    isFuture: boolean
}

export function useStageRequirements(card: Card) {
    // Fetch proposals for this card (for proposal requirement checking)
    const { data: proposals } = useQuery({
        queryKey: ['card-proposals', card.id],
        queryFn: async () => {
            const { data } = await supabase
                .from('proposals')
                .select('id, status')
                .eq('card_id', card.id)
            return data || []
        },
        enabled: !!card.id,
        staleTime: 1000 * 60 * 2
    })

    // Fetch completed tasks for this card (for task requirement checking)
    const { data: tasks } = useQuery({
        queryKey: ['card-tasks-completed', card.id],
        queryFn: async () => {
            const { data } = await supabase
                .from('tarefas')
                .select('id, tipo, concluida, status')
                .eq('card_id', card.id)
            return data || []
        },
        enabled: !!card.id,
        staleTime: 1000 * 60 * 2
    })

    // Fetch anexos (attachments) count for this card
    const { data: docProgress } = useQuery({
        queryKey: ['card-anexos-progress', card.id],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela arquivos não está nos types gerados
            const { count } = await (supabase.from('arquivos') as any)
                .select('*', { count: 'exact', head: true })
                .eq('card_id', card.id)
            const total = count || 0
            return { total, completed: total, allComplete: total > 0 }
        },
        enabled: !!card.id,
        staleTime: 1000 * 60 * 2
    })

    // Fetch card team members (for team_member requirement)
    const { data: cardTeamRoles } = useQuery({
        queryKey: ['card-team-roles', card.id],
        queryFn: async () => {
            const { data } = await supabase
                .from('card_team_members')
                .select('role')
                .eq('card_id', card.id)
            return new Set((data || []).map(m => m.role))
        },
        enabled: !!card.id,
        staleTime: 1000 * 60 * 2
    })

    // Fetch contato principal data (for contato_principal_completo rule)
    const { data: contatoPrincipal } = useQuery({
        queryKey: ['card-contato-principal', card.pessoa_principal_id],
        queryFn: async () => {
            if (!card.pessoa_principal_id) return null
            const { data } = await supabase
                .from('contatos')
                .select('nome, sobrenome, telefone, cpf')
                .eq('id', card.pessoa_principal_id)
                .single()
            return data
        },
        enabled: !!card.pessoa_principal_id,
        staleTime: 1000 * 60 * 5
    })

    const { data: requirements, isLoading } = useQuery({
        queryKey: ['stage-requirements', card.pipeline_stage_id],
        queryFn: async () => {
            if (!card.pipeline_stage_id) return []

            // Get current stage info
            const { data: currentStageData, error: stageError } = await supabase
                .from('pipeline_stages')
                .select('pipeline_id, ordem')
                .eq('id', card.pipeline_stage_id)
                .single()

            if (stageError) throw stageError
            const pipelineId = (currentStageData as { pipeline_id: string }).pipeline_id
            const currentOrder = (currentStageData as { ordem: number }).ordem

            // Fetch all required configs for this pipeline
            // NÃO usar embed `system_fields(label, type)` — não existe FK entre
            // stage_field_config.field_key e system_fields.key, então o PostgREST
            // retorna PGRST200 e silencia toda a query. Carregar labels via fetch
            // separado e mesclar em memória (mesmo padrão do useQualityGate).
            const { data, error } = await supabase
                .from('stage_field_config')
                .select(`
                    *,
                    pipeline_stages!inner (
                        id,
                        ordem,
                        fase,
                        pipeline_id
                    )
                `)
                .eq('is_required', true)
                .not('requirement_type', 'is', null)
                .eq('pipeline_stages.pipeline_id', pipelineId)

            if (error) throw error

            const fieldKeys = Array.from(new Set(
                (data || []).map(d => d.field_key).filter((k): k is string => !!k)
            ))

            const labelByKey = new Map<string, string>()
            const sectionByKey = new Map<string, string | null>()
            if (fieldKeys.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- system_fields não está nos types gerados
                const { data: fields } = await (supabase.from('system_fields') as any)
                    .select('key, label, section')
                    .in('key', fieldKeys)
                if (fields) {
                    for (const f of fields as { key: string; label: string; section: string | null }[]) {
                        labelByKey.set(f.key, f.label)
                        sectionByKey.set(f.key, f.section)
                    }
                }
            }

            const sortedData = (data || []).sort((a, b) => {
                const aOrdem = (a.pipeline_stages as { ordem?: number } | null)?.ordem || 0
                const bOrdem = (b.pipeline_stages as { ordem?: number } | null)?.ordem || 0
                return aOrdem - bOrdem
            })

            return sortedData.map((config): Requirement => {
                const baseReq = {
                    id: config.id,
                    stage_id: config.stage_id,
                    isBlocking: config.stage_id === card.pipeline_stage_id,
                    isFuture: config.pipeline_stages.ordem > currentOrder,
                    is_blocking_config: config.is_blocking ?? true
                }

                const reqType = config.requirement_type || 'field'

                if (reqType === 'proposal') {
                    return {
                        ...baseReq,
                        requirement_type: 'proposal',
                        label: config.requirement_label || 'Proposta',
                        proposal_min_status: config.proposal_min_status
                    } as ProposalRequirement
                }

                if (reqType === 'task') {
                    return {
                        ...baseReq,
                        requirement_type: 'task',
                        label: config.requirement_label || `Tarefa: ${config.task_tipo}`,
                        task_tipo: config.task_tipo,
                        task_require_completed: config.task_require_completed ?? false
                    } as TaskRequirement
                }

                if (reqType === 'rule') {
                    return {
                        ...baseReq,
                        requirement_type: 'rule',
                        label: config.requirement_label || config.field_key,
                        field_key: config.field_key
                    } as RuleRequirement
                }

                if (reqType === 'document') {
                    return {
                        ...baseReq,
                        requirement_type: 'document',
                        label: config.requirement_label || 'Documentos completos',
                    } as DocumentRequirement
                }

                if (reqType === 'team_member') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- coluna nova, types não regenerados
                    const role = ((config as any).required_team_role || 'pos_venda') as TeamRoleKey
                    return {
                        ...baseReq,
                        requirement_type: 'team_member',
                        label: config.requirement_label || `Responsável ${TEAM_ROLE_LABELS[role]}`,
                        required_team_role: role,
                    } as TeamMemberRequirement
                }

                // Default: field type
                return {
                    ...baseReq,
                    requirement_type: 'field',
                    field_key: config.field_key,
                    section: (config.field_key ? sectionByKey.get(config.field_key) : null) ?? null,
                    label: (config.field_key ? labelByKey.get(config.field_key) : undefined) || config.requirement_label || config.field_key
                } as FieldRequirement
            }).filter((req: Requirement) => req.isBlocking || req.isFuture)
        },
        enabled: !!card.pipeline_stage_id,
        staleTime: 1000 * 60 * 5
    })

    // Check if a field requirement is satisfied
    // section: nome da seção do system_fields. Quando informado, também varre containers
    // aninhados usados pelo widget ObservacoesEstruturadas (PLANNER em
    // produto_data.observacoes_criticas, SDR em briefing_inicial.observacoes,
    // POS_VENDA em produto_data.observacoes_pos_venda).
    const checkFieldRequirement = (fieldKey: string, section: string | null = null): boolean => {
        // Check in top level card fields
        if (fieldKey in card && (card as Record<string, unknown>)[fieldKey]) return true

        const checkContainer = (raw: unknown): boolean => {
            if (!raw || typeof raw !== 'object') return false
            const container = raw as Record<string, unknown>

            // Direct lookup
            const direct = container[fieldKey]
            if (isFilledValue(direct)) return true

            // Nested lookups: section + known phase aliases
            const aliases = section
                ? [section, ...SECTION_ALIASES.filter(a => a !== section)]
                : SECTION_ALIASES
            for (const alias of aliases) {
                const sub = container[alias]
                if (sub && typeof sub === 'object') {
                    const nested = (sub as Record<string, unknown>)[fieldKey]
                    if (isFilledValue(nested)) return true
                }
            }
            return false
        }

        if (checkContainer(card.produto_data)) return true
        if (checkContainer(card.briefing_inicial)) return true
        return false
    }

    // Proposal status hierarchy for comparison
    const PROPOSAL_STATUS_ORDER = ['draft', 'sent', 'viewed', 'in_progress', 'accepted']

    // Check if a proposal requirement is satisfied
    const checkProposalRequirement = (minStatus: string): boolean => {
        if (!proposals || proposals.length === 0) return false

        const minIndex = PROPOSAL_STATUS_ORDER.indexOf(minStatus)
        if (minIndex === -1) return false

        return proposals.some(p => {
            const proposalIndex = PROPOSAL_STATUS_ORDER.indexOf(p.status)
            return proposalIndex >= minIndex
        })
    }

    // Check if a task requirement is satisfied
    const checkTaskRequirement = (taskTipo: string, requireCompleted: boolean): boolean => {
        if (!tasks || tasks.length === 0) return false

        return tasks.some(t => {
            if (t.tipo !== taskTipo) return false
            if (requireCompleted && !t.concluida) return false
            return true
        })
    }

    // Unified requirement checker
    const checkRequirement = (req: Requirement): boolean => {
        switch (req.requirement_type) {
            case 'field':
                return checkFieldRequirement(req.field_key, req.section)
            case 'proposal':
                return checkProposalRequirement(req.proposal_min_status)
            case 'task':
                return checkTaskRequirement(req.task_tipo, req.task_require_completed)
            case 'document':
                return docProgress?.allComplete ?? true
            case 'team_member': {
                const ownerCol = TEAM_ROLE_TO_OWNER[req.required_team_role]
                const ownerId = ownerCol ? card[ownerCol] : null
                if (ownerId) return true
                return cardTeamRoles?.has(req.required_team_role) ?? false
            }
            case 'rule':
                if (req.field_key === 'lost_reason_required') {
                    const hasId = !!card.motivo_perda_id
                    const hasComment = !!card.motivo_perda_comentario && (card.motivo_perda_comentario as string).trim().length > 0
                    return hasId || hasComment
                }
                if (req.field_key === 'contato_principal_required') {
                    return !!card.pessoa_principal_id
                }
                if (req.field_key === 'contato_principal_completo') {
                    if (!card.pessoa_principal_id) return false
                    if (!contatoPrincipal) return false // ainda carregando — assume inválido
                    return !!(
                        contatoPrincipal.nome &&
                        contatoPrincipal.sobrenome &&
                        contatoPrincipal.telefone &&
                        contatoPrincipal.cpf
                    )
                }
                if (req.field_key === 'contato_principal_basico') {
                    if (!card.pessoa_principal_id) return false
                    if (!contatoPrincipal) return false
                    return !!(
                        contatoPrincipal.nome &&
                        contatoPrincipal.sobrenome
                    )
                }
                return true
            default:
                return true
        }
    }

    // Legacy checkRequirement for field_key string (backward compat)
    const checkRequirementLegacy = (fieldKey: string): boolean => {
        return checkFieldRequirement(fieldKey)
    }

    // Filter requirements by type
    const fieldRequirements = requirements?.filter((r): r is FieldRequirement => r.requirement_type === 'field') || []
    const proposalRequirements = requirements?.filter((r): r is ProposalRequirement => r.requirement_type === 'proposal') || []
    const taskRequirements = requirements?.filter((r): r is TaskRequirement => r.requirement_type === 'task') || []
    const ruleRequirements = requirements?.filter((r): r is RuleRequirement => r.requirement_type === 'rule') || []
    const documentRequirements = requirements?.filter((r): r is DocumentRequirement => r.requirement_type === 'document') || []

    // Categorize by blocking/future
    const blockingRequirements = requirements?.filter((r: Requirement) => r.isBlocking) || []
    const futureRequirements = requirements?.filter((r: Requirement) => r.isFuture) || []

    // Calculate missing requirements
    const missingBlocking = blockingRequirements.filter(req => !checkRequirement(req))
    const missingFuture = futureRequirements.filter(req => !checkRequirement(req))

    // All requirements complete?
    const allBlockingComplete = missingBlocking.length === 0

    return {
        requirements,
        isLoading,
        // Categorized by type
        fieldRequirements,
        proposalRequirements,
        taskRequirements,
        ruleRequirements,
        documentRequirements,
        // Categorized by stage
        blockingRequirements,
        futureRequirements,
        // Missing requirements
        missingBlocking,
        missingFuture,
        allBlockingComplete,
        // Checker functions
        checkRequirement,
        checkRequirementLegacy // Backward compat for field_key string
    }
}
