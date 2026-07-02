import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import type { DefaultAttachment } from './types'

// Catálogo de anexos-PADRÃO do casamento (wedding_default_attachments): a lista
// do que todo casamento deve ter anexado (contrato, comprovante do sinal, etc.),
// editável pela equipe direto na tela. Per-workspace: RLS + filtro org_id.

export function useWeddingDefaultAttachments() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const queryClient = useQueryClient()

  const query = useQuery<DefaultAttachment[]>({
    queryKey: ['planejamento', 'default-attachments', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await sbAny
        .from('wedding_default_attachments')
        .select('id, slot_key, titulo, descricao, obrigatorio, ordem, ativo')
        .eq('org_id', orgId)
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? []) as DefaultAttachment[]
    },
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['planejamento', 'default-attachments', orgId] })

  const add = useMutation<void, Error, { titulo: string; descricao?: string | null; obrigatorio: boolean }>({
    mutationFn: async ({ titulo, descricao, obrigatorio }) => {
      if (!orgId) throw new Error('Workspace não identificado.')
      const slotKey = titulo
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || `slot_${Date.now()}`
      const ordem = (query.data ?? []).reduce((max, d) => Math.max(max, d.ordem), 0) + 1
      const { error } = await sbAny.from('wedding_default_attachments').insert({
        org_id: orgId,
        slot_key: slotKey,
        titulo: titulo.trim(),
        descricao: descricao?.trim() || null,
        obrigatorio,
        ordem,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Anexo padrão adicionado.')
    },
    onError: (err) => toast.error(`Não consegui adicionar: ${err.message}`),
  })

  const update = useMutation<void, Error, Pick<DefaultAttachment, 'id' | 'titulo' | 'descricao' | 'obrigatorio' | 'ativo'>>({
    mutationFn: async ({ id, ...rest }) => {
      const { error } = await sbAny
        .from('wedding_default_attachments')
        .update(rest)
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => { await invalidate() },
    onError: (err) => toast.error(`Não consegui salvar: ${err.message}`),
  })

  const remove = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await sbAny
        .from('wedding_default_attachments')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Anexo padrão removido.')
    },
    onError: (err) => toast.error(`Não consegui remover: ${err.message}`),
  })

  return {
    defaults: (query.data ?? []).filter((d) => d.ativo),
    all: query.data ?? [],
    isLoading: query.isLoading,
    add,
    update,
    remove,
  }
}
