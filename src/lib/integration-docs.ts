export interface DocField {
    key: string;
    label: string;
    type: string;
    section: string;
    description: string;
    example: string;
    required?: boolean;
    options?: string[];
}

export const CORE_FIELDS: DocField[] = [
    // --- CARDS (Negócios) ---
    {
        key: 'deal.id',
        label: 'ID do Negócio',
        type: 'uuid',
        section: 'core_deal',
        description: 'Identificador único do negócio no sistema.',
        example: '550e8400-e29b-41d4-a716-446655440000',
        required: true
    },
    {
        key: 'deal.titulo',
        label: 'Título do Negócio',
        type: 'text',
        section: 'core_deal',
        description: 'Nome principal do negócio ou oportunidade.',
        example: 'Viagem para Paris - Família Silva',
        required: true
    },
    {
        key: 'deal.produto',
        label: 'Produto',
        type: 'enum',
        section: 'core_deal',
        description: 'Tipo de produto/serviço vendido.',
        example: 'viagem_personalizada',
        options: ['viagem_personalizada', 'viagem_grupo', 'passagem_aerea', 'hospedagem', 'seguro_viagem']
    },
    {
        key: 'deal.pipeline_id',
        label: 'ID do Pipeline',
        type: 'uuid',
        section: 'core_deal',
        description: 'ID do funil onde o negócio se encontra.',
        example: 'pipeline_123'
    },
    {
        key: 'deal.pipeline_stage_id',
        label: 'ID da Etapa',
        type: 'uuid',
        section: 'core_deal',
        description: 'ID da etapa atual do funil (ver tabela de estágios).',
        example: 'stage_456'
    },
    {
        key: 'deal.valor_estimado',
        label: 'Valor Estimado',
        type: 'number',
        section: 'core_deal',
        description: 'Valor monetário potencial do negócio.',
        example: '15000.00',
    },
    {
        key: 'deal.valor_final',
        label: 'Valor Final',
        type: 'number',
        section: 'core_deal',
        description: 'Valor final fechado do negócio.',
        example: '14500.00',
    },
    {
        key: 'deal.moeda',
        label: 'Moeda',
        type: 'text',
        section: 'core_deal',
        description: 'Código da moeda (ISO 4217).',
        example: 'BRL',
    },
    {
        key: 'deal.data_viagem_inicio',
        label: 'Data Início Viagem',
        type: 'date',
        section: 'core_deal',
        description: 'Data prevista para o início da viagem.',
        example: '2024-12-25',
    },
    {
        key: 'deal.data_viagem_fim',
        label: 'Data Fim Viagem',
        type: 'date',
        section: 'core_deal',
        description: 'Data prevista para o fim da viagem.',
        example: '2025-01-05',
    },
    {
        key: 'deal.prioridade',
        label: 'Prioridade',
        type: 'text',
        section: 'core_deal',
        description: 'Nível de prioridade do negócio.',
        example: 'alta',
    },
    {
        key: 'deal.origem',
        label: 'Origem',
        type: 'text',
        section: 'core_deal',
        description: 'Canal de origem do lead/negócio.',
        example: 'instagram',
    },
    {
        key: 'deal.status_comercial',
        label: 'Status Comercial',
        type: 'text',
        section: 'core_deal',
        description: 'Status macro do negócio (open, won, lost).',
        example: 'won',
    },
    {
        key: 'deal.motivo_perda_id',
        label: 'ID Motivo Perda',
        type: 'uuid',
        section: 'core_deal',
        description: 'ID do motivo de perda (se status for lost).',
        example: 'loss_reason_789',
    },
    {
        key: 'deal.motivo_perda_nome',
        label: 'Nome Motivo Perda',
        type: 'text',
        section: 'core_deal',
        description: 'Nome legível do motivo de perda.',
        example: 'Preço muito alto',
    },
    {
        key: 'deal.motivo_perda_comentario',
        label: 'Comentário Perda',
        type: 'text',
        section: 'core_deal',
        description: 'Comentário detalhado sobre a perda.',
        example: 'Cliente fechou com concorrente X por R$ 500 a menos.',
    },
    {
        key: 'deal.condicoes_pagamento',
        label: 'Condições de Pagamento',
        type: 'text',
        section: 'core_deal',
        description: 'Detalhes sobre a forma de pagamento.',
        example: 'Entrada + 10x sem juros',
    },
    {
        key: 'deal.codigo_projeto_erp',
        label: 'Cód. Projeto ERP',
        type: 'text',
        section: 'core_deal',
        description: 'Código do projeto no sistema ERP externo.',
        example: 'PRJ-2024-001',
    },
    {
        key: 'deal.codigo_cliente_erp',
        label: 'Cód. Cliente ERP',
        type: 'text',
        section: 'core_deal',
        description: 'Código do cliente no sistema ERP externo.',
        example: 'CLI-9988',
    },
    {
        key: 'deal.marketing_data',
        label: 'Dados de Marketing',
        type: 'json',
        section: 'core_deal',
        description: 'Objeto JSON com dados de campanha (UTMs).',
        example: '{"utm_source": "google", "utm_campaign": "verao_2025"}',
    },
    {
        key: 'deal.created_at',
        label: 'Data de Criação',
        type: 'datetime',
        section: 'core_deal',
        description: 'Data e hora em que o negócio foi criado.',
        example: '2024-01-01T10:00:00Z',
    },
    {
        key: 'deal.updated_at',
        label: 'Última Atualização',
        type: 'datetime',
        section: 'core_deal',
        description: 'Data e hora da última alteração no negócio.',
        example: '2024-01-02T15:30:00Z',
    },

    // --- CONTACTS (Contatos) ---
    {
        key: 'contact.id',
        label: 'ID do Contato',
        type: 'uuid',
        section: 'core_contact',
        description: 'Identificador único do contato principal.',
        example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
        required: true
    },
    {
        key: 'contact.nome',
        label: 'Nome Completo',
        type: 'text',
        section: 'core_contact',
        description: 'Nome completo do cliente.',
        example: 'João da Silva',
        required: true
    },
    {
        key: 'contact.email',
        label: 'Email',
        type: 'email',
        section: 'core_contact',
        description: 'Endereço de email principal.',
        example: 'joao@email.com',
    },
    {
        key: 'contact.telefone',
        label: 'Telefone',
        type: 'phone',
        section: 'core_contact',
        description: 'Número de telefone com DDD.',
        example: '+5511999999999',
    },
    {
        key: 'contact.cpf',
        label: 'CPF',
        type: 'text',
        section: 'core_contact',
        description: 'Cadastro de Pessoa Física.',
        example: '123.456.789-00',
    },
    {
        key: 'contact.passaporte',
        label: 'Passaporte',
        type: 'text',
        section: 'core_contact',
        description: 'Número do passaporte.',
        example: 'AB123456',
    },
    {
        key: 'contact.data_nascimento',
        label: 'Data de Nascimento',
        type: 'date',
        section: 'core_contact',
        description: 'Data de nascimento do contato.',
        example: '1990-05-20',
    },
    {
        key: 'contact.tipo_pessoa',
        label: 'Tipo de Pessoa',
        type: 'enum',
        section: 'core_contact',
        description: 'Classificação etária do contato.',
        example: 'adulto',
        required: true,
        options: ['adulto', 'crianca']
    },
    {
        key: 'contact.tipo_viajante',
        label: 'Tipo de Viajante',
        type: 'enum',
        section: 'core_contact',
        description: 'Papel do contato na viagem (Titular ou Acompanhante).',
        example: 'titular',
        required: true,
        options: ['titular', 'acompanhante']
    },
    {
        key: 'contact.tags',
        label: 'Tags',
        type: 'array<string>',
        section: 'core_contact',
        description: 'Lista de tags associadas ao contato.',
        example: '["vip", "familia", "indicação"]',
    },
    {
        key: 'contact.endereco',
        label: 'Endereço',
        type: 'json',
        section: 'core_contact',
        description: 'Objeto JSON com dados de endereço.',
        example: '{"rua": "Av. Paulista", "numero": "1000", "cidade": "São Paulo", "uf": "SP"}',
    },
    {
        key: 'contact.observacoes',
        label: 'Observações',
        type: 'text',
        section: 'core_contact',
        description: 'Anotações gerais sobre o contato.',
        example: 'Cliente prefere contato via WhatsApp.',
    },
    {
        key: 'contact.responsavel_id',
        label: 'ID Responsável (Contato)',
        type: 'uuid',
        section: 'core_contact',
        description: 'ID do usuário responsável por este contato.',
        example: 'user_999',
    },
    {
        key: 'contact.created_at',
        label: 'Data de Criação',
        type: 'datetime',
        section: 'core_contact',
        description: 'Data de cadastro do contato.',
        example: '2024-01-01T10:00:00Z',
    },

    // --- USERS (Usuários) ---
    {
        key: 'user.id',
        label: 'ID do Responsável',
        type: 'uuid',
        section: 'core_user',
        description: 'ID do usuário do CRM responsável pelo negócio.',
        example: 'user_123456789',
    },
    {
        key: 'user.nome',
        label: 'Nome do Responsável',
        type: 'text',
        section: 'core_user',
        description: 'Nome do usuário responsável.',
        example: 'Maria Consultora',
    },
    {
        key: 'user.email',
        label: 'Email do Responsável',
        type: 'email',
        section: 'core_user',
        description: 'Email do usuário responsável.',
        example: 'maria@agencia.com',
    },
    {
        key: 'user.role',
        label: 'Função (Role)',
        type: 'enum',
        section: 'core_user',
        description: 'Nível de permissão do usuário.',
        example: 'admin',
        options: ['admin', 'manager', 'agent']
    },
    {
        key: 'user.active',
        label: 'Ativo',
        type: 'boolean',
        section: 'core_user',
        description: 'Indica se o usuário está ativo no sistema.',
        example: 'true',
    },
    {
        key: 'user.department_id',
        label: 'ID Departamento',
        type: 'uuid',
        section: 'core_user',
        description: 'ID do departamento do usuário.',
        example: 'dept_456',
    }
];

export const SECTIONS_MAP: Record<string, string> = {
    'core_deal': 'Negócio (Campos Padrão)',
    'core_contact': 'Contato (Campos Padrão)',
    'core_user': 'Responsável (Usuário)',
    'trip_info': 'Informações da Viagem (Personalizado)',
    'details': 'Detalhes Adicionais (Personalizado)',
    'marketing': 'Marketing & Origem'
};
