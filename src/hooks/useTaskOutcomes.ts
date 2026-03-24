import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/** Fetch all task type outcomes */
export function useTaskOutcomes() {
    return useQuery({
        queryKey: ['task-outcomes'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('task_type_outcomes')
                .select('*')
                .order('ordem')
            if (error) throw error
            return data
        },
        staleTime: 1000 * 60 * 10,
    })
}

/** Returns the set of task tipos that have outcomes */
export function useTaskTypesWithOutcomes(): Set<string> {
    const { data: outcomes } = useTaskOutcomes()
    if (!outcomes) return new Set()
    return new Set(outcomes.map(o => o.tipo))
}
