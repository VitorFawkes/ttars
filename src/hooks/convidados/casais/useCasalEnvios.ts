import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sbAny } from '../_supabaseUntyped'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const EDGE_URL = `${SUPABASE_URL}/functions/v1/wedding-lista-publica`

async function callEdge<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
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

export interface StatusEnvio {
  enviado_em: string | null
  ultima_edicao_casal_em: string | null
  tem_alteracoes_pendentes: boolean
  nunca_enviou: boolean
}

export function useStatusEnvioPublic(codigo: string | undefined) {
  return useQuery<StatusEnvio, Error>({
    queryKey: ['lista-publica', codigo, 'status-envio'],
    enabled: !!codigo,
    queryFn: () => callEdge<StatusEnvio>({ action: 'get_status_envio', codigo }),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })
}

export function useMarcarProntoPublic(codigo: string | undefined) {
  const qc = useQueryClient()
  return useMutation<string, Error, void>({
    mutationFn: async () => {
      const data = await callEdge<{ envio_id: string }>({ action: 'marcar_pronto', codigo })
      return data.envio_id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lista-publica', codigo] }),
  })
}

export interface EnvioSnapshot {
  id: string
  enviado_em: string
  snapshot: SnapshotConvite[]
  total_convites: number
  total_pessoas: number
  total_sem_telefone: number
}

export interface SnapshotConvite {
  id: string
  nome: string
  posicao: number
  pessoas: SnapshotPessoa[]
}

export interface SnapshotPessoa {
  id: string
  nome_raw: string
  telefone_raw: string
  email_raw: string
  faixa: string
  lado: string | null
  tipo: string | null
  observacoes: string | null
  posicao: number
}

export function useCasalEnvios(casalId: string | null) {
  return useQuery<EnvioSnapshot[]>({
    queryKey: ['casais', 'envios', casalId],
    enabled: !!casalId,
    queryFn: async () => {
      const { data, error } = await sbAny.rpc('wedding_casal_admin_envios', { p_casal_id: casalId })
      if (error) throw error
      return (data ?? []).map((e: Record<string, unknown>) => ({
        ...e,
        snapshot: typeof e.snapshot === 'string' ? JSON.parse(e.snapshot as string) : e.snapshot,
      })) as EnvioSnapshot[]
    },
  })
}

export function useMarcarVisto() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (casal_id) => {
      const { error } = await sbAny.rpc('wedding_casal_admin_marcar_visto', { p_casal_id: casal_id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['casais', 'admin'] }),
  })
}
