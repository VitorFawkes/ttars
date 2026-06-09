import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Label } from '../../ui/label';
import { useToast } from '../../../contexts/ToastContext';
import { Shield, Users, Layers, Mail } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../../ui/dialog';
import { useRoles } from '../../../hooks/useRoles';
import { useTeamOptions } from '../../../hooks/useTeams';
import { useUsers } from '../../../hooks/useUsers';
import { useAuth } from '../../../contexts/AuthContext';
import type { Database } from '../../../database.types';

type WorkspaceRow = {
    org_id: string;
    org_name: string;
    is_member: boolean;
};

type Profile = Database['public']['Tables']['profiles']['Row'];

interface EditUserModalProps {
    user: Profile | null;
    isOpen: boolean;
    onClose: () => void;
    teams?: unknown[]; // Legacy prop, now using useTeamOptions
    onSuccess?: () => void;
}

export function EditUserModal({ user, isOpen, onClose, onSuccess }: EditUserModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { profile: currentProfile } = useAuth();
    const isPlatformAdmin = currentProfile?.is_platform_admin === true;
    const [isLoading, setIsLoading] = useState(false);

    // Fetch roles and teams from database
    const { roles, isLoading: rolesLoading } = useRoles();
    const { options: teamOptions, isLoading: teamsLoading } = useTeamOptions(true);
    const { updateEmail } = useUsers();

    // Form State
    const [formData, setFormData] = useState({
        nome: '',
        email: '',
        role_id: '',
        team_id: 'none',
    });

    // Acesso a produtos = membership nos workspaces da conta (org_members)
    const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
    const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<Set<string>>(new Set());
    const [initialWorkspaceIds, setInitialWorkspaceIds] = useState<Set<string>>(new Set());
    const [workspacesLoading, setWorkspacesLoading] = useState(false);

    const selectedRole = roles.find(r => r.id === formData.role_id);
    const isAdminRole = selectedRole?.name === 'admin';
    // Admins da conta (ou platform admin) podem gerenciar acesso a produtos de qualquer usuário.
    // A RPC valida a permissão de verdade no servidor.
    const canManageWorkspaces = isPlatformAdmin || currentProfile?.is_admin === true;
    const showWorkspaceSection = canManageWorkspaces && !!user;

    // Load user data when modal opens
    useEffect(() => {
        if (user) {
            setFormData({
                nome: user.nome || '',
                email: user.email || '',
                role_id: user.role_id || '',
                team_id: user.team_id || 'none',
            });
        }
    }, [user]);

    // Buscar workspaces (produtos) da conta para gerenciar o acesso do usuário
    useEffect(() => {
        if (!showWorkspaceSection || !user) {
            setWorkspaces([]);
            setSelectedWorkspaceIds(new Set());
            setInitialWorkspaceIds(new Set());
            return;
        }
        let cancelled = false;
        setWorkspacesLoading(true);
        type RpcFn = (fn: string, args: { p_user_id: string }) =>
            Promise<{ data: WorkspaceRow[] | null; error: { message: string } | null }>;
        (supabase.rpc as unknown as RpcFn)('get_member_workspaces', { p_user_id: user.id })
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) {
                    toast({ title: 'Erro ao carregar workspaces', description: error.message, type: 'error' });
                    return;
                }
                const rows = data ?? [];
                setWorkspaces(rows);
                const memberIds = new Set(rows.filter(r => r.is_member).map(r => r.org_id));
                setSelectedWorkspaceIds(memberIds);
                setInitialWorkspaceIds(new Set(memberIds));
            })
            .finally(() => { if (!cancelled) setWorkspacesLoading(false); });
        return () => { cancelled = true; };
    }, [showWorkspaceSection, user, toast]);

    const toggleWorkspace = (orgId: string) => {
        setSelectedWorkspaceIds(prev => {
            const next = new Set(prev);
            if (next.has(orgId)) next.delete(orgId); else next.add(orgId);
            return next;
        });
    };

    const workspacesChanged =
        selectedWorkspaceIds.size !== initialWorkspaceIds.size ||
        Array.from(selectedWorkspaceIds).some(id => !initialWorkspaceIds.has(id));

    type ProfileUpdates = {
        nome: string;
        role_id: string | null;
        team_id: string | null;
        is_admin: boolean;
    };

    const updateMutation = useMutation({
        mutationFn: async (updates: ProfileUpdates) => {
            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', user?.id || '');

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profiles'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            toast({
                title: 'Usuário atualizado',
                description: 'As informações foram salvas com sucesso.',
                type: 'success'
            });
            if (onSuccess) onSuccess();
            onClose();
        },
        onError: (error: Error) => {
            toast({
                title: 'Erro ao atualizar',
                description: error.message || 'Ocorreu um erro ao salvar as alterações.',
                type: 'error'
            });
        }
    });

    const emailChanged = user ? formData.email.trim().toLowerCase() !== (user.email || '').trim().toLowerCase() : false;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setIsLoading(true);
        try {
            // If email changed, update via admin RPC first
            if (emailChanged) {
                await updateEmail.mutateAsync({
                    userId: user.id,
                    newEmail: formData.email.trim(),
                });
            }

            await updateMutation.mutateAsync({
                nome: formData.nome,
                role_id: formData.role_id || null,
                team_id: formData.team_id === 'none' ? null : formData.team_id,
                is_admin: isAdminRole
            });

            // Sync de acesso a produtos (membership) — só quando mudou
            if (showWorkspaceSection && workspacesChanged) {
                type SetWorkspacesRpc = (fn: string, args: { p_user_id: string; p_workspace_ids: string[] }) =>
                    Promise<{ data: unknown; error: { message: string } | null }>;
                const { error: wsError } = await (supabase.rpc as unknown as SetWorkspacesRpc)(
                    'set_member_workspaces',
                    { p_user_id: user.id, p_workspace_ids: Array.from(selectedWorkspaceIds) }
                );
                if (wsError) {
                    toast({
                        title: 'Atualizado, mas falhou ao salvar acesso a produtos',
                        description: wsError.message,
                        type: 'error'
                    });
                }
            }
        } finally {
            setIsLoading(false);
        }
    };

    const roleOptions = roles.map(r => ({
        value: r.id,
        label: r.display_name
    }));

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                    <DialogTitle>Editar Usuário</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    {/* Basic Info Section */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">Nome Completo</Label>
                            <Input
                                id="edit-name"
                                value={formData.nome}
                                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                placeholder="Ex: João Silva"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-email" className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5" />
                                Email de Acesso
                            </Label>
                            <Input
                                id="edit-email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="usuario@empresa.com"
                                required
                            />
                            {emailChanged && (
                                <p className="text-xs text-amber-600">
                                    O email de login será alterado. O usuário precisará usar o novo email para acessar o sistema.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-slate-200" />

                    {/* Access Control Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Shield className="w-4 h-4 text-primary" />
                            Controle de Acesso
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-role">Role (Nível de Acesso)</Label>
                            <Select
                                value={formData.role_id}
                                onChange={(value) => setFormData({ ...formData, role_id: value })}
                                options={roleOptions}
                                disabled={rolesLoading}
                            />
                            <p className="text-xs text-muted-foreground">
                                Define o que o usuário pode fazer no sistema (permissões).
                            </p>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-slate-200" />

                    {/* Team Assignment Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Users className="w-4 h-4 text-primary" />
                            Organização
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-team">Time / Squad</Label>
                            <Select
                                value={formData.team_id}
                                onChange={(value) => setFormData({ ...formData, team_id: value })}
                                options={teamOptions}
                                disabled={teamsLoading}
                            />
                            <p className="text-xs text-muted-foreground">
                                Define a qual equipe o usuário pertence (organização).
                            </p>
                        </div>
                    </div>

                    {/* Divider */}
                    {showWorkspaceSection && <div className="border-t border-slate-200" />}

                    {/* Product Access Section — membership nos workspaces (org_members) */}
                    {showWorkspaceSection && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <Layers className="w-4 h-4 text-primary" />
                                Acesso a Produtos
                            </div>

                            <div className="space-y-2">
                                {workspacesLoading ? (
                                    <p className="text-xs text-muted-foreground">Carregando produtos…</p>
                                ) : workspaces.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Nenhum produto disponível.</p>
                                ) : (
                                    <div className="space-y-1.5 rounded-lg border border-slate-200 p-3 bg-slate-50">
                                        {workspaces.map(w => (
                                            <label key={w.org_id} className="flex items-center gap-2.5 cursor-pointer py-1">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedWorkspaceIds.has(w.org_id)}
                                                    onChange={() => toggleWorkspace(w.org_id)}
                                                    className="rounded border-slate-300 text-indigo-600 w-4 h-4 flex-shrink-0"
                                                />
                                                <span className="text-sm text-foreground">{w.org_name}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground pl-1 pt-1">
                                    O usuário poderá alternar entre os produtos marcados no menu superior.
                                </p>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
