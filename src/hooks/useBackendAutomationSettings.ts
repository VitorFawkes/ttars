import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { toast } from 'sonner'

/**
 * Config por workspace de uma automação de backend editável
 * (tabela backend_automation_settings). `config` é um JSON livre cujo formato
 * depende de cada automação.
 */
export interface BackendAutomationSetting {
  is_active: boolean
  config: Record<string, unknown>
}

// A tabela backend_automation_settings é nova. Os tipos gerados em
// src/database.types.ts estão defasados e regenerá-los traria um diff enorme de
// drift não relacionado. Acesso contido e tipado manualmente aqui (sem `any`).
interface UntypedFilter {
  eq: (col: string, val: unknown) => UntypedFilter
  maybeSingle: () => Promise<{
    data: BackendAutomationSetting | null
    error: { message: string } | null
  }>
}
interface UntypedTable {
  select: (cols: string) => UntypedFilter
  upsert: (
    row: Record<string, unknown>,
    opts?: { onConflict?: string }
  ) => Promise<{ error: { message: string } | null }>
}
const settingsTable = (): UntypedTable =>
  (supabase as unknown as { from: (t: string) => UntypedTable }).from(
    'backend_automation_settings'
  )

/** Lê a config da automação no workspace ativo. `null` = sem linha (usa defaults). */
export function useBackendAutomationSetting(automationId: string) {
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useQuery({
    queryKey: ['backend-automation-setting', activeOrgId, automationId],
    queryFn: async (): Promise<BackendAutomationSetting | null> => {
      if (!activeOrgId) return null
      const { data, error } = await settingsTable()
        .select('is_active, config')
        .eq('org_id', activeOrgId)
        .eq('automation_id', automationId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    enabled: !!activeOrgId,
  })
}

/**
 * Liga/desliga e/ou atualiza os parâmetros da automação no workspace ativo.
 * Faz upsert por (org_id, automation_id). RLS garante que só o workspace dono grava.
 */
export function useSaveBackendAutomationSetting(automationId: string) {
  const queryClient = useQueryClient()
  const { org } = useOrg()
  const activeOrgId = org?.id

  return useMutation({
    mutationFn: async (patch: {
      is_active?: boolean
      config?: Record<string, unknown>
    }) => {
      if (!activeOrgId) throw new Error('Sem workspace ativo')
      const { error } = await settingsTable().upsert(
        {
          org_id: activeOrgId,
          automation_id: automationId,
          ...patch,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,automation_id' }
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success('Automação atualizada')
      queryClient.invalidateQueries({
        queryKey: ['backend-automation-setting', activeOrgId, automationId],
      })
    },
    onError: (e: Error) => toast.error(`Erro ao salvar: ${e.message}`),
  })
}
