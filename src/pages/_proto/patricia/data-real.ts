/**
 * Dados REAIS da Patricia em produção — snapshot 2026-05-15.
 *
 * Fontes (todas consultadas via REST do Supabase):
 *  - ai_agents (id 4d96d9b4-e909-4441-bd85-d3f807cccfa7)
 *  - ai_agent_business_config
 *  - ai_agent_skills (+ ai_skills join)
 *  - ai_agent_moments (9 momentos)
 *  - ai_agent_scoring_rules (15 regras)
 *  - ai_agent_silent_signals (3 sinais)
 *  - ai_agent_phone_line_config (2 vínculos)
 *  - whatsapp_linha_config (2 linhas)
 *  - profiles (Wedding Planner)
 *  - pipeline_stages (etapa de handoff)
 *
 * Zero invenção. Se a Patricia mudar no banco, esses dados ficam desatualizados
 * (esse arquivo é mock estático pra protótipo).
 */

export const PATRICIA = {
  id: '4d96d9b4-e909-4441-bd85-d3f807cccfa7',
  nome: 'Patricia',
  persona: 'Especialista em triagem',
  descricao: 'SDR IA da Welcome Weddings — qualifica casais via WhatsApp e agenda reunião com a Wedding Planner.',
  tipo: 'sales' as const,
  ativa: true,
  modelo: 'gpt-5.1',
  interaction_mode: 'inbound' as const,
  playbook_enabled: true,
  execution_backend: 'edge_function' as const,
  produto: 'WEDDING' as const,
  fallback_message: 'Deixa eu verificar uma coisa aqui e já volto.',
}

export const BUSINESS = {
  company_name: 'Welcome Weddings',
  company_description: 'Produtora premium de destination wedding da América Latina. Desde 2012. Mais de 650 casamentos em 20+ países. 5 prêmios internacionais consecutivos. Cada casamento é desenhado do zero pro casal, zero pacote fechado.',
  tone: 'empathetic',
  language: 'pt-BR',
  fee_presentation_timing: 'never' as const,
  methodology_text: 'A gente não monta casamento de prateleira. Cada casamento é desenhado do zero pro casal. Diferencial: Wedding Planner dedicada, rede de fornecedores em 20+ países, foco em transformar sonho em experiência real, sem estresse. Menos preocupação, mais amor.',
  process_steps: [
    'Qualificação pelo WhatsApp (Patricia)',
    'Conversa com nossa especialista em destination wedding',
    'Contrato e kickoff do planejamento',
    'Planejamento completo com a Wedding Planner',
    'Dia do casamento',
  ],
  calendar_config: {
    working_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    working_hours: '10:00-17:00',
  },
  has_secondary_contacts: true,
  secondary_contact_role: 'parceiro(a)',
  secondary_contact_fields: ['cpf', 'data_nascimento'],
}

// Extraídas do system_prompt — 8 regras absolutas de tom
export const TONE_RULES: { rule: string; on: boolean }[] = [
  { rule: 'Zero travessões nos textos', on: true },
  { rule: 'Uma pergunta por turno (exceto perguntas do mesmo tema)', on: true },
  { rule: 'Primeira mensagem sem emoji', on: true },
  { rule: 'Use "a gente", nunca "nós"', on: true },
  { rule: 'Use "vocês" pro casal — nunca separar', on: true },
  { rule: 'Português brasileiro natural, zero formalidade', on: true },
  { rule: 'Elegância contida, sem entusiasmo forçado', on: true },
  { rule: 'Nunca usar clichês ("casamento dos sonhos", "deixe conosco")', on: true },
  { rule: 'Nunca falar de IA, prompt, sistema, formulário', on: true },
]

export const GOLDEN_RULE = {
  title: 'Patricia NUNCA fala preço',
  body: '"Só a especialista em destination wedding fala preço, porque cada casamento é único. Se o cliente insiste em saber preço antes — não soa caro, deixa o cliente falar o orçamento dele primeiro."',
}

export const FORMATTING = {
  rule: 'Quebrar em 1 a 3 mensagens WhatsApp',
  details: ['Cada mensagem máximo 3 linhas', 'Sem travessões', 'Sem emoji na primeira mensagem'],
}

export const CROSS_SELL = {
  title: 'Cross-sell lua de mel',
  body: 'Quando o cliente menciona lua de mel ou "queremos casar e já viajar", Patricia menciona Welcome Trips (Travel Planner) e oferece conectar em paralelo. NUNCA promete entregar lua de mel — é cross-produto.',
}

export const HIDDEN_INSTRUCTIONS = {
  handoff_invisivel: 'Quando qualifica e encaminha, NÃO dizer "vou passar" ou "vou transferir". Continua natural: "Perfeito, deixa eu preparar tudo pra quinta 14h. Me passa seu email..."',
  desfecho_nao_qualifica: 'Se score não bate: envia "Guia do Casamento Welcome" da base de conhecimento, encerra com simpatia, sem prometer próximo passo.',
}

// Coletados de ai_agent_moments — 9 momentos da conversa
export interface Moment {
  key: string
  label: string
  order: number
  kind: 'flow' | 'play'
  trigger: string
}

export const MOMENTS: Moment[] = [
  { key: 'abertura', label: 'Abertura', order: 1, kind: 'flow', trigger: 'Primeiro contato' },
  { key: 'sondagem', label: 'Sondagem', order: 2, kind: 'flow', trigger: 'Lead respondeu' },
  { key: 'objecao_preco', label: 'Objeção de preço', order: 3, kind: 'play', trigger: 'Palavra-chave: "preço", "valor", "quanto custa"' },
  { key: 'lua_de_mel', label: 'Lua de mel junto', order: 4, kind: 'play', trigger: 'Palavra-chave: "lua de mel", "honeymoon"' },
  { key: 'desfecho_qualificado', label: 'Desfecho qualificado', order: 5, kind: 'flow', trigger: 'Pontuação ≥ 25' },
  { key: 'desfecho_nao_qualificado', label: 'Desfecho não qualificado', order: 6, kind: 'flow', trigger: 'Sempre que score baixo' },
  { key: 'destino_fora_catalogo', label: 'Destino fora do catálogo', order: 7, kind: 'play', trigger: 'Palavra-chave (destino exótico)' },
  { key: 'objecao_preciso_pensar', label: 'Objeção "preciso pensar"', order: 8, kind: 'play', trigger: 'Palavra-chave: "preciso pensar"' },
  { key: 'familia_co_financiadora', label: 'Família co-financiadora', order: 9, kind: 'play', trigger: 'Palavra-chave (família ajudando)' },
]

// 6 campos coletados ativamente
export const COLLECTED_FIELDS = [
  { key: 'ww_data_casamento', label: 'Data do casamento', tipo: 'data' },
  { key: 'ww_destino', label: 'Destino', tipo: 'categoria', options: ['Caribe', 'Maldivas', 'Nordeste', 'Mendoza', 'Europa', 'Outro'] },
  { key: 'ww_num_convidados', label: 'Número de convidados', tipo: 'inteiro' },
  { key: 'ww_orcamento_faixa', label: 'Orçamento (em R$)', tipo: 'inteiro' },
  { key: 'ww_tipo_casamento', label: 'Tipo de casamento', tipo: 'texto', exemplo: 'praia, fazenda, salão' },
  { key: 'ww_sdr_visao_casamento', label: 'Visão do casamento', tipo: 'texto curto' },
]

// 3 sinais silenciosos (de ai_agent_silent_signals)
export interface SilentSignal {
  key: string
  label: string
  hint: string
  use: string
}

export const SILENT_SIGNALS: SilentSignal[] = [
  {
    key: 'viagem_internacional_recente',
    label: 'Viagem internacional recente',
    hint: 'Casal menciona espontaneamente viagem internacional dos últimos 12 meses (Europa, Caribe, EUA, Ásia, Maldivas) — mesmo em comentário casual',
    use: 'Sinal positivo de poder aquisitivo acima do orçamento declarado. Não confronta, registra silenciosamente.',
  },
  {
    key: 'referencia_casamento_premium',
    label: 'Referência de casamento admirado',
    hint: 'Casal cita ter ido em Destination Wedding',
    use: 'Sinal de círculo social compatível. Não confronta, registra silenciosamente.',
  },
  {
    key: 'familia_co_financiadora',
    label: 'Família ajuda no investimento',
    hint: 'Casal menciona que pais, sogros ou parentes vão ajudar a bancar',
    use: 'Abre possibilidade de teto maior. Em alguns casos, sugerir incluir os pais na videoconferência com a Planner.',
  },
]

// 6 ferramentas habilitadas (de ai_agent_skills + ai_skills)
export interface Skill {
  nome: string
  descricao: string
  categoria: 'action' | 'data_retrieval'
  enabled: boolean
}

export const SKILLS: Skill[] = [
  { nome: 'update_contact', descricao: 'Atualiza dados do contato', categoria: 'action', enabled: true },
  { nome: 'assign_tag', descricao: 'Atribui tag ao lead', categoria: 'action', enabled: true },
  { nome: 'check_calendar', descricao: 'Verifica agenda do consultor', categoria: 'data_retrieval', enabled: true },
  { nome: 'create_task', descricao: 'Cria tarefa ou reunião no CRM', categoria: 'action', enabled: true },
  { nome: 'search_knowledge_base', descricao: 'Busca informações na base de conhecimento', categoria: 'data_retrieval', enabled: true },
  { nome: 'request_handoff', descricao: 'Solicita transferência para humano', categoria: 'action', enabled: true },
]

// 15 regras de pontuação (qualify + bonus + disqualify)
export interface ScoringRule {
  label: string
  weight: number
  type: 'qualify' | 'bonus' | 'disqualify'
  group: string | null
}

export const SCORING_RULES: ScoringRule[] = [
  { label: 'Destino no Caribe', weight: 20, type: 'qualify', group: 'destino' },
  { label: 'Destino no Nordeste brasileiro', weight: 15, type: 'qualify', group: 'destino' },
  { label: 'Destino em Mendoza (Argentina)', weight: 10, type: 'qualify', group: 'destino' },
  { label: 'Destino nas Maldivas', weight: 5, type: 'qualify', group: 'destino' },
  { label: 'Destino na Europa', weight: 5, type: 'qualify', group: 'destino' },
  { label: 'Valor por convidado: R$ 3.000+', weight: 25, type: 'qualify', group: 'valor_convidado' },
  { label: 'Valor por convidado: R$ 2.500-3.000', weight: 20, type: 'qualify', group: 'valor_convidado' },
  { label: 'Valor por convidado: R$ 2.000-2.500', weight: 15, type: 'qualify', group: 'valor_convidado' },
  { label: 'Valor por convidado: R$ 1.500-2.000', weight: 10, type: 'qualify', group: 'valor_convidado' },
  { label: 'Valor por convidado: R$ 1.000-1.500', weight: 5, type: 'qualify', group: 'valor_convidado' },
  { label: 'Viagem internacional recente', weight: 10, type: 'qualify', group: null },
  { label: 'Família ajudando a pagar', weight: 10, type: 'qualify', group: null },
  { label: 'Referência a casamento premium', weight: 5, type: 'bonus', group: null },
  { label: 'Pesquisou outras produtoras ou hotéis', weight: 5, type: 'bonus', group: null },
  { label: 'Destino fora catálogo sem flexibilidade', weight: 0, type: 'disqualify', group: null },
]

export const SCORING_THRESHOLD = 25 // Score mínimo pra qualificar e agendar

// 8 sinais de handoff (3 ativos)
export interface HandoffSignal {
  slug: string
  description: string
  enabled: boolean
}

export const HANDOFF_SIGNALS: HandoffSignal[] = [
  { slug: 'pedido_humano', description: 'Cliente sinaliza em qualquer linguagem que quer falar com outra pessoa', enabled: true },
  { slug: 'loop_incompreensao', description: 'Patricia já tentou reformular 2+ vezes e cliente continua confuso', enabled: true },
  { slug: 'alta_intencao_bloqueada', description: 'Cliente quer fechar mas não consegue avançar no fluxo', enabled: true },
  { slug: 'cliente_insatisfeito', description: 'Tom frustrado, críticas repetidas, ironia evidente ao longo da conversa', enabled: false },
  { slug: 'fora_escopo', description: 'Tema que o agente não domina (jurídico, cancelamento complexo, reembolso)', enabled: false },
  { slug: 'informacao_sensivel', description: 'Cobrança errada, dado pessoal comprometido, risco reputacional', enabled: false },
  { slug: 'regulatorio', description: 'Tema que exige humano por política (devolução, cancelamento de contrato)', enabled: false },
  { slug: 'conversa_longa', description: 'Conversa muito longa sem resolução clara', enabled: false },
]

// Ação de handoff
export const HANDOFF_ACTIONS = {
  book_meeting: {
    enabled: true,
    tipo: 'reuniao_video',
    duracao_minutos: 60,
    slots_per_day: 2,
    business_days_ahead: 6,
    min_hours_between_slots: 2,
    skip_today: true,
  },
  change_stage: { id: 'ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1', label: 'Reunião Agendada' },
  apply_tag: { name: 'Patricia qualificou', color: '#22c55e' },
  notify_responsible: true,
  message_template: 'Perfeito, {contact_name}! Marquei {responsavel_first_name} pra falar com vocês {data} às {hora}. Ela já chega com contexto sobre o casamento de vocês.',
}

export const WEDDING_PLANNER = {
  id: 'f3c7ccd6-3038-469b-be5c-39a324ca64bc',
  nome: 'Ana Carolina Kuss',
  email: 'ana@welcometrips.com.br',
}

// 2 vínculos de linha WhatsApp (1 ativo, 1 pausado)
export interface PhoneLine {
  vinculo_id: string
  label: string
  produto: 'WEDDING' | 'TRIPS'
  ativa: boolean
}

export const PHONE_LINES: PhoneLine[] = [
  { vinculo_id: '5490f754-004a-4e33-99aa-dae6138aaf29', label: 'Elopment (Patricia v2)', produto: 'WEDDING', ativa: true },
  { vinculo_id: '3d03ed8a-18e6-4752-82b9-7770eb1653f6', label: 'SDR Weddings', produto: 'WEDDING', ativa: false },
]

// Whitelist de teste — Patricia só responde a esses 4 telefones
export const TEST_WHITELIST = [
  '5511964293533',
  '554199267071',
  '41998839193',
  '4199449964',
]

// Campos auto-atualizados (13)
export const AUTO_UPDATE_FIELDS = [
  'ai_resumo', 'ai_contexto', 'pipeline_stage_id',
  'ww_data_casamento', 'ww_destino', 'ww_num_convidados',
  'ww_orcamento_faixa', 'ww_tipo_casamento', 'ww_sdr_visao_casamento',
  'ww_sdr_ajuda_familia', 'ww_sdr_perfil_viagem_internacional',
  'ww_sdr_referencia_casamento_premium', 'titulo',
]

// Campos do contato que Patricia atualiza
export const CONTACT_UPDATE_FIELDS = ['nome', 'sobrenome', 'email', 'data_nascimento']

// Campos de formulário lidos do CRM ao entrar na conversa
export const FORM_DATA_FIELDS = [
  'ww_mkt_destino_form', 'ww_mkt_orcamento_form', 'ww_mkt_convidados_form',
  'ww_mkt_como_conheceu', 'utm_source',
  'ww_destino', 'ww_data_casamento', 'ww_num_convidados',
  'ww_orcamento_faixa', 'ww_tipo_casamento', 'ww_sdr_visao_casamento',
  'ww_sdr_ajuda_familia', 'ww_sdr_perfil_viagem_internacional',
  'ww_sdr_referencia_casamento_premium',
]

// Métricas (hub_stats + metrics) — números reais não consultados nesta sessão;
// usa placeholders honestos que indicam "carregando" se for usar com hooks reais.
export const METRICS = [
  { key: 'conversations_7d', label: 'Conversas', value: '—', window: 'últimos 7 dias' },
  { key: 'resolution_rate', label: 'Taxa de resolução', value: '—', window: 'últimos 7 dias' },
  { key: 'escalation_rate', label: 'Taxa de escalação', value: '—', window: 'últimos 30 dias' },
  { key: 'avg_turns', label: 'Média de turnos', value: '—', window: 'últimos 30 dias' },
]

// ─────────────────────────────────────────────────────────────────────────────
//  Trilha — 7 capítulos. Cada um aponta pra abas técnicas que contém os dados.
// ─────────────────────────────────────────────────────────────────────────────

export type ChapterId = 'cap1' | 'cap2' | 'cap3' | 'cap4' | 'cap5' | 'cap6' | 'cap7'

export interface Chapter {
  id: ChapterId
  num: number
  title: string
  question: string
  summary: string
  /** O que falta pra considerar "pronto" */
  isComplete: boolean
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'cap1', num: 1,
    title: 'Quem é a Patricia?',
    question: 'Como ela se apresenta?',
    summary: 'Nome, persona, descrição, tipo, identidade da empresa',
    isComplete: true,
  },
  {
    id: 'cap2', num: 2,
    title: 'Como ela fala?',
    question: 'Que tom, que regras de linguagem?',
    summary: 'Modo inbound · 9 regras de tom · nunca fala preço · formatação WhatsApp',
    isComplete: true,
  },
  {
    id: 'cap3', num: 3,
    title: 'Sobre o que ela conversa?',
    question: 'Por onde a conversa passa? O que ela descobre?',
    summary: '9 momentos · 6 campos coletados · 3 sinais silenciosos',
    isComplete: true,
  },
  {
    id: 'cap4', num: 4,
    title: 'O que ela sabe sobre seu negócio?',
    question: 'Que regras e contexto Patricia tem do negócio?',
    summary: '5 passos do processo Welcome · agenda seg-sex 10-17h · sem base de conhecimento ainda',
    isComplete: false,
  },
  {
    id: 'cap5', num: 5,
    title: 'O que ela pode fazer sozinha?',
    question: 'Que ações ela executa sem perguntar?',
    summary: '6 ferramentas · 13 campos auto-atualizados',
    isComplete: true,
  },
  {
    id: 'cap6', num: 6,
    title: 'Quando ela chama um humano?',
    question: 'Em que momento alguém da equipe entra?',
    summary: '3 sinais ativos · 15 regras de pontuação · agenda 60min com Ana Carolina Kuss',
    isComplete: true,
  },
  {
    id: 'cap7', num: 7,
    title: 'Em quais números ela atende?',
    question: 'Quais linhas WhatsApp ela usa?',
    summary: 'Elopment (Patricia v2) ativa · MODO DE TESTE: só 4 telefones',
    isComplete: true,
  },
]
