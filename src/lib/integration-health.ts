import type { IntegrationStats } from '@/hooks/useIntegrationStats';

export type HealthStatus = 'loading' | 'healthy' | 'processing' | 'warning' | 'critical' | 'error';

export interface HealthResult {
    status: HealthStatus;
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    badgeClass: string;
}

/**
 * Configuração de thresholds para cálculo de saúde.
 * Pode ser customizada por integração se necessário.
 */
export interface HealthThresholds {
    /** Número de falhas para status crítico */
    criticalFailures: number;
    /** Número de falhas para status warning */
    warningFailures: number;
    /** Ratio de pendentes para warning (0-1) */
    pendingRatioWarning: number;
    /** Número de bloqueados para warning */
    blockedWarning: number;
}

const DEFAULT_THRESHOLDS: HealthThresholds = {
    criticalFailures: 10,
    warningFailures: 1,
    pendingRatioWarning: 0.3,
    blockedWarning: 10
};

/**
 * Calcula o status de saúde da integração baseado nas estatísticas.
 * Centraliza a lógica duplicada de IntegrationOverviewTab e IntegrationStatusDashboard.
 */
export function calculateIntegrationHealth(
    stats: IntegrationStats | null | undefined,
    thresholds: Partial<HealthThresholds> = {}
): HealthResult {
    const config = { ...DEFAULT_THRESHOLDS, ...thresholds };

    // Estado de carregamento
    if (!stats) {
        return {
            status: 'loading',
            label: 'Carregando...',
            color: 'text-slate-400',
            bgColor: 'bg-slate-200',
            borderColor: 'border-slate-200',
            badgeClass: 'bg-slate-100 text-slate-600'
        };
    }

    const pendingRatio = stats.inbound.pending / Math.max(stats.inbound.total, 1);
    const totalFailed = stats.inbound.failed + stats.outbound.failed;

    // Crítico: muitas falhas
    if (totalFailed >= config.criticalFailures) {
        return {
            status: 'critical',
            label: 'Crítico',
            color: 'text-red-600',
            bgColor: 'bg-red-500',
            borderColor: 'border-red-200',
            badgeClass: 'bg-red-100 text-red-700'
        };
    }

    // Erro: há falhas
    if (totalFailed > 0) {
        return {
            status: 'error',
            label: 'Problemas Detectados',
            color: 'text-red-600',
            bgColor: 'bg-red-500',
            borderColor: 'border-red-200',
            badgeClass: 'bg-red-100 text-red-700'
        };
    }

    // Warning: muitos bloqueados ou alta taxa de pendentes
    if (stats.inbound.blocked >= config.blockedWarning || pendingRatio > config.pendingRatioWarning) {
        return {
            status: 'warning',
            label: 'Atenção Necessária',
            color: 'text-amber-600',
            bgColor: 'bg-amber-500',
            borderColor: 'border-amber-200',
            badgeClass: 'bg-amber-100 text-amber-700'
        };
    }

    // Processando: há pendentes
    if (stats.inbound.pending > 0) {
        return {
            status: 'processing',
            label: 'Processando',
            color: 'text-blue-600',
            bgColor: 'bg-blue-500',
            borderColor: 'border-blue-200',
            badgeClass: 'bg-blue-100 text-blue-700'
        };
    }

    // Saudável
    return {
        status: 'healthy',
        label: 'Saudável',
        color: 'text-green-600',
        bgColor: 'bg-green-500',
        borderColor: 'border-green-200',
        badgeClass: 'bg-green-100 text-green-700'
    };
}

/**
 * Constantes de status para badges e logs de eventos.
 * Centraliza definições duplicadas em IntegrationLogs e outros componentes.
 */
export const EVENT_STATUS_CONFIG = {
    pending: {
        label: 'Pendente',
        variant: 'secondary' as const,
        className: 'bg-blue-100 text-blue-700'
    },
    processed: {
        label: 'Processado',
        variant: 'secondary' as const,
        className: 'bg-green-100 text-green-700'
    },
    processed_shadow: {
        label: 'Shadow',
        variant: 'secondary' as const,
        className: 'bg-purple-100 text-purple-700'
    },
    failed: {
        label: 'Erro',
        variant: 'destructive' as const,
        className: 'bg-red-100 text-red-700'
    },
    ignored: {
        label: 'Ignorado',
        variant: 'secondary' as const,
        className: 'bg-slate-100 text-slate-600'
    },
    blocked: {
        label: 'Bloqueado',
        variant: 'secondary' as const,
        className: 'bg-amber-100 text-amber-700'
    },
    sent: {
        label: 'Enviado',
        variant: 'secondary' as const,
        className: 'bg-green-100 text-green-700'
    }
} as const;

export type EventStatus = keyof typeof EVENT_STATUS_CONFIG;
