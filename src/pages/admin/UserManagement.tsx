import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '../../components/ui/Table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../contexts/ToastContext';
import { Loader2, Search, Edit2, Trash2, Shield, Users, FileText, Mail, Key, Briefcase, Plane, Heart, Building2, ChevronUp, ChevronDown, ChevronsUpDown, KeyRound, Copy, Check, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';

const PRODUCT_BADGES: Record<string, { label: string; icon: React.ElementType; className: string }> = {
    TRIPS:   { label: 'Trips',   icon: Plane,     className: 'bg-teal-50 text-teal-700 border border-teal-200' },
    WEDDING: { label: 'Wedding', icon: Heart,     className: 'bg-rose-50 text-rose-700 border border-rose-200' },
    CORP:    { label: 'Corp',    icon: Building2, className: 'bg-purple-50 text-purple-700 border border-purple-200' },
};
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../../components/ui/dialog';
import { useAuth } from '../../contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { AddUserModal } from '../../components/admin/users/AddUserModal';
import { EditUserModal } from '../../components/admin/users/EditUserModal';
import InviteManager from '../../components/admin/users/InviteManager';
import AuditLogViewer from '../../components/admin/audit/AuditLogViewer';
import { RoleManagement } from '../../components/admin/roles/RoleManagement';
import { TeamManagement } from '../../components/admin/teams/TeamManagement';
import { useRoles } from '../../hooks/useRoles';
import { useUsers } from '../../hooks/useUsers';
import { useOrg } from '../../contexts/OrgContext';

export default function UserManagement() {
    const { profile } = useAuth();
    const { org } = useOrg();
    const activeOrgId = org?.id;
    const { toast } = useToast();
    const { users, isLoading: loading, refetch: refetchUsers, toggleUserStatus, deleteUser, resetPassword } = useUsers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [teams, setTeams] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    type SortColumn = 'nome' | 'role' | 'team' | 'produtos' | 'status';
    const [sortConfig, setSortConfig] = useState<{ column: SortColumn; direction: 'asc' | 'desc' }>({ column: 'nome', direction: 'asc' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<string | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [userToReset, setUserToReset] = useState<any>(null);
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [copied, setCopied] = useState(false);

    // Get roles for display
    const { roles } = useRoles();

    useEffect(() => {
        fetchTeams();
    }, [activeOrgId]);

    const fetchTeams = async () => {
        if (!activeOrgId) {
            setTeams([]);
            return;
        }
        try {
            const { data, error } = await supabase
                .from('teams')
                .select('*')
                .eq('org_id', activeOrgId);
            if (error) throw error;
            setTeams(data || []);
        } catch (error) {
            console.error('Error fetching teams:', error);
        }
    };

    const handleToggleTeamsNotify = async (userId: string, currentValue: boolean) => {
        try {
            // teams_notify_enabled ainda não está no database.types.ts
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
                .from('profiles')
                .update({ teams_notify_enabled: !currentValue })
                .eq('id', userId);
            if (error) throw error;
            refetchUsers();
            toast({ title: 'Sucesso', description: `Notificações Teams ${!currentValue ? 'ativadas' : 'desativadas'}.`, type: 'success' });
        } catch (error) {
            console.error('Error toggling teams notify:', error);
            toast({ title: 'Erro', description: 'Falha ao atualizar notificações Teams.', type: 'error' });
        }
    };

    const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
        try {
            await toggleUserStatus.mutateAsync({ userId, currentStatus });
            toast({ title: 'Sucesso', description: 'Status do usuário atualizado.', type: 'success' });
        } catch (error) {
            console.error('Error toggling status:', error);
            toast({ title: 'Erro', description: 'Falha ao atualizar status.', type: 'error' });
        }
    };

    const handleDeleteUser = async (userId: string) => {
        try {
            await deleteUser.mutateAsync(userId);
            toast({ title: 'Sucesso', description: 'Usuário excluído com sucesso.', type: 'success' });
            setUserToDelete(null);
        } catch (error) {
            console.error('Error deleting user:', error);
            toast({ title: 'Erro', description: 'Falha ao excluir usuário.', type: 'error' });
        }
    };

    const generatePassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        return Array.from(crypto.getRandomValues(new Uint8Array(12)))
            .map(b => chars[b % chars.length]).join('');
    };

    const handleResetPassword = async () => {
        if (!userToReset) return;
        setIsResetting(true);
        try {
            const newPassword = generatePassword();
            await resetPassword.mutateAsync({ userId: userToReset.id, newPassword });
            setUserToReset(null);
            setGeneratedPassword(newPassword);
        } catch (error) {
            console.error('Error resetting password:', error);
            toast({ title: 'Erro', description: 'Falha ao resetar senha.', type: 'error' });
            setUserToReset(null);
        } finally {
            setIsResetting(false);
        }
    };

    const handleCopyPassword = async () => {
        if (!generatedPassword) return;
        await navigator.clipboard.writeText(generatedPassword);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const toggleSort = (column: SortColumn) => {
        setSortConfig(prev =>
            prev.column === column
                ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                : { column, direction: 'asc' }
        );
    };

    const SortIcon = ({ column }: { column: SortColumn }) => {
        if (sortConfig.column !== column) return <ChevronsUpDown className="w-3.5 h-3.5 ml-1 text-slate-400" />;
        return sortConfig.direction === 'asc'
            ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-indigo-600" />
            : <ChevronDown className="w-3.5 h-3.5 ml-1 text-indigo-600" />;
    };

    const filteredUsers = users
        .filter(user =>
            user.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => {
            const dir = sortConfig.direction === 'asc' ? 1 : -1;
            switch (sortConfig.column) {
                case 'nome':
                    return dir * (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
                case 'role': {
                    const ra = getRoleDisplay(a).name;
                    const rb = getRoleDisplay(b).name;
                    return dir * ra.localeCompare(rb, 'pt-BR');
                }
                case 'team':
                    return dir * (a.teams?.name || '').localeCompare(b.teams?.name || '', 'pt-BR');
                case 'produtos': {
                    const pa = a.produtos?.[0] || '';
                    const pb = b.produtos?.[0] || '';
                    return dir * pa.localeCompare(pb, 'pt-BR');
                }
                case 'status':
                    return dir * (Number(b.active) - Number(a.active));
                default:
                    return 0;
            }
        });

    // Helper to get role display name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user shape varies between fetched profiles
    const getRoleDisplay = (user: any) => {
        // First try new role_id
        if (user.role_id) {
            const role = roles.find(r => r.id === user.role_id);
            if (role) return { name: role.display_name, color: role.color };
        }
        // Fallback to legacy role enum
        if (user.role) {
            return { name: user.role, color: 'bg-gray-100 text-gray-800' };
        }
        return { name: '-', color: 'bg-gray-100 text-gray-800' };
    };

    if (profile?.is_admin !== true) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="text-center">
                    <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">Acesso Restrito</h2>
                    <p className="text-gray-500">Você não tem permissão para acessar esta página.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-foreground">Gestão de Equipe</h2>
                <p className="text-muted-foreground">Gerencie usuários, roles, convites e auditoria.</p>
            </div>

            <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full grid-cols-5 lg:w-[800px] mb-8">
                    <TabsTrigger value="users" className="gap-2">
                        <Users className="w-4 h-4" />
                        Usuários
                    </TabsTrigger>
                    <TabsTrigger value="roles" className="gap-2">
                        <Key className="w-4 h-4" />
                        Roles
                    </TabsTrigger>
                    <TabsTrigger value="teams" className="gap-2">
                        <Briefcase className="w-4 h-4" />
                        Times
                    </TabsTrigger>
                    <TabsTrigger value="invites" className="gap-2">
                        <Mail className="w-4 h-4" />
                        Convites
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="gap-2">
                        <FileText className="w-4 h-4" />
                        Auditoria
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="space-y-4 animate-in fade-in-50 duration-500">
                    <div className="flex items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar usuários..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <AddUserModal teams={teams} onSuccess={refetchUsers} />
                    </div>

                    <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {(['nome', 'role', 'team', 'produtos', 'status'] as SortColumn[]).map((col, i) => {
                                        const labels: Record<SortColumn, string> = { nome: 'Usuário', role: 'Papel', team: 'Time', produtos: 'Produtos', status: 'Status' };
                                        return (
                                            <TableHead key={col} className={i === 0 ? '' : ''}>
                                                <button
                                                    onClick={() => toggleSort(col)}
                                                    className="flex items-center text-left font-medium hover:text-indigo-600 transition-colors select-none"
                                                >
                                                    {labels[col]}
                                                    <SortIcon column={col} />
                                                </button>
                                            </TableHead>
                                        );
                                    })}
                                    <TableHead className="text-center">
                                        <span className="flex items-center justify-center gap-1">
                                            <MessageSquare className="w-3.5 h-3.5" />
                                            Teams
                                        </span>
                                    </TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredUsers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            Nenhum usuário encontrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredUsers.map(user => (
                                        <TableRow key={user.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-foreground">{user.nome}</span>
                                                    <span className="text-xs text-muted-foreground">{user.email}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {(() => {
                                                    const roleInfo = getRoleDisplay(user);
                                                    return (
                                                        <Badge className={roleInfo.color}>
                                                            {roleInfo.name}
                                                        </Badge>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {user.teams?.name || '-'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {user.produtos?.length
                                                        ? user.produtos.map((p) => {
                                                            const badge = PRODUCT_BADGES[p];
                                                            if (!badge) return null;
                                                            const Icon = badge.icon;
                                                            return (
                                                                <span key={p} className={cn('inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium', badge.className)}>
                                                                    <Icon className="w-3 h-3" />
                                                                    {badge.label}
                                                                </span>
                                                            );
                                                        })
                                                        : <span className="text-xs text-slate-400">Todos</span>
                                                    }
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    className={user.active ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-slate-500/10 text-slate-600 border-slate-500/20 hover:bg-slate-500/20'}
                                                >
                                                    {user.active ? 'Ativo' : 'Inativo'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <button
                                                    onClick={() => handleToggleTeamsNotify(user.id, !!user.teams_notify_enabled)}
                                                    className={cn(
                                                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                                        user.teams_notify_enabled ? 'bg-indigo-600' : 'bg-slate-200'
                                                    )}
                                                    title={user.teams_notify_enabled ? 'Desativar notificações Teams' : 'Ativar notificações Teams'}
                                                >
                                                    <span className={cn(
                                                        'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm',
                                                        user.teams_notify_enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                                                    )} />
                                                </button>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => {
                                                            setSelectedUser(user);
                                                            setIsEditModalOpen(true);
                                                        }}
                                                        className="text-muted-foreground hover:text-foreground"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setUserToReset(user)}
                                                        className="text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                                                        title="Resetar Senha"
                                                    >
                                                        <KeyRound className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleToggleStatus(user.id, user.active)}
                                                        className={user.active ? 'text-orange-500 hover:text-orange-600 hover:bg-orange-50' : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'}
                                                        title={user.active ? 'Desativar Usuário' : 'Ativar Usuário'}
                                                    >
                                                        {user.active ? <Shield className="w-4 h-4" /> : <Shield className="w-4 h-4 fill-current" />}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setUserToDelete(user.id)}
                                                        className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                        title="Excluir Usuário"
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
                </TabsContent>

                <TabsContent value="roles" className="animate-in fade-in-50 duration-500">
                    <RoleManagement />
                </TabsContent>

                <TabsContent value="teams" className="animate-in fade-in-50 duration-500">
                    <TeamManagement />
                </TabsContent>

                <TabsContent value="invites" className="animate-in fade-in-50 duration-500">
                    <InviteManager />
                </TabsContent>

                <TabsContent value="audit" className="animate-in fade-in-50 duration-500">
                    <AuditLogViewer />
                </TabsContent>
            </Tabs>

            <EditUserModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                user={selectedUser}
                teams={teams}
                onSuccess={refetchUsers}
            />

            <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita e removerá o acesso ao sistema.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => userToDelete && handleDeleteUser(userToDelete)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Reset Password Confirmation */}
            <AlertDialog open={!!userToReset} onOpenChange={() => setUserToReset(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Resetar Senha</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja resetar a senha de <strong>{userToReset?.nome}</strong> ({userToReset?.email})? Uma nova senha será gerada.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isResetting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleResetPassword}
                            disabled={isResetting}
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                            {isResetting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Resetando...
                                </>
                            ) : 'Resetar Senha'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Generated Password Display */}
            <Dialog open={!!generatedPassword} onOpenChange={() => { setGeneratedPassword(null); setCopied(false); }}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <KeyRound className="w-5 h-5 text-amber-500" />
                            Nova Senha Gerada
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                            <p className="text-sm text-slate-500 mb-2">Senha:</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 text-lg font-mono font-semibold text-slate-900 tracking-wider">
                                    {generatedPassword}
                                </code>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleCopyPassword}
                                    className="shrink-0"
                                    title="Copiar senha"
                                >
                                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                        <p className="text-xs text-amber-600 font-medium">
                            Envie esta senha ao usuário. Ela não será exibida novamente.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => { setGeneratedPassword(null); setCopied(false); }}>
                            Fechar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
