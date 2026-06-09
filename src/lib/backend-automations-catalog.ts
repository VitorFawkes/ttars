/**
 * Catálogo estático das automações backend do WelcomeCRM.
 *
 * Lista read-only de tudo que o sistema dispara automaticamente fora do controle
 * direto do usuário: triggers SQL no banco, edge functions, jobs do pg_cron,
 * motor de cadência, agentes IA e filas/outbox.
 *
 * Mantenha esta lista alinhada com supabase/migrations/ e supabase/functions/.
 * Quando adicionar/remover automação no backend, editar aqui também.
 */

import {
  Database,
  Zap,
  Clock,
  Bot,
  Inbox,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export type BackendAutomationCategory =
  | 'trigger_sql'
  | 'edge_function'
  | 'pg_cron'
  | 'cadence_engine'
  | 'ai_agent'
  | 'queue'

export interface BackendAutomation {
  id: string
  name: string
  category: BackendAutomationCategory
  description: string
  trigger: string
  tables: string[]
  sourceFile?: string
  isActive: boolean
  /**
   * Quando true, esta automação é configurável por workspace via
   * backend_automation_settings (ligar/desligar + parâmetros) e a tela
   * /settings/automations-backend mostra os controles de edição.
   */
  editable?: boolean
}

export interface CategoryMeta {
  label: string
  description: string
  icon: LucideIcon
  tint: string
}

export const CATEGORY_META: Record<BackendAutomationCategory, CategoryMeta> = {
  trigger_sql: {
    label: 'Trigger no banco',
    description: 'Reage automaticamente quando dados mudam em uma tabela',
    icon: Database,
    tint: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  edge_function: {
    label: 'Edge Function',
    description: 'Processadores assíncronos e webhooks que o sistema chama',
    icon: Zap,
    tint: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  pg_cron: {
    label: 'Job agendado',
    description: 'Tarefas que rodam em horários ou intervalos fixos',
    icon: Clock,
    tint: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  cadence_engine: {
    label: 'Motor de cadência',
    description: 'Engine que orquestra as cadências configuráveis',
    icon: Workflow,
    tint: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  ai_agent: {
    label: 'Agente IA',
    description: 'Regras dos agentes Julia (outbound) e Patricia (inbound)',
    icon: Bot,
    tint: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  },
  queue: {
    label: 'Fila / outbox',
    description: 'Filas que seguram mensagens e operações até serem processadas',
    icon: Inbox,
    tint: 'bg-sky-50 text-sky-700 border-sky-200',
  },
}

export const CATEGORY_ORDER: BackendAutomationCategory[] = [
  'trigger_sql',
  'edge_function',
  'pg_cron',
  'cadence_engine',
  'ai_agent',
  'queue',
]

export const BACKEND_AUTOMATIONS: BackendAutomation[] = [
  // ─── Trigger SQL (8) ────────────────────────────────────────────────
  {
    id: 'move_card_on_meeting_scheduled',
    name: 'Mover card ao agendar reunião',
    category: 'trigger_sql',
    description:
      'Quando alguém marca uma reunião pro card, o card pula automaticamente para a etapa "Reunião Agendada" — só avança, nunca volta.',
    trigger: 'Quando uma reunião é criada com status "agendada"',
    tables: ['cards', 'tarefas'],
    sourceFile: 'supabase/migrations/20260512w_move_card_meeting_remove_integration_guard.sql',
    isActive: true,
  },
  {
    id: 'card_auto_advance',
    name: 'Avanço automático em etapas-marco',
    category: 'trigger_sql',
    description:
      'Etapas marcadas como "marco" (ex: "Ganho SDR", "Ganho Planner") empurram o card pra próxima etapa ativa assim que ele cai nelas.',
    trigger: 'Quando o card entra numa etapa com auto_advance ligado',
    tables: ['cards', 'pipeline_stages'],
    sourceFile: 'supabase/migrations/20260319_auto_advance_stages.sql',
    isActive: true,
  },
  {
    id: 'set_first_response_at',
    name: 'Registro de "primeira resposta"',
    category: 'trigger_sql',
    description:
      'Quando o time envia a primeira mensagem outbound para o lead num card, grava o timestamp em cards.first_response_at — usado em analytics.',
    trigger: 'Primeira mensagem outbound num card',
    tables: ['cards', 'whatsapp_messages'],
    sourceFile: 'supabase/migrations/20260422g_analytics_v2_triggers.sql',
    isActive: true,
  },
  {
    id: 'set_lead_entry_path',
    name: 'Detecção de origem do lead',
    category: 'trigger_sql',
    description:
      'Ao criar um card, identifica se veio de formulário, API, WhatsApp inbound, importação, etc. e marca a origem em cards.entry_path.',
    trigger: 'Card recém-criado',
    tables: ['cards'],
    sourceFile: 'supabase/migrations/20260422g_analytics_v2_triggers.sql',
    isActive: true,
  },
  {
    id: 'ww_derive_tipo_casamento',
    name: 'Qualificação Weddings: Elopement × Destination Wedding',
    category: 'trigger_sql',
    description:
      'Em cards de Weddings, define o Tipo de Casamento automaticamente pelo número de convidados: "Apenas o Casal" vira Elopement; qualquer faixa de convidados vira Destination Wedding. Só preenche quando o tipo está vazio (respeita escolha manual). Editável aqui: ligar/desligar e ajustar os parâmetros.',
    trigger: 'Card de Weddings criado, ou campo de convidados alterado',
    tables: ['cards'],
    sourceFile: 'supabase/migrations/20260609f_ww_qualificacao_automation.sql',
    isActive: true,
    editable: true,
  },
  {
    id: 'sync_role_from_team',
    name: 'Sincronizar role do consultor',
    category: 'trigger_sql',
    description:
      'Quando você muda o time de um consultor, o role dele (SDR, planner, etc.) é atualizado automaticamente para casar com o time.',
    trigger: 'profile.team_id muda',
    tables: ['profiles', 'teams'],
    sourceFile: 'supabase/migrations/20260219300000_target_phase_id_and_role_sync.sql',
    isActive: true,
  },
  {
    id: 'auto_merge_sub_card_on_leave',
    name: 'Mesclar sub-card automaticamente',
    category: 'trigger_sql',
    description:
      'Quando um sub-card de pós-venda sai da posição primária da venda, ele é mesclado automaticamente no card pai — evita órfãos no histórico.',
    trigger: 'Sub-card sai da 1ª posição em pós-venda',
    tables: ['cards', 'card_historical_data'],
    sourceFile: 'supabase/migrations/20260424b_auto_merge_sub_card_on_leave_first_pos_venda.sql',
    isActive: true,
  },
  {
    id: 'cards_match_pending_monde',
    name: 'Vincular card a venda do Monde',
    category: 'trigger_sql',
    description:
      'Quando a venda é finalizada no CRM, casa automaticamente com a venda pendente correspondente no Monde pelo número da venda.',
    trigger: 'Card recebe venda_num e fica em estágio de venda fechada',
    tables: ['cards', 'card_monde_link'],
    sourceFile: 'supabase/migrations/20260511c_monde_historico_apenas_informativo.sql',
    isActive: true,
  },
  {
    id: 'notify_teams_on_assign',
    name: 'Notificar time ao atribuir card',
    category: 'trigger_sql',
    description:
      'Quando o responsável de um card muda, manda notificação por WhatsApp para o novo responsável avisando que recebeu um card.',
    trigger: 'cards.owner_id muda',
    tables: ['cards', 'notifications'],
    sourceFile: 'supabase/migrations/20260330_notification_improvements.sql',
    isActive: true,
  },

  // ─── Edge Functions (8) ─────────────────────────────────────────────
  {
    id: 'webhook_whatsapp',
    name: 'Webhook do WhatsApp',
    category: 'edge_function',
    description:
      'Recebe mensagens entrantes do Echo/ChatPro, cria card se for lead novo, descarta eco/status, e roteia a mensagem para o agente IA.',
    trigger: 'POST do provider WhatsApp (Echo / ChatPro)',
    tables: ['whatsapp_messages', 'cards', 'contatos'],
    sourceFile: 'supabase/functions/webhook-whatsapp/index.ts',
    isActive: true,
  },
  {
    id: 'ai_agent_router_v2',
    name: 'Roteador da Patricia (inbound IA)',
    category: 'edge_function',
    description:
      'Toda mensagem inbound passa pelo pipeline de 5 etapas: backoffice, data agent, persona, validator e formatter. Pode atualizar o card e mudar o stage.',
    trigger: 'Invocado pelo webhook do WhatsApp ao receber mensagem',
    tables: ['cards', 'contatos', 'ai_message_buffer', 'whatsapp_messages'],
    sourceFile: 'supabase/functions/ai-agent-router-v2/index.ts',
    isActive: true,
  },
  {
    id: 'ai_agent_outbound_trigger',
    name: 'Disparador da Julia (outbound IA)',
    category: 'edge_function',
    description:
      'Processa a fila de leads novos e dispara a primeira mensagem da Julia respeitando horário comercial e regras da marca.',
    trigger: 'A cada 30s via pg_cron + invocação direta ao enfileirar',
    tables: ['ai_outbound_queue', 'whatsapp_messages', 'cards'],
    sourceFile: 'supabase/functions/ai-agent-outbound-trigger/index.ts',
    isActive: true,
  },
  {
    id: 'cadence_engine_fn',
    name: 'Motor de cadências',
    category: 'edge_function',
    description:
      'Executa os steps das cadências: envia mensagens, cria tarefas, muda etapa, adiciona tag, avança/pausa o fluxo conforme o resultado das tarefas.',
    trigger: 'Quando algo entra em cadence_queue / cadence_entry_queue + cron de segurança',
    tables: ['cadence_queue', 'cadence_entry_queue', 'cadence_instances', 'tarefas'],
    sourceFile: 'supabase/functions/cadence-engine/index.ts',
    isActive: true,
  },
  {
    id: 'webhook_ingest',
    name: 'Ingestor de webhooks externos',
    category: 'edge_function',
    description:
      'Endpoint genérico que CRMs e integrações externas chamam para criar cards, contatos e atualizar dados no CRM.',
    trigger: 'POST de qualquer integração externa configurada',
    tables: ['integration_outbox', 'cards', 'contatos'],
    sourceFile: 'supabase/functions/webhook-ingest/index.ts',
    isActive: true,
  },
  {
    id: 'active_campaign_webhook',
    name: 'Webhook do ActiveCampaign',
    category: 'edge_function',
    description:
      'Sincroniza contatos e deals do ActiveCampaign para o CRM: cria cards a partir de novos contatos e atualiza dados existentes.',
    trigger: 'POST do ActiveCampaign em eventos configurados',
    tables: ['cards', 'contatos', 'integration_outbox'],
    sourceFile: 'supabase/functions/active-campaign-webhook/index.ts',
    isActive: true,
  },
  {
    id: 'integration_dispatch',
    name: 'Despachante de integrações',
    category: 'edge_function',
    description:
      'Processa a fila integration_outbox e envia as atualizações de volta para os CRMs integrados (Monde, ActiveCampaign).',
    trigger: 'A cada 5 minutos via pg_cron',
    tables: ['integration_outbox'],
    sourceFile: 'supabase/functions/integration-dispatch/index.ts',
    isActive: true,
  },
  {
    id: 'send_whatsapp_message',
    name: 'Envio de mensagem WhatsApp',
    category: 'edge_function',
    description:
      'Recebe ordens de envio vindas de cadências, automações ou agentes IA e dispara a mensagem via Echo ou ChatPro.',
    trigger: 'Invocado por cadence-engine, automações e agentes IA',
    tables: ['whatsapp_messages', 'message_queue'],
    sourceFile: 'supabase/functions/send-whatsapp-message/index.ts',
    isActive: true,
  },

  // ─── Jobs agendados (pg_cron) (7) ───────────────────────────────────
  {
    id: 'cron_cadence_temporal_enqueue',
    name: 'Enfileirar cadências temporais',
    category: 'pg_cron',
    description:
      'Todo dia às 06:00 (horário SP), identifica cards prontos para disparar cadências baseadas em tempo (X dias na etapa, X dias antes da viagem) e os enfileira.',
    trigger: 'Diariamente, 09:00 UTC (06:00 SP)',
    tables: ['cadence_entry_queue', 'cadence_instances', 'cards'],
    sourceFile: 'supabase/migrations/20260420d_sprint_d_motor_temporal.sql',
    isActive: true,
  },
  {
    id: 'cron_cadence_queue_processor',
    name: 'Processar fila de cadências',
    category: 'pg_cron',
    description:
      'Roda a cada 1 minuto como fallback do processamento instantâneo — garante que nada em cadence_queue fique parado por mais de 1 min.',
    trigger: 'A cada 1 minuto',
    tables: ['cadence_queue', 'tarefas'],
    sourceFile: 'supabase/migrations/20260409_automacao_mensagens_cron.sql',
    isActive: true,
  },
  {
    id: 'cron_outbound_queue',
    name: 'Processar fila outbound da Julia',
    category: 'pg_cron',
    description:
      'Rede de segurança que invoca o disparador da Julia a cada 30 segundos para garantir que nenhuma primeira mensagem fique presa.',
    trigger: 'A cada 30 segundos',
    tables: ['ai_outbound_queue'],
    sourceFile: 'supabase/migrations/20260416b_outbound_queue_cron.sql',
    isActive: true,
  },
  {
    id: 'cron_idle_followup',
    name: 'Follow-up de cards parados',
    category: 'pg_cron',
    description:
      'Todo dia 06:00 SP, identifica cards sem resposta há X dias e enfileira automaticamente um follow-up via cadência.',
    trigger: 'Diariamente, 09:00 UTC (06:00 SP)',
    tables: ['cadence_entry_queue', 'cards'],
    sourceFile: 'supabase/migrations/20260416c_followup_idle_days.sql',
    isActive: true,
  },
  {
    id: 'cron_push_overdue_tasks',
    name: 'Notificações push de tarefas vencidas',
    category: 'pg_cron',
    description:
      'Duas vezes ao dia (06:00 e 11:00 SP), envia push para o responsável sobre tarefas atrasadas.',
    trigger: 'Diariamente, 09:00 e 14:00 UTC',
    tables: ['tarefas', 'push_tokens'],
    sourceFile: 'supabase/migrations/20260320_push_cron_task_overdue.sql',
    isActive: true,
  },
  {
    id: 'cron_future_opportunities',
    name: 'Processador de oportunidades futuras',
    category: 'pg_cron',
    description:
      'Todo dia 05:00 SP, avança automaticamente cards quando a data prevista de retorno/conexão chega.',
    trigger: 'Diariamente, 08:00 UTC (05:00 SP)',
    tables: ['cards', 'pipeline_stages'],
    sourceFile: 'supabase/migrations/20260317_future_opportunities.sql',
    isActive: true,
  },
  {
    id: 'cron_card_alerts',
    name: 'Alertas diários de cards',
    category: 'pg_cron',
    description:
      'Todo dia 06:00 SP, processa regras de alerta (cards parados, sem atividade, em risco) e gera notificações.',
    trigger: 'Diariamente, 09:00 UTC (06:00 SP)',
    tables: ['card_rules', 'cards', 'notifications'],
    sourceFile: 'supabase/migrations/20260407_card_alert_cron.sql',
    isActive: true,
  },

  // ─── Motor de Cadência (sumário) ────────────────────────────────────
  {
    id: 'cadence_engine_overview',
    name: 'Motor de cadências (visão geral)',
    category: 'cadence_engine',
    description:
      'Engine que orquestra cadence_templates + cadence_steps. Ações suportadas: enviar mensagem, criar tarefa, mudar etapa, adicionar tag, iniciar/pausar/cancelar cadência. Gatilhos: card criado, entrou na etapa, X dias na etapa, campo mudou, palavra-chave no inbound, outcome de tarefa.',
    trigger: 'Conforme cadência configurada (gatilho + delays)',
    tables: ['cadence_templates', 'cadence_steps', 'cadence_instances', 'cadence_event_triggers'],
    sourceFile: 'supabase/functions/cadence-engine/index.ts',
    isActive: true,
  },

  // ─── Agentes IA (2) ─────────────────────────────────────────────────
  {
    id: 'julia_outbound_rules',
    name: 'Regras da Julia (outbound)',
    category: 'ai_agent',
    description:
      'Qualifica leads novos, agenda reuniões, segue prompt de 5 fases com validador de marca. Move o card automaticamente: Novo Lead → Tentativa de Contato (após 1ª mensagem) → Conectado (quando lead responde) → Reunião Agendada (quando há meeting_id).',
    trigger: 'Ao processar mensagens entrantes/saintes do lead',
    tables: ['cards', 'ai_conversation_turns', 'ai_agent_qualification_flow'],
    sourceFile: 'supabase/functions/_shared/julia_defaults.ts',
    isActive: true,
  },
  {
    id: 'patricia_inbound_rules',
    name: 'Regras da Patricia (inbound)',
    category: 'ai_agent',
    description:
      'Responde mensagens inbound em conversa contínua, executa ferramentas (criar tarefa, atribuir tag, checar calendário), valida tom de marca. Multimodal: texto, áudio, imagem e documento.',
    trigger: 'A cada mensagem inbound recebida pelo webhook do WhatsApp',
    tables: ['cards', 'ai_conversation_turns', 'whatsapp_messages'],
    sourceFile: 'supabase/functions/ai-agent-router-v2/index.ts',
    isActive: true,
  },

  // ─── Filas / Outbox (2) ─────────────────────────────────────────────
  {
    id: 'queue_outbound_ai',
    name: 'Fila outbound de mensagens IA',
    category: 'queue',
    description:
      'A tabela ai_outbound_queue segura as primeiras mensagens da Julia até o horário comercial. Processada a cada 30 segundos.',
    trigger: 'Inserção via cadência/automação + processamento por cron',
    tables: ['ai_outbound_queue'],
    sourceFile: 'supabase/functions/ai-agent-outbound-trigger/index.ts',
    isActive: true,
  },
  {
    id: 'queue_integration_outbox',
    name: 'Integration outbox',
    category: 'queue',
    description:
      'Fila polimórfica que junta operações de sync para CRMs externos (criar, atualizar, deletar). Processada a cada 5 minutos pelo despachante de integrações.',
    trigger: 'Inserção via triggers/RPCs + processamento por cron a cada 5 min',
    tables: ['integration_outbox'],
    sourceFile: 'supabase/functions/integration-dispatch/index.ts',
    isActive: true,
  },
]
