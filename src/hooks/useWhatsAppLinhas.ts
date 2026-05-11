/**
 * useWhatsAppLinhas — lista linhas WhatsApp ativas da org atual filtradas pelo
 * produto. Usado pelo builder de Automações para obrigar o usuário a escolher
 * explicitamente de qual linha a mensagem sai.
 *
 * Antes desse hook, o cadence-engine caía num fallback indeterminado (primeira
 * linha ativa que achasse) quando o builder não salvava phone_number_id —
 * resultado: em Trips, a automação poderia disparar por qualquer uma das 4
 * linhas, aleatoriamente. Sprint B tornou phone_number_id obrigatório.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface WhatsAppLinha {
  id: string
  phone_number_label: string
  phone_number_id: string | null
  ativo: boolean | null
  produto: string | null
  pipeline_id: string | null
  org_id: string
}

/**
 * Detecta se a linha é oficial Meta (phone_number_id puramente numérico) ou
 * não-oficial (UUID Echo/ChatPro).
 *
 * Linha oficial Meta + gatilho proativo → exige HSM aprovado (texto livre é
 * dropado fora da janela 24h com erro silencioso 131047 "Re-engagement").
 * Linha não-oficial → texto livre sempre aceito.
 *
 * Mantém em sincronia com `public.is_official_meta_phone(TEXT)` no banco.
 */
export function isOfficialMetaLine(phoneNumberId: string | null | undefined): boolean {
  if (!phoneNumberId) return false
  return /^\d+$/.test(phoneNumberId)
}

export function useWhatsAppLinhas(product: string | null | undefined) {
  return useQuery({
    queryKey: ['whatsapp-linhas-ativas', product ?? 'any'],
    queryFn: async (): Promise<WhatsAppLinha[]> => {
      let query = supabase
        .from('whatsapp_linha_config')
        .select('id, phone_number_label, phone_number_id, ativo, produto, pipeline_id, org_id')
        .eq('ativo', true)
        .not('phone_number_id', 'is', null)

      if (product) {
        query = query.or(`produto.eq.${product},produto.is.null`)
      }

      const { data, error } = await query.order('phone_number_label')
      if (error) throw error
      return (data ?? []) as WhatsAppLinha[]
    },
    staleTime: 60_000,
  })
}
