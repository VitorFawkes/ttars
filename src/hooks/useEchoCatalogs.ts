/**
 * useEchoCatalogs — hooks que carregam catálogos do Echo (tags, close-reasons,
 * users) para popular dropdowns no builder de automações.
 *
 * Os hooks vão direto na Echo API via callEchoApi, autenticando com
 * x-api-key. Como a chave é segredo do server, fazemos o proxy via uma
 * action específica do edge function `cadence-engine` (já está em uso pra
 * /templates via list_wa_templates).
 *
 * Para os 3 catálogos abaixo, usamos uma action genérica `echo_proxy` que
 * delega para GET /tags, GET /close-reasons e GET /phone-numbers (lista de
 * números) ou via consulta direta a integration_user_map (caso users).
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface EchoTag {
    id: string
    name: string
    color: string | null
}

export interface EchoCloseReason {
    id: string
    name: string
}

/**
 * Echo user é representado pelo external_user_id em integration_user_map.
 * O label vem do profile TTARS associado (nome/email).
 */
export interface EchoUser {
    external_user_id: string  // ID do usuário no Echo
    profile_id: string        // ID do profile TTARS
    nome: string
    email: string | null
}

/**
 * useEchoTags — lista as tags do Echo da org atual.
 * Proxy via cadence-engine (action: echo_proxy, path: '/tags').
 */
export function useEchoTags() {
    return useQuery({
        queryKey: ['echo-tags'],
        queryFn: async (): Promise<EchoTag[]> => {
            const { data, error } = await supabase.functions.invoke('cadence-engine', {
                body: { action: 'echo_proxy', method: 'GET', path: '/tags' },
            })
            if (error) throw error
            const list = data?.tags || data?.data || []
            return Array.isArray(list) ? list : []
        },
        staleTime: 60_000,
    })
}

/**
 * useEchoCloseReasons — lista os motivos de encerramento do Echo da org atual.
 */
export function useEchoCloseReasons() {
    return useQuery({
        queryKey: ['echo-close-reasons'],
        queryFn: async (): Promise<EchoCloseReason[]> => {
            const { data, error } = await supabase.functions.invoke('cadence-engine', {
                body: { action: 'echo_proxy', method: 'GET', path: '/close-reasons' },
            })
            if (error) throw error
            const list = data?.close_reasons || data?.data || []
            return Array.isArray(list) ? list : []
        },
        staleTime: 60_000,
    })
}

/**
 * useEchoUsers — usuários TTARS que estão mapeados pra um Echo user_id.
 * Tabela: integration_user_map JOIN profiles.
 *
 * Filtra por org_id implicitamente (RLS). Mostra só usuários com mapping ativo.
 */
export function useEchoUsers() {
    return useQuery({
        queryKey: ['echo-users'],
        queryFn: async (): Promise<EchoUser[]> => {
            const { data, error } = await supabase
                .from('integration_user_map')
                .select('external_user_id, internal_user_id, profiles:internal_user_id ( id, nome, email, active )')
                .not('external_user_id', 'is', null)
                .not('internal_user_id', 'is', null)
            if (error) throw error
            return ((data || []) as Array<Record<string, unknown>>)
                .map((row) => {
                    const profile = row.profiles as { id?: string; nome?: string; email?: string; active?: boolean } | null
                    if (!profile?.id || profile.active === false) return null
                    return {
                        external_user_id: row.external_user_id as string,
                        profile_id: profile.id,
                        nome: profile.nome || profile.email || profile.id,
                        email: profile.email || null,
                    } as EchoUser
                })
                .filter((u): u is EchoUser => u !== null)
        },
        staleTime: 60_000,
    })
}
