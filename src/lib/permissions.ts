/**
 * Catálogo de capabilities (permissões) do WelcomeCRM.
 *
 * Cada role tem um campo `permissions` JSONB que armazena um dict
 * { capability_key: boolean }. Este arquivo é a fonte única da
 * verdade sobre quais capabilities existem.
 *
 * IMPORTANTE: o enforcement de permissões ainda é parcial no backend.
 * As RLS policies e funções SECURITY DEFINER cobrem a maioria dos casos
 * críticos, mas algumas capabilities são checadas apenas no frontend
 * para UX (ex: esconder botões). Nunca use estas flags como única linha
 * de defesa — o backend deve validar dados sensíveis via RLS.
 */

export interface CapabilityGroup {
    key: string
    label: string
    description: string
    icon: string
    capabilities: Capability[]
}

export interface Capability {
    key: string
    label: string
    description: string
    dangerous?: boolean
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
    {
        key: 'pipeline',
        label: 'Pipeline',
        description: 'Visualizar e gerenciar o funil de vendas',
        icon: 'Kanban',
        capabilities: [
            { key: 'view_pipeline', label: 'Ver pipeline', description: 'Acessar o Kanban e visualizar cards' },
            { key: 'create_cards', label: 'Criar cards', description: 'Criar novos cards no pipeline' },
            { key: 'edit_cards', label: 'Editar cards', description: 'Editar informações de cards' },
            { key: 'move_cards', label: 'Mover cards entre estágios', description: 'Arrastar cards entre estágios do pipeline' },
            { key: 'delete_cards', label: 'Deletar cards', description: 'Remover cards (vai para lixeira)', dangerous: true },
            { key: 'view_all_phases', label: 'Ver todas as fases', description: 'Ignorar regras de phase visibility' },
        ],
    },
    {
        key: 'contacts',
        label: 'Contatos',
        description: 'Gerenciamento de contatos e leads',
        icon: 'Users',
        capabilities: [
            { key: 'view_contacts', label: 'Ver contatos', description: 'Acessar lista de contatos' },
            { key: 'create_contacts', label: 'Criar contatos', description: 'Adicionar novos contatos' },
            { key: 'edit_contacts', label: 'Editar contatos', description: 'Modificar dados de contatos' },
            { key: 'delete_contacts', label: 'Deletar contatos', description: 'Remover contatos', dangerous: true },
            { key: 'export_contacts', label: 'Exportar contatos', description: 'Baixar lista de contatos (CSV/Excel)' },
        ],
    },
    {
        key: 'proposals',
        label: 'Propostas',
        description: 'Criar e gerenciar propostas comerciais',
        icon: 'FileText',
        capabilities: [
            { key: 'view_proposals', label: 'Ver propostas', description: 'Acessar propostas' },
            { key: 'create_proposals', label: 'Criar propostas', description: 'Criar novas propostas' },
            { key: 'edit_proposals', label: 'Editar propostas', description: 'Modificar propostas existentes' },
            { key: 'send_proposals', label: 'Enviar propostas', description: 'Enviar proposta para o cliente' },
            { key: 'delete_proposals', label: 'Deletar propostas', description: 'Remover propostas', dangerous: true },
        ],
    },
    {
        key: 'team',
        label: 'Equipe',
        description: 'Gerenciamento de usuários, times e convites',
        icon: 'Users',
        capabilities: [
            { key: 'view_team', label: 'Ver equipe', description: 'Visualizar membros e times' },
            { key: 'invite_users', label: 'Convidar usuários', description: 'Gerar convites para novos membros', dangerous: true },
            { key: 'edit_users', label: 'Editar usuários', description: 'Modificar roles e permissões de outros usuários', dangerous: true },
            { key: 'delete_users', label: 'Deletar usuários', description: 'Remover usuários do sistema', dangerous: true },
            { key: 'manage_teams', label: 'Gerenciar times', description: 'Criar, editar e deletar times' },
            { key: 'manage_departments', label: 'Gerenciar departamentos', description: 'Criar, editar e deletar departamentos' },
            { key: 'manage_roles', label: 'Gerenciar roles', description: 'Definir permissões de outros roles', dangerous: true },
        ],
    },
    {
        key: 'configuration',
        label: 'Configuração',
        description: 'Customização do CRM (pipeline, campos, seções)',
        icon: 'Settings',
        capabilities: [
            { key: 'manage_pipeline', label: 'Gerenciar pipeline', description: 'Criar/editar fases e estágios' },
            { key: 'manage_fields', label: 'Gerenciar campos', description: 'Criar/editar campos customizados' },
            { key: 'manage_sections', label: 'Gerenciar seções', description: 'Criar/editar seções de card' },
            { key: 'manage_tags', label: 'Gerenciar tags', description: 'Criar/editar tags' },
            { key: 'manage_motivos_perda', label: 'Gerenciar motivos de perda', description: 'Criar/editar motivos de perda' },
            { key: 'manage_workspace', label: 'Gerenciar workspace', description: 'Editar nome, logo, cores da organização', dangerous: true },
        ],
    },
    {
        key: 'automation',
        label: 'Automações',
        description: 'Regras de automação e cadências de vendas',
        icon: 'Zap',
        capabilities: [
            { key: 'view_cadences', label: 'Ver cadências', description: 'Visualizar cadências de vendas' },
            { key: 'manage_cadences', label: 'Gerenciar cadências', description: 'Criar/editar cadências' },
            { key: 'manage_automations', label: 'Gerenciar automações', description: 'Criar/editar regras de automação' },
        ],
    },
    {
        key: 'integrations',
        label: 'Integrações',
        description: 'Conexões com sistemas externos',
        icon: 'Plug',
        capabilities: [
            { key: 'view_integrations', label: 'Ver integrações', description: 'Visualizar status de integrações' },
            { key: 'manage_integrations', label: 'Gerenciar integrações', description: 'Configurar integrações (AC, WhatsApp, etc)', dangerous: true },
            { key: 'view_integration_logs', label: 'Ver logs de integração', description: 'Acessar histórico de eventos' },
            { key: 'manage_api_keys', label: 'Gerenciar API keys', description: 'Criar/revogar chaves de API', dangerous: true },
        ],
    },
    {
        key: 'analytics',
        label: 'Analytics',
        description: 'Relatórios e métricas',
        icon: 'BarChart3',
        capabilities: [
            { key: 'view_analytics', label: 'Ver analytics', description: 'Acessar dashboards e relatórios' },
            { key: 'view_team_analytics', label: 'Ver analytics do time', description: 'Ver métricas de performance de outros usuários' },
            { key: 'export_analytics', label: 'Exportar relatórios', description: 'Baixar relatórios (CSV/PDF)' },
        ],
    },
    {
        key: 'data',
        label: 'Dados e LGPD',
        description: 'Exportação, auditoria e compliance',
        icon: 'ShieldCheck',
        capabilities: [
            { key: 'view_audit_log', label: 'Ver audit log', description: 'Acessar histórico de alterações' },
            { key: 'export_data', label: 'Exportar dados (LGPD)', description: 'Gerar export completo da organização', dangerous: true },
        ],
    },
]

export type PermissionsMap = Record<string, boolean>

/**
 * Presets de roles padrão.
 * Usados como template ao criar um novo role.
 */
export const ROLE_PRESETS: Record<string, PermissionsMap> = {
    admin: Object.fromEntries(
        CAPABILITY_GROUPS.flatMap((g) => g.capabilities.map((c) => [c.key, true]))
    ),
    sales: {
        view_pipeline: true,
        create_cards: true,
        edit_cards: true,
        move_cards: true,
        view_contacts: true,
        create_contacts: true,
        edit_contacts: true,
        view_proposals: true,
        create_proposals: true,
        edit_proposals: true,
        send_proposals: true,
        view_team: true,
        view_cadences: true,
        view_integrations: true,
        view_analytics: true,
    },
    support: {
        view_pipeline: true,
        view_contacts: true,
        edit_contacts: true,
        view_proposals: true,
        view_team: true,
        view_cadences: true,
        view_analytics: false,
    },
    gestor: {
        view_pipeline: true,
        create_cards: true,
        edit_cards: true,
        move_cards: true,
        view_all_phases: true,
        view_contacts: true,
        create_contacts: true,
        edit_contacts: true,
        export_contacts: true,
        view_proposals: true,
        create_proposals: true,
        edit_proposals: true,
        send_proposals: true,
        view_team: true,
        invite_users: true,
        manage_teams: true,
        view_cadences: true,
        manage_cadences: true,
        view_integrations: true,
        view_analytics: true,
        view_team_analytics: true,
        export_analytics: true,
    },
}

/**
 * Verifica se uma capability está habilitada para uma role.
 * Se o role tem `is_admin === true`, retorna true sempre.
 */
export function hasCapability(permissions: PermissionsMap | null | undefined, key: string): boolean {
    if (!permissions) return false
    return permissions[key] === true
}

/**
 * Retorna quantas capabilities estão habilitadas.
 */
export function countEnabledCapabilities(permissions: PermissionsMap | null | undefined): number {
    if (!permissions) return 0
    return Object.values(permissions).filter(Boolean).length
}

/**
 * Total de capabilities disponíveis (para barra de progresso).
 */
export const TOTAL_CAPABILITIES = CAPABILITY_GROUPS.reduce(
    (sum, g) => sum + g.capabilities.length,
    0
)
