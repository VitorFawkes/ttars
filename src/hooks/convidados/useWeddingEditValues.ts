import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'

export interface WeddingEditValues {
  titulo: string
  data_viagem_inicio: string | null
  ww_local: string | null
  ww_data_final_acao: string | null
  ww_link_atendimento: string | null
  ww_site_casamento: string | null
}

interface Row {
  titulo: string
  data_viagem_inicio: string | null
  produto_data: Record<string, unknown> | null
}

function readString(data: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!data) return null
  for (const k of keys) {
    const v = data[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

/** Carrega os valores brutos do card de casamento prontos para popular o
 *  formulário de edição. Lê inclusive aliases legados (`local`, `site_casamento`)
 *  para que o input apareça preenchido mesmo em cards antigos. */
export function useWeddingEditValues(cardId: string | null | undefined, options?: { enabled?: boolean }) {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const enabled = (options?.enabled ?? true) && !!orgId && !!cardId

  return useQuery<WeddingEditValues | null>({
    queryKey: ['convidados', 'wedding-edit', orgId, cardId],
    enabled,
    queryFn: async () => {
      if (!orgId || !cardId) return null
      const { data, error } = await sbAny
        .from('cards')
        .select('titulo, data_viagem_inicio, produto_data')
        .eq('id', cardId)
        .eq('org_id', orgId)
        .eq('produto', 'WEDDING')
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as Row
      return {
        titulo: row.titulo,
        data_viagem_inicio: row.data_viagem_inicio,
        ww_local: readString(row.produto_data, 'ww_local', 'local_casamento', 'local', 'venue'),
        ww_data_final_acao: readString(row.produto_data, 'ww_data_final_acao'),
        ww_link_atendimento: readString(row.produto_data, 'ww_link_atendimento'),
        ww_site_casamento: readString(row.produto_data, 'ww_site_casamento', 'ww_site', 'site_casamento', 'site_url', 'website'),
      }
    },
  })
}
