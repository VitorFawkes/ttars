import { useState } from 'react';
import { useRoles, type Role } from '../../../hooks/useRoles';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Skeleton } from '../../ui/Skeleton';
import { useToast } from '../../../contexts/ToastContext';
import {
    Shield,
    Plus,
    Pencil,
    Trash2,
    Lock,
    Users
} from 'lucide-react';
import { AddRoleModal } from './AddRoleModal';
import { EditRoleModal } from './EditRoleModal';

export function RoleManagement() {
    const { toast } = useToast();
    const { roles, isLoading, deleteRole } = useRoles();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    const handleDelete = async (role: Role) => {
        if (role.is_system) {
            toast({
                title: 'Não permitido',
                description: 'Roles do sistema não podem ser excluídos.',
                type: 'error'
            });
            return;
        }

        if (!confirm(`Tem certeza que deseja excluir o role "${role.display_name}"?`)) {
            return;
        }

        try {
            await deleteRole.mutateAsync(role.id);
            toast({
                title: 'Role excluído',
                description: 'O role foi removido com sucesso.',
                type: 'success'
            });
        } catch (error: any) {
            toast({
                title: 'Erro ao excluir',
                description: error.message || 'Não foi possível excluir o role.',
                type: 'error'
            });
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Skeleton className="w-10 h-10 rounded-full" />
                                <div>
                                    <Skeleton className="h-5 w-32 mb-2" />
                                    <Skeleton className="h-4 w-48" />
                                </div>
                            </div>
                            <Skeleton className="h-9 w-24" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Roles de Acesso
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Defina níveis de acesso e permissões para os usuários.
                    </p>
                </div>
                <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Novo Role
                </Button>
            </div>

            {/* Roles List */}
            <div className="grid gap-4">
                {roles.map((role) => (
                    <div
                        key={role.id}
                        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow duration-200"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                {/* Icon */}
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${role.color?.split(' ')[0] || 'bg-gray-100'}`}>
                                    {role.is_system ? (
                                        <Lock className={`w-5 h-5 ${role.color?.split(' ')[1] || 'text-gray-600'}`} />
                                    ) : (
                                        <Shield className={`w-5 h-5 ${role.color?.split(' ')[1] || 'text-gray-600'}`} />
                                    )}
                                </div>

                                {/* Info */}
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold text-foreground">
                                            {role.display_name}
                                        </h4>
                                        {role.is_system && (
                                            <Badge variant="outline" className="text-xs">
                                                Sistema
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        {role.description || 'Sem descrição'}
                                    </p>
                                    <p className="text-xs text-muted-foreground/70 mt-1 font-mono">
                                        {role.name}
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <Badge className={role.color || 'bg-gray-100 text-gray-800'}>
                                    <Users className="w-3 h-3 mr-1" />
                                    {/* TODO: Add user count */}
                                    --
                                </Badge>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingRole(role)}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDelete(role)}
                                    disabled={role.is_system}
                                    className={role.is_system
                                        ? 'text-muted-foreground/40 cursor-not-allowed'
                                        : 'text-destructive hover:text-destructive/90 hover:bg-destructive/10'
                                    }
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}

                {roles.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                        <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-foreground">Nenhum role encontrado</h3>
                        <p className="text-muted-foreground mt-1">
                            Crie um novo role para começar a gerenciar permissões.
                        </p>
                    </div>
                )}
            </div>

            {/* Modals */}
            <AddRoleModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />

            <EditRoleModal
                role={editingRole}
                isOpen={!!editingRole}
                onClose={() => setEditingRole(null)}
            />
        </div>
    );
}
