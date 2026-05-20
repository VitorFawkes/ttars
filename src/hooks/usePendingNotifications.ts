import { useMemo } from 'react';
import { useNotifications, type Notification } from './useNotifications';

export type AlertChannel = 'modal' | 'banner' | 'bell';

export interface PendingNotification {
  id: string;
  card_id: string | null;
  title: string;
  body: string | null;
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
  created_at: string;
  metadata: {
    rule_id?: string;
    rule_name?: string;
    severity?: 'info' | 'warning' | 'critical';
    channels?: { modal?: boolean; banner?: boolean; bell?: boolean };
    missing_fields?: string[];
  };
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function toPending(n: Notification): PendingNotification {
  const meta = (n.metadata ?? {}) as PendingNotification['metadata'];
  return {
    id: n.id,
    card_id: n.card_id,
    title: n.title,
    body: n.body,
    severity: (meta.severity ?? 'warning') as 'info' | 'warning' | 'critical',
    read: n.read,
    created_at: n.created_at,
    metadata: meta,
  };
}

export function usePendingNotifications() {
  const { notifications, isLoading } = useNotifications();

  const alerts = useMemo<PendingNotification[]>(() => {
    return (notifications ?? [])
      .filter((n) => n.type === 'card_alert_rule' && !n.read)
      .map(toPending)
      .sort((a, b) => {
        const sevDiff =
          (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
        if (sevDiff !== 0) return sevDiff;
        return b.created_at.localeCompare(a.created_at);
      });
  }, [notifications]);

  function byChannel(channel: AlertChannel): PendingNotification[] {
    return alerts.filter((a) => a.metadata?.channels?.[channel] === true);
  }

  function byCard(cardId: string): PendingNotification[] {
    return alerts.filter((a) => a.card_id === cardId);
  }

  return {
    alerts,
    byChannel,
    byCard,
    isLoading,
  };
}
