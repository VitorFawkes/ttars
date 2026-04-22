import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { ViagemEstado, TripItemTipo, TripItemStatus, TripItemAlternativa } from '@/types/viagem'

export interface ViagemInternaRow {
  id: string
  card_id: string | null
  org_id: string
  public_token: string
  estado: ViagemEstado
  tp_owner_id: string | null
  pos_owner_id: string | null
  titulo: string | null
  subtitulo: string | null
  capa_url: string | null
  total_estimado: number
  total_aprovado: number
  enviada_em: string | null
  confirmada_em: string | null
  created_at: string
  updated_at: string
}

export interface TripItemInterno {
  id: string
  viagem_id: string
  org_id: string
  parent_id: string | null
  tipo: TripItemTipo
  status: TripItemStatus
  ordem: number
  comercial: Record<string, unknown>
  operacional: Record<string, unknown>
  alternativas: TripItemAlternativa[]
  source_type: 'manual' | 'proposal' | 'financeiro' | 'library' | null
  source_id: string | null
  aprovado_em: string | null
  aprovado_por: 'client' | 'tp' | 'pv' | null
  criado_por: string | null
  criado_por_papel: 'tp' | 'pv' | null
  editado_por: string | null
  editado_por_papel: 'tp' | 'pv' | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ViagemComItems {
  viagem: ViagemInternaRow
  items: TripItemInterno[]
}

export const viagemInternaKeys = {
  all: ['viagem-interna'] as const,
  byId: (id: string) => ['viagem-interna', 'id', id] as const,
  byCardId: (cardId: string) => ['viagem-interna', 'card', cardId] as const,
  list: (filters: Record<string, unknown> = {}) => ['viagem-interna', 'list', filters] as const,
}

async function fetchViagemComItems(viagem: ViagemInternaRow): Promise<ViagemComItems> {
  const { data: items, error } = await supabase
    .from('trip_items')
    .select('*')
    .eq('viagem_id', viagem.id)
    .is('deleted_at', null)
    .order('parent_id', { nullsFirst: true })
    .order('ordem', { ascending: true })
  if (error) throw error
  return { viagem, items: (items ?? []) as unknown as TripItemInterno[] }
}

export function useViagemByCardId(cardId: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: cardId ? viagemInternaKeys.byCardId(cardId) : ['viagem-interna', 'card', 'none'],
    queryFn: async (): Promise<ViagemComItems | null> => {
      if (!cardId) return null
      const { data, error } = await supabase
        .from('viagens')
        .select('*')
        .eq('card_id', cardId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return fetchViagemComItems(data as unknown as ViagemInternaRow)
    },
    enabled: !!cardId,
    staleTime: 10_000,
  })

  useEffect(() => {
    const viagemId = query.data?.viagem.id
    if (!viagemId) return
    const channel = supabase
      .channel(`viagem-interna-${viagemId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_items',
        filter: `viagem_id=eq.${viagemId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'viagens',
        filter: `id=eq.${viagemId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [query.data?.viagem.id, queryClient])

  return query
}

export function useViagemById(viagemId: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: viagemId ? viagemInternaKeys.byId(viagemId) : ['viagem-interna', 'id', 'none'],
    queryFn: async (): Promise<ViagemComItems | null> => {
      if (!viagemId) return null
      const { data, error } = await supabase
        .from('viagens')
        .select('*')
        .eq('id', viagemId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return fetchViagemComItems(data as unknown as ViagemInternaRow)
    },
    enabled: !!viagemId,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (!viagemId) return
    const channel = supabase
      .channel(`viagem-interna-byid-${viagemId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_items',
        filter: `viagem_id=eq.${viagemId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: viagemInternaKeys.byId(viagemId) })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'viagens',
        filter: `id=eq.${viagemId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: viagemInternaKeys.byId(viagemId) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [viagemId, queryClient])

  return query
}

export interface ViagemListRow extends ViagemInternaRow {
  card_titulo: string | null
}

export interface ViagemListFilters {
  estado?: ViagemEstado | null
  comCard?: boolean | null
  busca?: string | null
}

export function useViagensList(filters: ViagemListFilters = {}) {
  return useQuery({
    queryKey: viagemInternaKeys.list(filters as Record<string, unknown>),
    queryFn: async (): Promise<ViagemListRow[]> => {
      let q = supabase
        .from('viagens')
        .select('*, cards:card_id (titulo)')
        .order('updated_at', { ascending: false })
        .limit(200)
      if (filters.estado) q = q.eq('estado', filters.estado)
      if (filters.comCard === true) q = q.not('card_id', 'is', null)
      if (filters.comCard === false) q = q.is('card_id', null)
      if (filters.busca && filters.busca.trim()) q = q.ilike('titulo', `%${filters.busca.trim()}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row) => ({
        ...(row as unknown as ViagemInternaRow),
        card_titulo: (row as { cards?: { titulo?: string | null } | null })?.cards?.titulo ?? null,
      }))
    },
    staleTime: 15_000,
  })
}

// ====================================================================
// Mutations
// ====================================================================

interface CriarViagemInput {
  cardId?: string | null
  titulo?: string | null
  subtitulo?: string | null
  hidratar?: boolean
}

interface CriarViagemResult {
  id: string
  public_token: string
  card_id: string | null
  hidratacao: { criados: number; ja_existentes: number; motivo?: string } | null
}

export function useCriarViagem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CriarViagemInput): Promise<CriarViagemResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('criar_viagem', {
        p_card_id: input.cardId ?? null,
        p_titulo: input.titulo ?? null,
        p_subtitulo: input.subtitulo ?? null,
        p_hidratar: input.hidratar ?? true,
      })
      if (error) throw error
      return data as CriarViagemResult
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
      if (result.hidratacao && result.hidratacao.criados > 0) {
        toast.success(`${result.hidratacao.criados} itens do Produto-Vendas`, {
          description: 'Carregados automaticamente na viagem.',
        })
      }
    },
  })
}

export function useAtrelarViagemACard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { viagemId: string; cardId: string; hidratar?: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('atrelar_viagem_a_card', {
        p_viagem_id: input.viagemId,
        p_card_id: input.cardId,
        p_hidratar: input.hidratar ?? true,
      })
      if (error) throw error
      return data as { viagem_id: string; card_id: string; hidratacao: CriarViagemResult['hidratacao'] }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
      if (result.hidratacao && result.hidratacao.criados > 0) {
        toast.success(`${result.hidratacao.criados} itens do Produto-Vendas`, {
          description: 'Carregados ao atrelar ao card.',
        })
      } else {
        toast.success('Viagem atrelada ao card')
      }
    },
  })
}

export function useHidratarViagem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (viagemId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('hidratar_viagem_de_financeiro', {
        p_viagem_id: viagemId,
      })
      if (error) throw error
      return data as { criados: number; ja_existentes: number; motivo?: string }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
      if (result.criados > 0) {
        toast.success(`${result.criados} ${result.criados === 1 ? 'item novo' : 'itens novos'} do Produto-Vendas`, {
          description: 'Adicionados automaticamente.',
        })
      }
    },
  })
}

interface UpdateViagemInput {
  id: string
  titulo?: string | null
  subtitulo?: string | null
  capa_url?: string | null
  estado?: ViagemEstado
  tp_owner_id?: string | null
  pos_owner_id?: string | null
}

export function useUpdateViagem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateViagemInput) => {
      const { id, ...patch } = input
      const { data, error } = await supabase
        .from('viagens')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data as unknown as ViagemInternaRow
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
    },
  })
}

interface CreateTripItemInput {
  viagem_id: string
  parent_id?: string | null
  tipo: TripItemTipo
  ordem?: number
  comercial?: Record<string, unknown>
  operacional?: Record<string, unknown>
  status?: TripItemStatus
  criado_por_papel?: 'tp' | 'pv'
}

export function useCreateTripItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateTripItemInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('trip_items') as any)
        .insert({
          viagem_id: input.viagem_id,
          parent_id: input.parent_id ?? null,
          tipo: input.tipo,
          ordem: input.ordem ?? 0,
          comercial: input.comercial ?? {},
          operacional: input.operacional ?? {},
          alternativas: [],
          status: input.status ?? 'rascunho',
          source_type: 'manual',
          criado_por_papel: input.criado_por_papel ?? 'pv',
        })
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as TripItemInterno
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
    },
  })
}

interface UpdateTripItemInput {
  id: string
  comercial?: Record<string, unknown>
  operacional?: Record<string, unknown>
  alternativas?: TripItemAlternativa[]
  tipo?: TripItemTipo
  ordem?: number
  status?: TripItemStatus
  editado_por_papel?: 'tp' | 'pv'
}

export function useUpdateTripItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateTripItemInput) => {
      const { id, editado_por_papel, ...patch } = input
      const { data: { user } } = await supabase.auth.getUser()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('trip_items') as any)
        .update({
          ...patch,
          editado_por_papel: editado_por_papel ?? 'pv',
          editado_por: user?.id ?? null,
        })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as TripItemInterno
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
    },
  })
}

export function useDeleteTripItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('trip_items')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', itemId)
      if (error) throw error
      return itemId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
    },
  })
}

interface ReorderTripItemsInput {
  viagem_id: string
  updates: { id: string; ordem: number; parent_id?: string | null }[]
}

export function useReorderTripItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ReorderTripItemsInput) => {
      await Promise.all(
        input.updates.map(async (u) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase.from('trip_items') as any)
            .update({
              ordem: u.ordem,
              ...(u.parent_id !== undefined ? { parent_id: u.parent_id } : {}),
            })
            .eq('id', u.id)
          if (error) throw error
        }),
      )
      return input
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
    },
  })
}

interface EnviarViagemResult {
  id: string
  estado: ViagemEstado
  enviada_em: string
  public_token: string
  itens_promovidos: number
}

export function useEnviarViagem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (viagemId: string): Promise<EnviarViagemResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('enviar_viagem_ao_cliente', {
        p_viagem_id: viagemId,
      })
      if (error) throw error
      return data as EnviarViagemResult
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
      toast.success('Viagem enviada ao cliente', {
        description: result.itens_promovidos > 0
          ? `${result.itens_promovidos} itens novos visíveis ao cliente.`
          : 'Link do cliente atualizado.',
      })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar viagem'
      toast.error(msg)
    },
  })
}
