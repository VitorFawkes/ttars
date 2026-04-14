import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface TemplateUsage {
  trigger_id: string
  trigger_name: string | null
  template_id: string
  cadence_template_id: string | null
  cadence_template_nome: string | null
  is_active: boolean
}

/**
 * Retorna mapa templateId -> array de automações que referenciam o template.
 * Inspeciona action_config.template_id e action_config.message_template_id de cadence_event_triggers.
 */
export function useTemplateUsagesMap() {
  return useQuery({
    queryKey: ['template-usages-map'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cadence_event_triggers')
        .select(`
          id, name, action_config, is_active, template_id,
          cadence_templates(id, nome)
        `)
      if (error) throw error

      const map = new Map<string, TemplateUsage[]>()
      for (const t of (data || [])) {
        const cfg = t.action_config as Record<string, unknown> | null
        if (!cfg) continue
        const tplId = (cfg.template_id || cfg.message_template_id) as string | undefined
        if (!tplId) continue
        const usage: TemplateUsage = {
          trigger_id: t.id,
          trigger_name: t.name,
          template_id: tplId,
          cadence_template_id: t.cadence_templates?.id ?? null,
          cadence_template_nome: t.cadence_templates?.nome ?? null,
          is_active: t.is_active,
        }
        if (!map.has(tplId)) map.set(tplId, [])
        map.get(tplId)!.push(usage)
      }
      return map
    },
  })
}
