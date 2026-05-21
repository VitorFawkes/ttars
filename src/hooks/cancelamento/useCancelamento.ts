import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

// ============================================================
// Tipos
// ============================================================

export type ModoCancelamento = 'total' | 'parcial' | 'mudanca_brusca'
export type EscopoMotivo = 'total' | 'parcial' | 'mudanca' | 'qualquer'

export interface MotivoCancelamento {
  id: string
  org_id: string
  nome: string
  ativo: boolean
  ordem: number
  escopo: EscopoMotivo
}

export interface ViagemCancelamentoState {
  viagem_id: string
  card_id: string | null
  org_id: string
  modo_cancelamento: ModoCancelamento | null
  motivo_cancelamento_id: string | null
  motivo_cancelamento_obs: string | null
  cancelamento_aberto_em: string | null
  cancelamento_aberto_por: string | null
  cancelamento_concluido_em: string | null
  cancelamento_stage_anterior_id: string | null
  tp_owner_id: string | null
  pos_owner_id: string | null
  titulo: string | null
}

export interface CancellationTaskRow {
  id: string
  titulo: string
  status: string | null
  concluida: boolean | null
  responsavel_id: string | null
  responsavel_nome: string | null
  data_vencimento: string | null
  prioridade: string | null
}

export interface CancellationGhostSummary {
  viagem_id: string
  card_id: string | null
  card_titulo: string | null
  modo_cancelamento: ModoCancelamento
  cancelamento_aberto_em: string
  cancelamento_aberto_por: string | null
  aberto_por_nome: string | null
  total_tarefas: number
  concluidas: number
  pendentes: number
  atrasadas: number
  embarque_em: string | null
  proximas: Array<{
    id: string
    titulo: string
    responsavel_id: string | null
    responsavel_nome: string | null
    data_vencimento: string | null
  }>
}

// ============================================================
// Keys
// ============================================================

export const cancelamentoKeys = {
  motivos: (orgId: string | undefined, escopo?: EscopoMotivo | null) =>
    ['motivos_cancelamento', orgId ?? 'none', escopo ?? 'todos'] as const,
  state: (viagemId: string | undefined) =>
    ['cancelamento-state', viagemId ?? 'none'] as const,
  tasks: (cardId: string | undefined) =>
    ['cancelamento-tasks', cardId ?? 'none'] as const,
  ghosts: (tpOwnerId: string | undefined, orgId: string | undefined) =>
    ['cancelamento-ghosts', tpOwnerId ?? 'none', orgId ?? 'none'] as const,
}

// ============================================================
// Helper RPC (RPCs ainda não estão em database.types.ts)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase.rpc as any)(name, args)

// ============================================================
// useMotivosCancelamento
// ============================================================

export function useMotivosCancelamento(
  orgId: string | undefined,
  escopo?: EscopoMotivo | null,
) {
  return useQuery({
    queryKey: cancelamentoKeys.motivos(orgId, escopo),
    queryFn: async (): Promise<MotivoCancelamento[]> => {
      if (!orgId) return []
      let q = supabase
        .from('motivos_cancelamento')
        .select('id, org_id, nome, ativo, ordem, escopo')
        .eq('org_id', orgId)
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })
      if (escopo) {
        q = q.in('escopo', [escopo, 'qualquer'])
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as MotivoCancelamento[]
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ============================================================
// useCancellationStateByCard — lê estado do cancelamento via card
// ============================================================

export function useCancellationStateByCard(cardId: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: cancelamentoKeys.state(cardId),
    queryFn: async (): Promise<ViagemCancelamentoState | null> => {
      if (!cardId) return null
      const { data, error } = await supabase
        .from('viagens')
        .select(
          'id, card_id, org_id, modo_cancelamento, motivo_cancelamento_id, motivo_cancelamento_obs, cancelamento_aberto_em, cancelamento_aberto_por, cancelamento_concluido_em, cancelamento_stage_anterior_id, tp_owner_id, pos_owner_id, titulo',
        )
        .eq('card_id', cardId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        viagem_id: data.id,
        card_id: data.card_id,
        org_id: data.org_id,
        modo_cancelamento: data.modo_cancelamento as ModoCancelamento | null,
        motivo_cancelamento_id: data.motivo_cancelamento_id,
        motivo_cancelamento_obs: data.motivo_cancelamento_obs,
        cancelamento_aberto_em: data.cancelamento_aberto_em,
        cancelamento_aberto_por: data.cancelamento_aberto_por,
        cancelamento_concluido_em: data.cancelamento_concluido_em,
        cancelamento_stage_anterior_id: data.cancelamento_stage_anterior_id,
        tp_owner_id: data.tp_owner_id,
        pos_owner_id: data.pos_owner_id,
        titulo: data.titulo,
      }
    },
    enabled: !!cardId,
    staleTime: 10_000,
  })

  // Realtime: atualiza ao mudar viagens
  useEffect(() => {
    const viagemId = query.data?.viagem_id
    if (!viagemId) return
    const channel = supabase
      .channel(`cancelamento-state-${viagemId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'viagens', filter: `id=eq.${viagemId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: cancelamentoKeys.state(cardId) })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [query.data?.viagem_id, cardId, queryClient])

  return query
}

// ============================================================
// useCancellationTasksForCard — tarefas com origem cancelamento
// ============================================================

export function useCancellationTasksForCard(cardId: string | undefined) {
  return useQuery({
    queryKey: cancelamentoKeys.tasks(cardId),
    queryFn: async (): Promise<CancellationTaskRow[]> => {
      if (!cardId) return []
      // metadata pode ter origin = manual/automation/etc. Pra cancelamento usamos
      // metadata.origem = 'cancelamento_total' | 'cancelamento_parcial' | 'cancelamento_mudanca'.
      const { data, error } = await supabase
        .from('tarefas')
        .select(
          'id, titulo, status, concluida, responsavel_id, data_vencimento, prioridade, profiles:responsavel_id (nome)',
        )
        .eq('card_id', cardId)
        .like('metadata->>origem', 'cancelamento_%')
        .is('deleted_at', null)
        .order('data_vencimento', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []).map((row) => {
        const r = row as unknown as {
          id: string
          titulo: string
          status: string | null
          concluida: boolean | null
          responsavel_id: string | null
          data_vencimento: string | null
          prioridade: string | null
          profiles?: { nome?: string | null } | null
        }
        return {
          id: r.id,
          titulo: r.titulo,
          status: r.status,
          concluida: r.concluida,
          responsavel_id: r.responsavel_id,
          responsavel_nome: r.profiles?.nome ?? null,
          data_vencimento: r.data_vencimento,
          prioridade: r.prioridade,
        }
      })
    },
    enabled: !!cardId,
    staleTime: 10_000,
  })
}

// ============================================================
// useCancellationGhosts — viagens em modo cancelamento ativo
// ============================================================

export function useCancellationGhosts(
  tpOwnerId: string | undefined,
  orgId: string | undefined,
) {
  return useQuery({
    queryKey: cancelamentoKeys.ghosts(tpOwnerId, orgId),
    queryFn: async (): Promise<CancellationGhostSummary[]> => {
      if (!tpOwnerId || !orgId) return []

      // 1. Viagens em modo aberto desse TP nessa org
      const { data: viagens, error } = await supabase
        .from('viagens')
        .select(
          'id, card_id, modo_cancelamento, cancelamento_aberto_em, cancelamento_aberto_por, profiles:cancelamento_aberto_por (nome), cards:card_id (titulo, produto_data)',
        )
        .eq('org_id', orgId)
        .eq('tp_owner_id', tpOwnerId)
        .not('modo_cancelamento', 'is', null)
        .is('cancelamento_concluido_em', null)
      if (error) throw error
      if (!viagens || viagens.length === 0) return []

      const cardIds = viagens.map((v) => (v as { card_id: string | null }).card_id).filter(Boolean) as string[]
      if (cardIds.length === 0) return viagens.map(buildSummaryFromViagem)

      // 2. Tarefas do cancelamento desses cards (agregação no cliente — volume baixo)
      const { data: tarefas, error: errTask } = await supabase
        .from('tarefas')
        .select('id, card_id, titulo, concluida, data_vencimento, responsavel_id, profiles:responsavel_id (nome)')
        .in('card_id', cardIds)
        .like('metadata->>origem', 'cancelamento_%')
        .is('deleted_at', null)
      if (errTask) throw errTask

      const tarefasByCard = new Map<string, Array<{
        id: string
        titulo: string
        concluida: boolean | null
        data_vencimento: string | null
        responsavel_id: string | null
        responsavel_nome: string | null
      }>>()
      for (const t of tarefas ?? []) {
        const row = t as unknown as {
          id: string
          card_id: string
          titulo: string
          concluida: boolean | null
          data_vencimento: string | null
          responsavel_id: string | null
          profiles?: { nome?: string | null } | null
        }
        const list = tarefasByCard.get(row.card_id) ?? []
        list.push({
          id: row.id,
          titulo: row.titulo,
          concluida: row.concluida,
          data_vencimento: row.data_vencimento,
          responsavel_id: row.responsavel_id,
          responsavel_nome: row.profiles?.nome ?? null,
        })
        tarefasByCard.set(row.card_id, list)
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      return viagens.map((v) => {
        const row = v as unknown as {
          id: string
          card_id: string | null
          modo_cancelamento: ModoCancelamento
          cancelamento_aberto_em: string
          cancelamento_aberto_por: string | null
          profiles?: { nome?: string | null } | null
          cards?: { titulo?: string | null; produto_data?: Record<string, unknown> | null } | null
        }
        const tList = (row.card_id && tarefasByCard.get(row.card_id)) || []
        const total = tList.length
        const concluidas = tList.filter((t) => t.concluida === true).length
        const pendentesList = tList.filter((t) => t.concluida !== true)
        const pendentes = pendentesList.length
        const atrasadas = pendentesList.filter((t) => {
          if (!t.data_vencimento) return false
          const d = new Date(t.data_vencimento)
          return d < today
        }).length

        const proximas = [...pendentesList]
          .sort((a, b) => {
            const da = a.data_vencimento ? new Date(a.data_vencimento).getTime() : Number.MAX_SAFE_INTEGER
            const db = b.data_vencimento ? new Date(b.data_vencimento).getTime() : Number.MAX_SAFE_INTEGER
            return da - db
          })
          .slice(0, 2)
          .map((t) => ({
            id: t.id,
            titulo: t.titulo,
            responsavel_id: t.responsavel_id,
            responsavel_nome: t.responsavel_nome,
            data_vencimento: t.data_vencimento,
          }))

        // Embarque: tenta extrair de produto_data
        let embarque_em: string | null = null
        const pd = row.cards?.produto_data as
          | { data_exata_da_viagem?: { start?: string }; epoca_viagem?: { start?: string } }
          | null
          | undefined
        if (pd?.data_exata_da_viagem?.start) embarque_em = pd.data_exata_da_viagem.start
        else if (pd?.epoca_viagem?.start) embarque_em = pd.epoca_viagem.start

        return {
          viagem_id: row.id,
          card_id: row.card_id,
          card_titulo: row.cards?.titulo ?? null,
          modo_cancelamento: row.modo_cancelamento,
          cancelamento_aberto_em: row.cancelamento_aberto_em,
          cancelamento_aberto_por: row.cancelamento_aberto_por,
          aberto_por_nome: row.profiles?.nome ?? null,
          total_tarefas: total,
          concluidas,
          pendentes,
          atrasadas,
          embarque_em,
          proximas,
        }
      })
    },
    enabled: !!tpOwnerId && !!orgId,
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
}

function buildSummaryFromViagem(v: unknown): CancellationGhostSummary {
  const row = v as {
    id: string
    card_id: string | null
    modo_cancelamento: ModoCancelamento
    cancelamento_aberto_em: string
    cancelamento_aberto_por: string | null
    profiles?: { nome?: string | null } | null
    cards?: { titulo?: string | null } | null
  }
  return {
    viagem_id: row.id,
    card_id: row.card_id,
    card_titulo: row.cards?.titulo ?? null,
    modo_cancelamento: row.modo_cancelamento,
    cancelamento_aberto_em: row.cancelamento_aberto_em,
    cancelamento_aberto_por: row.cancelamento_aberto_por,
    aberto_por_nome: row.profiles?.nome ?? null,
    total_tarefas: 0,
    concluidas: 0,
    pendentes: 0,
    atrasadas: 0,
    embarque_em: null,
    proximas: [],
  }
}

// ============================================================
// Mutations (RPCs)
// ============================================================

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['cancelamento-state'] })
  queryClient.invalidateQueries({ queryKey: ['cancelamento-tasks'] })
  queryClient.invalidateQueries({ queryKey: ['cancelamento-ghosts'] })
  queryClient.invalidateQueries({ queryKey: ['viagem-interna'] })
  queryClient.invalidateQueries({ queryKey: ['cards'] })
}

export function useAbrirCancelamento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      viagemId: string
      modo: ModoCancelamento
      motivoId?: string | null
      obs?: string | null
    }) => {
      const { data, error } = await rpc('abrir_cancelamento', {
        p_viagem_id: input.viagemId,
        p_modo: input.modo,
        p_motivo_id: input.motivoId ?? null,
        p_obs: input.obs ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      invalidateAll(queryClient)
      toast.success('Cancelamento aberto')
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao abrir cancelamento')
    },
  })
}

export function useCancelarItemViagem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { itemId: string; motivo?: string | null }) => {
      const { data, error } = await rpc('cancelar_item_viagem', {
        p_item_id: input.itemId,
        p_motivo: input.motivo ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      invalidateAll(queryClient)
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar item')
    },
  })
}

export function useDescancelarItemViagem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await rpc('descancelar_item_viagem', {
        p_item_id: itemId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      invalidateAll(queryClient)
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao desfazer cancelamento do item')
    },
  })
}

export function useConcluirCancelamento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (viagemId: string) => {
      const { data, error } = await rpc('concluir_cancelamento', {
        p_viagem_id: viagemId,
      })
      if (error) throw error
      return data as { status: string; modo: string; card_movido: boolean }
    },
    onSuccess: (result) => {
      invalidateAll(queryClient)
      toast.success(
        result.card_movido
          ? 'Cancelamento concluído — card movido para Cancelada'
          : 'Cancelamento concluído',
      )
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao concluir cancelamento')
    },
  })
}

export function useReabrirCancelamento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (viagemId: string) => {
      const { data, error } = await rpc('reabrir_cancelamento', {
        p_viagem_id: viagemId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      invalidateAll(queryClient)
      toast.success('Cancelamento reaberto')
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao reabrir cancelamento')
    },
  })
}

// ============================================================
// useCancellationOverlayMap — mapa de cards com modo cancelamento ativo
// ============================================================
// Carrega TODAS as viagens da org em modo aberto numa só query (compartilhada
// via react-query cache). Cada KanbanCard consulta o Map sem custo extra.

export interface CancellationOverlayInfo {
  modo_cancelamento: ModoCancelamento
  cancelamento_aberto_em: string
  cancelamento_concluido_em: string | null
  total_tarefas_pendentes: number
}

export function useCancellationOverlayMap(orgId: string | undefined) {
  return useQuery({
    queryKey: ['cancelamento-overlay-map', orgId ?? 'none'],
    queryFn: async (): Promise<Map<string, CancellationOverlayInfo>> => {
      if (!orgId) return new Map()
      const { data, error } = await supabase
        .from('viagens')
        .select(
          'card_id, modo_cancelamento, cancelamento_aberto_em, cancelamento_concluido_em',
        )
        .eq('org_id', orgId)
        .not('modo_cancelamento', 'is', null)
        .is('cancelamento_concluido_em', null)
      if (error) throw error
      const map = new Map<string, CancellationOverlayInfo>()
      for (const row of data ?? []) {
        const r = row as {
          card_id: string | null
          modo_cancelamento: ModoCancelamento
          cancelamento_aberto_em: string
          cancelamento_concluido_em: string | null
        }
        if (!r.card_id) continue
        map.set(r.card_id, {
          modo_cancelamento: r.modo_cancelamento,
          cancelamento_aberto_em: r.cancelamento_aberto_em,
          cancelamento_concluido_em: r.cancelamento_concluido_em,
          total_tarefas_pendentes: 0, // TODO: agregação opcional via view
        })
      }
      return map
    },
    enabled: !!orgId,
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
}

/** Helper pra KanbanCard: dado um cardId + orgId, retorna o overlay info ou null. */
export function useCancellationOverlay(
  cardId: string | undefined,
  orgId: string | undefined,
): CancellationOverlayInfo | null {
  const { data: map } = useCancellationOverlayMap(orgId)
  if (!cardId || !map) return null
  return map.get(cardId) ?? null
}

// ============================================================
// useIncluirCanceladosToggle — preferência local de exibir cancelados no kanban
// ============================================================

const STORAGE_KEY = 'kanban-incluir-cancelados'

export function useIncluirCanceladosToggle(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  })
  const setter = (v: boolean) => {
    setValue(v)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, v ? 'true' : 'false')
    }
  }
  return [value, setter]
}

// ============================================================
// Helpers de label/cor
// ============================================================

export function modoCancelamentoLabel(m: ModoCancelamento): string {
  switch (m) {
    case 'total':
      return 'Total'
    case 'parcial':
      return 'Parcial'
    case 'mudanca_brusca':
      return 'Mudança'
  }
}

export function modoCancelamentoChip(m: ModoCancelamento): string {
  return `⚠ ${modoCancelamentoLabel(m).toUpperCase()}`
}

export function escopoFromModo(m: ModoCancelamento): EscopoMotivo {
  if (m === 'mudanca_brusca') return 'mudanca'
  return m
}

export function diasParaEmbarque(embarqueEm: string | null): number | null {
  if (!embarqueEm) return null
  const start = new Date(embarqueEm)
  start.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((start.getTime() - today.getTime()) / 86_400_000)
}

export function ghostBorderState(g: CancellationGhostSummary):
  | 'amber'
  | 'red'
  | 'green'
  | 'gray' {
  if (g.total_tarefas === 0) return 'gray'
  if (g.atrasadas > 0) return 'red'
  if (g.pendentes === 0 && g.total_tarefas > 0) return 'green'
  return 'amber'
}

// useMemo helper for consumers
export function useGhostBorderClass(g: CancellationGhostSummary): string {
  return useMemo(() => {
    const state = ghostBorderState(g)
    switch (state) {
      case 'red':
        return 'border-red-500 shadow-red-100'
      case 'green':
        return 'border-emerald-500 border-dashed'
      case 'gray':
        return 'border-slate-300'
      case 'amber':
      default:
        return 'border-amber-500 animate-pulse-slow'
    }
  }, [g])
}
