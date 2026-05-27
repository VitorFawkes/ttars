/**
 * Registry de tipos de node — fonte única de verdade pra:
 *   - Toolbox (lista do que o user pode arrastar)
 *   - Validação (1 trigger só, terminal não pode ter filhos)
 *   - Persistência (mapear `type` do React Flow ↔ event_type/action_type/step_type)
 *
 * Cada entrada descreve o que o node É; o COMPONENTE visual fica em
 * `BaseNode` parametrizado (Fase 2). Fase 1: só os metadados.
 */
import type { NodeTypeMeta, NodeCategory } from '../types'

export const NODE_REGISTRY: NodeTypeMeta[] = [
    // ─── Triggers ────────────────────────────────────────────────────────────
    { type: 'trigger.card_created',           category: 'trigger', iconName: 'Sparkles',     isTrigger: true,
      label: 'Card criado',                   description: 'Dispara quando um novo card é criado no pipeline' },
    { type: 'trigger.stage_enter',            category: 'trigger', iconName: 'LogIn',        isTrigger: true,
      label: 'Card entrou em etapa',          description: 'Dispara quando um card entra em uma etapa específica' },
    { type: 'trigger.macro_stage_enter',      category: 'trigger', iconName: 'LayoutGrid',   isTrigger: true,
      label: 'Card entrou em fase',           description: 'Dispara quando um card entra em uma fase (grupo de etapas)' },
    { type: 'trigger.field_changed',          category: 'trigger', iconName: 'Edit3',        isTrigger: true,
      label: 'Campo preenchido / alterado',   description: 'Dispara quando um campo do card muda de valor' },
    { type: 'trigger.tag_added',              category: 'trigger', iconName: 'Tag',          isTrigger: true,
      label: 'Tag adicionada',                description: 'Dispara quando uma tag é aplicada ao card' },
    { type: 'trigger.tag_removed',            category: 'trigger', iconName: 'Tag',          isTrigger: true,
      label: 'Tag removida',                  description: 'Dispara quando uma tag é removida do card' },
    { type: 'trigger.inbound_message_pattern',category: 'trigger', iconName: 'MessageCircle',isTrigger: true,
      label: 'Cliente respondeu',             description: 'Dispara quando o cliente envia mensagem com palavra-chave' },
    { type: 'trigger.time_offset_from_date',  category: 'trigger', iconName: 'CalendarClock',isTrigger: true,
      label: 'Antes/depois de uma data',      description: 'Dispara X dias antes ou depois de uma data do card' },
    { type: 'trigger.time_in_stage',          category: 'trigger', iconName: 'Clock',        isTrigger: true,
      label: 'Card parado em etapa',          description: 'Dispara quando o card fica X dias na mesma etapa' },
    { type: 'trigger.calendly_invitee_created', category: 'trigger', iconName: 'CalendarCheck', imageUrl: '/calendly-icon.webp', isTrigger: true,
      label: 'Reunião agendada no Calendly',  description: 'Dispara quando lead agenda reunião via Calendly (pode criar card novo)' },

    // ─── Ações no card ───────────────────────────────────────────────────────
    { type: 'action.create_task',     category: 'card', iconName: 'CheckSquare', isTrigger: false,
      label: 'Criar tarefa',          description: 'Cria uma tarefa para o responsável do card ou alguém específico' },
    { type: 'action.complete_task',   category: 'card', iconName: 'CheckCircle2', isTrigger: false,
      label: 'Concluir tarefa',       description: 'Marca como concluída a tarefa criada em um passo anterior do fluxo' },
    { type: 'action.change_stage',    category: 'card', iconName: 'ArrowRightCircle', isTrigger: false,
      label: 'Mover de etapa',        description: 'Move o card para outra etapa do pipeline' },
    { type: 'action.add_tag',         category: 'card', iconName: 'TagPlus', isTrigger: false,
      label: 'Adicionar tag ao card', description: 'Aplica uma tag ao card' },
    { type: 'action.remove_tag',      category: 'card', iconName: 'TagMinus', isTrigger: false,
      label: 'Remover tag do card',   description: 'Remove uma tag do card' },
    { type: 'action.update_field',    category: 'card', iconName: 'Edit',    isTrigger: false,
      label: 'Atualizar campo',       description: 'Atualiza um campo do card (whitelist)' },
    { type: 'action.notify_internal', category: 'card', iconName: 'Bell',    isTrigger: false,
      label: 'Notificar time',        description: 'Cria notificação interna pra alguém do time' },

    // ─── Echo (envio + gestão de conversa) ───────────────────────────────────
    { type: 'action.send_message', category: 'echo', iconName: 'MessageSquare', isTrigger: false,
      label: 'Enviar mensagem',    description: 'WhatsApp via Echo (HSM aprovado ou texto livre)' },
    { type: 'action.send_media',   category: 'echo', iconName: 'Image',         isTrigger: false,
      label: 'Enviar mídia',       description: 'Imagem, vídeo, áudio ou documento via Echo' },
    { type: 'action.echo_assign',          category: 'echo', iconName: 'UserCheck', isTrigger: false,
      label: 'Atribuir conversa',          description: 'Define o atendente responsável da conversa Echo' },
    { type: 'action.echo_release',         category: 'echo', iconName: 'UserMinus', isTrigger: false,
      label: 'Liberar conversa',           description: 'Devolve a conversa ao pool (status waiting)' },
    { type: 'action.echo_close',           category: 'echo', iconName: 'X',         isTrigger: false,
      label: 'Fechar conversa',            description: 'Encerra a conversa com motivo opcional' },
    { type: 'action.echo_set_status',      category: 'echo', iconName: 'Settings',  isTrigger: false,
      label: 'Mudar status',               description: 'Define active / waiting / closed' },
    { type: 'action.echo_add_tag',         category: 'echo', iconName: 'Tag',       isTrigger: false,
      label: 'Adicionar tag (conversa)',   description: 'Aplica uma tag Echo na conversa' },
    { type: 'action.echo_remove_tag',      category: 'echo', iconName: 'Tag',       isTrigger: false,
      label: 'Remover tag (conversa)',     description: 'Remove uma tag Echo da conversa' },
    { type: 'action.echo_add_co_owner',    category: 'echo', iconName: 'Users',     isTrigger: false,
      label: 'Adicionar co-owner',         description: 'Compartilha custódia da conversa com outro atendente' },
    { type: 'action.echo_remove_co_owner', category: 'echo', iconName: 'Users',     isTrigger: false,
      label: 'Remover co-owner',           description: 'Remove um co-proprietário da conversa' },

    // ─── Fluxo ───────────────────────────────────────────────────────────────
    { type: 'action.wait',          category: 'flow', iconName: 'Hourglass', isTrigger: false,
      label: 'Esperar',             description: 'Pausa antes do próximo passo (minutos / horas / dias)' },
    { type: 'action.branch',        category: 'flow', iconName: 'GitBranch', isTrigger: false,
      label: 'Decisão (if/else)',   description: 'Bifurca o fluxo conforme uma condição',
      hasMultipleOutputs: true },
    { type: 'action.end',           category: 'flow', iconName: 'Flag',      isTrigger: false,
      label: 'Fim',                 description: 'Encerra a cadência (com sucesso / falha / ghosting)',
      isTerminal: true },
    { type: 'action.start_cadence', category: 'flow', iconName: 'Layers',    isTrigger: false,
      label: 'Iniciar sub-cadência',description: 'Dispara outra cadência salva' },

    // ─── Integração ──────────────────────────────────────────────────────────
    { type: 'action.trigger_n8n_webhook', category: 'integration', iconName: 'Webhook', isTrigger: false,
      label: 'Chamar webhook (n8n)',      description: 'POST pra um endpoint n8n ou externo' },
]

// Mapas de busca rápida
export const NODE_BY_TYPE = new Map(NODE_REGISTRY.map(n => [n.type, n]))

export const NODES_BY_CATEGORY: Record<NodeCategory, NodeTypeMeta[]> = {
    trigger:     NODE_REGISTRY.filter(n => n.category === 'trigger'),
    card:        NODE_REGISTRY.filter(n => n.category === 'card'),
    message:     NODE_REGISTRY.filter(n => n.category === 'message'),
    echo:        NODE_REGISTRY.filter(n => n.category === 'echo'),
    flow:        NODE_REGISTRY.filter(n => n.category === 'flow'),
    integration: NODE_REGISTRY.filter(n => n.category === 'integration'),
}

export const CATEGORY_LABEL: Record<NodeCategory, string> = {
    trigger:     'Gatilhos',
    card:        'Ações no card',
    message:     'Mensagens',  // legado, sem itens — mantido pra evitar breaking type
    echo:        'Echo',
    flow:        'Fluxo',
    integration: 'Integrações',
}
