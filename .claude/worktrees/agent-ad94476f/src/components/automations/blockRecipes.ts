/**
 * Receitas de automação compatíveis com o builder de blocos (AutomacaoBuilderPage).
 *
 * Cada receita cria uma cadência: gatilho (card_created ou stage_enter) + blocos
 * de tarefas encadeados. Ao escolher uma receita na galeria, o builder abre
 * pré-preenchido com esses dados e o gestor ajusta nome, etapas e prazos.
 *
 * As receitas antigas em `automation-recipes.ts` foram desenhadas para o
 * builder trigger-simples (send_message, create_task único) e NÃO se aplicam
 * aqui. Manter separado.
 */

import type { LucideIcon } from 'lucide-react'
import {
    Sparkles,
    Users,
    FileText,
    Phone,
    Clipboard,
} from 'lucide-react'

export type BlockRecipeEventType = 'card_created' | 'stage_enter'

export interface BlockRecipeTask {
    tipo: 'contato' | 'email' | 'reuniao' | 'enviar_proposta' | 'coleta_documentos' | 'tarefa'
    titulo: string
    descricao?: string
    prioridade: 'high' | 'medium' | 'low'
    /** Em dias úteis depois do disparo da automação (bloco 1) ou do bloco anterior */
    due_days: number
}

export interface BlockRecipeBlock {
    /** Lista de tarefas desse bloco. Todas criadas juntas. */
    tasks: BlockRecipeTask[]
    /** Se true, começa imediatamente no gatilho (em paralelo ao bloco 1) */
    startsFromTrigger?: boolean
}

export interface BlockRecipe {
    id: string
    name: string
    summary: string
    icon: LucideIcon
    /** Nome sugerido ao abrir no builder */
    suggested_name: string
    event_type: BlockRecipeEventType
    blocks: BlockRecipeBlock[]
}

export const BLOCK_RECIPES: BlockRecipe[] = [
    {
        id: 'cadencia_sdr_simples',
        name: 'Cadência SDR simples',
        summary: '3 tentativas de contato ao longo da primeira semana — ligação, e-mail e WhatsApp.',
        icon: Phone,
        suggested_name: 'Cadência SDR — primeira semana',
        event_type: 'card_created',
        blocks: [
            {
                tasks: [
                    {
                        tipo: 'contato',
                        titulo: 'Primeiro contato por WhatsApp',
                        descricao: 'Apresentar-se e entender o interesse do lead.',
                        prioridade: 'high',
                        due_days: 1,
                    },
                ],
            },
            {
                tasks: [
                    {
                        tipo: 'email',
                        titulo: 'E-mail de follow-up',
                        descricao: 'Reforçar materiais e convidar para conversa.',
                        prioridade: 'medium',
                        due_days: 3,
                    },
                ],
            },
            {
                tasks: [
                    {
                        tipo: 'contato',
                        titulo: 'Tentativa final de contato',
                        descricao: 'Última tentativa antes de qualificar como perdido.',
                        prioridade: 'medium',
                        due_days: 7,
                    },
                ],
            },
        ],
    },
    {
        id: 'follow_up_proposta',
        name: 'Follow-up de proposta enviada',
        summary: 'Quando o card entrar em "Proposta enviada", confirma recebimento e cobra retorno.',
        icon: FileText,
        suggested_name: 'Follow-up de proposta',
        event_type: 'stage_enter',
        blocks: [
            {
                tasks: [
                    {
                        tipo: 'contato',
                        titulo: 'Confirmar recebimento da proposta',
                        descricao: 'Garantir que o cliente recebeu e tirar dúvidas iniciais.',
                        prioridade: 'high',
                        due_days: 1,
                    },
                ],
            },
            {
                tasks: [
                    {
                        tipo: 'contato',
                        titulo: 'Cobrar retorno da proposta',
                        descricao: 'Avaliar interesse e pedir feedback.',
                        prioridade: 'high',
                        due_days: 3,
                    },
                ],
            },
            {
                tasks: [
                    {
                        tipo: 'contato',
                        titulo: 'Última cobrança antes de arquivar',
                        descricao: 'Aviso claro de que a proposta pode ser perdida por falta de resposta.',
                        prioridade: 'medium',
                        due_days: 7,
                    },
                ],
            },
        ],
    },
    {
        id: 'onboarding_pos_venda',
        name: 'Onboarding pós-venda',
        summary: 'Quando o card entra no pós-venda, dispara boas-vindas e agendamento de kickoff.',
        icon: Sparkles,
        suggested_name: 'Onboarding pós-venda',
        event_type: 'stage_enter',
        blocks: [
            {
                tasks: [
                    {
                        tipo: 'contato',
                        titulo: 'Ligação de boas-vindas',
                        descricao: 'Dar as boas-vindas e explicar próximos passos.',
                        prioridade: 'high',
                        due_days: 1,
                    },
                    {
                        tipo: 'email',
                        titulo: 'E-mail com briefing',
                        descricao: 'Enviar questionário de briefing para planejamento.',
                        prioridade: 'high',
                        due_days: 1,
                    },
                ],
            },
            {
                tasks: [
                    {
                        tipo: 'reuniao',
                        titulo: 'Reunião de kickoff',
                        descricao: 'Alinhar expectativas, preferências e cronograma.',
                        prioridade: 'high',
                        due_days: 3,
                    },
                ],
            },
        ],
    },
    {
        id: 'checklist_documentos',
        name: 'Checklist de documentos',
        summary: 'Cria tarefas paralelas de coleta assim que o card entra em uma etapa.',
        icon: Clipboard,
        suggested_name: 'Coleta de documentos',
        event_type: 'stage_enter',
        blocks: [
            {
                tasks: [
                    {
                        tipo: 'coleta_documentos',
                        titulo: 'Coletar passaporte / RG',
                        prioridade: 'high',
                        due_days: 2,
                    },
                    {
                        tipo: 'coleta_documentos',
                        titulo: 'Coletar dados dos viajantes',
                        prioridade: 'high',
                        due_days: 2,
                    },
                    {
                        tipo: 'coleta_documentos',
                        titulo: 'Conferir seguro viagem',
                        prioridade: 'medium',
                        due_days: 3,
                    },
                ],
            },
        ],
    },
    {
        id: 'handoff_sdr_planner',
        name: 'Handoff SDR → Planner',
        summary: 'Quando o lead é qualificado, gera tarefas paralelas para o Planner assumir.',
        icon: Users,
        suggested_name: 'Handoff para Planner',
        event_type: 'stage_enter',
        blocks: [
            {
                tasks: [
                    {
                        tipo: 'contato',
                        titulo: 'Apresentar-se como Planner',
                        descricao: 'Mensagem curta se apresentando e explicando os próximos passos.',
                        prioridade: 'high',
                        due_days: 1,
                    },
                    {
                        tipo: 'reuniao',
                        titulo: 'Agendar reunião de briefing',
                        descricao: 'Marcar a primeira conversa de planejamento.',
                        prioridade: 'high',
                        due_days: 2,
                    },
                ],
            },
        ],
    },
]

export function getBlockRecipe(id: string): BlockRecipe | undefined {
    return BLOCK_RECIPES.find((r) => r.id === id)
}
