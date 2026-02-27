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
        label: 'Negócios',
        description: 'Faturamento, conversão, pipeline, ciclo de venda',
        icon: BarChart3,
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50',
    },
    contatos: {
        key: 'contatos',
        label: 'Contatos',
        description: 'Base de clientes, recorrência, perfil demográfico',
        icon: Users,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
    },
    propostas: {
        key: 'propostas',
        label: 'Propostas',
        description: 'Taxa de aceite, valor médio, tempo de resposta',
        icon: FileText,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
    },
    tarefas: {
        key: 'tarefas',
        label: 'Tarefas',
        description: 'Produtividade, atrasos, taxa de conclusão',
        icon: CheckSquare,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
    },
    reunioes: {
        key: 'reunioes',
        label: 'Reuniões',
        description: 'Volume, taxa de realização, resultados',
        icon: Calendar,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
    },
    mensagens: {
        key: 'mensagens',
        label: 'Mensagens',
        description: 'Volume por canal (WhatsApp, email, telefone)',
        icon: MessageCircle,
        color: 'text-cyan-600',
        bgColor: 'bg-cyan-50',
    },
    whatsapp: {
        key: 'whatsapp',
        label: 'WhatsApp',
        description: 'Conversas, tipos de mídia, volume por fase',
        icon: MessageSquare,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
    },
    documentos: {
        key: 'documentos',
        label: 'Documentos',
        description: 'Taxa de coleta, pendências, tipos solicitados',
        icon: FileCheck,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
    },
    cadencia: {
        key: 'cadencia',
        label: 'Cadências',
        description: 'Automações de follow-up, taxa de sucesso',
        icon: Zap,
        color: 'text-rose-600',
        bgColor: 'bg-rose-50',
    },
    historico: {
        key: 'historico',
        label: 'Histórico de Etapas',
        description: 'Fluxo do funil, tempo por etapa, gargalos',
        icon: GitBranch,
        color: 'text-violet-600',
        bgColor: 'bg-violet-50',
    },
    equipe: {
        key: 'equipe',
        label: 'Equipe',
        description: 'Composição dos times, distribuição por fase',
        icon: UsersRound,
        color: 'text-slate-600',
        bgColor: 'bg-slate-50',
    },
}

export const SOURCE_LIST: SourceMeta[] = Object.values(SOURCE_MAP)
