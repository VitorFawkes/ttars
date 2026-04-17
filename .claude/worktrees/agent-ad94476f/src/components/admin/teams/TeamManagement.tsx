import { useState } from 'react';
import { useTeams } from '../../../hooks/useTeams';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '../../ui/Table';
import {
    Loader2,
    Plus,
    Search,
    Edit2,
    Trash2,
    Users,
    Briefcase,
    UserPlus
} from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { AddTeamModal } from './AddTeamModal';
import { EditTeamModal } from './EditTeamModal';
import { TeamMembers } from './TeamMembers';
import { useToast } from '../../../contexts/ToastContext';

export function TeamManagement() {
    const { teams, isLoading, deleteTeam } = useTeams();
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editingTeam, setEditingTeam] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [managingMembersTeam, setManagingMembersTeam] = useState<any>(null);
    const { toast } = useToast();

    const filteredTeams = teams?.filter(team =>
        team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este time?')) return;
        try {
            await deleteTeam.mutateAsync(id);
            toast({ title: 'Sucesso', description: 'Time excluído com sucesso.', type: 'success' });
        } catch (error) {
            console.error('Error deleting team:', error);
            toast({ title: 'Erro', description: 'Erro ao excluir time.', type: 'error' });
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar times..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Novo Time
                </Button>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Fase Pipeline</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Membros</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : filteredTeams?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    Nenhum time encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredTeams?.map(team => (
                                <TableRow key={team.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className={`p-2 rounded-lg ${team.color || 'bg-slate-100 text-slate-600'}`}>
                                                <Briefcase className="w-4 h-4" />
                                            </div>
                                            <span className="font-medium text-foreground">{team.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {team.phase ? (
                                            <Badge className={`${team.phase.color} text-white text-xs`}>
                                                {team.phase.name}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {team.description || '-'}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 text-muted-foreground">
                                            <Users className="w-4 h-4" />
                                            <span>{team.member_count || 0}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            className={team.is_active ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-slate-500/10 text-slate-600 border-slate-500/20'}
                                        >
                                            {team.is_active ? 'Ativo' : 'Inativo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setManagingMembersTeam(team)}
                                                className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                title="Gerenciar Membros"
                                            >
                                                <UserPlus className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setEditingTeam(team)}
                                                className="text-muted-foreground hover:text-foreground"
                                                title="Editar Time"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(team.id)}
                                                className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                disabled={(team.member_count ?? 0) > 0}
                                                title={(team.member_count ?? 0) > 0 ? 'Não é possível excluir times com membros' : 'Excluir time'}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <AddTeamModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />

            <EditTeamModal
                isOpen={!!editingTeam}
                onClose={() => setEditingTeam(null)}
                team={editingTeam}
            />

            <TeamMembers
                isOpen={!!managingMembersTeam}
                onClose={() => setManagingMembersTeam(null)}
                team={managingMembersTeam}
            />
        </div>
    );
}
