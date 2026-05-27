// Hook PÚBLICO — chama edge function wedding-lista-publica.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ListaCasalResponse } from '../../../lib/convidados/types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const EDGE_URL = `${SUPABASE_URL}/functions/v1/wedding-lista-publica`

async function callEdge<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  return body as T
}

export function useListaCasalPublica(codigo: string | undefined) {
  return useQuery<ListaCasalResponse, Error>({
    queryKey: ['lista-publica', codigo],
    enabled: !!codigo,
    retry: (failureCount, error) => {
      const status = (error as Error & { status?: number }).status
      if (status === 404 || status === 403) return false
      return failureCount < 2
    },
    queryFn: () => callEdge<ListaCasalResponse>({ action: 'get_lista', codigo }),
    refetchOnWindowFocus: false,
  })
}

export function useUpsertConvitePublic(codigo: string | undefined) {
  const qc = useQueryClient()
  return useMutation<
    string,
    Error,
    { convite_id?: string | null; nome?: string; posicao?: number }
  >({
    mutationFn: async (input) => {
      const data = await callEdge<{ convite_id: string }>({
        action: 'upsert_convite',
        codigo,
        ...input,
      })
      return data.convite_id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lista-publica', codigo] }),
  })
}

export function useDeleteConvitePublic(codigo: string | undefined) {
  const qc = useQueryClient()
  return useMutation<boolean, Error, string>({
    mutationFn: async (convite_id) => {
      const data = await callEdge<{ ok: boolean }>({
        action: 'delete_convite',
        codigo,
        convite_id,
      })
      return data.ok
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lista-publica', codigo] }),
  })
}

export function useReorderConvitesPublic(codigo: string | undefined) {
  const qc = useQueryClient()
  return useMutation<void, Error, string[]>({
    mutationFn: async (ids) => {
      await callEdge<{ ok: boolean }>({
        action: 'reorder_convites',
        codigo,
        ids,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lista-publica', codigo] }),
  })
}

export interface UpsertPessoaInput {
  convite_id: string
  guest_id?: string | null
  nome?: string | null
  telefone?: string | null
  email?: string | null
  faixa?: string | null
  lado?: string | null
  tipo?: string | null
  observacoes?: string | null
  posicao?: number | null
}

export function useUpsertPessoaPublic(codigo: string | undefined) {
  const qc = useQueryClient()
  return useMutation<string, Error, UpsertPessoaInput>({
    mutationFn: async (input) => {
      const data = await callEdge<{ guest_id: string }>({
        action: 'upsert_pessoa',
        codigo,
        ...input,
      })
      return data.guest_id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lista-publica', codigo] }),
  })
}

export function useDeletePessoaPublic(codigo: string | undefined) {
  const qc = useQueryClient()
  return useMutation<boolean, Error, string>({
    mutationFn: async (guest_id) => {
      const data = await callEdge<{ ok: boolean }>({
        action: 'delete_pessoa',
        codigo,
        guest_id,
      })
      return data.ok
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lista-publica', codigo] }),
  })
}
