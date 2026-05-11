/**
 * Configuração do Sentry para observabilidade de erros em produção.
 *
 * Inicializado em main.tsx antes do React.
 *
 * Env vars:
 *   - VITE_SENTRY_DSN    : DSN do projeto no Sentry (opcional — se ausente, Sentry fica desabilitado)
 *   - VITE_APP_ENV       : 'production' | 'staging' | 'development'
 *   - VITE_APP_VERSION   : versão do app (opcional, ex: git sha)
 *
 * Se VITE_SENTRY_DSN não estiver definido, a função retorna silenciosamente
 * sem inicializar — útil em dev e staging sem custo.
 */

import * as Sentry from '@sentry/react'

export function initSentry() {
    const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
    if (!dsn) {
        if (import.meta.env.PROD) {
            console.warn('[Sentry] VITE_SENTRY_DSN not set — error tracking disabled')
        }
        return
    }

    const env = (import.meta.env.VITE_APP_ENV as string) ?? (import.meta.env.PROD ? 'production' : 'development')
    const release = import.meta.env.VITE_APP_VERSION as string | undefined

    Sentry.init({
        dsn,
        environment: env,
        release,
        integrations: [
            Sentry.browserTracingIntegration(),
            Sentry.replayIntegration({
                maskAllText: true,      // LGPD: não captura texto do DOM
                blockAllMedia: true,    // LGPD: não captura imagens/mídia
            }),
        ],
        // Performance monitoring
        tracesSampleRate: env === 'production' ? 0.1 : 1.0,
        // Session replay — apenas em erros (não continuous)
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        // Não enviar erros de dev
        enabled: env !== 'development',
        // Filtra erros irrelevantes
        ignoreErrors: [
            // Erros de rede que não são bugs
            'NetworkError',
            'Failed to fetch',
            'Load failed',
            // Erros de browser extensions
            /chrome-extension:\/\//,
            /moz-extension:\/\//,
            // ResizeObserver noise
            'ResizeObserver loop limit exceeded',
            'ResizeObserver loop completed with undelivered notifications',
        ],
        beforeSend(event) {
            // Remove headers Authorization que possam vazar em logs
            if (event.request?.headers) {
                delete event.request.headers.Authorization
                delete event.request.headers.authorization
                delete event.request.headers.apikey
            }
            return event
        },
    })
}

/**
 * Seta contexto de usuário no Sentry (chamar após login).
 */
export function setSentryUser(user: { id: string; email?: string; org_id?: string } | null) {
    if (!user) {
        Sentry.setUser(null)
        return
    }
    Sentry.setUser({
        id: user.id,
        email: user.email,
    })
    if (user.org_id) {
        Sentry.setTag('org_id', user.org_id)
    }
}

export { Sentry }
