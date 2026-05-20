/**
 * Tipos estendidos de `card_alert_rules` (Marco A — Alertas Viscerais).
 *
 * Por que existe: as colunas `show_in_modal`, `show_in_kanban_banner`,
 * `show_in_bell`, `recipient_mode`, `recipient_target` foram aplicadas em
 * STAGING mas ainda não promovidas em PRODUÇÃO. O `database.types.ts` é
 * gerado contra o schema de PROD (canonical) e por isso ainda não inclui
 * esses campos.
 *
 * Quando deletar este arquivo: após a Task 16 (promoção pra produção),
 * regenerar `src/database.types.ts` contra produção via:
 *   `npx supabase gen types typescript --project-id szyrzxvlptqqheizyrxu > src/database.types.ts`
 * As colunas vão estar lá, e este arquivo de extensão pode ser removido.
 */

import type { Database } from '@/database.types';

export type RecipientMode =
  | 'card_owner'
  | 'team_managers'
  | 'specific_roles'
  | 'specific_users';

export type AlertChannelFlags = {
  show_in_modal: boolean;
  show_in_kanban_banner: boolean;
  show_in_bell: boolean;
};

export type AlertRecipient = {
  recipient_mode: RecipientMode;
  recipient_target: string[];
};

type BaseAlertRow = Database['public']['Tables']['card_alert_rules']['Row'];
type BaseAlertInsert = Database['public']['Tables']['card_alert_rules']['Insert'];
type BaseAlertUpdate = Database['public']['Tables']['card_alert_rules']['Update'];

export type AlertRuleRow = BaseAlertRow & AlertChannelFlags & AlertRecipient;

export type AlertRuleInsert = BaseAlertInsert &
  Partial<AlertChannelFlags> &
  Partial<AlertRecipient>;

export type AlertRuleUpdate = BaseAlertUpdate &
  Partial<AlertChannelFlags> &
  Partial<AlertRecipient>;

export type NotificationChannelMetadata = {
  rule_id?: string;
  rule_name?: string;
  severity?: 'info' | 'warning' | 'critical';
  missing_fields?: string[];
  channels?: {
    modal?: boolean;
    banner?: boolean;
    bell?: boolean;
  };
};
