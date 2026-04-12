/**
 * useAutomations — hook unificado do hub de Automações.
 *
 * Junta duas fontes em uma lista única:
 *   - cadence_event_triggers (gatilho + 1 ação: create_task | send_message | change_stage | start_cadence)
 *   - cadence_templates (cadências complexas com múltiplos steps)
 *
 * Cada item da lista é um "AutomationItem" com source + action_type, pra que o hub renderize
 * um único componente e o gestor não precise pensar em "cadência vs trigger".
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ActionType, EventType } from '../lib/automation-recipes'

export type AutomationSource = 'trigger' | 'cadence_template'

export interface AutomationItem {
  /** id único — prefixado com source para evitar colisão */
  uid: string
  id: string
  source: AutomationSource
  name: string
  description: string | null
  is_active: boolean
  event_type: EventType | string | null
  action_type: ActionType | 'cadence_steps'
  /** Apenas se source=cadence_template: quantidade de steps */
  steps_count?: number
  /** Instâncias ativas ou contagem de disparos */
  stats: {
    active_instances?: number
    completed_instances?: number
    triggered_count?: number
  }
  created_at: string
  updated_at: string | null
}

export function useAutomations() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['automations-hub'],
    queryFn: async (): Promise<AutomationItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas não tipadas
      const sb = supabase as any

      const [triggersRes, templatesRes, instancesRes, entryLogsRes] = await Promise.all([
        sb
          .from('cadence_event_triggers')
          .select('id, name, event_type, action_type, is_active, created_at, updated_at, target_template_id, action_config')
          .order('created_at', { ascending: false }),
        sb
          .from('cadence_templates')
          .select('id, name, description, is_active, created_at, updated_at')
          .order('created_at', { ascending: false }),
        sb.from('cadence_instances').select('template_id, status'),
        sb
          .from('cadence_event_log')
          .select('event_data, created_at')
          .in('event_type', ['entry_rule_triggered', 'entry_rule_task_created', 'entry_rule_message_sent', 'entry_rule_stage_changed'])
          .gte('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
      ])

      if (triggersRes.error) throw triggersRes.error
      if (templatesRes.error) throw templatesRes.error

      // Contar instâncias por template
      const instByTemplate = new Map<string, { active: number; completed: number }>()
      for (const inst of instancesRes.data || []) {
        const prev = instByTemplate.get(inst.template_id) || { active: 0, completed: 0 }
        if (['active', 'waiting_task', 'paused'].includes(inst.status)) prev.active++
        else if (inst.status === 'completed') prev.completed++
        instByTemplate.set(inst.template_id, prev)
      }

      // Contar disparos por trigger (7d)
      const firedByTrigger = new Map<string, number>()
      for (const log of entryLogsRes.data || []) {
        const tid = log.event_data?.trigger_id
        if (tid) firedByTrigger.set(tid, (firedByTrigger.get(tid) || 0) + 1)
      }

      // Cadência que foi consumida por um trigger (action=start_cadence) NÃO deve
      // aparecer como item separado — ela vira "detalhe" do trigger. Pra isso,
      // coletamos os target_template_id dos triggers.
      const consumedTemplateIds = new Set<string>(
        (triggersRes.data || [])
          .filter((t: { action_type: string; target_template_id: string | null }) => t.action_type === 'start_cadence' && t.target_template_id)
          .map((t: { target_template_id: string }) => t.target_template_id)
      )

      const triggers: AutomationItem[] = (triggersRes.data || []).map((t: {
        id: string; name: string | null; event_type: string; action_type: string;
        is_active: boolean; created_at: string; updated_at: string | null;
      }) => ({
        uid: `trigger:${t.id}`,
        id: t.id,
        source: 'trigger' as const,
        name: t.name || '(sem nome)',
        description: null,
        is_active: t.is_active,
        event_type: t.event_type,
        action_type: t.action_type as ActionType,
        stats: { triggered_count: firedByTrigger.get(t.id) || 0 },
        created_at: t.created_at,
        updated_at: t.updated_at,
      }))

      const templates: AutomationItem[] = (templatesRes.data || [])
        .filter((tpl: { id: string }) => !consumedTemplateIds.has(tpl.id))
        .map((tpl: {
          id: string; name: string; description: string | null; is_active: boolean;
          created_at: string; updated_at: string | null;
        }) => {
          const counts = instByTemplate.get(tpl.id) || { active: 0, completed: 0 }
          return {
            uid: `cadence_template:${tpl.id}`,
            id: tpl.id,
            source: 'cadence_template' as const,
            name: tpl.name,
            description: tpl.description,
            is_active: tpl.is_active,
            event_type: null,
            action_type: 'cadence_steps' as const,
            stats: {
              active_instances: counts.active,
              completed_instances: counts.completed,
            },
            created_at: tpl.created_at,
            updated_at: tpl.updated_at,
          }
        })

      return [...triggers, ...templates].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    },
  })

  const toggleActive = useMutation({
    mutationFn: async ({ item, active }: { item: AutomationItem; active: boolean }) => {
      const table = item.source === 'trigger' ? 'cadence_event_triggers' : 'cadence_templates'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from(table)
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations-hub'] }),
  })

  const remove = useMutation({
    mutationFn: async (item: AutomationItem) => {
      const table = item.source === 'trigger' ? 'cadence_event_triggers' : 'cadence_templates'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from(table).delete().eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations-hub'] }),
  })

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    toggleActive,
    remove,
  }
}
