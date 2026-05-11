import {
    CheckSquare, Phone, MessageSquare, Mail,
    Calendar, FileText, Send,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface TaskTypeConfig {
    icon: LucideIcon
    label: string
    color: string
    bg: string
    border: string
}

export const TASK_TYPE_CONFIG: Record<string, TaskTypeConfig> = {
    tarefa: { icon: CheckSquare, label: 'Tarefa', color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
    contato: { icon: Phone, label: 'Contato', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    ligacao: { icon: Phone, label: 'Contato', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    whatsapp: { icon: MessageSquare, label: 'Contato', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    email: { icon: Mail, label: 'Email', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    reuniao: { icon: Calendar, label: 'Reunião', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
    enviar_proposta: { icon: Send, label: 'Proposta', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    coleta_documentos: { icon: FileText, label: 'Docs', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    solicitacao_mudanca: { icon: FileText, label: 'Mudança', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
    envio_presente: { icon: CheckSquare, label: 'Presente', color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' },
    outro: { icon: CheckSquare, label: 'Outro', color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
}

export function getTaskTypeConfig(tipo: string): TaskTypeConfig {
    return TASK_TYPE_CONFIG[tipo] || TASK_TYPE_CONFIG.tarefa
}

export const PRIORIDADE_CONFIG: Record<string, { label: string; bar: string; chip: string; chipText: string }> = {
    alta: { label: 'Alta', bar: 'bg-red-500', chip: 'bg-red-50 border-red-200', chipText: 'text-red-700' },
    media: { label: 'Média', bar: 'bg-amber-400', chip: 'bg-amber-50 border-amber-200', chipText: 'text-amber-700' },
    baixa: { label: 'Baixa', bar: 'bg-slate-300', chip: 'bg-slate-50 border-slate-200', chipText: 'text-slate-600' },
}

export const ORIGEM_CONFIG: Record<string, { label: string; chip: string }> = {
    manual: { label: 'Manual', chip: 'bg-slate-50 border-slate-200 text-slate-600' },
    cadencia: { label: 'Cadência', chip: 'bg-violet-50 border-violet-200 text-violet-700' },
    automacao: { label: 'Automação', chip: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
    integracao: { label: 'Integração', chip: 'bg-teal-50 border-teal-200 text-teal-700' },
}

export const OUTCOME_LABELS: Record<string, string> = {
    atendeu: 'Atendeu',
    nao_atendeu: 'Não Atendeu',
    caixa_postal: 'Caixa Postal',
    numero_invalido: 'Num. Inválido',
    respondido: 'Respondido',
    visualizado: 'Visualizado',
    enviado: 'Enviado',
    realizada: 'Realizada',
    cancelada: 'Cancelada',
    nao_compareceu: 'Não Compareceu',
    remarcada: 'Remarcada',
    rescheduled: 'Reagendada',
    resolvido: 'Resolvido',
    cancelado_cliente: 'Canc. Cliente',
    adiada: 'Adiada',
    escalado: 'Escalado',
    resolvido_com_custo: 'Resol. c/ Custo',
}

export const OUTCOME_STYLES: Record<string, string> = {
    atendeu: 'text-green-600 bg-green-50 border-green-200',
    nao_atendeu: 'text-red-600 bg-red-50 border-red-200',
    caixa_postal: 'text-amber-600 bg-amber-50 border-amber-200',
    numero_invalido: 'text-red-600 bg-red-50 border-red-200',
    respondido: 'text-green-600 bg-green-50 border-green-200',
    realizada: 'text-green-600 bg-green-50 border-green-200',
    cancelada: 'text-red-600 bg-red-50 border-red-200',
    rescheduled: 'text-amber-600 bg-amber-50 border-amber-200',
    resolvido: 'text-green-600 bg-green-50 border-green-200',
}

export function formatCurrencyBRL(value: number | null): string | null {
    if (value == null) return null
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function sanitizePhone(phone: string | null): string | null {
    if (!phone) return null
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) return null
    return digits.startsWith('55') ? digits : `55${digits}`
}
