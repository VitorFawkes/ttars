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
import { useProducts } from '../../../hooks/useProducts';
import type { Database } from '../../../database.types';
import { cn } from '../../../lib/utils';

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
    const [isLoading, setIsLoading] = useState(false);

    // Fetch roles, teams and products from database
    const { roles, isLoading: rolesLoading } = useRoles();
    const { options: teamOptions, isLoading: teamsLoading } = useTeamOptions(true);
    const { updateEmail } = useUsers();
    const { products: PRODUCTS } = useProducts(true);

    // Form State
    const [formData, setFormData] = useState({
        nome: '',
        email: '',
        role_id: '',
        team_id: 'none',
        produtos: [] as string[]
    });

    // Load user data when modal opens
    useEffect(() => {
        if (user) {
            setFormData({
                nome: user.nome || '',
                email: user.email || '',
                role_id: user.role_id || '',
                team_id: user.team_id || 'none',
                produtos: (user.produtos as string[]) || []
            });
        }
    }, [user]);

    const toggleProduct = (value: string) => {
        setFormData(prev => ({
            ...prev,
            produtos: prev.produtos.includes(value)
                ? prev.produtos.filter(p => p !== value)
                : [...prev.produtos, value]
        }));
    };

    type AppProduct = Database['public']['Enums']['app_product'];
    type ProfileUpdates = {
        nome: string;
        role_id: string | null;
        team_id: string | null;
        produtos: AppProduct[] | null;
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
                produtos: formData.produtos.length > 0 ? (formData.produtos as AppProduct[]) : null
            });
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
                    <div className="border-t border-slate-200" />

                    {/* Product Access Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Layers className="w-4 h-4 text-primary" />
                            Acesso a Produtos
                        </div>

                        <div className="space-y-2">
                            {PRODUCTS.map(p => (
                                <label key={p.slug} className="flex items-center gap-3 cursor-pointer py-1">
                                    <input
                                        type="checkbox"
                                        checked={formData.produtos.includes(p.slug)}
                                        onChange={() => toggleProduct(p.slug)}
                                        className="rounded border-slate-300 text-indigo-600 w-4 h-4 flex-shrink-0"
                                    />
                                    <div className="flex items-center gap-2">
                                        <p.icon className={cn('w-4 h-4', p.color_class)} />
                                        <span className="text-sm text-foreground">{p.name}</span>
                                    </div>
                                </label>
                            ))}
                            <p className="text-xs text-muted-foreground pl-1 pt-1">
                                Nenhum selecionado = acesso a todos os produtos.
                            </p>
                        </div>
                    </div>

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
