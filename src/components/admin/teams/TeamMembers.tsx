import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUsers } from '../../../hooks/useUsers';
import { useTeams, type Team } from '../../../hooks/useTeams';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { useToast } from '../../../contexts/ToastContext';
import { Loader2, Search, Trash2, UserPlus, Shield } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar';
import { Badge } from '../../ui/Badge';
import { supabase } from '../../../lib/supabase';

interface TeamMembersProps {
    isOpen: boolean;
    onClose: () => void;
    team: Team | null;
}

export function TeamMembers({ isOpen, onClose, team }: TeamMembersProps) {
    const { users, refetch: refetchUsers } = useUsers();
    const { refetch: refetchTeams } = useTeams();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    // Resolve member IDs via team_members (cross-org) + fallback profile.team_id
    const { data: memberIds = [] } = useQuery({
        queryKey: ['team-member-ids', team?.id],
        enabled: !!team?.id && isOpen,
        queryFn: async () => {
            if (!team?.id) return [] as string[];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC types pendentes
            const { data, error } = await (supabase.rpc as any)('get_team_member_ids', {
                p_team_ids: [team.id],
            });
            if (error) throw error;
            return (data ?? []) as string[];
        },
    });

    if (!team) return null;

    const memberIdSet = new Set(memberIds);
    const teamMembers = users.filter(u => memberIdSet.has(u.id));
    // Candidatos: ativos e ainda não no time (qualquer time legacy)
    const availableUsers = users.filter(u => !memberIdSet.has(u.id));

    const filteredMembers = teamMembers.filter(member =>
        member.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleAddMember = async () => {
        if (!selectedUserId) return;
        setIsAdding(true);
        try {
            // Insere em team_members (source of truth cross-org)
            const { error: tmError } = await supabase
                .from('team_members')
                .upsert({ user_id: selectedUserId, team_id: team.id, role: 'member' }, { onConflict: 'user_id,team_id' });
            if (tmError) throw tmError;

            // Também atualiza profile.team_id se o usuário não tiver nenhum (legacy + role sync trigger)
            const user = users.find(u => u.id === selectedUserId);
            if (user && !user.team_id) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({ team_id: team.id })
                    .eq('id', selectedUserId);
                if (profileError) throw profileError;
            }

            toast({ title: 'Sucesso', description: 'Membro adicionado ao time.', type: 'success' });
            await refetchUsers();
            await refetchTeams();
            queryClient.invalidateQueries({ queryKey: ['team-member-ids', team.id] });
            setSelectedUserId('');
        } catch (error) {
            console.error('Error adding member:', error);
            toast({ title: 'Erro', description: 'Erro ao adicionar membro.', type: 'error' });
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        try {
            // Remove de team_members
            const { error: tmError } = await supabase
                .from('team_members')
                .delete()
                .eq('user_id', userId)
                .eq('team_id', team.id);
            if (tmError) throw tmError;

            // Se profile.team_id apontava para este time, limpa
            const user = users.find(u => u.id === userId);
            if (user?.team_id === team.id) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({ team_id: null })
                    .eq('id', userId);
                if (profileError) throw profileError;
            }

            toast({ title: 'Sucesso', description: 'Membro removido do time.', type: 'success' });
            await refetchUsers();
            await refetchTeams();
            queryClient.invalidateQueries({ queryKey: ['team-member-ids', team.id] });
        } catch (error) {
            console.error('Error removing member:', error);
            toast({ title: 'Erro', description: 'Erro ao remover membro.', type: 'error' });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${team.color.split(' ')[0]}`} />
                        Membros do Time: {team.name}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4 flex-1 overflow-hidden">
                    {/* Add Member Section */}
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-3">
                        <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                            <UserPlus className="w-4 h-4" />
                            Adicionar Membro
                        </h4>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <Select
                                    value={selectedUserId}
                                    onChange={setSelectedUserId}
                                    options={availableUsers.map(u => ({
                                        value: u.id,
                                        label: u.nome
                                    }))}
                                    placeholder="Selecione um usuário..."
                                />
                            </div>
                            <Button
                                onClick={handleAddMember}
                                disabled={!selectedUserId || isAdding}
                                size="sm"
                            >
                                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                            </Button>
                        </div>
                    </div>

                    {/* Members List */}
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar membros..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                            {filteredMembers.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    Nenhum membro encontrado neste time.
                                </div>
                            ) : (
                                filteredMembers.map(member => (
                                    <div
                                        key={member.id}
                                        className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg hover:border-slate-200 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-9 w-9">
                                                <AvatarImage src={member.avatar_url || undefined} />
                                                <AvatarFallback>{member.nome?.substring(0, 2).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-medium text-slate-900">{member.nome}</p>
                                                <p className="text-xs text-slate-500">{member.email}</p>
                                            </div>
                                            {member.id === team.leader_id && (
                                                <Badge variant="secondary" className="ml-2 text-xs">
                                                    <Shield className="w-3 h-3 mr-1" />
                                                    Líder
                                                </Badge>
                                            )}
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveMember(member.id)}
                                            className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                                            title="Remover do time"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
