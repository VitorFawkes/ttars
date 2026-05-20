import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { PendingNotification } from '@/hooks/usePendingNotifications';

interface Props {
  pendencia: PendingNotification;
  onOpen: (cardId: string) => void;
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', iconClass: 'text-red-600' },
  warning:  { icon: AlertTriangle, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', iconClass: 'text-amber-600' },
  info:     { icon: Info, bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-800', iconClass: 'text-sky-600' },
} as const;

export function PendenciaItem({ pendencia, onOpen }: Props) {
  const cfg = SEVERITY_CONFIG[pendencia.severity] ?? SEVERITY_CONFIG.warning;
  const Icon = cfg.icon;
  const cardId = pendencia.card_id;

  return (
    <div className={`flex items-start gap-3 rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.iconClass}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${cfg.text} truncate`}>{pendencia.title}</div>
        {pendencia.body && (
          <div className="text-xs text-slate-600 mt-0.5">{pendencia.body}</div>
        )}
      </div>
      {cardId && (
        <button
          type="button"
          onClick={() => onOpen(cardId)}
          className="shrink-0 rounded-md bg-white border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Abrir
        </button>
      )}
    </div>
  );
}
