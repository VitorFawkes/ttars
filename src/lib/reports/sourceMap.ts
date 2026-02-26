import {
    BarChart3, Users, FileText, CheckSquare, Calendar,
    MessageCircle, MessageSquare, FileCheck, Zap,
    GitBranch, UsersRound,
} from 'lucide-react'
import type { DataSource } from './reportTypes'
import type { LucideIcon } from 'lucide-react'

export interface SourceMeta {
    key: DataSource
    label: string
    description: string
    icon: LucideIcon
    color: string
    bgColor: string
}

export const SOURCE_MAP: Record<DataSource, SourceMeta> = {
    cards: {
        key: 'cards',
        label: 'Negócios (Cards)',
        description: 'Deals, viagens, pipeline, valores financeiros',
        icon: BarChart3,
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50',
    },
    contatos: {
        key: 'contatos',
        label: 'Contatos',
        description: 'Pessoas, clientes, dados demográficos',
        icon: Users,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
    },
    propostas: {
        key: 'propostas',
        label: 'Propostas',
        description: 'Propostas comerciais, valores, engajamento',
        icon: FileText,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
    },
    tarefas: {
        key: 'tarefas',
        label: 'Tarefas',
        description: 'Tasks, prazos, conclusões, resultados',
        icon: CheckSquare,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
    },
    reunioes: {
        key: 'reunioes',
        label: 'Reuniões',
        description: 'Reuniões agendadas, status, resultados',
        icon: Calendar,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
    },
    mensagens: {
        key: 'mensagens',
        label: 'Mensagens',
        description: 'Mensagens CRM (WhatsApp, email, telefone)',
        icon: MessageCircle,
        color: 'text-cyan-600',
        bgColor: 'bg-cyan-50',
    },
    whatsapp: {
        key: 'whatsapp',
        label: 'WhatsApp',
        description: 'Mensagens WhatsApp detalhadas, tipos, direção',
        icon: MessageSquare,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
    },
    documentos: {
        key: 'documentos',
        label: 'Documentos',
        description: 'Checklist de documentos, status de coleta',
        icon: FileCheck,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
    },
    cadencia: {
        key: 'cadencia',
        label: 'Cadências',
        description: 'Automações de vendas, instâncias, resultados',
        icon: Zap,
        color: 'text-rose-600',
        bgColor: 'bg-rose-50',
    },
    historico: {
        key: 'historico',
        label: 'Histórico de Etapas',
        description: 'Movimentações entre etapas, tempo em cada',
        icon: GitBranch,
        color: 'text-violet-600',
        bgColor: 'bg-violet-50',
    },
    equipe: {
        key: 'equipe',
        label: 'Equipe',
        description: 'Usuários, times, roles',
        icon: UsersRound,
        color: 'text-slate-600',
        bgColor: 'bg-slate-50',
    },
}

export const SOURCE_LIST: SourceMeta[] = Object.values(SOURCE_MAP)
