/**
 * Receitas de automação — presets que cobrem 90% dos cenários reais.
 *
 * Cada receita pré-preenche o builder: event_type, filtros e action_type/config.
 * O gestor só ajusta o texto da mensagem / stage alvo / detalhes da tarefa e ativa.
 *
 * Expandir aqui quando um vendedor/planner pedir caso novo.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Sparkles,
  Calendar,
  CheckCircle2,
  Gift,
  Clock,
  MessageSquarePlus,
  AlertTriangle,
  Plane,
  Target,
  Layers,
  Tag,
  Bell,
} from 'lucide-react'

export type ActionType =
  | 'send_message'
  | 'create_task'
  | 'change_stage'
  | 'start_cadence'
  | 'add_tag'
  | 'remove_tag'
  | 'notify_internal'

export type EventType =
  | 'card_created'
  | 'stage_enter'
  | 'dias_antes_viagem'
  | 'dias_apos_viagem'
  | 'aniversario_contato'
  | 'proposta_expirada'
  | 'dias_no_stage'
  | 'card_won'
  | 'cron_roteamento'

/**
 * Gatilhos "proativos" disparam SEM o cliente ter mandado mensagem recente.
 * Nesses casos, texto livre cai fora da janela 24h do WhatsApp e é dropado
 * silenciosamente (erro Meta 131047 "Re-engagement"). Só HSM aprovado entrega.
 * O builder obriga HSM nesses gatilhos.
 */
export const PROACTIVE_EVENTS: Set<EventType> = new Set([
  'card_created',
  'dias_antes_viagem',
  'dias_apos_viagem',
  'aniversario_contato',
  'proposta_expirada',
  'dias_no_stage',
])

export function isProactiveEvent(event: EventType): boolean {
  return PROACTIVE_EVENTS.has(event)
}

export interface RecipePreset {
  id: string
  /** Label curta do cartão */
  name: string
  /** Categoria pra agrupar na galeria */
  category: 'mensagem' | 'tarefa' | 'pipeline' | 'cadencia'
  /** Frase em linguagem humana que descreve o que a automação faz */
  summary: string
  /** Ícone pintado pelo tipo */
  icon: LucideIcon
  /** Produto sugerido (null = qualquer) */
  product?: 'TRIPS' | 'WEDDING' | null
  /** Pré-preenchimento — o usuário ajusta depois */
  preset: {
    event_type: EventType
    /** Config adicional do evento (ex: days_before para dias_antes_viagem) */
    event_config?: Record<string, unknown>
    action_type: ActionType
    action_config?: Record<string, unknown>
    /** Texto sugerido se action_type=send_message (usado apenas se não houver HSM) */
    suggested_message?: string
    /**
     * Sugestão de HSM Template para gatilhos proativos. Se presente, o builder
     * abre com "modo HSM" selecionado e esse template default. Nome deve bater
     * com algum template aprovado no WABA (ver useWhatsAppTemplates).
     */
    suggested_hsm_template?: string
    /** Sugestão de título pra create_task */
    suggested_task_title?: string
  }
}

export const RECIPES: RecipePreset[] = [
  // ─── MENSAGEM ───────────────────────────────────────────────────────
  {
    id: 'boas_vindas_card_criado',
    name: 'Boas-vindas ao novo lead',
    category: 'mensagem',
    summary: 'Quando um card é criado, envia mensagem de boas-vindas para o contato.',
    icon: Sparkles,
    preset: {
      event_type: 'card_created',
      action_type: 'send_message',
      suggested_hsm_template: 'wt_primeiro_contato001',
    },
  },
  {
    id: 'lembrete_d7_antes_viagem',
    name: 'Lembrete 7 dias antes da viagem',
    category: 'mensagem',
    summary: 'Faltando 7 dias para a data da viagem, envia lembrete ao cliente.',
    icon: Plane,
    product: 'TRIPS',
    preset: {
      event_type: 'dias_antes_viagem',
      event_config: { dias: 7 },
      action_type: 'send_message',
      suggested_message:
        'Oi {{contact.nome}}! Faltam só 7 dias para sua viagem para {{card.destino}}. Conferiu passaporte, seguro e tudo mais? Qualquer dúvida, chama!',
    },
  },
  {
    id: 'lembrete_d1_checkin',
    name: 'Check-in D-1',
    category: 'mensagem',
    summary: 'Um dia antes da viagem, envia mensagem com documentos e contatos.',
    icon: Calendar,
    product: 'TRIPS',
    preset: {
      event_type: 'dias_antes_viagem',
      event_config: { dias: 1 },
      action_type: 'send_message',
      suggested_message:
        'Oi {{contact.nome}}! Amanhã começa sua viagem 🎉 Lembre de levar passaporte/RG, voucher e nosso telefone de emergência. Boa viagem!',
    },
  },
  {
    id: 'proposta_expirando',
    name: 'Cobrar proposta expirando',
    category: 'mensagem',
    summary: 'Quando a proposta expira, envia mensagem pedindo retorno.',
    icon: AlertTriangle,
    preset: {
      event_type: 'proposta_expirada',
      action_type: 'send_message',
      suggested_message:
        'Oi {{contact.nome}}! Sua proposta para {{card.destino}} expira hoje. Quer renovar? É só me responder!',
    },
  },
  {
    id: 'pos_viagem_d7',
    name: 'Follow-up pós-viagem D+7',
    category: 'mensagem',
    summary: '7 dias depois da viagem, pergunta como foi e pede avaliação.',
    icon: MessageSquarePlus,
    product: 'TRIPS',
    preset: {
      event_type: 'dias_apos_viagem',
      event_config: { dias: 7 },
      action_type: 'send_message',
      suggested_message:
        'Oi {{contact.nome}}! Como foi a viagem para {{card.destino}}? Adoraríamos ouvir sua experiência ✨',
    },
  },
  {
    id: 'aniversario',
    name: 'Aniversário do cliente',
    category: 'mensagem',
    summary: 'No aniversário do contato, envia mensagem de parabéns.',
    icon: Gift,
    preset: {
      event_type: 'aniversario_contato',
      action_type: 'send_message',
      suggested_message:
        'Feliz aniversário, {{contact.nome}}! 🎂 Que este novo ciclo venha cheio de novas viagens e aventuras.',
    },
  },
  {
    id: 'wedding_d60',
    name: 'Wedding: contagem 60 dias',
    category: 'mensagem',
    summary: 'Faltando 60 dias pro casamento, envia checklist de preparativos.',
    icon: Calendar,
    product: 'WEDDING',
    preset: {
      event_type: 'dias_antes_viagem',
      event_config: { dias: 60 },
      action_type: 'send_message',
      suggested_message:
        'Faltam 60 dias pro grande dia! Vamos alinhar os últimos detalhes? Me conta o que ainda está pendente.',
    },
  },

  // ─── PIPELINE ────────────────────────────────────────────────────────
  {
    id: 'mover_quando_taxa_paga',
    name: 'Mover de etapa automaticamente',
    category: 'pipeline',
    summary: 'Quando um card entra na etapa X, move para a etapa Y após delay.',
    icon: Target,
    preset: {
      event_type: 'stage_enter',
      action_type: 'change_stage',
      action_config: { target_stage_id: null },
    },
  },

  // ─── TAREFA ──────────────────────────────────────────────────────────
  {
    id: 'tarefa_sla_stage',
    name: 'SLA: tarefa se parado em etapa',
    category: 'tarefa',
    summary: 'Se o card ficar X dias na mesma etapa, cria tarefa pro dono do card.',
    icon: Clock,
    preset: {
      event_type: 'dias_no_stage',
      event_config: { dias: 5 },
      action_type: 'create_task',
      suggested_task_title: 'Ação urgente — card parado na etapa há 5 dias',
    },
  },
  {
    id: 'tarefa_card_ganho',
    name: 'Tarefa pós-fechamento',
    category: 'tarefa',
    summary: 'Quando um card é ganho, cria tarefa de onboarding pro planner.',
    icon: CheckCircle2,
    preset: {
      event_type: 'card_won',
      action_type: 'create_task',
      suggested_task_title: 'Iniciar onboarding do cliente ganho',
    },
  },

  // ─── CADÊNCIA ────────────────────────────────────────────────────────
  {
    id: 'cadencia_prospeccao',
    name: 'Cadência de prospecção',
    category: 'cadencia',
    summary: 'Quando o card entra em Leads, dispara cadência de prospecção SDR.',
    icon: Layers,
    preset: {
      event_type: 'card_created',
      action_type: 'start_cadence',
      action_config: { target_template_id: null },
    },
  },

  // ─── PIPELINE (tag + notify) ─────────────────────────────────────────
  {
    id: 'tag_quando_ganho',
    name: 'Marcar card ganho com tag',
    category: 'pipeline',
    summary: 'Quando um card é ganho, adiciona uma tag pra facilitar relatório.',
    icon: Tag,
    preset: {
      event_type: 'card_won',
      action_type: 'add_tag',
      action_config: { tag_id: null },
    },
  },
  {
    id: 'avisar_dono_sla',
    name: 'Avisar dono quando SLA estourar',
    category: 'tarefa',
    summary: 'Se o card ficar parado muito tempo em etapa, avisa o dono pelo sino do app.',
    icon: Bell,
    preset: {
      event_type: 'dias_no_stage',
      event_config: { dias: 5 },
      action_type: 'notify_internal',
      action_config: {
        recipient_mode: 'card_owner',
        title: 'Card parado há muito tempo',
        body: 'O card {{card.titulo}} está parado na mesma etapa há 5 dias.',
      },
    },
  },
]

export const RECIPE_CATEGORIES: Array<{ key: RecipePreset['category']; label: string; description: string }> = [
  {
    key: 'mensagem',
    label: 'Mensagem',
    description: 'Disparar WhatsApp automático para o cliente',
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    description: 'Mover card de etapa automaticamente',
  },
  {
    key: 'tarefa',
    label: 'Tarefa',
    description: 'Criar tarefa para alguém do time',
  },
  {
    key: 'cadencia',
    label: 'Cadência',
    description: 'Série encadeada de tarefas ao longo do tempo',
  },
]

export function getRecipe(id: string): RecipePreset | undefined {
  return RECIPES.find((r) => r.id === id)
}

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  send_message: 'Enviar mensagem',
  create_task: 'Criar tarefa',
  change_stage: 'Mudar etapa',
  start_cadence: 'Iniciar cadência',
  add_tag: 'Adicionar tag ao card',
  remove_tag: 'Remover tag do card',
  notify_internal: 'Avisar alguém do time',
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  card_created: 'Card criado',
  stage_enter: 'Card entrou em etapa',
  dias_antes_viagem: 'X dias antes da viagem',
  dias_apos_viagem: 'X dias depois da viagem',
  aniversario_contato: 'Aniversário do contato',
  proposta_expirada: 'Proposta expirou',
  dias_no_stage: 'Card parado X dias em etapa',
  card_won: 'Card ganho',
  cron_roteamento: 'Roteamento automático diário',
}
