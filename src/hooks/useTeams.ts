import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useOrg } from '@/contexts/OrgContext';

export interface Team {
    id: string;
    name: string;
    description: string | null;
    department_id: string | null;
    phase_id: string | null;
    is_active: boolean;
    color: string;
    leader_id: string | null;
    created_at: string;
    updated_at: string;
    department?: {
        id: string;
        name: string;
    } | null;
    leader?: {
        id: string;
        nome: string;
        email: string;
    } | null;
    phase?: {
        id: string;
        name: string;
        slug: string | null;
        color: string;
        order_index: number;
    } | null;
    member_count?: number;
}

export interface CreateTeamData {
    name: string;
    description?: string;
    department_id?: string;
    phase_id?: string;
    color?: string;
    leader_id?: string;
}

export interface UpdateTeamData extends Partial<CreateTeamData> {
    id: string;
    is_active?: boolean;
}

/**
 * Hook for fetching and managing teams from the database
 */
export function useTeams() {
    const queryClient = useQueryClient();
    const { org } = useOrg();
    const activeOrgId = org?.id;

    const teamsQuery = useQuery({
        queryKey: ['teams', activeOrgId],
        queryFn: async () => {
            if (!activeOrgId) return [];
            const { data, error } = await supabase
                .from('teams')
                .select(`
                    *,
                    department:departments(id, name),
                    leader:profiles!teams_leader_id_fkey(id, nome, email),
                    phase:pipeline_phases(id, name, slug, color, order_index)
                `)
                .eq('org_id', activeOrgId)
                .order('name');

            if (error) throw error;
            return data as Team[];
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        enabled: !!activeOrgId,
    });

    const teamsWithCountQuery = useQuery({
        queryKey: ['teams', 'with-count', activeOrgId],
        queryFn: async () => {
            if (!activeOrgId) return [];
            // Get teams with member counts — isolado por workspace
            const { data: teams, error: teamsError } = await supabase
                .from('teams')
                .select(`
                    *,
                    department:departments(id, name),
                    leader:profiles!teams_leader_id_fkey(id, nome, email),
                    phase:pipeline_phases(id, name, slug, color, order_index)
                `)
                .eq('org_id', activeOrgId)
                .order('name');

            if (teamsError) throw teamsError;

            // Conta membros via org_members do workspace (não profiles.org_id, que aponta
            // pra account pai no multi-tenant). Ver memory/feedback_multi_tenant_org_members.md
            const { data: members, error: membersErr } = await supabase
                .from('org_members')
                .select('user_id, profiles!inner(team_id)')
                .eq('org_id', activeOrgId);

            if (membersErr) throw membersErr;

            const countMap: Record<string, number> = {};
            type MemberRow = { user_id: string; profiles: { team_id: string | null } | null }
            for (const m of (members as unknown as MemberRow[]) || []) {
                const teamId = m.profiles?.team_id
                if (teamId) countMap[teamId] = (countMap[teamId] || 0) + 1
            }

            return (teams as Team[]).map(t => ({
                ...t,
                member_count: countMap[t.id] || 0,
            }));
        },
        staleTime: 2 * 60 * 1000,
        enabled: !!activeOrgId,
    });

    const createTeam = useMutation({
        mutationFn: async (data: CreateTeamData) => {
            if (!activeOrgId) throw new Error('Workspace ativo não encontrado');
            const { data: result, error } = await supabase
                .from('teams')
                .insert({
                    org_id: activeOrgId,
                    name: data.name,
                    description: data.description || null,
                    department_id: data.department_id || null,
                    phase_id: data.phase_id || null,
                    color: data.color || 'bg-blue-100 text-blue-800',
                    leader_id: data.leader_id || null,
                    is_active: true,
                })
                .select()
                .single();

            if (error) throw error;
            return result as Team;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teams'] });
        },
    });

    const updateTeam = useMutation({
        mutationFn: async ({ id, ...data }: UpdateTeamData) => {
            const updates: Record<string, unknown> = {};
            if (data.name !== undefined) updates.name = data.name;
            if (data.description !== undefined) updates.description = data.description;
            if (data.department_id !== undefined) updates.department_id = data.department_id || null;
            if (data.phase_id !== undefined) updates.phase_id = data.phase_id || null;
            if (data.color !== undefined) updates.color = data.color;
            if (data.leader_id !== undefined) updates.leader_id = data.leader_id || null;
            if (data.is_active !== undefined) updates.is_active = data.is_active;

            const { data: result, error } = await supabase
                .from('teams')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return result as Team;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teams'] });
        },
    });

    const deleteTeam = useMutation({
        mutationFn: async (id: string) => {
            // Soft delete by setting is_active = false
            const { error } = await supabase
                .from('teams')
                .update({ is_active: false })
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teams'] });
        },
    });

    return {
        teams: teamsQuery.data || [],
        teamsWithCount: teamsWithCountQuery.data || [],
        isLoading: teamsQuery.isLoading,
        isLoadingWithCount: teamsWithCountQuery.isLoading,
        isError: teamsQuery.isError,
        error: teamsQuery.error,
        refetch: teamsQuery.refetch,
        createTeam,
        updateTeam,
        deleteTeam,
    };
}

/**
 * Hook for getting team options formatted for Select components
 */
export function useTeamOptions(includeNone = true) {
    const { teams, isLoading } = useTeams();

    const activeTeams = teams.filter(t => t.is_active !== false);

    const options = [
        ...(includeNone ? [{ value: 'none', label: 'Sem Time Definido' }] : []),
        ...activeTeams.map(team => ({
            value: team.id,
            label: team.name,
            description: team.department?.name,
        })),
    ];

    return { options, isLoading };
}
