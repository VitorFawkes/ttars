/**
 * useWhatsAppTemplates — lista templates HSM aprovados pela Meta, consumindo a
 * action `list_wa_templates` do edge function `cadence-engine`.
 *
 * Usado pelo builder de Automações quando o gatilho é proativo (card_created,
 * dias_antes_viagem, etc.) — nesses casos, texto livre pode ser dropado pelo
 * WhatsApp se estiver fora da janela 24h, e o jeito confiável é HSM.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface WhatsAppTemplateComponent {
  type: 'BODY' | 'HEADER' | 'FOOTER' | 'BUTTONS'
  text?: string
  format?: string
  buttons?: Array<{ type: string; text: string; url?: string }>
  example?: { body_text?: string[][] }
}

export interface WhatsAppTemplate {
  name: string
  language: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | string
  parameter_format: 'POSITIONAL' | 'NAMED' | string
  components: WhatsAppTemplateComponent[]
  id?: string
}

/**
 * Extrai texto do BODY e conta quantos parâmetros posicionais ({{1}}, {{2}}, …)
 * o template espera. Fundamental para renderizar o picker e validar.
 */
export function parseTemplateBody(template: WhatsAppTemplate): {
  bodyText: string
  paramCount: number
  paramLabels: string[]
  hasButtons: boolean
} {
  const body = template.components.find((c) => c.type === 'BODY')
  const bodyText = body?.text || ''
  // Matches {{1}}, {{2}}, etc. — usa Set para desduplicar
  const matches = bodyText.match(/\{\{\s*(\d+)\s*\}\}/g) || []
  const uniqueIndices = new Set(matches.map((m) => m.replace(/[^0-9]/g, '')))
  const paramCount = uniqueIndices.size
  // Labels vindo do example (se Meta forneceu)
  const exampleRow = body?.example?.body_text?.[0]
  const paramLabels = Array.from({ length: paramCount }, (_, i) => exampleRow?.[i] || `Parâmetro ${i + 1}`)
  const hasButtons = template.components.some((c) => c.type === 'BUTTONS')
  return { bodyText, paramCount, paramLabels, hasButtons }
}

export function useWhatsAppTemplates(phoneNumberId: string | null | undefined) {
  return useQuery({
    queryKey: ['wa-templates', phoneNumberId || 'default'],
    queryFn: async (): Promise<WhatsAppTemplate[]> => {
      const { data, error } = await supabase.functions.invoke('cadence-engine', {
        body: { action: 'list_wa_templates', phone_number_id: phoneNumberId || undefined },
      })
      if (error) throw error
      const list: WhatsAppTemplate[] = data?.templates || []
      // Só templates aprovados e em pt_BR (ordenado por uso comum: MARKETING primeiro)
      return list
        .filter((t) => t.status === 'APPROVED')
        .sort((a, b) => {
          if (a.category === b.category) return a.name.localeCompare(b.name)
          return a.category === 'MARKETING' ? -1 : 1
        })
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5 min — templates mudam pouco
  })
}
