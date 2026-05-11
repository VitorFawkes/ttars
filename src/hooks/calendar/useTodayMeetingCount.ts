import { useQuery } from '@tanstack/react-query'
import { startOfDay, endOfDay } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export function useTodayMeetingCount() {
    const { profile } = useAuth()

    return useQuery({
        queryKey: ['today-meeting-count', profile?.id],
        queryFn: async () => {
            const now = new Date()
            const { count, error } = await supabase
                .from('tarefas')
                .select('id', { count: 'exact', head: true })
                .eq('tipo', 'reuniao')
                .eq('responsavel_id', profile!.id)
                .gte('data_vencimento', startOfDay(now).toISOString())
                .lte('data_vencimento', endOfDay(now).toISOString())
                .is('deleted_at', null)
                .eq('concluida', false)

            if (error) throw error
            return count || 0
        },
        staleTime: 1000 * 60, // 1 min
        enabled: !!profile?.id,
    })
}
