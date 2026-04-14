import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ScheduledJob {
  job_name: string
  label: string
  description: string | null
  category: string
  is_enabled: boolean
  frequency_label: string | null
  impact_tags: string[] | null
  last_toggled_at: string | null
  last_toggled_by: string | null
  cron_registered: boolean
  last_run_started_at: string | null
  last_run_status: string | null
}

const QUERY_KEY = ['scheduled-jobs']

export function useScheduledJobs() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('list_scheduled_jobs_with_status')
      if (error) throw error
      return (data || []) as ScheduledJob[]
    },
    refetchInterval: 30000,
  })

  const toggle = useMutation({
    mutationFn: async ({ jobName, isEnabled }: { jobName: string; isEnabled: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('scheduled_job_kill_switch')
        .update({ is_enabled: isEnabled })
        .eq('job_name', jobName)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const stopAll = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('emergency_stop_all_scheduled_jobs')
      if (error) throw error
      return data as number
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  return {
    jobs: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    toggle,
    stopAll,
  }
}
