import { Calendar, CheckSquare, CreditCard, FileText, MapPin, BedDouble, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { WeddingTaskTipo } from './types'

// Catálogo de tipos de tarefa do Planejamento (label + ícone + cores).
// Enxuto e local (espelha src/components/tasks/taskTypeConfig.ts, sem importar).
// Reunião é só mais um tipo de tarefa — ícone de calendário.

export interface WeddingTaskTypeMeta {
  label: string
  icon: LucideIcon
  /** classe de texto/ícone */
  color: string
  /** chip: fundo + borda */
  bg: string
  border: string
}

export const WEDDING_TASK_TYPES: Record<WeddingTaskTipo, WeddingTaskTypeMeta> = {
  reuniao:   { label: 'Reunião',   icon: Calendar,    color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200' },
  tarefa:    { label: 'Tarefa',    icon: CheckSquare, color: 'text-slate-600',   bg: 'bg-slate-100',  border: 'border-slate-200' },
  pagamento: { label: 'Pagamento', icon: CreditCard,  color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  documento: { label: 'Documento', icon: FileText,    color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  reserva:   { label: 'Reserva',   icon: MapPin,      color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-200' },
  bloqueio:  { label: 'Bloqueio',  icon: BedDouble,   color: 'text-indigo-600',  bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  lista:     { label: 'Lista',     icon: Users,       color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200' },
}

/** Ordem de exibição no seletor de tipo. */
export const WEDDING_TASK_TIPO_LIST: WeddingTaskTipo[] = [
  'tarefa', 'reuniao', 'reserva', 'documento', 'pagamento', 'bloqueio', 'lista',
]
