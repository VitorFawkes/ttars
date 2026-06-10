// Hook PÚBLICO — chama edge function wedding-lista-publica.
// Mutations usam optimistic updates pra a UI responder imediatamente —
// sem esperar round-trip do servidor + refetch da lista inteira.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ListaCasalResponse,
  Convite,
  Pessoa,
  FaixaKey,
  LadoKey,
  TipoKey,
} from '../../../lib/convidados/types'

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

const tempId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

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

// ── Convite ─────────────────────────────────────────────────────────────

interface UpsertConviteCtx {
  previous?: ListaCasalResponse
  tempId?: string
}

// Invalida a query de status do envio pra o botão "Pronto" / "Avisar mudanças"
// refletir que houve edição depois do último envio. Sem isso o status fica
// congelado em cache (staleTime: 30s) e o botão fica disabled mesmo após edits.
function invalidateStatusEnvio(qc: ReturnType<typeof useQueryClient>, codigo: string | undefined) {
  qc.invalidateQueries({ queryKey: ['lista-publica', codigo, 'status-envio'] })
}

export function useUpsertConvitePublic(codigo: string | undefined) {
  const qc = useQueryClient()
  const queryKey = ['lista-publica', codigo] as const

  return useMutation<
    string,
    Error,
    { convite_id?: string | null; nome?: string; posicao?: number },
    UpsertConviteCtx
  >({
    mutationFn: async (input) => {
      const data = await callEdge<{ convite_id: string }>({
        action: 'upsert_convite',
        codigo,
        ...input,
      })
      return data.convite_id
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<ListaCasalResponse>(queryKey)
      if (!previous) return { previous }

      // Criar novo convite (sem convite_id)
      if (!input.convite_id) {
        const tid = tempId('cv')
        const newConvite: Convite = {
          id: tid,
          nome: input.nome || 'Novo convite',
          posicao: input.posicao ?? previous.convites.length,
          pessoas: [],
        }
        qc.setQueryData<ListaCasalResponse>(queryKey, {
          ...previous,
          convites: [...previous.convites, newConvite].sort((a, b) => a.posicao - b.posicao),
        })
        return { previous, tempId: tid }
      }

      // Editar (renomear / reposicionar)
      qc.setQueryData<ListaCasalResponse>(queryKey, {
        ...previous,
        convites: previous.convites.map((c) =>
          c.id === input.convite_id
            ? {
                ...c,
                nome: input.nome !== undefined ? input.nome || 'Convite sem nome' : c.nome,
                posicao: input.posicao !== undefined ? input.posicao : c.posicao,
              }
            : c,
        ),
      })
      return { previous }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous)
    },
    onSuccess: (realId, _input, ctx) => {
      // Substitui temp id pelo real
      if (ctx?.tempId) {
        const cur = qc.getQueryData<ListaCasalResponse>(queryKey)
        if (cur) {
          qc.setQueryData<ListaCasalResponse>(queryKey, {
            ...cur,
            convites: cur.convites.map((c) => (c.id === ctx.tempId ? { ...c, id: realId } : c)),
          })
        }
      }
      // Refetch silencioso pra sincronizar (sem flash)
      qc.invalidateQueries({ queryKey, refetchType: 'none' })
      invalidateStatusEnvio(qc, codigo)
    },
  })
}

export function useDeleteConvitePublic(codigo: string | undefined) {
  const qc = useQueryClient()
  const queryKey = ['lista-publica', codigo] as const
  return useMutation<boolean, Error, string, { previous?: ListaCasalResponse }>({
    mutationFn: async (convite_id) => {
      const data = await callEdge<{ ok: boolean }>({
        action: 'delete_convite',
        codigo,
        convite_id,
      })
      return data.ok
    },
    onMutate: async (convite_id) => {
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<ListaCasalResponse>(queryKey)
      if (previous) {
        qc.setQueryData<ListaCasalResponse>(queryKey, {
          ...previous,
          convites: previous.convites.filter((c) => c.id !== convite_id),
        })
      }
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey, refetchType: 'none' })
      invalidateStatusEnvio(qc, codigo)
    },
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

// ── Nomes do casal no campo Lado ────────────────────────────────────────

export function useUpdateLadoNomes(codigo: string | undefined) {
  const qc = useQueryClient()
  const queryKey = ['lista-publica', codigo] as const
  return useMutation<boolean, Error, { label_a: string; label_b: string }, { previous?: ListaCasalResponse }>({
    mutationFn: async ({ label_a, label_b }) => {
      const data = await callEdge<{ ok: boolean }>({
        action: 'update_lado_nomes',
        codigo,
        label_a,
        label_b,
      })
      return data.ok
    },
    onMutate: async ({ label_a, label_b }) => {
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<ListaCasalResponse>(queryKey)
      if (previous) {
        qc.setQueryData<ListaCasalResponse>(queryKey, {
          ...previous,
          casal: { ...previous.casal, lado_label_a: label_a || null, lado_label_b: label_b || null },
        })
      }
      return { previous }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey, refetchType: 'none' })
    },
  })
}

// ── Pessoa ──────────────────────────────────────────────────────────────

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

interface UpsertPessoaCtx {
  previous?: ListaCasalResponse
  tempId?: string
}

export function useUpsertPessoaPublic(codigo: string | undefined) {
  const qc = useQueryClient()
  const queryKey = ['lista-publica', codigo] as const

  return useMutation<string, Error, UpsertPessoaInput, UpsertPessoaCtx>({
    mutationFn: async (input) => {
      const data = await callEdge<{ guest_id: string }>({
        action: 'upsert_pessoa',
        codigo,
        ...input,
      })
      return data.guest_id
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<ListaCasalResponse>(queryKey)
      if (!previous) return { previous }

      // CRIAR nova pessoa (sem guest_id)
      if (!input.guest_id) {
        const tid = tempId('p')
        const newPessoa: Pessoa = {
          id: tid,
          nome_raw: input.nome ?? '',
          telefone_raw: input.telefone ?? '',
          email_raw: input.email ?? '',
          faixa: (input.faixa as FaixaKey) || 'adulto',
          lado: ((input.lado as LadoKey) || '') as LadoKey | '',
          tipo: ((input.tipo as TipoKey) || '') as TipoKey | '',
          observacoes: input.observacoes ?? '',
          posicao: input.posicao ?? 0,
        }
        qc.setQueryData<ListaCasalResponse>(queryKey, {
          ...previous,
          convites: previous.convites.map((c) =>
            c.id === input.convite_id ? { ...c, pessoas: [...c.pessoas, newPessoa] } : c,
          ),
        })
        return { previous, tempId: tid }
      }

      // EDITAR pessoa existente
      qc.setQueryData<ListaCasalResponse>(queryKey, {
        ...previous,
        convites: previous.convites.map((c) => ({
          ...c,
          pessoas: c.pessoas.map((p) => {
            if (p.id !== input.guest_id) return p
            return {
              ...p,
              ...(input.nome !== undefined ? { nome_raw: input.nome ?? '' } : {}),
              ...(input.telefone !== undefined ? { telefone_raw: input.telefone ?? '' } : {}),
              ...(input.email !== undefined ? { email_raw: input.email ?? '' } : {}),
              ...(input.faixa !== undefined ? { faixa: (input.faixa as FaixaKey) || 'adulto' } : {}),
              ...(input.lado !== undefined ? { lado: ((input.lado as LadoKey) || '') as LadoKey | '' } : {}),
              ...(input.tipo !== undefined ? { tipo: ((input.tipo as TipoKey) || '') as TipoKey | '' } : {}),
              ...(input.observacoes !== undefined ? { observacoes: input.observacoes ?? '' } : {}),
            }
          }),
        })),
      })
      return { previous }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous)
    },
    onSuccess: (realId, _input, ctx) => {
      if (ctx?.tempId) {
        const cur = qc.getQueryData<ListaCasalResponse>(queryKey)
        if (cur) {
          qc.setQueryData<ListaCasalResponse>(queryKey, {
            ...cur,
            convites: cur.convites.map((c) => ({
              ...c,
              pessoas: c.pessoas.map((p) => (p.id === ctx.tempId ? { ...p, id: realId } : p)),
            })),
          })
        }
      }
      qc.invalidateQueries({ queryKey, refetchType: 'none' })
      invalidateStatusEnvio(qc, codigo)
    },
  })
}

export function useDeletePessoaPublic(codigo: string | undefined) {
  const qc = useQueryClient()
  const queryKey = ['lista-publica', codigo] as const
  return useMutation<boolean, Error, string, { previous?: ListaCasalResponse }>({
    mutationFn: async (guest_id) => {
      const data = await callEdge<{ ok: boolean }>({
        action: 'delete_pessoa',
        codigo,
        guest_id,
      })
      return data.ok
    },
    onMutate: async (guest_id) => {
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<ListaCasalResponse>(queryKey)
      if (previous) {
        qc.setQueryData<ListaCasalResponse>(queryKey, {
          ...previous,
          convites: previous.convites.map((c) => ({
            ...c,
            pessoas: c.pessoas.filter((p) => p.id !== guest_id),
          })),
        })
      }
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey, refetchType: 'none' })
      invalidateStatusEnvio(qc, codigo)
    },
  })
}
