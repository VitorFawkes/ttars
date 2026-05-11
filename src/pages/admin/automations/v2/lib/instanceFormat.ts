/**
 * Helpers compartilhados entre ExecutionsPanel e BaseNode (tooltip do trail).
 * Centralizados aqui pra evitar import cíclico e manter cor/label de status
 * consistentes entre lugares que mostram cadence_instances.
 */
import { Activity, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react'
import type { ComponentType } from 'react'

export interface StatusMeta {
    label: string
    color: string
    icon: ComponentType<{ className?: string }>
}

export const STATUS_META: Record<string, StatusMeta> = {
    active:        { label: 'Ativa',      color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Activity },
    waiting_task:  { label: 'Aguardando', color: 'bg-amber-100 text-amber-700 border-amber-200',       icon: Clock },
    paused:        { label: 'Pausada',    color: 'bg-slate-100 text-slate-700 border-slate-200',       icon: Clock },
    completed:     { label: 'Completa',   color: 'bg-blue-100 text-blue-700 border-blue-200',          icon: CheckCircle },
    cancelled:     { label: 'Cancelada',  color: 'bg-slate-100 text-slate-600 border-slate-200',       icon: XCircle },
    failed:        { label: 'Falhou',     color: 'bg-rose-100 text-rose-700 border-rose-200',          icon: AlertCircle },
}

export function formatRelative(iso: string): string {
    const d = new Date(iso).getTime()
    const diffMs = Date.now() - d
    if (diffMs < 60_000) return 'agora'
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}min`
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h`
    return `${Math.floor(diffMs / 86_400_000)}d`
}
